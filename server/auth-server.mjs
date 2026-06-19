// © 2026 Samskruthi Harish. Madav — Proprietary. Reference auth server (Phase 1).
//
// Zero-dependency Node (>=18) reference implementation of the Madav auth contract (see AUTH.md):
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
import webmd from "../electron/webmd.cjs";
import cspPolicy from "../shared/csp.cjs"; // single CSP source (web + desktop) // LLM-ready web extraction (CJS — Node imports it fine)
import { scoreQuiz, scoreBatch } from "./quiz.mjs";
import * as mcpBroker from "./mcp-broker.mjs"; // Phase 3: server-side MCP broker (HTTP/SSE), SSRF-guarded
import { makeOAuthStateStore } from "./oauth-state.mjs"; // P3.4.3: store-backed, single-use, user-bound OAuth state
import { makeConnectorVault } from "./connector-vault.mjs"; // P3.4.2: per-user encrypted token vault
import { makeProviderKeyVault } from "./provider-key-vault.mjs"; // P3 S3a: sealed BYO provider key for scheduled runs
import { completeOnce } from "./provider-call.mjs"; // P3 S3b: one non-streaming completion -> text
import { makeScheduler } from "./scheduler.mjs"; // P3 S3b: internal claim-first scheduler (single-shot runs)
import { computeNextRunAt, isActiveSchedule, sanitizeSchedule } from "./schedule-next.mjs"; // P3 S4: tz-aware next fire + schedule sanitize
import { beginConnectorSignIn, finishConnectorSignIn, makeWebOAuthProvider } from "./connector-oauth-web.mjs"; // P3.4.5: realigned SDK OAuth + silent provider for the /mcp broker

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
  if (process.env.ALLOW_DEV_LOGIN === "1") {
    console.error(`[auth-server] FATAL: ALLOW_DEV_LOGIN=1 in production would let anyone sign in as any email without OAuth. Unset it and restart.`);
    process.exit(1);
  }
}
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 7);
// Private beta gate: when on, only admins (admin-emails/ADMIN_EMAILS) or free/complimentary users
// (free-emails/FREE_EMAILS or the comped freeAccess flag) may complete sign-in. Everyone else is
// shown a static notice and gets no token. Toggle with PRIVATE_BETA=1.
const PRIVATE_BETA = process.env.PRIVATE_BETA === "1";
if (PRIVATE_BETA) console.log(`[auth-server] PRIVATE_BETA active — only admin / free-access accounts may sign in.`);
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
      const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tok, "User-Agent": "Madav" } })).json();
      let email = u.email;
      if (!email) { try { const es = await (await fetch("https://api.github.com/user/emails", { headers: { Authorization: "Bearer " + tok, "User-Agent": "Madav" } })).json(); email = (es.find((e) => e.primary) || es[0] || {}).email; } catch {} }
      return { sub: "github:" + u.id, email, name: u.name || u.login, avatar: u.avatar_url };
    },
  },
};

// ---- user store (JSON file by default, Postgres when DATABASE_URL is set) ----
const store = await makeStore();

// Phase 3 P3.4.x: connector OAuth state + per-user encrypted token vault. The vault is built LAZILY and is
// key-guarded, so a missing CONNECTOR_VAULT_KEY degrades only the connector routes — never server startup.
const oauthStates = makeOAuthStateStore(store);
let _connectorVault = null;
const connectorVault = () => (_connectorVault ||= makeConnectorVault(store));
let _providerKeyVault = null;
const providerKeyVault = () => (_providerKeyVault ||= makeProviderKeyVault(store));

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

