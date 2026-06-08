// © 2026 Samskruthi Harish. BrainEdge — Proprietary. Reference auth server (Phase 1).
//
// Zero-dependency Node (>=18) reference implementation of the BrainEdge auth contract (see AUTH.md):
//   Google/GitHub OAuth (secrets stay here), 7-day trial, account status, /me, suspend.
// This is a STARTING POINT for local dev / small deploys. Before production, read the "Security TODO"
// in AUTH.md (HTTPS, real DB, state/CSRF validation, rate limiting, key rotation, security review).
//
// Run:  node server/auth-server.mjs   (configure via env — see server/README.md)

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const PORT = +(process.env.PORT || 8787);
const BASE = process.env.AUTH_BASE_URL || `http://127.0.0.1:${PORT}`;
const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h; re-validated online so bans still bite quickly
const STORE = process.env.STORE_FILE || path.join(process.cwd(), "server", "users.json");
// Stripe (Phase 2). Billing endpoints are only active when these are set; the rest runs without them.
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE = process.env.STRIPE_PRICE_ID || "";
const STRIPE_WH = process.env.STRIPE_WEBHOOK_SECRET || "";

const OAUTH = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    userInfo: async (tok) => { const j = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tok } })).json(); return { sub: "google:" + j.sub, email: j.email, name: j.name, avatar: j.picture }; },
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET,
    auth: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    userInfo: async (tok) => {
      const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tok, "User-Agent": "BrainEdge" } })).json();
      let email = u.email;
      if (!email) { try { const es = await (await fetch("https://api.github.com/user/emails", { headers: { Authorization: "Bearer " + tok, "User-Agent": "BrainEdge" } })).json(); email = (es.find((e) => e.primary) || es[0] || {}).email; } catch {} }
      return { sub: "github:" + u.id, email, name: u.name || u.login, avatar: u.avatar_url };
    },
  },
};

// ---- tiny JSON store (swap for Postgres in production) ----
const load = () => { try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return { users: {} }; } };
const save = (db) => { fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(db, null, 2)); };
function upsertUser(idn) {
  const db = load();
  let u = db.users[idn.sub];
  if (!u) {
    u = { id: idn.sub, provider: idn.sub.split(":")[0], email: idn.email, name: idn.name, avatar: idn.avatar,
      createdAt: new Date().toISOString(), trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(),
      suspended: false, subscriptionActive: false, plan: null };
    db.users[idn.sub] = u;
  } else { u.email = idn.email || u.email; u.name = idn.name || u.name; u.avatar = idn.avatar || u.avatar; }
  save(db);
  return u;
}
function statusOf(u) {
  const now = Date.now();
  if (u.suspended) return { status: "suspended", daysLeft: 0 };
  if (u.subscriptionActive) return { status: "active", daysLeft: null };
  const end = Date.parse(u.trialEndsAt);
  if (now < end) return { status: "trialing", daysLeft: Math.ceil((end - now) / 864e5) };
  return { status: "expired", daysLeft: 0 };
}

