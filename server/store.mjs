// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// User store with two interchangeable backends, selected at startup:
//   - JSON file (default) — zero dependency, great for local dev / single small instance.
//   - Postgres (when DATABASE_URL is set) — for production / Supabase / Neon / managed PG.
// The server only uses this async interface, so swapping backends changes nothing else.
import fs from "node:fs";
import path from "node:path";

const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);

// Shape of a brand-new account (7-day trial stamped once at creation).
const newUser = (idn) => ({
  id: idn.sub, provider: idn.sub.split(":")[0], email: idn.email, name: idn.name, avatar: idn.avatar,
  createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
  suspended: false, freeAccess: false, subscriptionActive: false, plan: null, stripeCustomerId: null, stripeSubId: null,
});

// ---- JSON file backend ----
function jsonStore(file) {
  const load = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { users: {} }; } };
  const save = (db) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 2)); };
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
  };
}

// ---- Postgres backend (uses the optional `pg` package; install it in server/) ----
async function pgStore(url) {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
  await pool.query(`create table if not exists users (
    id text primary key, provider text, email text, name text, avatar text,
    created_at timestamptz default now(), trial_ends_at timestamptz,
    suspended boolean default false, free_access boolean default false, subscription_active boolean default false,
    plan text, stripe_customer_id text, stripe_sub_id text )`);
  await pool.query(`alter table users add column if not exists free_access boolean default false`); // for older tables
  const COLS = { subscriptionActive: "subscription_active", stripeCustomerId: "stripe_customer_id", stripeSubId: "stripe_sub_id", suspended: "suspended", freeAccess: "free_access", plan: "plan", trialEndsAt: "trial_ends_at" };
  const row2u = (r) => r && ({
    id: r.id, provider: r.provider, email: r.email, name: r.name, avatar: r.avatar,
    createdAt: r.created_at, trialEndsAt: r.trial_ends_at, suspended: r.suspended, freeAccess: r.free_access,
    subscriptionActive: r.subscription_active, plan: r.plan, stripeCustomerId: r.stripe_customer_id, stripeSubId: r.stripe_sub_id,
  });
  return {
    kind: "postgres",
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
      for (const k in patch) { sets.push(`${COLS[k] || k}=$${i++}`); vals.push(patch[k]); }
      if (!sets.length) return; vals.push(id);
      await pool.query(`update users set ${sets.join(",")} where id=$${i}`, vals);
    },
    async findByCustomer(cust) { const { rows } = await pool.query("select * from users where stripe_customer_id=$1", [cust]); return row2u(rows[0]); },
  };
}

export async function makeStore() {
  if (process.env.DATABASE_URL) return pgStore(process.env.DATABASE_URL);
  return jsonStore(process.env.STORE_FILE || path.join(process.cwd(), "server", "users.json"));
}
