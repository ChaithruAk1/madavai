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
import { makeStore } from "./store.mjs";
import { scoreQuiz, scoreBatch } from "./quiz.mjs";

// Minimal .env loader (no dependency): load server/.env into process.env if present.
// Real environment variables (e.g. set in PowerShell or on the host) always win.
try {
  const txt = fs.readFileSync(new URL("./.env", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const PORT = +(process.env.PORT || 8787);
const BASE = process.env.AUTH_BASE_URL || `http://127.0.0.1:${PORT}`;
const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
const ADMIN_KEY = process.env.ADMIN_KEY || "dev-admin-key";
// PRODUCTION GUARD: refuse to start with factory-default secrets outside local dev.
// "Production" = NODE_ENV=production, a PaaS marker (Render sets RENDER), or a non-loopback base URL.
const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER || !/127\.0\.0\.1|localhost/.test(BASE);
if (IS_PROD) {
  const bad = [];
  if (SECRET === "dev-insecure-secret-change-me") bad.push("SESSION_SECRET");
  if (ADMIN_KEY === "dev-admin-key") bad.push("ADMIN_KEY");
  if (bad.length) {
    console.error(`[auth-server] FATAL: refusing to start in production with default ${bad.join(" + ")}. Set strong values (e.g. "openssl rand -hex 32") and restart.`);
    process.exit(1);
  }
}
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h; re-validated online so bans still bite quickly
// Extra redirect targets allowed besides loopback (your web app origin), comma-separated.
const ALLOWED_REDIRECTS = (process.env.ALLOWED_REDIRECTS || "").split(",").map((s) => s.trim()).filter(Boolean);
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

// ---- user store (JSON file by default, Postgres when DATABASE_URL is set) ----
const store = await makeStore();

// Email lists read live (editing the file needs no restart): combines an env var (comma-separated)
// with a text file (one email per line, '#' for comments).
//   free-emails  -> users who get free access (no subscription)
//   admin-emails -> users who can see analytics + manage users
const FREE_EMAILS_FILE = new URL("./free-emails.txt", import.meta.url);
const ADMIN_EMAILS_FILE = new URL("./admin-emails.txt", import.meta.url);
function emailSet(envVar, file) {
  const set = new Set((process.env[envVar] || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  try {
    const txt = fs.readFileSync(file, "utf8");
    for (const line of txt.split(/\r?\n/)) { const e = line.split("#")[0].trim().toLowerCase(); if (e) set.add(e); }
  } catch {}
  return set;
}
const isFreeEmail = (email) => !!email && emailSet("FREE_EMAILS", FREE_EMAILS_FILE).has(email.toLowerCase());
const isAdminEmail = (email) => !!email && emailSet("ADMIN_EMAILS", ADMIN_EMAILS_FILE).has(email.toLowerCase());

// Admin endpoints accept EITHER the x-admin-key header OR a signed-in admin-email user's session.
// Hardened: timing-safe key compare + a strict per-IP rate limit so the key can't be brute-forced.
function safeEq(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}
async function adminOk(req) {
  if (rateLimited(req, "admin", 30, 60000)) return false; // 30 admin calls/min/IP — humans never exceed this
  const hdr = req.headers["x-admin-key"] || "";
  if (ADMIN_KEY && hdr && safeEq(hdr, ADMIN_KEY)) return true;
  const pl = verify(bearer(req)); if (!pl) return false;
  const u = await store.getUser(pl.sub); return !!(u && isAdminEmail(u.email));
}

function statusOf(u) {
  const now = Date.now();
  if (u.suspended) return { status: "suspended", daysLeft: 0 };
  if (u.freeAccess || isFreeEmail(u.email)) return { status: "active", daysLeft: null };   // comped (by id) or on the free-emails list
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
// Long-lived token for the CLI (the terminal can't re-auth interactively often). Still re-validated
// online against the user's live subscription on every CLI start, so a cancellation/ban bites quickly.
const CLI_TTL_MS = 365 * 24 * 60 * 60 * 1000;
function signCli(sub) {
  const payload = b64u(JSON.stringify({ sub, cli: true, exp: Date.now() + CLI_TTL_MS }));
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + mac;
}

// ---- helpers ----
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type, x-admin-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" }); res.end(JSON.stringify(obj)); };

// Static serving for the WEB app: serves the built Vite bundle (dist/) so the web app and the API
// share one origin (no CORS, OAuth redirects come back here). SPA fallback to index.html.
const WEB_DIR = process.env.WEB_DIR || path.join(process.cwd(), "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json" };
function serveStatic(res, p) {
  let rel = decodeURIComponent(p).replace(/^\/+/, "") || "index.html";
  const file = path.join(WEB_DIR, rel);
  if (!file.startsWith(WEB_DIR)) { res.writeHead(403); return res.end(); } // path-traversal guard
  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(WEB_DIR, "index.html"), (e2, idx) => {
        if (e2) return json(res, 404, { error: "not found" });
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(idx);
      });
      return;
    }
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}
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
// A redirect target is allowed if it's loopback (desktop) or in the ALLOWED_REDIRECTS list (web).
const isAllowedRedirect = (r) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(r) || ALLOWED_REDIRECTS.some((a) => r.startsWith(a));

// OAuth state store with a 10-minute TTL (CSRF protection).
const pending = new Map(); // state -> { provider, redirect, exp }
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (v.exp < now) pending.delete(k); }, 60000).unref?.();

// Simple in-memory rate limiter (per IP + bucket). Swap for a shared store if you run multiple instances.
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

  // GET /auth/:provider/start?redirect=...&state=...
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

  // GET /auth/:provider/callback?code=...&state=...
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
    if (rateLimited(req, "me", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req));
    if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub);
    if (!user) return json(res, 401, { error: "unknown user" });
    // Throttled last-seen so we don't write on every poll (poll is every ~3 min anyway).
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

  // POST /cli/token (Bearer session) — mint a long-lived CLI token. Called by the desktop app's
  // "Enable terminal access" so the CLI can verify the subscription without re-login.
  if (p === "/cli/token" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    const st = statusOf(user);
    return json(res, 200, { token: signCli(user.id), status: st.status, daysLeft: st.daysLeft, email: user.email });
  }

  // GET /cli/verify (Bearer CLI token) — the CLI calls this on startup to confirm an active subscription.
  if (p === "/cli/verify" && req.method === "GET") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    const st = statusOf(user);
    const ok = st.status === "active" || st.status === "trialing";
    if (user.lastSeenAt == null || Date.now() - Date.parse(user.lastSeenAt || 0) > 5 * 60000) store.patchUser(user.id, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    return json(res, 200, { ok, status: st.status, daysLeft: st.daysLeft, email: user.email, name: user.name });
  }

  // POST /auth/logout  (stateless tokens — client just drops it; here we no-op)
  if (p === "/auth/logout" && req.method === "POST") return json(res, 200, { ok: true });

  // DEV-ONLY test login (no OAuth). Enable with ALLOW_DEV_LOGIN=1. NEVER enable in production.
  if (p === "/auth/dev/start" && req.method === "GET") {
    if (process.env.ALLOW_DEV_LOGIN !== "1") return json(res, 404, { error: "not found" });
    const redirect = u.searchParams.get("redirect") || "";
    const email = u.searchParams.get("email") || "dev@brainedge.local";
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

  // POST /admin/users/:id/(suspend|unsuspend|comp|uncomp)   header: x-admin-key
  // comp = give this user free access forever (no subscription needed); uncomp removes it.
  m = p.match(/^\/admin\/users\/(.+)\/(suspend|unsuspend|comp|uncomp)$/);
  if (m && req.method === "POST") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const id = decodeURIComponent(m[1]); const user = await store.getUser(id);
    if (!user) return json(res, 404, { error: "no such user" });
    const action = m[2];
    if (action === "suspend" || action === "unsuspend") { await store.patchUser(id, { suspended: action === "suspend" }); return json(res, 200, { ok: true, id, suspended: action === "suspend" }); }
    await store.patchUser(id, { freeAccess: action === "comp" }); // comp / uncomp
    return json(res, 200, { ok: true, id, freeAccess: action === "comp" });
  }

  // POST /events (Bearer) -> log an app-reported usage event (e.g. opened a section). Never prompt content.
  if (p === "/events" && req.method === "POST") {
    if (rateLimited(req, "events", 300, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let body = {}; try { body = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    if (!body.type) return json(res, 400, { error: "type required" });
    await store.logEvent({ userId: pl.sub, type: String(body.type).slice(0, 40), meta: body.meta || null });
    store.patchUser(pl.sub, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    return json(res, 200, { ok: true });
  }

  // POST /visit (no auth) -> log an anonymous website visit, for visitor analytics.
  if (p === "/visit" && req.method === "POST") {
    if (rateLimited(req, "visit", 600, 60000)) return json(res, 200, { ok: true });
    let b = {}; try { b = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    const v = String(b.visitorId || "").slice(0, 40) || "anon";
    await store.logEvent({ userId: null, type: "visit", meta: { v } });
    return json(res, 200, { ok: true });
  }

  // POST /score-quiz (Bearer) -> grade speed-check answers server-side (the answer key + scoring stay
  // off the client). Body { batch: { label: {id:text} } } -> { scores: { label: scoresObj } }.
  if (p === "/score-quiz" && req.method === "POST") {
    if (rateLimited(req, "score", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let b = {}; try { b = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    if (b.batch) return json(res, 200, { scores: scoreBatch(b.batch) });
    return json(res, 200, { score: scoreQuiz(b.answers || b) });
  }

  // POST /proxy/chat (Bearer) — forward a streaming chat to the user's provider. Lets the WEB app reach
  // providers that don't allow direct browser calls (CORS), e.g. NVIDIA/OpenAI. Signed-in users only.
  if (p === "/proxy/chat" && req.method === "POST") {
    if (rateLimited(req, "proxy", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let b = {}; try { b = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    const { kind, baseUrl, apiKey, model, messages } = b;
    if (!baseUrl || !model) return json(res, 400, { error: "baseUrl and model required" });
    try {
      let url, headers, payload;
      if (kind === "anthropic") {
        url = baseUrl.replace(/\/$/, "") + "/v1/messages";
        const system = (messages || []).filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
        const turns = (messages || []).filter((m) => m.role !== "system");
        headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}) };
        payload = { model, max_tokens: 4096, system, messages: turns, stream: true };
      } else {
        const bb = (baseUrl || "").replace(/\/$/, ""); const apib = /\/v\d|\/openai/.test(bb) ? bb : bb + "/v1";
        url = apib + "/chat/completions";
        headers = { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}) };
        payload = { model, messages, stream: true };
      }
      const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "text/event-stream", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" });
      if (upstream.body) { const reader = upstream.body.getReader(); while (true) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } }
      return res.end();
    } catch (e) { if (!res.headersSent) return json(res, 502, { error: "proxy", detail: String((e && e.message) || e) }); try { res.end(); } catch {} }
  }

  // POST /proxy/models (Bearer) — list models via the user's provider (CORS bypass for the web app).
  if (p === "/proxy/models" && req.method === "POST") {
    if (rateLimited(req, "proxy", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let b = {}; try { b = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    const { kind, baseUrl, apiKey } = b;
    if (!baseUrl) return json(res, 400, { error: "baseUrl required" });
    try {
      const bb = (baseUrl || "").replace(/\/$/, ""); const apib = /\/v\d|\/openai/.test(bb) ? bb : bb + "/v1";
      const headers = {};
      if (kind === "anthropic") { headers["anthropic-version"] = "2023-06-01"; if (apiKey) headers["x-api-key"] = apiKey; }
      else if (apiKey) headers["Authorization"] = "Bearer " + apiKey;
      const r = await fetch(apib + "/models", { headers });
      const j = await r.json().catch(() => ({}));
      return json(res, 200, j);
    } catch (e) { return json(res, 502, { error: "proxy", detail: String((e && e.message) || e) }); }
  }

  // POST /proxy/fetch (Bearer) — fetch a web page / search the web for the agent. Browsers can't fetch
  // arbitrary sites (CORS), so the web app routes its web_fetch / web_search tools through here.
  if (p === "/proxy/fetch" && req.method === "POST") {
    if (rateLimited(req, "fetch", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    let b = {}; try { b = JSON.parse((await rawBody(req)) || "{}"); } catch {}
    let target = String(b.url || "").trim();
    if (b.query && !target) target = "https://duckduckgo.com/html/?q=" + encodeURIComponent(b.query); // simple web search
    if (!/^https?:\/\//i.test(target)) return json(res, 400, { error: "http(s) url or query required" });
    // SSRF guard: block private / loopback hosts.
    try { const h = new URL(target).hostname; if (/^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|::1)/i.test(h) || /\.(local|internal)$/i.test(h)) return json(res, 403, { error: "blocked host" }); } catch { return json(res, 400, { error: "bad url" }); }
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 15000);
      const r = await fetch(target, { headers: { "User-Agent": "BrainEdge/1.0", Accept: "text/html,application/json,text/plain,*/*" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(to));
      const ct = r.headers.get("content-type") || ""; const raw = (await r.text()).slice(0, 600000);
      let text = raw;
      if (/html/i.test(ct)) {
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n").replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
      }
      return json(res, 200, { url: r.url, status: r.status, contentType: ct, text: text.slice(0, 40000) });
    } catch (e) { return json(res, 502, { error: "fetch", detail: String((e && e.message) || e) }); }
  }

  // GET /admin/users (x-admin-key) -> all users with computed status + last-seen.
  if (p === "/admin/users" && req.method === "GET") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const users = await store.listUsers();
    return json(res, 200, { users: users.map((x) => { const s = statusOf(x); return {
      id: x.id, name: x.name, email: x.email, provider: x.provider, status: s.status, daysLeft: s.daysLeft,
      createdAt: x.createdAt, lastSeenAt: x.lastSeenAt, suspended: !!x.suspended,
      freeAccess: !!x.freeAccess || isFreeEmail(x.email), subscriptionActive: !!x.subscriptionActive, plan: x.plan || null,
    }; }) });
  }

  // GET /admin/stats (x-admin-key) -> aggregate counts, 7-day funnel, recent events.
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
    const ev = await store.recentEvents(5000);
    const last7d = { signup: 0, signin: 0, subscribed: 0 };
    const visitors = new Set(); let visits7d = 0, visits24h = 0;
    const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
    const series = {}; // last 14 days: visits + signups per day (for the trend chart)
    for (let i = 13; i >= 0; i--) { const k = dayKey(now - i * 864e5); series[k] = { day: k, visits: 0, signups: 0 }; }
    for (const e of ev) {
      if (within(e.ts, 7 * 864e5) && last7d[e.type] !== undefined) last7d[e.type]++;
      if (e.type === "visit") {
        if (within(e.ts, 7 * 864e5)) { visits7d++; if (e.meta && e.meta.v) visitors.add(e.meta.v); }
        if (within(e.ts, 864e5)) visits24h++;
      }
      const k = dayKey(e.ts);
      if (series[k]) { if (e.type === "visit") series[k].visits++; if (e.type === "signup") series[k].signups++; }
    }
    const audience = { visits7d, visits24h, uniqueVisitors: visitors.size,
      conversion: visitors.size > 0 ? Math.round((last7d.signup / visitors.size) * 100) : 0 };
    // Activity feed: real account events only (drop section "view" + anonymous "visit" noise), with email.
    const umap = {}; for (const u of users) umap[u.id] = u.email || u.name || u.id;
    const events = ev.filter((e) => e.type !== "view" && e.type !== "visit").slice(0, 50)
      .map((e) => ({ ts: e.ts, type: e.type, email: e.userId ? (umap[e.userId] || e.userId) : null, meta: e.meta || null }));
    return json(res, 200, { counts, last7d, audience, series: Object.values(series), events });
  }

  // POST /billing/checkout (Bearer) -> { url } : start a Stripe subscription Checkout.
  if (p === "/billing/checkout" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    // DEV simulate: with dev login on and no Stripe configured, mark the account active so the
    // subscribe → auto-unlock flow can be tested without Stripe/CLI. NEVER active in production.
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

  // POST /billing/portal (Bearer) -> { url } : Stripe customer portal to manage/cancel.
  if (p === "/billing/portal" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub);
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
    const obj = (evt.data && evt.data.object) || {};
    if (evt.type === "checkout.session.completed") {
      const u = await store.getUser(obj.client_reference_id);
      if (u) { await store.patchUser(u.id, { stripeCustomerId: obj.customer, stripeSubId: obj.subscription, subscriptionActive: true, plan: "pro" }); await store.logEvent({ userId: u.id, type: "subscribed", meta: { plan: "pro" } }); }
    } else if (evt.type === "customer.subscription.deleted") {
      const u = await store.findByCustomer(obj.customer); if (u) await store.patchUser(u.id, { subscriptionActive: false, plan: null });
    } else if (evt.type === "customer.subscription.updated") {
      const u = await store.findByCustomer(obj.customer); if (u) await store.patchUser(u.id, { subscriptionActive: ["active", "trialing", "past_due"].includes(obj.status) });
    }
    return json(res, 200, { received: true });
  }

  if (p === "/billing/done") return html(res, "<div><h2>Subscription active 🎉</h2><p>You can close this window and return to BrainEdge — it unlocks automatically.</p></div>");
  if (p === "/billing/cancel") return html(res, "<div><h2>Checkout canceled</h2><p>No charge was made. You can close this window.</p></div>");

  if (p === "/health") return json(res, 200, { ok: true });

  // GET /app-version — desktop update check. Set APP_VERSION (e.g. "0.4.0") and
  // APP_DOWNLOAD_URL when you publish a new installer; clients compare and show a banner.
  if (p === "/app-version" && req.method === "GET") {
    return json(res, 200, { version: process.env.APP_VERSION || "", url: process.env.APP_DOWNLOAD_URL || "" });
  }
  // Anything else: serve the web app (GET) or 404 (other methods).
  if (req.method === "GET") return serveStatic(res, p);
  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => console.log(`BrainEdge auth server on ${BASE}  (store ${store.kind} · trial ${TRIAL_DAYS}d · dev-login ${process.env.ALLOW_DEV_LOGIN === "1" ? "ON" : "off"} · stripe ${STRIPE_SECRET && STRIPE_PRICE ? "ON" : "off"})`));