// ---- session token: base64url(payload).hmac ----
const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(sub) {
  const payload = b64u(JSON.stringify({ sub, exp: Date.now() + SESSION_TTL_MS }));
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + mac;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try { const p = JSON.parse(Buffer.from(payload, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}

// ---- helpers ----
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type" }); res.end(JSON.stringify(obj)); };
const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const html = (res, body) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;text-align:center">${body}</body>`); };
const rawBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

// ---- Stripe (REST; no SDK dependency) ----
async function stripe(pathname, params) {
  const res = await fetch("https://api.stripe.com/v1/" + pathname, {
    method: "POST", headers: { Authorization: "Bearer " + STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.json();
}
function verifyStripeSig(header, payload, secret) {
  try {
    const parts = Object.fromEntries(String(header || "").split(",").map((kv) => kv.split("=")));
    if (!parts.t || !parts.v1) return false;
    const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  } catch { return false; }
}
const userByCustomer = (db, cust) => Object.values(db.users).find((u) => u.stripeCustomerId === cust);
const pending = new Map(); // state -> { provider, redirect }  (use a store/TTL in production)

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const p = u.pathname;
  if (req.method === "OPTIONS") return json(res, 204, {});

  // GET /auth/:provider/start?redirect=...&state=...
  let m = p.match(/^\/auth\/(google|github)\/start$/);
  if (m && req.method === "GET") {
    const prov = OAUTH[m[1]];
    if (!prov.clientId) return json(res, 500, { error: `${m[1]} OAuth not configured on server` });
    const state = crypto.randomBytes(16).toString("hex");
    pending.set(state, { provider: m[1], redirect: u.searchParams.get("redirect") || "" });
    const a = new URL(prov.auth);
    a.searchParams.set("client_id", prov.clientId);
    a.searchParams.set("redirect_uri", `${BASE}/auth/${m[1]}/callback`);
    a.searchParams.set("response_type", "code");
    a.searchParams.set("scope", prov.scope);
    a.searchParams.set("state", state);
    res.writeHead(302, { Location: a.toString() }); return res.end();
  }

  // GET /auth/:provider/callback?code=...&state=...
  m = p.match(/^\/auth\/(google|github)\/callback$/);
  if (m && req.method === "GET") {
    const prov = OAUTH[m[1]];
    const code = u.searchParams.get("code"); const state = u.searchParams.get("state");
    const ctx = pending.get(state); pending.delete(state);
    if (!code || !ctx) { res.writeHead(400); return res.end("Invalid OAuth state"); }
    try {
      const body = new URLSearchParams({ client_id: prov.clientId, client_secret: prov.clientSecret, code, redirect_uri: `${BASE}/auth/${m[1]}/callback`, grant_type: "authorization_code" });
      const tr = await (await fetch(prov.token, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body })).json();
      if (!tr.access_token) { res.writeHead(400); return res.end("Token exchange failed"); }
      const idn = await prov.userInfo(tr.access_token);
      const user = upsertUser(idn);
      const token = sign(user.id);
      const redir = ctx.redirect;
      if (redir && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(redir)) {
        // Loopback (desktop): token as a query param so the app's local server receives it.
        const sep = redir.includes("?") ? "&" : "?";
        res.writeHead(302, { Location: redir + sep + "token=" + encodeURIComponent(token) }); return res.end();
      }
      // Web fallback: a real deployment sets a cookie / redirects to the SPA. Dev fallback below.
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<h2>Signed in to BrainEdge</h2><p>You can close this window.</p>`);
    } catch (e) { res.writeHead(500); return res.end("OAuth error: " + (e && e.message)); }
  }

  // GET /me
  if (p === "/me" && req.method === "GET") {
    const pl = verify(bearer(req));
    if (!pl) return json(res, 401, { error: "unauthenticated" });
    const db = load(); const user = db.users[pl.sub];
    if (!user) return json(res, 401, { error: "unknown user" });
    const st = statusOf(user);
    if (st.status === "suspended") return json(res, 403, { error: "suspended" });
    return json(res, 200, {
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider },
      status: st.status, trialEndsAt: user.trialEndsAt, daysLeft: st.daysLeft,
      subscription: { active: !!user.subscriptionActive, plan: user.plan || null },
    });
  }

  // POST /auth/logout  (stateless tokens — client just drops it; here we no-op)
  if (p === "/auth/logout" && req.method === "POST") return json(res, 200, { ok: true });

  // DEV-ONLY test login (no OAuth). Enable with ALLOW_DEV_LOGIN=1. NEVER enable in production.
  if (p === "/auth/dev/start" && req.method === "GET") {
    if (process.env.ALLOW_DEV_LOGIN !== "1") return json(res, 404, { error: "not found" });
    const redirect = u.searchParams.get("redirect") || "";
    const email = u.searchParams.get("email") || "dev@brainedge.local";
    const user = upsertUser({ sub: "dev:" + email, email, name: "Dev User", avatar: "" });
    const token = sign(user.id);
    if (redirect && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(redirect)) {
      const sep = redirect.includes("?") ? "&" : "?";
      res.writeHead(302, { Location: redirect + sep + "token=" + encodeURIComponent(token) }); return res.end();
    }
    return json(res, 200, { token });
  }

  // POST /admin/users/:id/(un)suspend   header: x-admin-key
  m = p.match(/^\/admin\/users\/(.+)\/(suspend|unsuspend)$/);
  if (m && req.method === "POST") {
    if ((req.headers["x-admin-key"] || "") !== ADMIN_KEY) return json(res, 403, { error: "forbidden" });
    const db = load(); const user = db.users[decodeURIComponent(m[1])];
    if (!user) return json(res, 404, { error: "no such user" });
    user.suspended = m[2] === "suspend"; save(db);
    return json(res, 200, { ok: true, id: user.id, suspended: user.suspended });
  }

  // POST /billing/checkout (Bearer) -> { url } : start a Stripe subscription Checkout.
  if (p === "/billing/checkout" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const db = load(); const user = db.users[pl.sub]; if (!user) return json(res, 401, { error: "unknown user" });
    // DEV simulate: with dev login on and no Stripe configured, mark the account active so the
    // subscribe → auto-unlock flow can be tested without Stripe/CLI. NEVER active in production.
    if (process.env.ALLOW_DEV_LOGIN === "1" && (!STRIPE_SECRET || !STRIPE_PRICE)) {
      user.stripeCustomerId = user.stripeCustomerId || ("cus_dev_" + user.id);
      user.subscriptionActive = true; user.plan = "pro (dev)"; save(db);
      return json(res, 200, { url: `${BASE}/billing/done` });
    }
    if (!STRIPE_SECRET || !STRIPE_PRICE) return json(res, 500, { error: "billing not configured" });
    const s = await stripe("checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": STRIPE_PRICE, "line_items[0][quantity]": "1",
      success_url: `${BASE}/billing/done`, cancel_url: `${BASE}/billing/cancel`,
      client_reference_id: user.id, customer_email: user.email || undefined,
      "subscription_data[metadata][userId]": user.id,
    });
    if (!s.url) { console.error("Stripe checkout error:", JSON.stringify(s.error || s)); return json(res, 502, { error: "stripe", detail: (s.error && s.error.message) || JSON.stringify(s).slice(0, 300) }); }
    return json(res, 200, { url: s.url });
  }

  // POST /billing/portal (Bearer) -> { url } : Stripe customer portal to manage/cancel.
  if (p === "/billing/portal" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const db = load(); const user = db.users[pl.sub];
    if (!user || !user.stripeCustomerId) return json(res, 400, { error: "no subscription" });
    const ps = await stripe("billing_portal/sessions", { customer: user.stripeCustomerId, return_url: `${BASE}/billing/done` });
    if (!ps.url) return json(res, 502, { error: "stripe", detail: JSON.stringify(ps).slice(0, 300) });
    return json(res, 200, { url: ps.url });
  }

  // POST /billing/webhook : Stripe events flip subscriptionActive. Signed; raw body required.
  if (p === "/billing/webhook" && req.method === "POST") {
    const raw = await rawBody(req);
    if (STRIPE_WH && !verifyStripeSig(req.headers["stripe-signature"], raw, STRIPE_WH)) return json(res, 400, { error: "bad signature" });
    let evt; try { evt = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
    const db = load(); const obj = (evt.data && evt.data.object) || {};
    if (evt.type === "checkout.session.completed") {
      const u = db.users[obj.client_reference_id];
      if (u) { u.stripeCustomerId = obj.customer; u.stripeSubId = obj.subscription; u.subscriptionActive = true; u.plan = "pro"; save(db); }
    } else if (evt.type === "customer.subscription.deleted") {
      const u = userByCustomer(db, obj.customer); if (u) { u.subscriptionActive = false; u.plan = null; save(db); }
    } else if (evt.type === "customer.subscription.updated") {
      const u = userByCustomer(db, obj.customer); if (u) { u.subscriptionActive = ["active", "trialing", "past_due"].includes(obj.status); save(db); }
    }
    return json(res, 200, { received: true });
  }

  if (p === "/billing/done") return html(res, "<div><h2>Subscription active 🎉</h2><p>You can close this window and return to BrainEdge — it unlocks automatically.</p></div>");
  if (p === "/billing/cancel") return html(res, "<div><h2>Checkout canceled</h2><p>No charge was made. You can close this window.</p></div>");

  if (p === "/health") return json(res, 200, { ok: true });
  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`BrainEdge auth server on ${BASE}  (trial ${TRIAL_DAYS}d · dev-login ${process.env.ALLOW_DEV_LOGIN === "1" ? "ON" : "off"} · stripe ${STRIPE_SECRET && STRIPE_PRICE ? "ON" : "off"})`));
