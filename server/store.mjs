// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// User store with two interchangeable backends, selected at startup:
//   - JSON file (default) — zero dependency, great for local dev / single small instance.
//   - Postgres (when DATABASE_URL is set) — for production / Supabase / Neon / managed PG.
// The server only uses this async interface, so swapping backends changes nothing else.
//
// Interface: getUser, upsertUser, patchUser, findByCustomer,
//            logEvent, recentEvents, listUsers   (last three power analytics / the admin page)
//
// Community / sharing collections (Phase 3): shares, requests, threads, posts.
// Each is a generic id-keyed collection exposed via the same async shape on both backends:
//   col(name) -> { all(), get(id), insert(doc), update(id, patch), remove(id) }
// JSON backend stores them as top-level arrays in the same users.json file; Postgres stores each
// as a (id text primary key, data jsonb) table created on startup alongside users/events.
import fs from "node:fs";
import path from "node:path";

const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
const EVENT_CAP = 5000; // JSON backend keeps only the most recent N events

// Shape of a brand-new account (7-day trial stamped once at creation).
const newUser = (idn) => ({
  id: idn.sub, provider: idn.sub.split(":")[0], email: idn.email, name: idn.name, avatar: idn.avatar,
  createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
  lastSeenAt: null,
  suspended: false, freeAccess: false, subscriptionActive: false, plan: null, stripeCustomerId: null, stripeSubId: null,
});

// Names of the generic id-keyed collections (stored as arrays in JSON, jsonb tables in Postgres).
const COLLECTIONS = ["shares", "requests", "threads", "posts", "workspaces", "conversations", "conntokens", "oauthstate", "projects", "tasks", "runs"]; // workspaces: per-user synced agents/teams/groups (record id = userId); conntokens: per-user encrypted connector tokens (record id = "conntok:<userId>")

// ---- JSON file backend ----
function jsonStore(file) {
  const load = () => { try { const d = JSON.parse(fs.readFileSync(file, "utf8")); if (!d.events) d.events = []; for (const c of COLLECTIONS) if (!d[c]) d[c] = []; return d; } catch { const d = { users: {}, events: [] }; for (const c of COLLECTIONS) d[c] = []; return d; } };
  const save = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); };
  // Generic id-keyed collection backed by a JSON array; mirrors the Postgres col() shape below.
  const jcol = (name) => ({
    async all() { return load()[name].slice(); },
    async get(id) { return load()[name].find((x) => x.id === id) || null; },
    async insert(doc) { const db = load(); db[name].push(doc); save(db); return doc; },
    async update(id, patch) { const db = load(); const x = db[name].find((y) => y.id === id); if (x) { Object.assign(x, patch); save(db); } return x || null; },
    async remove(id) { const db = load(); const before = db[name].length; db[name] = db[name].filter((x) => x.id !== id); if (db[name].length !== before) save(db); },
  });
  return {
    kind: "json",
    col: jcol,
    async getUser(id) { return load().users[id] || null; },
    async upsertUser(idn) {
      const db = load(); let u = db.users[idn.sub];
      if (!u) { u = newUser(idn); db.users[idn.sub] = u; }
      else { u.email = idn.email || u.email; u.name = idn.name || u.name; u.avatar = idn.avatar || u.avatar; }
      save(db); return u;
    },
    async patchUser(id, patch) { const db = load(); if (db.users[id]) { Object.assign(db.users[id], patch); save(db); } },
    async findByCustomer(cust) { return Object.values(load().users).find((u) => u.stripeCustomerId === cust) || null; },
    async logEvent(ev) {
      const db = load();
      db.events.push({ ts: new Date().toISOString(), userId: ev.userId || null, type: ev.type, meta: ev.meta || null });
      if (db.events.length > EVENT_CAP) db.events = db.events.slice(-EVENT_CAP);
      save(db);
    },
    async recentEvents(limit = 100) { const db = load(); return db.events.slice(-limit).reverse(); },
    async listUsers() { return Object.values(load().users); },
  };
}

