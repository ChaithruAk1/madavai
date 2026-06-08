// Reusable auth + paywall server — drop-in login, 7-day trial, Stripe subscription, analytics.
// Zero-dependency Node (>=18). Configure entirely via env / .env (see .env.example).
//
//   Google/GitHub OAuth (secrets stay here) · session tokens · 7-day trial · /me account status
//   · Stripe checkout/portal/webhook · admin suspend + free-access · product event analytics.
//
// Run:  node server/auth-server.mjs

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { makeStore } from "./store.mjs";

// Minimal .env loader (no dependency). Real environment variables always win.
try {
  const txt = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const APP_NAME = process.env.APP_NAME || "App";
const PORT = +(process.env.PORT || 8787);
const BASE = process.env.AUTH_BASE_URL || `http://127.0.0.1:${PORT}`;
const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // re-validated online so bans bite quickly
const ALLOWED_REDIRECTS = (process.env.ALLOWED_REDIRECTS || "").split(",").map((s) => s.trim()).filter(Boolean);
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
      const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tok, "User-Agent": APP_NAME } })).json();
      let email = u.email;
      if (!email) { try { const es = await (await fetch("https://api.github.com/user/emails", { headers: { Authorization: "Bearer " + tok, "User-Agent": APP_NAME } })).json(); email = (es.find((e) => e.primary) || es[0] || {}).email; } catch {} }
      return { sub: "github:" + u.id, email, name: u.name || u.login, avatar: u.avatar_url };
    },
  },
};

const store = await makeStore();

// Email lists (env var + live-edited text file): free-access users and admins.
const FREE_EMAILS_FILE = new URL("./free-emails.txt", import.meta.url);
const ADMIN_EMAILS_FILE = new URL("./admin-emails.txt", import.meta.url);
function emailSet(envVar, file) {
  const set = new Set((process.env[envVar] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  try { const txt = fs.readFileSync(file, "utf8"); for (const line of txt.split(/\r?\n/)) { const e = line.split("#")[0].trim().toLowerCase(); if (e) set.add(e); } } catch {}
  return set;
}
const isFreeEmail = (email) => !!email && emailSet("FREE_EMAILS", FREE_EMAILS_FILE).has(email.toLowerCase());
const isAdminEmail = (email) => !!email && emailSet("ADMIN_EMAILS", ADMIN_EMAILS_FILE).has(email.toLowerCase());

async function adminOk(req) {
  if (ADMIN_KEY && (req.headers["x-admin-key"] || "") === ADMIN_KEY) return true;
  const pl = verify(bearer(req)); if (!pl) return false;
  const u = await store.getUser(pl.sub); return !!(u && isAdminEmail(u.email));
}

function statusOf(u) {
  const now = Date.now();
  if (u.suspended) return { status: "suspended", daysLeft: 0 };
  if (u.freeAccess || isFreeEmail(u.email)) return { status: "active", daysLeft: null };
  if (u.subscriptionActive) return { status: "active", daysLeft: null };
  const end = Date.parse(u.trialEndsAt);
  if (now < end) return { status: "trialing", daysLeft: Math.ceil((end - now) / 864e5) };
  return { status: "expired", daysLeft: 0 };
}

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

const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, x-admin-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }); res.end(JSON.stringify(obj)); };

// Optional: serve a built web app (set WEB_DIR). Lets the API and SPA share one origin.
const WEB_DIR = process.env.WEB_DIR || path.join(process.cwd(), "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json" };
function serveStatic(res, p) {
  let rel = decodeURIComponent(p).replace(/^\/+/, "") || "index.html";
  const file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { fs.readFile(path.join(WEB_DIR, "index.html"), (e2, idx) => { if (e2) return json(res, 404, { error: "not found" }); res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(idx); }); return; }
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" }); res.end(buf);
  });
}
const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const html = (res, body) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;text-align:center">${body}</body>`); };
const rawBody = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

