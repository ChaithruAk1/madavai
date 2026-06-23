// User + events store with two interchangeable backends, selected at startup:
//   - JSON file (default) — zero dependency, great for local dev / single small instance.
//   - Postgres (when DATABASE_URL is set) — for production (Supabase / Neon / managed PG).
// The server only uses this async interface, so swapping backends changes nothing else.
//
// Interface: getUser, upsertUser, patchUser, findByCustomer, logEvent, recentEvents, listUsers
import fs from "node:fs";
import path from "node:path";

// Crash-safe write: temp file -> fsync -> atomic rename (parity with the desktop + main server store).
function atomicWriteFileSync(file, data) {
  const tmp = path.join(path.dirname(file), "." + path.basename(file) + ".tmp-" + process.pid + "-" + Date.now());
  let fd;
  try { fd = fs.openSync(tmp, "w"); fs.writeFileSync(fd, data); try { fs.fsyncSync(fd); } catch {} }
  finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch {} } }
  try { fs.renameSync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
}

const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
const EVENT_CAP = 5000; // JSON backend keeps only the most recent N events

const newUser = (idn) => ({
  id: idn.sub, provider: idn.sub.split(":")[0], email: idn.email, name: idn.name, avatar: idn.avatar,
  createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
  lastSeenAt: null,
  suspended: false, freeAccess: false, subscriptionActive: false, plan: null, stripeCustomerId: null, stripeSubId: null,
});

function jsonStore(file) {
  const load = () => { try { const d = JSON.parse(fs.readFileSync(file, "utf8")); if (!d.events) d.events = []; return d; } catch { return { users: {}, events: [] }; } };
  const save = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); atomicWriteFileSync(file, JSON.stringify(db, null, 2)); };
  return {
    kind: "json",
    async getUser(id) { return load().users[id] || null; },
    async upsertUser(idn) {
      const db = load(); let u = db.users[idn.sub];
      if (!u) { u = newUser(idn); db.users[idn.sub] = u; }
      else { u.email = idn.email || u.email; u.name = idn.name || u.name; u.avatar = idn.avatar || u.avatar; }
      save(db); return u;
    },
    async patchUser(id, patch) { const db = load(); if (db.users[id]) { Object.assign(db.users[id], patch); save(db); } },
    async findByCustomer(cust) { return Object.values(load().users).find((u) => u.stripeCustomerId === cust) || null; },
    async logEvent(ev) { const db = load(); db.events.push({ ts: new Date().toISOString(), userId: ev.userId || null, type: ev.type, meta: ev.meta || null }); if (db.events.length > EVENT_CAP) db.events = db.events.slice(-EVENT_CAP); save(db); },
    async recentEvents(limit = 100) { return load().events.slice(-limit).reverse(); },
    async listUsers() { return Object.values(load().users); },
  };
}

async function pgStore(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
  await pool.query(`create table if not exists users (
    id text primary key, provider text, email text, name text, avatar text,
    created_at timestamptz default now(), trial_ends_at timestamptz, last_seen_at timestamptz,
    suspended boolean default false, free_access boolean default false, subscription_active boolean default false,
    plan text, stripe_customer_id text, stripe_sub_id text )`);
  await pool.query(`alter table users add column if not exists free_access boolean default false`);
  await pool.query(`alter table users add column if not exists last_seen_at timestamptz`);
  await pool.query(`create table if not exists events ( id bigserial primary key, ts timestamptz default now(), user_id text, type text, meta jsonb )`);
  await pool.query(`create index if not exists events_ts_idx on events (ts desc)`);
  const COLS = { subscriptionActive: "subscription_active", stripeCustomerId: "stripe_customer_id", stripeSubId: "stripe_sub_id", suspended: "suspended", freeAccess: "free_access", plan: "plan", trialEndsAt: "trial_ends_at", lastSeenAt: "last_seen_at" };
  const row2u = (r) => r && ({
    id: r.id, provider: r.provider, email: r.email, name: r.name, avatar: r.avatar,
    createdAt: r.created_at, trialEndsAt: r.trial_ends_at, lastSeenAt: r.last_seen_at, suspended: r.suspended, freeAccess: r.free_access,
    subscriptionActive: r.subscription_active, plan: r.plan, stripeCustomerId: r.stripe_customer_id, stripeSubId: r.stripe_sub_id,
  });
  return {
    kind: "postgres",
    async getUser(id) { const { rows } = await pool.query("select * from users where id=$1", [id]); return row2u(rows[0]); },
    async upsertUser(idn) {
      const u = newUser(idn);
      const { rows } = await pool.query(`insert into users (id,provider,email,name,avatar,trial_ends_at) values ($1,$2,$3,$4,$5,$6)
        on conflict (id) do update set email=excluded.email, name=excluded.name, avatar=excluded.avatar returning *`,
        [u.id, u.provider, u.email, u.name, u.avatar, u.trialEndsAt]);
      return row2u(rows[0]);
    },
    async patchUser(id, patch) {
      const sets = [], vals = []; let i = 1;
      for (const k in patch) { sets.push(`${COLS[k] || k}=$${i++}`); vals.push(patch[k]); }
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