// ---- Postgres backend (uses the optional `pg` package; install it in server/) ----
async function pgStore(url) {
  const { default: pg } = await import("pg");
  // TLS: localhost → none. Managed DB → VERIFY the server cert against the provider CA when
  // PGSSLROOTCERT is set (PEM contents, or a path to a .pem); else keep the prior unverified mode but
  // WARN, since rejectUnauthorized:false lets a network MITM impersonate the database. (review M7)
  let ssl = false;
  if (!url.includes("localhost")) {
    let ca = process.env.PGSSLROOTCERT || "";
    try { if (ca && !ca.includes("BEGIN CERTIFICATE") && fs.existsSync(ca)) ca = fs.readFileSync(ca, "utf8"); } catch {}
    if (ca) ssl = { ca, rejectUnauthorized: true };
    else { console.warn("[store] PGSSLROOTCERT not set — Postgres TLS is unauthenticated (rejectUnauthorized:false); set it to the provider CA to prevent MITM."); ssl = { rejectUnauthorized: false }; }
  }
  const pool = new pg.Pool({ connectionString: url, ssl });
  await pool.query(`create table if not exists users (
    id text primary key, provider text, email text, name text, avatar text,
    created_at timestamptz default now(), trial_ends_at timestamptz, last_seen_at timestamptz,
    suspended boolean default false, free_access boolean default false, subscription_active boolean default false,
    plan text, stripe_customer_id text, stripe_sub_id text )`);
  await pool.query(`alter table users add column if not exists free_access boolean default false`); // for older tables
  await pool.query(`alter table users add column if not exists last_seen_at timestamptz`);          // for older tables
  await pool.query(`alter table users add column if not exists token_version integer default 1`);   // CLI token revocation
  await pool.query(`create table if not exists events (
    id bigserial primary key, ts timestamptz default now(), user_id text, type text, meta jsonb )`);
  await pool.query(`create index if not exists events_ts_idx on events (ts desc)`);
  // Generic id-keyed jsonb collections (shares/requests/threads/posts). Same DDL pattern as events.
  for (const c of COLLECTIONS) await pool.query(`create table if not exists ${c} ( id text primary key, data jsonb )`);
  const COLS = { subscriptionActive: "subscription_active", stripeCustomerId: "stripe_customer_id", stripeSubId: "stripe_sub_id", suspended: "suspended", freeAccess: "free_access", plan: "plan", trialEndsAt: "trial_ends_at", lastSeenAt: "last_seen_at", tokenVersion: "token_version" };
  const row2u = (r) => r && ({
    id: r.id, provider: r.provider, email: r.email, name: r.name, avatar: r.avatar,
    createdAt: r.created_at, trialEndsAt: r.trial_ends_at, lastSeenAt: r.last_seen_at, suspended: r.suspended, freeAccess: r.free_access,
    subscriptionActive: r.subscription_active, plan: r.plan, stripeCustomerId: r.stripe_customer_id, stripeSubId: r.stripe_sub_id,
    tokenVersion: r.token_version || 1,
  });
  // Generic id-keyed jsonb collection; name is validated against COLLECTIONS so it's never raw user input.
  const pcol = (name) => {
    if (!COLLECTIONS.includes(name)) throw new Error("unknown collection " + name);
    return {
      async all() { const { rows } = await pool.query(`select data from ${name}`); return rows.map((r) => r.data); },
      async get(id) { const { rows } = await pool.query(`select data from ${name} where id=$1`, [id]); return rows[0] ? rows[0].data : null; },
      async insert(doc) { await pool.query(`insert into ${name} (id,data) values ($1,$2)`, [doc.id, JSON.stringify(doc)]); return doc; },
      async update(id, patch) {
        const { rows } = await pool.query(`select data from ${name} where id=$1`, [id]);
        if (!rows[0]) return null;
        const merged = Object.assign({}, rows[0].data, patch);
        await pool.query(`update ${name} set data=$2 where id=$1`, [id, JSON.stringify(merged)]);
        return merged;
      },
      async remove(id) { await pool.query(`delete from ${name} where id=$1`, [id]); },
    };
  };
  return {
    kind: "postgres",
    col: pcol,
    async getUser(id) { const { rows } = await pool.query("select * from users where id=$1", [id]); return row2u(rows[0]); },
    async upsertUser(idn) {
      const u = newUser(idn);
      const { rows } = await pool.query(
        `insert into users (id,provider,email,name,avatar,trial_ends_at) values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update set email=excluded.email, name=excluded.name, avatar=excluded.avatar
         returning *`, [u.id, u.provider, u.email, u.name, u.avatar, u.trialEndsAt]);
      return row2u(rows[0]);
    },
    async patchUser(id, patch) {
      const sets = [], vals = []; let i = 1;
      for (const k in patch) {
        if (!COLS[k]) { console.warn("[store] patchUser: ignoring unmapped field", k); continue; } // never interpolate a raw key as SQL identifier
        sets.push(`${COLS[k]}=$${i++}`); vals.push(patch[k]);
      }
      if (!sets.length) return; vals.push(id);
      await pool.query(`update users set ${sets.join(",")} where id=$${i}`, vals);
    },
    async findByCustomer(cust) { const { rows } = await pool.query("select * from users where stripe_customer_id=$1", [cust]); return row2u(rows[0]); },
    async logEvent(ev) { await pool.query("insert into events (user_id,type,meta) values ($1,$2,$3)", [ev.userId || null, ev.type, ev.meta ? JSON.stringify(ev.meta) : null]); },
    async recentEvents(limit = 100) { const { rows } = await pool.query("select ts,user_id,type,meta from events order by ts desc limit $1", [limit]); return rows.map((r) => ({ ts: r.ts, userId: r.user_id, type: r.type, meta: r.meta })); },
    async listUsers() { const { rows } = await pool.query("select * from users order by created_at desc"); return rows.map(row2u); },
  };
}

export async function makeStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return jsonStore(process.env.STORE_FILE || path.join(process.cwd(), "server", "users.json"));
}