// Private-beta access check: a user is allowed in when PRIVATE_BETA is off, or they're an admin,
// or they're a free/complimentary user (free-emails list or the comped freeAccess flag).
function betaAllowed(user) {
  if (!PRIVATE_BETA) return true;
  return isAdminEmail(user.email) || isFreeEmail(user.email) || !!user.freeAccess;
}
// Static, script-free "not on the access list" page (200) shown when the beta gate blocks a sign-in.
function betaDenied(res) {
  res.setHeader("Content-Security-Policy", HTML_CSP);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Madav — private beta</title><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;text-align:center;margin:0"><div style="max-width:420px;padding:24px"><h2 style="margin:0 0 12px">${esc("Madav is in private beta")}</h2><p style="color:#9aa3b2;line-height:1.5">${esc("Madav is in private beta — this account isn't on the access list yet.")}</p></div></body>`);
}

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
function sign(sub, ver) {
  const payload = b64u(JSON.stringify({ sub, v: ver || 1, exp: Date.now() + SESSION_TTL_MS }));
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + mac;
}
function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, mac] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  // timingSafeEqual THROWS on length-mismatched buffers (truncated/forged token); an uncaught throw
  // in the async handler would hang the socket. Length-check first, then compare. (review M3)
  let macBuf; try { macBuf = Buffer.from(String(mac || "")); } catch { return null; }
  const goodBuf = Buffer.from(good);
  if (macBuf.length !== goodBuf.length || !crypto.timingSafeEqual(macBuf, goodBuf)) return null;
  try { const p = JSON.parse(Buffer.from(payload, "base64url").toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
// Long-lived token for the CLI (the terminal can't re-auth interactively often). Still re-validated
// online against the user's live subscription on every CLI start, so a cancellation/ban bites quickly.
const CLI_TTL_MS = 365 * 24 * 60 * 60 * 1000;
function signCli(sub, ver) {
  const payload = b64u(JSON.stringify({ sub, cli: true, v: ver || 1, exp: Date.now() + CLI_TTL_MS }));
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + mac;
}

// ---- helpers ----
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

// CORS allowlist: the server's own origin, the dev web/app ports, plus EXTRA_ORIGINS (comma list).
// No Origin header (desktop app, curl, server-to-server) -> no CORS headers needed; unknown Origin -> none sent.
const ALLOWED_ORIGINS = new Set([
  new URL(BASE).origin,
  "http://localhost:5174", "http://127.0.0.1:5174", "http://localhost:8787", "http://127.0.0.1:8787",
  ...(process.env.EXTRA_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
]);

// Security headers on every response (set via setHeader so later writeHead calls merge with them).
// CSP defaults to the strict API policy; HTML responses override it with HTML_CSP below.
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
const HTML_CSP = cspPolicy.buildCSP({ web: true });
function baseHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()"); // mic stays on (push-to-talk)
  res.setHeader("Content-Security-Policy", API_CSP);
  if (req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-admin-key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  }
}

// SSRF guard: true when a URL must NOT be fetched server-side (non-http(s), loopback, RFC1918,
// link-local/cloud-metadata, or *.local / *.internal hostnames).
function isForbiddenTarget(urlString) {
  let t; try { t = new URL(urlString); } catch { return true; }
  if (t.protocol !== "http:" && t.protocol !== "https:") return true;
  const h = t.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "::1" || h === "::" || h === "0.0.0.0" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^::ffff:127\./.test(h)) return true; // IPv4-mapped loopback
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const a = +m4[1], b = +m4[2];
    if (a === 0 || a === 127 || a === 10) return true;            // 0/8, loopback, 10/8
    if (a === 172 && b >= 16 && b <= 31) return true;             // 172.16/12
    if (a === 192 && b === 168) return true;                      // 192.168/16
    if (a === 169 && b === 254) return true;                      // link-local / cloud metadata
  }
  return false;
}
// Is the CALLER the local machine? (desktop app talking to its own loopback server)
function isLoopbackCaller(req) {
  const a = req.socket.remoteAddress || "";
  return a === "::1" || a.startsWith("127.") || a.startsWith("::ffff:127.");
}
// /proxy destination allowlist — the caller forwards their apiKey to baseUrl, so restrict targets to
// known providers (suffix-match on hostname, case-insensitive). Extend with env PROXY_HOSTS (CSV, ADDS).
const PROXY_HOST_ALLOW = [
  "openrouter.ai", "api.openai.com", "api.anthropic.com", "generativelanguage.googleapis.com",
  "integrate.api.nvidia.com", "api.groq.com", "api.mistral.ai", "api.together.xyz", "api.deepseek.com",
  "api.fireworks.ai", "api.cerebras.ai", "api.x.ai", "api.cohere.com",
  ...String(process.env.PROXY_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
];
function isAllowedProxyHost(urlString) {
  let t; try { t = new URL(urlString); } catch { return false; }
  const h = t.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return PROXY_HOST_ALLOW.some((d) => h === d || h.endsWith("." + d));
}

// ---- Madav Starter config (see the /starter routes) ----
// House key for zero-setup free models. SERVER-ONLY: set STARTER_OPENROUTER_KEY in the
// host environment; unset = the Starter provider politely reports "not configured".
const STARTER_KEY = process.env.STARTER_OPENROUTER_KEY || "";
const STARTER_NIM_KEY = process.env.STARTER_NVIDIA_KEY || ""; // optional 2nd Starter source — NVIDIA NIM free models (surfaced to clients with an "nim/" id prefix so chat routes back here correctly)
const NIM_BASE = "https://integrate.api.nvidia.com/v1";
const STARTER_DAILY = Math.max(1, Number(process.env.STARTER_DAILY) || 50);
const STARTER_HEADERS = { "HTTP-Referer": "https://madav.ai", "X-Title": "Madav" }; // OpenRouter app attribution
const starterUsed = new Map(); // `${userId}:${yyyy-mm-dd}` → request count (in-memory)
function starterQuota(uid) {
  const today = new Date().toISOString().slice(0, 10);
  const k = uid + ":" + today;
  const n = (starterUsed.get(k) || 0) + 1;
  starterUsed.set(k, n);
  if (starterUsed.size > 20000) for (const key of starterUsed.keys()) if (!key.endsWith(today)) starterUsed.delete(key); // daily GC
  return n <= STARTER_DAILY;
}
if (STARTER_KEY || STARTER_NIM_KEY) console.log(`[auth-server] Madav Starter active — ${[STARTER_KEY && "OpenRouter :free", STARTER_NIM_KEY && "NVIDIA NIM"].filter(Boolean).join(" + ")}, ${STARTER_DAILY}/user/day.`);

// Madav Starter eligibility: TRIAL users only (admins/creators exempt — full access). Paid
// subscribers AND complimentary accounts are excluded — they must add their own provider key.
async function starterEligible(pl) {
  try {
    if (!pl) return false;
    const user = await store.getUser(pl.sub);
    if (!user) return false;
    if (isAdminEmail(user.email)) return true;        // admin / creator: full access
    return statusOf(user).status === "trialing";       // trial only — paid + complimentary excluded
  } catch { return false; }
}

// Static serving for the WEB app: serves the built Vite bundle (dist/) so the web app and the API
// share one origin (no CORS, OAuth redirects come back here). SPA fallback to index.html.
const WEB_DIR = process.env.WEB_DIR || path.join(process.cwd(), "dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".map": "application/json" };
// Marketing landing page: a self-contained static site in landing/ that owns the ROOT
// URL; the app itself lives at /app. Fail-open: no landing folder deployed → the SPA
// serves at / exactly as before this feature existed.
const LANDING_DIR = process.env.LANDING_DIR || path.join(process.cwd(), "landing");
function serveStatic(res, p) {
  let rel = decodeURIComponent(p).replace(/^\/+/, "") || "index.html";
  let dir = WEB_DIR;
  if ((p === "/" || p === "/index.html") && fs.existsSync(path.join(LANDING_DIR, "index.html"))) { dir = LANDING_DIR; rel = "index.html"; }
  else if (rel === "landing" || rel.startsWith("landing/")) { dir = LANDING_DIR; rel = rel.replace(/^landing\/?/, "") || "index.html"; }
  else if (rel === "app" || rel.startsWith("app/")) rel = "index.html"; // the SPA shell (assets use absolute /assets/* paths)
  const root = path.resolve(dir);
  const file = path.resolve(dir, rel);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); } // path-traversal guard (boundary-aware)
  fs.readFile(file, (err, buf) => {
    if (err) {
      fs.readFile(path.join(WEB_DIR, "index.html"), (e2, idx) => {
        if (e2) return json(res, 404, { error: "not found" });
        res.setHeader("Content-Security-Policy", HTML_CSP);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(idx);
      });
      return;
    }
    const ext = file.slice(file.lastIndexOf("."));
    const type = MIME[ext] || "application/octet-stream";
    if (type.startsWith("text/html")) res.setHeader("Content-Security-Policy", HTML_CSP);
    res.writeHead(200, { "Content-Type": type });
    res.end(buf);
  });
}
const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
const html = (res, body) => { res.setHeader("Content-Security-Policy", HTML_CSP); res.writeHead(200, { "Content-Type": "text/html" }); res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;text-align:center">${body}</body>`); };
// Body reader with a size cap: over the limit -> respond 413 and destroy the socket, resolve null
// (callers must `if (raw === null) return;`). Default 1MB; /proxy/chat passes 8MB for vision payloads.
const rawBody = (req, res, limit = 1024 * 1024) => new Promise((r) => {
  let d = "", over = false;
  req.on("data", (c) => {
    if (over) return;
    d += c;
    if (d.length > limit) { over = true; d = ""; try { json(res, 413, { error: "payload too large" }); } catch {} req.destroy(); r(null); }
  });
  req.on("end", () => { if (!over) r(d); });
  req.on("error", () => { if (!over) { over = true; r(null); } });
});

// ---- Stripe (REST; no SDK dependency) ----
async function stripe(pathname, params) {
  const res = await fetch("https://api.stripe.com/v1/" + pathname, {
    method: "POST", headers: { Authorization: "Bearer " + STRIPE_SECRET, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.json();
}
// Webhook idempotency: remember processed Stripe event ids (insertion-ordered Set, capped at 1000).
const seenStripeEvents = new Set();
function stripeEventSeen(id) {
  if (!id) return false;
  if (seenStripeEvents.has(id)) return true;
  seenStripeEvents.add(id);
  if (seenStripeEvents.size > 1000) seenStripeEvents.delete(seenStripeEvents.values().next().value);
  return false;
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
const isAllowedRedirect = (r) => {
  // Loopback (desktop) — anchored, host-exact.
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(r)) return true;
  // Web — EXACT-ORIGIN match. A bare startsWith() let "https://madav.ai@evil.com" and
  // "https://madav.ai.evil.com" pass and leak the session token (review H2). Compare real origins.
  let ro; try { ro = new URL(r).origin; } catch { return false; }
  return ALLOWED_REDIRECTS.some((a) => { try { return new URL(a).origin === ro; } catch { return false; } });
};

// OAuth state store with a 10-minute TTL (CSRF protection).
const pending = new Map(); // state -> { provider, redirect, exp }
setInterval(() => { const now = Date.now(); for (const [k, v] of pending) if (v.exp < now) pending.delete(k); }, 60000).unref?.();

// Client IP for rate-limit keys. The LEFT-most X-Forwarded-For entry is client-controlled (spoofable to
// rotate the key and defeat brute-force limits); the trusted proxy (Render) appends the real peer IP on
// the right, so count TRUSTED_PROXY_HOPS in from the right. (review M5)
const TRUSTED_HOPS = Math.max(1, parseInt(process.env.TRUSTED_PROXY_HOPS || "1", 10) || 1);
function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (xff.length) return xff[Math.max(0, xff.length - TRUSTED_HOPS)];
  return req.socket.remoteAddress || "?";
}
// Simple in-memory rate limiter (per IP + bucket). Swap for a shared store if you run multiple instances.
const hits = new Map();
function rateLimited(req, bucket, max, windowMs) {
  const ip = clientIp(req);
  const key = bucket + ":" + ip; const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now > rec.reset) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  rec.n++; return rec.n > max;
}
const tooMany = (res, retryAfterSec) => { res.setHeader("Retry-After", String(retryAfterSec)); return json(res, 429, { error: "rate limited" }); };

// ---- shared helpers for sharing / requests / community (Phase 3) ----
// HTML-escape every piece of user-supplied content rendered into a server page (XSS guard).
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// Strip control characters (keep \t \n \r) from stored text — community/request content is returned as JSON.
const clean = (s) => String(s == null ? "" : s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
// (removed legacy clean impl)
const newId = () => crypto.randomBytes(16).toString("hex"); // 32-hex random id
// Resolve the Bearer session to a live user (or null). Centralises the verify(bearer(req)) + getUser dance.
async function authUser(req) {
  const pl = verify(bearer(req)); if (!pl) return null;
  const u = await store.getUser(pl.sub); if (!u) return null;
  // Web token revocation: tokens minted before /admin/users/:id/revoke-cli carry an older version;
  // old tokens without `v` skip the check (valid until expiry). (review M3)
  if (typeof pl.v === "number" && pl.v !== (u.tokenVersion || 1)) return null;
  return u;
}
// "Paid" = an active subscription or comped/free-email account (statusOf -> "active"). Trial users are NOT paid.
const isPaid = (u) => !!u && statusOf(u).status === "active";
// Public author label — never leak a full email to other users. Prefer name; else email local-part, truncated.
function authorLabel(u) {
  const name = (u && u.name && String(u.name).trim()) || "";
  if (name) return clean(name).slice(0, 40);
  const local = (u && u.email ? String(u.email).split("@")[0] : "") || "user";
  return clean(local).length > 6 ? clean(local).slice(0, 5) + "…" : clean(local);
}
const REQ_STATUSES = ["requested", "approved", "rejected", "building", "deployed"];
const THREAD_CATEGORIES = ["ideas", "help", "showcase", "general"];

// ---- Phase 3 S4: normalize a scheduled-task body (shared by POST + PUT). Stores the rich shared-UI fields
// (name/description/schedule/target/permission/group/tz) additively; derives enabled + nextRunAt from the
// schedule so daily/weekly/interval all fire correctly. Drafts (no prompt / mode off) are stored but never run.
function sanitizeTaskTarget(t) {
  const x = t || {}; const str = (v) => String(v == null ? "" : v).slice(0, 80);
  const out = { type: ["chat", "project", "agent", "team", "play", "folder", "brief"].includes(x.type) ? x.type : "chat" };
  for (const k of ["projectId", "agentId", "teamId", "skillName"]) if (x[k]) out[k] = str(x[k]);
  return out;
}
function normalizeTaskInput(b, prev, now) {
  const p = prev || {};
  const pick = (k, n, dflt) => String((b[k] != null ? b[k] : (p[k] != null ? p[k] : dflt)) ?? "").slice(0, n);
  const schedule = sanitizeSchedule(b.schedule != null ? b.schedule : p.schedule);
  const prompt = (b.prompt != null ? String(b.prompt) : String(p.prompt || "")).slice(0, 8000);
  const tz = String(b.tz != null ? b.tz : (p.tz || "UTC")).slice(0, 64);
  const provider = ((b.provider != null ? b.provider : p.provider) === "byo") ? "byo" : "starter";
  const intervalMs = schedule.mode === "interval" ? Math.max(15 * 60000, schedule.everyMinutes * 60000) : 0; // min 15-minute interval
  const enabled = isActiveSchedule(schedule) && !!prompt;
  const name = pick("name", 200, b.title != null ? b.title : p.title);
  return {
    title: pick("title", 200, name), name,
    description: pick("description", 2000), prompt,
    model: pick("model", 200), provider, schedule, tz,
    target: sanitizeTaskTarget(b.target != null ? b.target : p.target),
    permission: pick("permission", 20, "ask") || "ask",
    group: pick("group", 80),
    intervalMs, enabled,
    nextRunAt: enabled ? computeNextRunAt(schedule, now, tz) : 0,
  };
}

// ---- Phase 3 S3b: scheduled-task execution (single-shot; Starter house key or sealed BYO key) ----
async function providerCallFor(task, user) {
  const model = String(task.model || ""); const prompt = String(task.prompt || "");
  if (task.provider === "byo") {
    const k = await providerKeyVault().get(task.userId);
    if (!k || !k.apiKey) throw new Error("no stored provider key — add one in Settings");
    if (!isAllowedProxyHost(k.baseUrl)) throw new Error("provider host not allowed");
    return completeOnce({ kind: k.kind, baseUrl: k.baseUrl, apiKey: k.apiKey, model, prompt });
  }
  // Starter (house key). Free models only, mirroring /starter/v1/chat/completions.
  if (!STARTER_KEY && !STARTER_NIM_KEY) throw new Error("Starter is not configured on this server");
  if (model.startsWith("nim/")) {
    if (!STARTER_NIM_KEY) throw new Error("NVIDIA Starter source not configured");
    return completeOnce({ kind: "openai", baseUrl: NIM_BASE, apiKey: STARTER_NIM_KEY, model: model.slice(4), prompt });
  }
  if (/:free$/.test(model)) {
    if (!STARTER_KEY) throw new Error("Starter not configured");
    return completeOnce({ kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: STARTER_KEY, model, prompt, headers: STARTER_HEADERS });
  }
  throw new Error("Starter serves free models only (:free or nim/) — use provider:byo with a stored key for others");
}
const taskScheduler = makeScheduler({ store, providerCallFor, getUser: (id) => store.getUser(id), statusOf });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, BASE);
  const p = u.pathname;
  baseHeaders(req, res); // security + (allowlisted) CORS headers on every response
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (p.startsWith("/auth/") && rateLimited(req, "auth", 30, 15 * 60000)) return tooMany(res, 900);

  // GET /auth/:provider/start?redirect=...&state=...
  let m = p.match(/^\/auth\/(google|github)\/start$/);
  if (m && req.method === "GET") {
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
    if (m[1] === "google") a.searchParams.set("prompt", "select_account"); // always show the account chooser
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
      if (!tr.access_token) {
        // Surface the provider's reason in the server log (never the secret): Google/GitHub
        // always say WHY — invalid_client = secret/ID mismatch, redirect_uri_mismatch, etc.
        console.error(`[auth-server] ${m[1]} token exchange failed:`, JSON.stringify({ error: tr.error, description: tr.error_description, redirect_uri: `${BASE}/auth/${m[1]}/callback`, clientIdTail: String(prov.clientId || "").slice(-20), secretSet: !!prov.clientSecret, secretLen: String(prov.clientSecret || "").length }));
        res.writeHead(400);
        return res.end(`Token exchange failed (${tr.error || "no detail"}) — the server log has specifics.`);
      }
      const idn = await prov.userInfo(tr.access_token);
      const existed = await store.getUser(idn.sub);
      const user = await store.upsertUser(idn);
      await store.logEvent({ userId: user.id, type: existed ? "signin" : "signup", meta: { provider: m[1] } });
      await store.patchUser(user.id, { lastSeenAt: new Date().toISOString() });
      // Private beta gate: only admins / free-access users may finish sign-in; everyone else gets no token.
      if (!betaAllowed(user)) return betaDenied(res);
      const token = sign(user.id, user.tokenVersion || 1);
      const redir = ctx.redirect;
      if (redir && isAllowedRedirect(redir)) {
        // Loopback (desktop): token as a query param so the app's local server receives it.
        const sep = redir.includes("?") ? "&" : "?";
        res.writeHead(302, { Location: redir + sep + "token=" + encodeURIComponent(token) }); return res.end();
      }
      // Web fallback: a real deployment sets a cookie / redirects to the SPA. Dev fallback below.
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<h2>Signed in to Madav</h2><p>You can close this window.</p>`);
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
    if (typeof pl.v === "number" && pl.v !== (user.tokenVersion || 1)) return json(res, 401, { error: "token revoked" });
    const seen = user.lastSeenAt ? Date.parse(user.lastSeenAt) : 0;
    if (Date.now() - seen > 5 * 60000) store.patchUser(user.id, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    const st = statusOf(user);
    if (st.status === "suspended") return json(res, 403, { error: "suspended" });
    // Admins are never "on trial": they own the install — full access, no Upgrade nags.
    const admin = isAdminEmail(user.email);
    return json(res, 200, {
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, provider: user.provider },
      admin,
      status: admin ? "active" : st.status, trialEndsAt: admin ? null : user.trialEndsAt, daysLeft: admin ? null : st.daysLeft,
      subscription: { active: admin || !!user.subscriptionActive || !!user.freeAccess || isFreeEmail(user.email), plan: admin ? "Creator" : (user.freeAccess || isFreeEmail(user.email)) ? "Complimentary" : (user.plan || null) },
    });
  }

  // POST /cli/token (Bearer session) — mint a long-lived CLI token. Called by the desktop app's
  // "Enable terminal access" so the CLI can verify the subscription without re-login.
  if (p === "/cli/token" && req.method === "POST") {
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    const st = statusOf(user);
    return json(res, 200, { token: signCli(user.id, user.tokenVersion || 1), status: st.status, daysLeft: st.daysLeft, email: user.email });
  }

  // GET /cli/verify (Bearer CLI token) — the CLI calls this on startup to confirm an active subscription.
  if (p === "/cli/verify" && req.method === "GET") {
    if (rateLimited(req, "cliverify", 60, 15 * 60000)) return tooMany(res, 900);
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const user = await store.getUser(pl.sub); if (!user) return json(res, 401, { error: "unknown user" });
    // Token-version revocation: tokens minted before /admin/users/:id/revoke-cli carry an older version.
    if ((pl.v || 1) !== (user.tokenVersion || 1)) return json(res, 401, { error: "token revoked" });
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
    const email = u.searchParams.get("email") || "dev@madav.local";
    const existed = await store.getUser("dev:" + email);
    const user = await store.upsertUser({ sub: "dev:" + email, email, name: "Dev User", avatar: "" });
    await store.logEvent({ userId: user.id, type: existed ? "signin" : "signup", meta: { provider: "dev" } });
    await store.patchUser(user.id, { lastSeenAt: new Date().toISOString() });
    // Private beta gate (same as the OAuth callback): only admins / free-access users may finish sign-in.
    if (!betaAllowed(user)) return betaDenied(res);
    const token = sign(user.id, user.tokenVersion || 1);
    if (redirect && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(redirect)) {
      const sep = redirect.includes("?") ? "&" : "?";
      res.writeHead(302, { Location: redirect + sep + "token=" + encodeURIComponent(token) }); return res.end();
    }
    return json(res, 200, { token });
  }

  // POST /admin/users/:id/(suspend|unsuspend|comp|uncomp|revoke-cli)   header: x-admin-key
  // comp = give this user free access forever (no subscription needed); uncomp removes it.
  // revoke-cli = bump the user's token version so all previously minted CLI tokens stop verifying.
  m = p.match(/^\/admin\/users\/(.+)\/(suspend|unsuspend|comp|uncomp|revoke-cli)$/);
  if (m && req.method === "POST") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const id = decodeURIComponent(m[1]); const user = await store.getUser(id);
    if (!user) return json(res, 404, { error: "no such user" });
    const action = m[2];
    if (action === "revoke-cli") { const v = (user.tokenVersion || 1) + 1; await store.patchUser(id, { tokenVersion: v }); return json(res, 200, { ok: true, id, tokenVersion: v }); }
    if (action === "suspend" || action === "unsuspend") { await store.patchUser(id, { suspended: action === "suspend" }); return json(res, 200, { ok: true, id, suspended: action === "suspend" }); }
    await store.patchUser(id, { freeAccess: action === "comp" }); // comp / uncomp
    return json(res, 200, { ok: true, id, freeAccess: action === "comp" });
  }

  // POST /events (Bearer) -> log an app-reported usage event (e.g. opened a section). Never prompt content.
  if (p === "/events" && req.method === "POST") {
    if (rateLimited(req, "events", 300, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 100 * 1024); if (raw === null) return;
    let body = {}; try { body = JSON.parse(raw || "{}"); } catch {}
    if (!body.type) return json(res, 400, { error: "type required" });
    await store.logEvent({ userId: pl.sub, type: String(body.type).slice(0, 40), meta: body.meta || null });
    store.patchUser(pl.sub, { lastSeenAt: new Date().toISOString() }).catch(() => {});
    return json(res, 200, { ok: true });
  }

  // POST /visit (no auth) -> log an anonymous website visit, for visitor analytics.
  if (p === "/visit" && req.method === "POST") {
    if (rateLimited(req, "visit", 600, 60000)) return json(res, 200, { ok: true });
    const raw = await rawBody(req, res, 100 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
    const v = String(b.visitorId || "").slice(0, 40) || "anon";
    await store.logEvent({ userId: null, type: "visit", meta: { v } });
    return json(res, 200, { ok: true });
  }

  // POST /score-quiz (Bearer) -> grade speed-check answers server-side (the answer key + scoring stay
  // off the client). Body { batch: { label: {id:text} } } -> { scores: { label: scoresObj } }.
  if (p === "/score-quiz" && req.method === "POST") {
    if (rateLimited(req, "score", 60, 15 * 60000)) return tooMany(res, 900);
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
    if (b.batch) return json(res, 200, { scores: scoreBatch(b.batch) });
    return json(res, 200, { score: scoreQuiz(b.answers || b) });
  }

  // ---- Workspace sync — agents/teams/folders/instructions follow the ACCOUNT ----
  // API keys and connector tokens are deliberately NOT synced (device-local by design).
  // Last-write-wins via updatedAt; clients compare before applying.
  // ---- Scheduled tasks (Phase 3 S1): per-user task CRUD + run history. STORAGE ONLY — execution
  // (single-shot Starter/BYO run) + scheduler are added later (S2/S3) behind review. No secrets stored here.
  if (p === "/tasks" && req.method === "GET") {
    if (rateLimited(req, "tasks", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const all = await store.col("tasks").all();
    return json(res, 200, { tasks: all.filter((t) => t.userId === user.id) });
  }
  if (p === "/tasks" && req.method === "POST") {
    if (rateLimited(req, "tasks-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const mine = (await store.col("tasks").all()).filter((t) => t.userId === user.id);
    if (mine.length >= 20) return json(res, 400, { error: "task limit reached (max 20)" });
    const now = Date.now();
    const f = normalizeTaskInput(b, null, now); // draft allowed (no prompt / mode off => stored, never fires)
    const task = { id: "tsk_" + crypto.randomBytes(8).toString("hex"), userId: user.id, createdAt: now, lastRunAt: 0, ...f };
    await store.col("tasks").insert(task);
    return json(res, 200, { task });
  }
  if (p.match(/^\/tasks\/[a-z0-9_]+$/i) && req.method === "PUT") {
    if (rateLimited(req, "tasks-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const cur = await store.col("tasks").get(p.split("/")[2]);
    if (!cur || cur.userId !== user.id) return json(res, 404, { error: "not found" });
    const raw = await rawBody(req, res); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const patch = normalizeTaskInput(b, cur, Date.now()); // merges over cur; recomputes enabled + nextRunAt
    return json(res, 200, { task: await store.col("tasks").update(cur.id, patch) });
  }
  if (p.match(/^\/tasks\/[a-z0-9_]+$/i) && req.method === "DELETE") {
    if (rateLimited(req, "tasks-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const cur = await store.col("tasks").get(p.split("/")[2]);
    if (!cur || cur.userId !== user.id) return json(res, 404, { error: "not found" });
    await store.col("tasks").remove(cur.id);
    return json(res, 200, { ok: true });
  }
  if (p.match(/^\/tasks\/[a-z0-9_]+\/runs$/i) && req.method === "GET") {
    if (rateLimited(req, "tasks", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const tid = p.split("/")[2];
    const cur = await store.col("tasks").get(tid);
    if (!cur || cur.userId !== user.id) return json(res, 404, { error: "not found" });
    const runs = (await store.col("runs").all()).filter((r) => r.taskId === tid && r.userId === user.id);
    return json(res, 200, { runs });
  }

  // Run a task NOW (Phase 3 S3b): authed, user-scoped, single-shot via the scheduler (plan + daily quota apply).
  if (p.match(/^\/tasks\/[a-z0-9_]+\/run$/i) && req.method === "POST") {
    if (rateLimited(req, "tasks-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const cur = await store.col("tasks").get(p.split("/")[2]);
    if (!cur || cur.userId !== user.id) return json(res, 404, { error: "not found" });
    const run = await taskScheduler.runDue(cur); // checks plan + daily quota; ONE completion, no tools
    if (run && run.skipped === "quota") return json(res, 429, { error: "daily run limit reached", skipped: "quota" });
    if (run && (run.skipped === "plan" || run.skipped === "no user")) return json(res, 403, { error: "not eligible to run", skipped: run.skipped });
    return json(res, 200, { run });
  }

  // ---- Scheduled-task BYO provider key (Phase 3 S3a): opt-in, sealed server-side, never echoed to the
  // browser. Used later (S3b) to run a scheduled task on the user's own provider. Status is boolean-only.
  if (p === "/tasks/provider-key" && req.method === "POST") {
    if (rateLimited(req, "provkey", 20, 60000)) return tooMany(res, 60);
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const baseUrl = String(b.baseUrl || "").trim(); const apiKey = String(b.apiKey || "").trim();
    if (!baseUrl || !apiKey) return json(res, 400, { error: "baseUrl and apiKey required" });
    if (!isAllowedProxyHost(baseUrl)) return json(res, 400, { error: "unsupported provider host" }); // SSRF allowlist (reused)
    try { await providerKeyVault().set(user.id, { kind: b.kind, baseUrl, apiKey }); }
    catch (e) { return json(res, 500, { error: "vault", detail: String((e && e.message) || e).slice(0, 200) }); }
    return json(res, 200, { ok: true });
  }
  if (p === "/tasks/provider-key/status" && req.method === "GET") {
    if (rateLimited(req, "tasks", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    let st = { stored: false }; try { st = await providerKeyVault().status(user.id); } catch {}
    return json(res, 200, st);
  }
  if (p === "/tasks/provider-key" && req.method === "DELETE") {
    if (rateLimited(req, "provkey", 20, 60000)) return tooMany(res, 60);
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    try { await providerKeyVault().remove(user.id); } catch {}
    return json(res, 200, { ok: true });
  }

  // ---- Project (Workroom) records sync (Phase 2): Workrooms follow the account, like the workspace blob
  // below. Projects carry NO secrets (names/instructions/knowledge-text/agent ids only); 1MB body cap bounds size.
  if (p === "/projects" && req.method === "GET") {
    if (rateLimited(req, "projects", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const rec = await store.col("projects").get(user.id);
    return json(res, 200, rec ? { data: rec.data || {}, updatedAt: rec.updatedAt || 0 } : { data: null, updatedAt: 0 });
  }
  if (p === "/projects" && req.method === "PUT") {
    if (rateLimited(req, "projects-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 1024 * 1024); if (raw === null) return; // 1MB cap
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const src = (b.data && typeof b.data === "object" && !Array.isArray(b.data)) ? b.data : {};
    const data = {};
    for (const id of Object.keys(src).slice(0, 200)) { if (src[id] && typeof src[id] === "object") data[id] = src[id]; }
    const updatedAt = Date.now();
    const existing = await store.col("projects").get(user.id);
    if (existing) await store.col("projects").update(user.id, { data, updatedAt });
    else await store.col("projects").insert({ id: user.id, data, updatedAt });
    return json(res, 200, { ok: true, updatedAt });
  }
  if (p === "/workspace" && req.method === "GET") {
    if (rateLimited(req, "workspace", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const rec = await store.col("workspaces").get(user.id);
    return json(res, 200, rec ? { data: rec.data || {}, updatedAt: rec.updatedAt || 0 } : { data: null, updatedAt: 0 });
  }
  if (p === "/workspace" && req.method === "PUT") {
    if (rateLimited(req, "workspace-w", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 1024 * 1024); if (raw === null) return; // 1MB cap
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    // Whitelist exactly what may sync — nothing secret can ride along.
    const data = {
      agents: Array.isArray(b.agents) ? b.agents.slice(0, 200) : [],
      teams: Array.isArray(b.teams) ? b.teams.slice(0, 50) : [],
      agentGroups: Array.isArray(b.agentGroups) ? b.agentGroups.slice(0, 50) : [],
      globalInstructions: String(b.globalInstructions || "").slice(0, 8000),
    };
    const updatedAt = Date.now();
    const existing = await store.col("workspaces").get(user.id);
    if (existing) await store.col("workspaces").update(user.id, { data, updatedAt });
    else await store.col("workspaces").insert({ id: user.id, data, updatedAt });
    return json(res, 200, { ok: true, updatedAt });
  }

  // ---- Chat sync: conversations follow the account across devices (desktop <-> web) ----
  if (p === "/conversations" && req.method === "GET") {
    if (rateLimited(req, "conversations", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const rec = await store.col("conversations").get(user.id);
    return json(res, 200, rec ? { data: rec.data || {}, updatedAt: rec.updatedAt || 0 } : { data: null, updatedAt: 0 });
  }
  if (p === "/conversations" && req.method === "PUT") {
    if (rateLimited(req, "conversations-w", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 8 * 1024 * 1024); if (raw === null) return; // 8MB cap (chats can be large)
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 200).map((c) => ({
      id: String(c.id || "").slice(0, 80), mode: String(c.mode || "chat").slice(0, 20), title: String(c.title || "Conversation").slice(0, 200),
      projectId: c.projectId ? String(c.projectId).slice(0, 80) : null, createdAt: +c.createdAt || 0, updatedAt: +c.updatedAt || 0,
      messages: Array.isArray(c.messages) ? c.messages.slice(-400) : [],
    })).filter((c) => c.id);
    const inTomb = (Array.isArray(b.tombstones) ? b.tombstones : []).slice(0, 1000)
      .map((t) => ({ id: String((t && t.id) || "").slice(0, 80), deletedAt: +((t && t.deletedAt)) || 0 })).filter((t) => t.id && t.deletedAt);
    const existing = await store.col("conversations").get(user.id);
    const prevItems = (existing && existing.data && Array.isArray(existing.data.items)) ? existing.data.items : [];
    const prevTomb = (existing && existing.data && Array.isArray(existing.data.tombstones)) ? existing.data.tombstones : [];
    // merge tombstones: keep the latest deletedAt per id
    const tomb = new Map();
    for (const t of [...prevTomb, ...inTomb]) { if (!t || !t.id) continue; const p = tomb.get(t.id); if (!p || (t.deletedAt || 0) > (p.deletedAt || 0)) tomb.set(t.id, { id: t.id, deletedAt: t.deletedAt || 0 }); }
    const byId = new Map();
    for (const c of prevItems) byId.set(c.id, c);
    for (const c of items) { const prev = byId.get(c.id); if (!prev || (c.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(c.id, c); } // last-write-wins per conversation
    // apply tombstones: drop a conversation deleted at/after its last edit; if it was edited LATER, it wins and the tombstone is cleared
    for (const [id, t] of tomb) { const it = byId.get(id); if (it && (it.updatedAt || 0) > (t.deletedAt || 0)) tomb.delete(id); else byId.delete(id); }
    const mergedItems = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 500);
    const TOMB_TTL = 120 * 24 * 3600 * 1000, now = Date.now();
    const mergedTomb = [...tomb.values()].filter((t) => now - (t.deletedAt || 0) < TOMB_TTL).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0)).slice(0, 1000);
    const data = { items: mergedItems, tombstones: mergedTomb }; const updatedAt = Date.now();
    if (existing) await store.col("conversations").update(user.id, { data, updatedAt });
    else await store.col("conversations").insert({ id: user.id, data, updatedAt });
    return json(res, 200, { ok: true, updatedAt, count: mergedItems.length, tombstones: mergedTomb.length });
  }

  // ---- Madav Starter — zero-setup free models on the HOUSE key ----
  // The seeded "Madav Starter" profile points the standard OpenAI client here; the
  // bearer is the user's SESSION TOKEN (never an upstream key). The OpenRouter house
  // key lives ONLY in env STARTER_OPENROUTER_KEY — it never reaches any client.
  // Guardrails: signed-in users only, ":free" models only, per-user daily quota
  // (STARTER_DAILY, default 50; in-memory, resets on deploy — fine for the ceiling
  // it is). Long-term users are nudged toward their own keys by the error copy.
  if (p === "/starter/v1/models" && req.method === "GET") {
    if (rateLimited(req, "starter", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "Sign in to Madav to use the Starter models." });
    if (!STARTER_KEY && !STARTER_NIM_KEY) return json(res, 503, { error: "Starter models aren't configured on this server." });
    if (!(await starterEligible(pl))) return json(res, 200, { data: [] }); // not on trial → Starter offers no models
    const data = [];
    if (STARTER_KEY) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: "Bearer " + STARTER_KEY, ...STARTER_HEADERS } });
        const j = await r.json().catch(() => ({}));
        for (const m of (Array.isArray(j.data) ? j.data : [])) if (/:free$/.test(m.id || "")) data.push(m); // OpenRouter free only
      } catch {}
    }
    if (STARTER_NIM_KEY) {
      try {
        const r = await fetch(NIM_BASE + "/models", { headers: { Authorization: "Bearer " + STARTER_NIM_KEY } });
        const j = await r.json().catch(() => ({}));
        for (const m of (Array.isArray(j.data) ? j.data : [])) if (m && m.id) data.push({ ...m, id: "nim/" + m.id }); // namespaced so chat routes to NIM
      } catch {}
    }
    return json(res, 200, { data });
  }
  if (p === "/starter/v1/chat/completions" && req.method === "POST") {
    if (rateLimited(req, "starter", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "Sign in to Madav to use the Starter models." });
    if (!STARTER_KEY && !STARTER_NIM_KEY) return json(res, 503, { error: "Starter models aren't configured on this server." });
    if (!(await starterEligible(pl))) return json(res, 403, { error: "Madav Starter is available during your free trial. You're on a paid or complimentary plan — add your own provider key in Settings → Model configuration to keep using models." });
    const raw = await rawBody(req, res, 8 * 1024 * 1024); if (raw === null) return; // vision payloads
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
    const model = String(b.model || "");
    // Route by source: "nim/<model>" → NVIDIA NIM (free tier); "<id>:free" → OpenRouter free. Nothing else.
    let upstreamUrl, upstreamKey, upstreamHeaders, payload;
    if (model.startsWith("nim/")) {
      if (!STARTER_NIM_KEY) return json(res, 503, { error: "The NVIDIA Starter source isn't configured on this server." });
      upstreamUrl = NIM_BASE + "/chat/completions"; upstreamKey = STARTER_NIM_KEY; upstreamHeaders = {};
      payload = JSON.stringify({ ...b, model: model.slice(4) }); // strip the "nim/" namespace before forwarding
    } else if (/:free$/.test(model)) {
      if (!STARTER_KEY) return json(res, 503, { error: "Starter models aren't configured on this server." });
      upstreamUrl = "https://openrouter.ai/api/v1/chat/completions"; upstreamKey = STARTER_KEY; upstreamHeaders = STARTER_HEADERS;
      payload = raw;
    } else {
      return json(res, 400, { error: "Madav Starter serves free models only (OpenRouter :free or NVIDIA NIM). Add your own API key in Settings → Model configuration for everything else." });
    }
    // Admins ride without limits; everyone else gets the daily Starter quota.
    if (!(await adminOk(req)) && !starterQuota((pl.sub || pl.uid || pl.email || "anon") + "")) return json(res, 429, { error: `Daily Starter limit reached (${STARTER_DAILY} requests). For unlimited use, add your own API key in Settings → Model configuration — it takes two minutes.` });
    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + upstreamKey, ...upstreamHeaders },
        body: payload,
      });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-cache" });
      if (upstream.body) { const reader = upstream.body.getReader(); while (true) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } }
      return res.end();
    } catch (e) { if (!res.headersSent) return json(res, 502, { error: "starter upstream", detail: String((e && e.message) || e) }); try { res.end(); } catch {} }
  }

  // POST /proxy/chat (Bearer) — forward a streaming chat to the user's provider. Lets the WEB app reach
  // providers that don't allow direct browser calls (CORS), e.g. NVIDIA/OpenAI. Signed-in users only.
  if (p === "/proxy/chat" && req.method === "POST") {
    if (rateLimited(req, "proxy", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 8 * 1024 * 1024); if (raw === null) return; // 8MB: vision payloads
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
    const { kind, baseUrl, apiKey, model, messages } = b;
    if (!baseUrl || !model) return json(res, 400, { error: "baseUrl and model required" });
    // SSRF guard — except a loopback caller (the desktop app) may use localhost providers (Ollama/LM Studio).
    if (!isLoopbackCaller(req) && isForbiddenTarget(baseUrl)) return json(res, 403, { error: "blocked host" });
    // Provider allowlist: we forward the caller's apiKey, so only relay to supported providers (loopback exempt).
    if (!isLoopbackCaller(req) && !isAllowedProxyHost(baseUrl)) return json(res, 400, { error: "unsupported provider host — set PROXY_HOSTS to allow it" });
    try {
      let url, headers, payload;
      if (kind === "anthropic") {
        url = baseUrl.replace(/\/$/, "") + "/v1/messages";
        const system = (messages || []).filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
        const turns = (messages || []).filter((m) => m.role !== "system");
        headers = { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}) };
        payload = { model, max_tokens: 16384, system, messages: turns, stream: true };
      } else {
        const bb = (baseUrl || "").replace(/\/$/, ""); const apib = /\/v\d|\/openai/.test(bb) ? bb : bb + "/v1";
        url = apib + "/chat/completions";
        headers = { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}) };
        payload = { model, messages, stream: true, max_tokens: 16384 };
      }
      const upstream = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-cache" });
      if (upstream.body) { const reader = upstream.body.getReader(); while (true) { const { done, value } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } }
      return res.end();
    } catch (e) { if (!res.headersSent) return json(res, 502, { error: "proxy", detail: String((e && e.message) || e) }); try { res.end(); } catch {} }
  }

  // POST /proxy/models (Bearer) — list models via the user's provider (CORS bypass for the web app).
  if (p === "/proxy/models" && req.method === "POST") {
    if (rateLimited(req, "proxy", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch {}
    const { kind, baseUrl, apiKey } = b;
    if (!baseUrl) return json(res, 400, { error: "baseUrl required" });
    // SSRF guard — except a loopback caller (the desktop app) may use localhost providers (Ollama/LM Studio).
    if (!isLoopbackCaller(req) && isForbiddenTarget(baseUrl)) return json(res, 403, { error: "blocked host" });
    // Provider allowlist: we forward the caller's apiKey, so only relay to supported providers (loopback exempt).
    if (!isLoopbackCaller(req) && !isAllowedProxyHost(baseUrl)) return json(res, 400, { error: "unsupported provider host — set PROXY_HOSTS to allow it" });
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
  // POST /proxy/transcribe (Bearer) — forward push-to-talk audio to the user's OWN Whisper-capable endpoint
  // (OpenAI/Groq). Browsers can't POST multipart to those hosts (CORS) and shouldn't expose keys, so the server
  // relays it. BYO key (from the caller's profile) — no Madav-side vendor. Mirrors desktop electron/voice.cjs.
  if (p === "/proxy/transcribe" && req.method === "POST") {
    if (rateLimited(req, "transcribe", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const raw = await rawBody(req, res, 26 * 1024 * 1024); if (raw === null) return; // ~25MB audio ceiling
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const { baseUrl, apiKey, model, path: sttPath, b64, mime } = b;
    if (!baseUrl || !apiKey || !b64) return json(res, 400, { error: "baseUrl, apiKey and audio required" });
    if (!isLoopbackCaller(req) && isForbiddenTarget(baseUrl)) return json(res, 403, { error: "blocked host" });
    if (!isLoopbackCaller(req) && !isAllowedProxyHost(baseUrl)) return json(res, 400, { error: "unsupported provider host — set PROXY_HOSTS to allow it" });
    try {
      const buf = Buffer.from(String(b64), "base64");
      if (buf.length < 1200) return json(res, 400, { error: "That recording was too short — hold the mic and speak." });
      if (buf.length > 25 * 1024 * 1024) return json(res, 400, { error: "Recording too long — keep it under ~2 minutes." });
      const ext = /ogg/.test(mime || "") ? "ogg" : /mp4|m4a/.test(mime || "") ? "m4a" : "webm";
      const form = new FormData();
      form.append("file", new Blob([buf], { type: mime || "audio/webm" }), "speech." + ext);
      form.append("model", String(model || "whisper-1"));
      const url = String(baseUrl).replace(/\/$/, "") + (sttPath || "/v1/audio/transcriptions");
      const up = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + apiKey }, body: form });
      if (!up.ok) { const t = (await up.text()).slice(0, 220); return json(res, 502, { error: "Transcription failed (" + up.status + "): " + t }); }
      const j = await up.json().catch(() => ({}));
      const text = String((j && j.text) || "").trim();
      return json(res, 200, text ? { text } : { error: "Nothing was transcribed — try speaking a little longer." });
    } catch (e) { return json(res, 502, { error: String((e && e.message) || e).slice(0, 200) }); }
  }
  if (p === "/proxy/fetch" && req.method === "POST") {
    if (rateLimited(req, "fetch", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const rawReq = await rawBody(req, res); if (rawReq === null) return;
    let b = {}; try { b = JSON.parse(rawReq || "{}"); } catch {}
    let target = String(b.url || "").trim();
    if (b.query && !target) {
      // Web SEARCH (house key): try the SHARED provider (Tavily/Serper/Brave) first; on no-key / out-of-
      // credits / error, fall through to DuckDuckGo below. One search backend for web + desktop (core/search.js).
      try {
        const { webSearch, formatResults } = await import("../core/search.js");
        const cfg = { provider: process.env.SEARCH_PROVIDER || "auto", tavilyKey: process.env.TAVILY_API_KEY || "", serperKey: process.env.SERPER_API_KEY || "", braveKey: process.env.BRAVE_API_KEY || "" };
        const results = await webSearch(String(b.query), { fetchImpl: fetch, cfg, count: 6 });
        if (Array.isArray(results) && results.length) return json(res, 200, { url: "search:" + b.query, status: 200, text: formatResults(results, b.query) });
      } catch { /* provider failed → DuckDuckGo fallback */ }
      target = "https://duckduckgo.com/html/?q=" + encodeURIComponent(b.query); // simple web search fallback
    }
    if (!/^https?:\/\//i.test(target)) return json(res, 400, { error: "http(s) url or query required" });
    // SSRF guard: block private / loopback / link-local hosts (re-checked on every redirect hop below).
    if (isForbiddenTarget(target)) return json(res, 403, { error: "blocked host" });
    try {
      const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 15000);
      let r;
      try {
        for (let hop = 0; ; hop++) {
          r = await fetch(target, { headers: { "User-Agent": "Madav/1.0", Accept: "text/html,application/json,text/plain,*/*" }, redirect: "manual", signal: ac.signal });
          if (![301, 302, 303, 307, 308].includes(r.status)) break;
          const loc = r.headers.get("location");
          if (!loc) break;
          if (hop >= 5) return json(res, 502, { error: "too many redirects" });
          target = new URL(loc, target).toString();
          if (isForbiddenTarget(target)) return json(res, 403, { error: "blocked host" });
        }
      } finally { clearTimeout(to); }
      const ct = r.headers.get("content-type") || ""; const raw = (await r.text()).slice(0, 600000);
      let text = raw;
      if (/html/i.test(ct)) {
        // LLM-ready extraction: main content as MARKDOWN (electron/webmd.cjs — ESM imports
        // the CJS module directly, one implementation for desktop + server).
        text = webmd.extract(raw, r.url).markdown;
      }
      return json(res, 200, { url: r.url, status: r.status, contentType: ct, text: text.slice(0, 40000) });
    } catch (e) { return json(res, 502, { error: "fetch", detail: String((e && e.message) || e) }); }
  }

  // ---- Phase 3: MCP connector broker (Bearer) — list/call tools on a remote HTTP/SSE MCP server on
  // the agent's behalf (browsers can't, and must not hold connector secrets). Additive + SSRF-guarded.
  // Only a small allowlist of forward headers is honored. NOTE: redirect/DNS-rebinding hardening is a
  // follow-up (docs/PHASE3-MCP.md). stdio MCP servers are desktop-only by design.
  function mcpForwardHeaders(h) {
    if (!h || typeof h !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(h)) {
      if (typeof v === "string" && /^(authorization|x-api-key|x-mcp-[a-z0-9-]+)$/i.test(k)) out[k] = v;
      if (Object.keys(out).length >= 10) break;
    }
    return out;
  }
  if (p === "/mcp/tools" && req.method === "POST") {
    if (rateLimited(req, "mcp", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const rawReq = await rawBody(req, res); if (rawReq === null) return;
    let b = {}; try { b = JSON.parse(rawReq || "{}"); } catch {}
    const url = String(b.url || "").trim();
    try { mcpBroker.assertSafeMcpUrl(url); } catch (e) { return json(res, 400, { error: String((e && e.message) || e) }); }
    try {
      console.log("[mcp] list tools  <-", url);
      const authProvider = b.id ? makeWebOAuthProvider({ vault: connectorVault(), userId: pl.sub, server: { id: String(b.id), url, transport: b.transport }, redirectUrl: `${BASE}/connectors/oauth/callback`, interactive: false }) : null;
      const tools = await mcpBroker.listTools({ url, headers: mcpForwardHeaders(b.headers), authProvider });
      return json(res, 200, { tools });
    } catch (e) { return json(res, 502, { error: "mcp", detail: String((e && e.message) || e) }); }
  }
  if (p === "/mcp/call" && req.method === "POST") {
    if (rateLimited(req, "mcp", 30, 60000)) return json(res, 429, { error: "rate limited" });
    const pl = verify(bearer(req)); if (!pl) return json(res, 401, { error: "unauthenticated" });
    const rawReq = await rawBody(req, res); if (rawReq === null) return;
    let b = {}; try { b = JSON.parse(rawReq || "{}"); } catch {}
    const url = String(b.url || "").trim();
    const name = String(b.name || "").trim();
    if (!name) return json(res, 400, { error: "tool name required" });
    try { mcpBroker.assertSafeMcpUrl(url); } catch (e) { return json(res, 400, { error: String((e && e.message) || e) }); }
    try {
      console.log("[mcp] CALL tool   <-", name, "@", url);
      const authProvider = b.id ? makeWebOAuthProvider({ vault: connectorVault(), userId: pl.sub, server: { id: String(b.id), url, transport: b.transport }, redirectUrl: `${BASE}/connectors/oauth/callback`, interactive: false }) : null;
      const result = await mcpBroker.callTool({ url, headers: mcpForwardHeaders(b.headers), name, args: b.args || {}, authProvider });
      return json(res, 200, { result });
    } catch (e) { return json(res, 502, { error: "mcp", detail: String((e && e.message) || e) }); }
  }

  // ---- Phase 3 P3.4.5 (R2b): REALIGNED connector OAuth via the MCP SDK (generic, one path for ALL
  // connectors). Brokers the same flow desktop's mcp-oauth.cjs runs. Tokens never reach the browser; the
  // server URL is SSRF-checked; tokens are sealed in the per-user vault. Supersedes the bespoke
  // /connectors/:id/oauth/* routes above, which R3 removes once the bridge is wired.
  if (p === "/connectors/signin" && req.method === "POST") {
    if (rateLimited(req, "conn-oauth", 20, 15 * 60000)) return tooMany(res, 900);
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const rawReq = await rawBody(req, res); if (rawReq === null) return;
    let b = {}; try { b = JSON.parse(rawReq || "{}"); } catch {}
    const server = b.server || {};
    if (!server.url || !server.id) return json(res, 400, { error: "server id + url required" });
    try { mcpBroker.assertSafeMcpUrl(server.url); } catch (e) { return json(res, 400, { error: String((e && e.message) || e) }); }
    const redirect = String(b.redirect || "");
    if (redirect && !isAllowedRedirect(redirect)) return json(res, 400, { error: "redirect not allowed" });
    try {
      const r = await beginConnectorSignIn({ vault: connectorVault(), pending: oauthStates, userId: user.id, server, redirectUrl: `${BASE}/connectors/oauth/callback`, redirect });
      return json(res, r.ok ? 200 : 400, r);
    } catch (e) { return json(res, 502, { error: "signin", detail: String((e && e.message) || e).slice(0, 300) }); }
  }
  if (p === "/connectors/oauth/callback" && req.method === "GET") {
    if (rateLimited(req, "conn-oauth", 20, 15 * 60000)) return tooMany(res, 900);
    const code = u.searchParams.get("code"); const state = u.searchParams.get("state");
    let r; try { r = await finishConnectorSignIn({ vault: connectorVault(), pending: oauthStates, stateId: state, code, redirectUrl: `${BASE}/connectors/oauth/callback` }); }
    catch (e) { r = { ok: false, error: String((e && e.message) || e) }; }
    if (!r.ok) { res.writeHead(400); return res.end("Connector sign-in failed"); }
    const redir = r.redirect && isAllowedRedirect(r.redirect) ? r.redirect : "";
    if (redir) { const sep = redir.includes("?") ? "&" : "?"; res.writeHead(302, { Location: redir + sep + "connected=" + encodeURIComponent(r.serverId) }); return res.end(); }
    res.writeHead(200, { "Content-Type": "text/html" }); return res.end(`<h2>Connected to Madav</h2><p>You can close this window.</p>`);
  }
  if (p === "/connectors/status" && req.method === "GET") {
    if (rateLimited(req, "connectors", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const id = u.searchParams.get("id") || "";
    let rec = null; try { rec = await connectorVault().get(user.id, id); } catch {}
    return json(res, 200, { connected: !!(rec && rec.tokens), registered: !!(rec && rec.client) });
  }
  if (p === "/connectors/signout" && req.method === "POST") {
    if (rateLimited(req, "connectors", 60, 60000)) return json(res, 429, { error: "rate limited" });
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const rawReq = await rawBody(req, res); if (rawReq === null) return;
    let b = {}; try { b = JSON.parse(rawReq || "{}"); } catch {}
    try { await connectorVault().remove(user.id, String(b.id || "")); } catch {}
    return json(res, 200, { ok: true });
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
    const raw = await rawBody(req, res); if (raw === null) return;
    // No webhook secret configured, or a bad/missing signature -> reject. Never process unverified events.
    if (!STRIPE_WH || !verifyStripeSig(req.headers["stripe-signature"], raw, STRIPE_WH)) return json(res, 400, { error: "bad signature" });
    let evt; try { evt = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
    if (stripeEventSeen(evt.id)) return json(res, 200, { received: true, duplicate: true }); // idempotency
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

  if (p === "/billing/done") return html(res, "<div><h2>Subscription active 🎉</h2><p>You can close this window and return to Madav — it unlocks automatically.</p></div>");
  if (p === "/billing/cancel") return html(res, "<div><h2>Checkout canceled</h2><p>No charge was made. You can close this window.</p></div>");

  // ===================== FEATURE A — Shareable conversation links =====================
  const SHARE_TTL_MS = 30 * 864e5; // 30 days
  // POST /share (Bearer) — store a read-only snapshot of a conversation, return its public URL.
  if (p === "/share" && req.method === "POST") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "share-create", 10, 60 * 60000)) return tooMany(res, 3600); // ~10/hour/user (per IP)
    const raw = await rawBody(req, res, 200 * 1024); if (raw === null) return; // 200KB cap
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const title = clean(String(b.title || "Shared conversation")).slice(0, 200);
    const msgs = Array.isArray(b.messages) ? b.messages.slice(0, 1000).map((m) => ({
      role: clean(String((m && m.role) || "")).slice(0, 40),
      content: clean(String((m && m.content) || "")).slice(0, 100000),
    })) : [];
    if (!msgs.length) return json(res, 400, { error: "messages required" });
    const now = Date.now();
    const doc = { id: newId(), userId: user.id, title, messages: msgs, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SHARE_TTL_MS).toISOString() };
    await store.col("shares").insert(doc);
    return json(res, 200, { id: doc.id, url: BASE + "/s/" + doc.id });
  }

  // GET /s/:id — server-rendered, script-free, read-only HTML view of a shared conversation.
  let sm = p.match(/^\/s\/([0-9a-f]{32})$/);
  if (sm && req.method === "GET") {
    const share = await store.col("shares").get(sm[1]);
    const expired = share && Date.parse(share.expiresAt) < Date.now();
    if (expired) { await store.col("shares").remove(share.id).catch(() => {}); } // lazy prune
    if (!share || expired) {
      res.setHeader("Content-Security-Policy", HTML_CSP);
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh;text-align:center"><div><h2>Share not found</h2><p style="color:#9aa3b2">This link is invalid or has expired.</p></div></body>`);
    }
    const blocks = share.messages.map((m) => {
      const role = esc(m.role || "message");
      return `<div style="margin:0 0 16px;border:1px solid #1e2533;border-radius:10px;overflow:hidden"><div style="padding:6px 12px;background:#141a26;color:#7c89a0;font-size:12px;text-transform:uppercase;letter-spacing:.05em">${role}</div><div style="padding:12px;white-space:pre-wrap;word-break:break-word">${esc(m.content)}</div></div>`;
    }).join("");
    const expDate = esc(new Date(share.expiresAt).toISOString().slice(0, 10));
    res.setHeader("Content-Security-Policy", HTML_CSP);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(share.title)} — Madav</title><body style="font-family:system-ui;background:#0b0d12;color:#e6e9ef;margin:0"><div style="max-width:760px;margin:0 auto;padding:32px 20px"><h1 style="font-size:22px;margin:0 0 24px">${esc(share.title)}</h1>${blocks}<footer style="margin-top:28px;padding-top:16px;border-top:1px solid #1e2533;color:#7c89a0;font-size:13px">Shared from Madav · expires ${expDate}</footer></div></body>`);
  }

  // DELETE /share/:id — owner only.
  sm = p.match(/^\/share\/([0-9a-f]{32})$/);
  if (sm && req.method === "DELETE") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const share = await store.col("shares").get(sm[1]);
    if (!share) return json(res, 404, { error: "not found" });
    if (share.userId !== user.id) return json(res, 403, { error: "forbidden" });
    await store.col("shares").remove(share.id);
    return json(res, 200, { ok: true });
  }

  // ===================== FEATURE B — Product Requests (voting board) =====================
  // GET /requests (Bearer) — list all with vote counts, whether the caller voted, and canVote.
  if (p === "/requests" && req.method === "GET") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "requests-read", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const canVote = isPaid(user);
    const all = await store.col("requests").all();
    const list = all.map((r) => ({
      id: r.id, authorName: r.authorName, title: r.title, detail: r.detail, status: r.status,
      voteCount: Array.isArray(r.votes) ? r.votes.length : 0,
      voted: Array.isArray(r.votes) && r.votes.includes(user.id),
      mine: r.userId === user.id, createdAt: r.createdAt, statusAt: r.statusAt, adminNote: r.adminNote || null,
    }));
    return json(res, 200, { canVote, requests: list });
  }

  // POST /requests (Bearer) — create a feature request.
  if (p === "/requests" && req.method === "POST") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "requests-create", 5, 24 * 60 * 60000)) return tooMany(res, 86400); // 5/day/user (per IP)
    const raw = await rawBody(req, res, 64 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const title = clean(String(b.title || "")).trim().slice(0, 120);
    const detail = clean(String(b.detail || "")).trim().slice(0, 2000);
    if (!title) return json(res, 400, { error: "title required" });
    const doc = { id: newId(), userId: user.id, authorName: authorLabel(user), title, detail, status: "requested", votes: [], createdAt: new Date().toISOString(), statusAt: null, adminNote: null };
    await store.col("requests").insert(doc);
    return json(res, 200, { id: doc.id });
  }

  // POST /requests/:id/vote (Bearer) — toggle a vote; subscribed/comped users only.
  let rm = p.match(/^\/requests\/([0-9a-f]{32})\/vote$/);
  if (rm && req.method === "POST") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "requests-vote", 60, 60000)) return json(res, 429, { error: "rate limited" });
    if (!isPaid(user)) return json(res, 403, { error: "Voting is for subscribed users — trial accounts can follow along" });
    const r = await store.col("requests").get(rm[1]);
    if (!r) return json(res, 404, { error: "not found" });
    const votes = Array.isArray(r.votes) ? r.votes.slice() : [];
    const i = votes.indexOf(user.id);
    if (i >= 0) votes.splice(i, 1); else votes.push(user.id);
    await store.col("requests").update(r.id, { votes });
    return json(res, 200, { voted: i < 0, voteCount: votes.length });
  }

  // POST /requests/:id/status (ADMIN) — set status + optional admin note.
  rm = p.match(/^\/requests\/([0-9a-f]{32})\/status$/);
  if (rm && req.method === "POST") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const raw = await rawBody(req, res, 8 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    if (!REQ_STATUSES.includes(b.status)) return json(res, 400, { error: "invalid status" });
    const r = await store.col("requests").get(rm[1]);
    if (!r) return json(res, 404, { error: "not found" });
    const patch = { status: b.status, statusAt: new Date().toISOString() };
    if (b.adminNote != null) patch.adminNote = clean(String(b.adminNote)).slice(0, 2000);
    await store.col("requests").update(r.id, patch);
    return json(res, 200, { ok: true, status: b.status });
  }

  // DELETE /requests/:id — author (only while "requested") or admin.
  rm = p.match(/^\/requests\/([0-9a-f]{32})$/);
  if (rm && req.method === "DELETE") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const r = await store.col("requests").get(rm[1]);
    if (!r) return json(res, 404, { error: "not found" });
    const admin = await adminOk(req);
    const ownerCanDelete = r.userId === user.id && r.status === "requested";
    if (!admin && !ownerCanDelete) return json(res, 403, { error: "forbidden" });
    await store.col("requests").remove(r.id);
    return json(res, 200, { ok: true });
  }

  // ===================== FEATURE C — Community forum (threads + posts) =====================
  // GET /community/threads?category= (Bearer) — list (pinned first, then lastAt desc), cap 100.
  if (p === "/community/threads" && req.method === "GET") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "community-read", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const cat = u.searchParams.get("category");
    const allPosts = await store.col("posts").all();
    const counts = {}; for (const po of allPosts) counts[po.threadId] = (counts[po.threadId] || 0) + 1;
    let threads = await store.col("threads").all();
    if (cat && THREAD_CATEGORIES.includes(cat)) threads = threads.filter((t) => t.category === cat);
    threads.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || Date.parse(b.lastAt || b.createdAt) - Date.parse(a.lastAt || a.createdAt));
    const list = threads.slice(0, 100).map((t) => ({
      id: t.id, authorName: t.authorName, title: t.title, category: t.category,
      createdAt: t.createdAt, lastAt: t.lastAt, locked: !!t.locked, pinned: !!t.pinned, postCount: counts[t.id] || 0,
    }));
    return json(res, 200, { threads: list });
  }

  // POST /community/threads (Bearer) — create a thread plus its first post.
  if (p === "/community/threads" && req.method === "POST") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "community-thread", 10, 24 * 60 * 60000)) return tooMany(res, 86400); // 10/day/user (per IP)
    const raw = await rawBody(req, res, 16 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const title = clean(String(b.title || "")).trim().slice(0, 120);
    const category = THREAD_CATEGORIES.includes(b.category) ? b.category : "general";
    const body = clean(String(b.body || "")).trim().slice(0, 4000);
    if (!title || !body) return json(res, 400, { error: "title and body required" });
    const now = new Date().toISOString();
    const name = authorLabel(user);
    const thread = { id: newId(), userId: user.id, authorName: name, title, category, createdAt: now, lastAt: now, locked: false, pinned: false };
    await store.col("threads").insert(thread);
    const post = { id: newId(), threadId: thread.id, userId: user.id, authorName: name, body, createdAt: now };
    await store.col("posts").insert(post);
    return json(res, 200, { id: thread.id });
  }

  // GET /community/threads/:id (Bearer) — a thread plus its posts (cap 200, oldest first).
  let tm = p.match(/^\/community\/threads\/([0-9a-f]{32})$/);
  if (tm && req.method === "GET") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "community-read", 120, 60000)) return json(res, 429, { error: "rate limited" });
    const t = await store.col("threads").get(tm[1]);
    if (!t) return json(res, 404, { error: "not found" });
    const posts = (await store.col("posts").all())
      .filter((po) => po.threadId === t.id)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, 200)
      .map((po) => ({ id: po.id, authorName: po.authorName, body: po.body, createdAt: po.createdAt }));
    return json(res, 200, { thread: { id: t.id, authorName: t.authorName, title: t.title, category: t.category, createdAt: t.createdAt, lastAt: t.lastAt, locked: !!t.locked, pinned: !!t.pinned }, posts });
  }

  // POST /community/threads/:id/posts (Bearer) — reply; rejected when the thread is locked.
  tm = p.match(/^\/community\/threads\/([0-9a-f]{32})\/posts$/);
  if (tm && req.method === "POST") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    if (rateLimited(req, "community-post", 30, 24 * 60 * 60000)) return tooMany(res, 86400); // 30/day/user (per IP)
    const t = await store.col("threads").get(tm[1]);
    if (!t) return json(res, 404, { error: "not found" });
    if (t.locked) return json(res, 403, { error: "thread is locked" });
    const raw = await rawBody(req, res, 16 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    const body = clean(String(b.body || "")).trim().slice(0, 4000);
    if (!body) return json(res, 400, { error: "body required" });
    const now = new Date().toISOString();
    const post = { id: newId(), threadId: t.id, userId: user.id, authorName: authorLabel(user), body, createdAt: now };
    await store.col("posts").insert(post);
    await store.col("threads").update(t.id, { lastAt: now });
    return json(res, 200, { id: post.id });
  }

  // POST /community/threads/:id/mod (ADMIN) — { pin?, lock?, delete? }.
  tm = p.match(/^\/community\/threads\/([0-9a-f]{32})\/mod$/);
  if (tm && req.method === "POST") {
    if (!(await adminOk(req))) return json(res, 403, { error: "forbidden" });
    const t = await store.col("threads").get(tm[1]);
    if (!t) return json(res, 404, { error: "not found" });
    const raw = await rawBody(req, res, 8 * 1024); if (raw === null) return;
    let b = {}; try { b = JSON.parse(raw || "{}"); } catch { return json(res, 400, { error: "bad json" }); }
    if (b.delete) {
      for (const po of (await store.col("posts").all()).filter((x) => x.threadId === t.id)) await store.col("posts").remove(po.id);
      await store.col("threads").remove(t.id);
      return json(res, 200, { ok: true, deleted: true });
    }
    const patch = {};
    if (typeof b.pin === "boolean") patch.pinned = b.pin;
    if (typeof b.lock === "boolean") patch.locked = b.lock;
    if (Object.keys(patch).length) await store.col("threads").update(t.id, patch);
    return json(res, 200, { ok: true, pinned: patch.pinned ?? !!t.pinned, locked: patch.locked ?? !!t.locked });
  }

  // DELETE /community/posts/:id (Bearer) — creator/admin may delete ANY post; an author may delete their own.
  let pdm = p.match(/^\/community\/posts\/([0-9a-f]{32})$/);
  if (pdm && req.method === "DELETE") {
    const user = await authUser(req); if (!user) return json(res, 401, { error: "unauthenticated" });
    const po = await store.col("posts").get(pdm[1]);
    if (!po) return json(res, 404, { error: "not found" });
    const admin = await adminOk(req);
    if (!admin && po.userId !== user.id) return json(res, 403, { error: "forbidden" });
    await store.col("posts").remove(po.id);
    return json(res, 200, { ok: true });
  }

  if (p === "/health") return json(res, 200, { ok: true });

  // GET /.well-known/security.txt — vulnerability disclosure contact (RFC 9116).
  if (p === "/.well-known/security.txt" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("Contact: mailto:chaithru@gmail.com\nPreferred-Languages: en\nPolicy: Report vulnerabilities privately. No testing against production user data.\nExpires: 2027-06-10T00:00:00.000Z");
  }

  // GET /app-version — desktop update check. Set APP_VERSION (e.g. "0.4.0") and
  // APP_DOWNLOAD_URL when you publish a new installer; clients compare and show a banner.
  if (p === "/app-version" && req.method === "GET") {
    return json(res, 200, { version: process.env.APP_VERSION || "", url: process.env.APP_DOWNLOAD_URL || "" });
  }
  // Anything else: serve the web app (GET) or 404 (other methods).
  if (req.method === "GET") return serveStatic(res, p);
  json(res, 404, { error: "not found" });
});

server.headersTimeout = 65000;     // slow-loris guard
server.requestTimeout = 300000;    // generous: /proxy/chat streams can run for minutes
if (process.env.SCHED_DISABLED !== "1" && process.env.NODE_ENV !== "test") { taskScheduler.start(); console.log("[auth-server] task scheduler started (60s tick)"); }
server.listen(PORT, () => console.log(`Madav auth server on ${BASE}  (store ${store.kind} · trial ${TRIAL_DAYS}d · dev-login ${process.env.ALLOW_DEV_LOGIN === "1" ? "ON" : "off"} · stripe ${STRIPE_SECRET && STRIPE_PRICE ? "ON" : "off"})`));