async function stripe(pathname, params) {
  const res = await fetch("https://api.stripe.com/v1/" + pathname, { method: "POST", headers: { Authorization: "Bearer " + STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
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
const isAllowedRedirect = (r) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(r) || ALLOWED_REDIRECTS.some((a) => r.startsWith(a));

const pending = new Map();
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (v.exp < now) pending.delete(k); }, 60000).unref?.();

const hits = new Map();
function rateLimited(req, bucket, max, windowMs) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  const key = bucket + ":" + ip; const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  rec.n++; return rec.n > max;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const p = u.pathname;
  if (req.method === "OPTIONS") return json(res, 204, {});

  let m = p.match(/^\/auth\/(google|github)\/start$/);
  if (m && req.method === "GET") {
    if (rateLimited(req, "auth", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const prov = OAUTH[m[1]];
    if (!prov.clientId) return json(res, 500, { error: `${m[1]} OAuth not configured on server` });
    const redirect = u.searchParams.get("redirect") || "";
    if (redirect && !isAllowedRedirect(redirect)) return json(res, 400, { error: "redirect not allowed" });
    const state = crypto.randomBytes(16).toString("hex");
    pending.set(state, { provider: m[1], redirect, exp: Date.now() + 10 * 60000 });
    const a = new URL(prov.auth);
    a.searchParams.set("client_id", prov.clientId);
    a.searchParams.set("redirect_uri", `${BASE}/auth/${m[1]}/callback`);
    a.searchParams.set("response_type", "code");
    a.searchParams.set("scope", prov.scope);
    a.searchParams.set("state", state);
    res.writeHead(302, { Location: a.toString() }); return res.end();
  }

  m = p.match(/^\/auth\/(google|github)\/callback$/);
  if (m && req.method === "GET") {
    const prov = OAUTH[m[1]];
    const code = u.searchParams.get("code"); const state = u.searchParams.get("state");
    const ctx = pending.get(state); pending.delete(state);
    if (!code || !ctx || (ctx.exp && ctx.exp < Date.now())) { res.writeHead(400); return res.end("Invalid or expired OAuth state"); }
    try {
      const body = new URLSearchParams({ client_id: prov.clientId, client_secret: prov.clientSecret, code, redirect_uri: `${BASE}/auth/${m[1]}/callback`, grant_type: "authorization_code" });
      const tr = await (await fetch(prov.token, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body })).json();
      if (!tr.access_token) { res.writeHead(400); return res.end("Token exchange failed"); }
      const idn = await prov.userInfo(tr.access_token);
      const existed = await store.getUser(idn.sub);
      const user = await store.upsertUser(idn);
      await store.logEvent({ userId: user.id, type: existed ? "signin" : "signup", meta: { provider: m[1] } });
      await store.patchUser(user.id, { lastSeenAt: new Date().toISOString() });
      const token = sign(user.id);
      const redir = ctx.redirect;
      if (redir && isAllowedRedirect(redir)) {
        const sep = redir.includes("?") ? "&" : "?";
        res.writeHead(302, { Location: redir + sep + "token=" + encodeURIComponent(token) }); return res.end();
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<h2>Signed in to ${APP_NAME}</h2><p>You can close this window.</p>`);
    } catch (e) { res.writeHead(500); return res.end("OAuth error: " + (e && e.message)); }
  }

  if (p === "/me" && req.method === "GET") {
    if (rateLimited(req, "me", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req));
    if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub);
    if (!user) return json(res, 401, { error: "unknown user" });
    const seen = user.lastSeenAt ? Date.parse(user.lastSeenAt) : 0;
    if (Date.now() - seen > 5 * 60000) store.patchUser(user.id, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    const st = statusOf(user);
    if (st.status === "suspended") return json(res, 403, { error: "suspended" });
    return json(res, 200, {
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider },
      admin: isAdminEmail(user.email),
      status: st.status, trialEndsAt: user.trialEndsAt, daysLeft: st.daysLeft,
      subscription: { active: !!user.subscriptionActive || !!user.freeAccess || isFreeEmail(user.email), plan: (user.freeAccess || isFreeEmail(user.email)) ? "Complimentary" : (user.plan || null) },
    });
  }

  if (p === "/auth/logout" && req.method === "POST") return json(res, 200, { ok: true });

  if (p === "/auth/dev/start" && req.method === "GET") {
    if (process.env.ALLOW_DEV_LOGIN !== "1") return json(res, 404, { error: "not found" });
    const redirect = u.searchParams.get("redirect") || "";
    const email = u.searchParams.get("email") || "dev@local";
    const existed = await store.getUser("dev:" + email);
    const user = await store.upsertUser({ sub: "dev:" + email, email, name: "Dev User", avatar: "" });
    await store.logEvent({ userId: user.id, type: existed ? "signin" : "signup", meta: { provider: "dev" } });
    await store.patchUser(user.id, { lastSeenAt: new Date().toISOString() });
    const token = sign(user.id);
    if (redirect && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(redirect)) {
      const sep = redirect.includes("?") ? "&" : "?";
      res.writeHead(302, { Location: redirect + sep + "token=" + encodeURIComponent(token) }); return res.end();
    }
    return json(res, 200, { token });
  }

  m = p.match(/^\/admin\/users\/(.+)\/(suspend|unsuspend|comp|uncomp)$/);
  if (m && req.method === "POST") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const id = decodeURIComponent(m[1]); const user = await store.getUser(id);
    if (!user) return json(res, 404, { error: "no such user" });
    const action = m[2];
    if (action === "suspend" || action === "unsuspend") { await store.patchUser(id, { suspended: action === "suspend" }); return json(res, 200, { ok: true, id, suspended: action === "suspend" }); }
    await store.patchUser(id, { freeAccess: action === "comp" });
    return json(res, 200, { ok: true, id, freeAccess: action === "comp" });
  }

  if (p === "/events" && req.method === "POST") {
    if (rateLimited(req, "events", 300, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let body = {}; try { body = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    if (!body.type) return json(res, 400, { error: "type required" });
    await store.logEvent({ userId: pl.sub, type: String(body.type).slice(0, 40), meta: body.meta || null });
    store.patchUser(pl.sub, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    return json(res, 200, { ok: true });
  }

  if (p === "/admin/users" && req.method === "GET") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const users = await store.listUsers();
    return json(res, 200, { users: users.map((x) => { const s = statusOf(x); return {
      id: x.id, name: x.name, email: x.email, provider: x.provider, status: s.status, daysLeft: s.daysLeft,
      createdAt: x.createdAt, lastSeenAt: x.lastSeenAt, suspended: !!x.suspended,
      freeAccess: !!x.freeAccess || isFreeEmail(x.email), subscriptionActive: !!x.subscriptionActive, plan: x.plan || null,
    }; }) });
  }

  if (p === "/admin/stats" && req.method === "GET") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const users = await store.listUsers();
    const now = Date.now();
    const within = (iso, ms) => !!iso && (now - Date.parse(iso) <= ms);
    const counts = { total: users.length, trialing: 0, active: 0, expired: 0, suspended: 0, paying: 0, comp: 0, active24h: 0, active7d: 0, new7d: 0 };
    for (const x of users) {
      const s = statusOf(x).status; counts[s] = (counts[s] || 0) + 1;
      if (x.subscriptionActive) counts.paying++;
      if (x.freeAccess || isFreeEmail(x.email)) counts.comp++;
      if (within(x.lastSeenAt, 864e5)) counts.active24h++;
      if (within(x.lastSeenAt, 7 * 864e5)) counts.active7d++;
      if (within(x.createdAt, 7 * 864e5)) counts.new7d++;
    }
    const ev = await store.recentEvents(2000);
    const last7d = { signup: 0, signin: 0, subscribed: 0 };
    for (const e of ev) if (within(e.ts, 7 * 864e5) && last7d[e.type] !== undefined) last7d[e.type]++;
    return json(res, 200, { counts, last7d, events: ev.slice(0, 60) });
  }

  if (p === "/billing/checkout" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    if (process.env.ALLOW_DEV_LOGIN === "1" && (!STRIPE_SECRET || !STRIPE_PRICE)) {
      await store.patchUser(user.id, { stripeCustomerId: user.stripeCustomerId || ("cus_dev_" + user.id), subscriptionActive: true, plan: "pro (dev)" });
      await store.logEvent({ userId: user.id, type: "subscribed", meta: { plan: "pro (dev)" } });
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

  if (p === "/billing/portal" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub);
    if (!user || !user.stripeCustomerId) return json(res, 400, { error: "no subscription" });
    const ps = await stripe("billing_portal/sessions", { customer: user.stripeCustomerId, return_url: `${BASE}/billing/done` });
    if (!ps.url) return json(res, 502, { error: "stripe", detail: JSON.stringify(ps).slice(0, 300) });
    return json(res, 200, { url: ps.url });
  }

  if (p === "/billing/webhook" && req.method === "POST") {
    const raw = await rawBody(req);
    if (STRIPE_WH && !verifyStripeSig(req.headers["stripe-signature"], raw, STRIPE_WH)) return json(res, 400, { error: "bad signature" });
    let evt; try { evt = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
    const obj = (evt.data && evt.data.object) || {};
    if (evt.type === "checkout.session.completed") {
      const usr = await store.getUser(obj.client_reference_id);
      if (usr) { await store.patchUser(usr.id, { stripeCustomerId: obj.customer, stripeSubId: obj.subscription, subscriptionActive: true, plan: "pro" }); await store.logEvent({ userId: usr.id, type: "subscribed", meta: { plan: "pro" } }); }
    } else if (evt.type === "customer.subscription.deleted") {
      const usr = await store.findByCustomer(obj.customer); if (usr) await store.patchUser(usr.id, { subscriptionActive: false, plan: null });
    } else if (evt.type === "customer.subscription.updated") {
      const usr = await store.findByCustomer(obj.customer); if (usr) await store.patchUser(usr.id, { subscriptionActive: ["active", "trialing", "past_due"].includes(obj.status) });
    }
    return json(res, 200, { received: true });
  }

  if (p === "/billing/done") return html(res, `<div><h2>Subscription active 🎉</h2><p>You can close this window and return to ${APP_NAME} — it unlocks automatically.</p></div>`);
  if (p === "/billing/cancel") return html(res, "<div><h2>Checkout canceled</h2><p>No charge was made. You can close this window.</p></div>");

  if (p === "/health") return json(res, 200, { ok: true });
  if (req.method === "GET") return serveStatic(res, p);
  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`${APP_NAME} auth server on ${BASE}  (store ${store.kind} · trial ${TRIAL_DAYS}d · dev-login ${process.env.ALLOW_DEV_LOGIN === "1" ? "ON" : "off"} · stripe ${STRIPE_SECRET && STRIPE_PRICE ? "ON" : "off"})`);
