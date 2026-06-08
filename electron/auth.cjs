// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Desktop auth client: system-browser OAuth via a one-shot loopback, the session token stored
// ENCRYPTED via safeStorage, and ALWAYS-ONLINE validation against the auth server (see AUTH.md).
const { app, shell, safeStorage } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const TOKEN_FILE = () => path.join(app.getPath("userData"), "brainedge-session.bin");

function saveToken(t) {
  try {
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t) : Buffer.from("plain:" + t);
    fs.writeFileSync(TOKEN_FILE(), buf);
  } catch {}
}
function loadToken() {
  try {
    const buf = fs.readFileSync(TOKEN_FILE());
    if (buf.slice(0, 6).toString() === "plain:") return buf.slice(6).toString();
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : "";
  } catch { return ""; }
}
function clearToken() { try { fs.unlinkSync(TOKEN_FILE()); } catch {} }

// Open the system browser to the server's OAuth start; capture the session token on a loopback.
function signIn(provider, authBaseUrl) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { srv.close(); } catch {} resolve(r); };
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/cb") { res.writeHead(404); return res.end(); }
      const token = u.searchParams.get("token");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><meta charset=utf-8><body style='font-family:system-ui;background:#0b0d12;color:#e6e9ef;display:grid;place-items:center;height:100vh'><div style='text-align:center'><h2>Signed in to BrainEdge</h2><p>You can close this window and return to the app.</p></div>");
      if (token) { saveToken(token); finish({ ok: true }); } else finish({ error: "no token returned" });
    });
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      const redirect = `http://127.0.0.1:${port}/cb`;
      const url = `${authBaseUrl.replace(/\/+$/, "")}/auth/${provider}/start?redirect=${encodeURIComponent(redirect)}`;
      shell.openExternal(url);
    });
    setTimeout(() => finish({ error: "sign-in timed out" }), 180000);
  });
}

// Validate the stored session ONLINE. No offline fallback by design — the app must be online.
async function me(authBaseUrl) {
  const token = loadToken();
  if (!token) return { error: "unauthenticated" };
  try {
    const r = await fetch(`${authBaseUrl.replace(/\/+$/, "")}/me`, { headers: { Authorization: "Bearer " + token } });
    if (r.status === 401) { clearToken(); return { error: "unauthenticated" }; }
    if (r.status === 403) return { error: "suspended" };
    if (!r.ok) return { error: "server", code: r.status };
    return await r.json();
  } catch { return { error: "offline" }; }
}

// Open Stripe Checkout / Customer Portal in the system browser. Returns { ok } or { error }.
async function billing(kind, authBaseUrl) {
  const token = loadToken();
  if (!token) return { error: "unauthenticated" };
  try {
    const r = await fetch(`${authBaseUrl.replace(/\/+$/, "")}/billing/${kind}`, { method: "POST", headers: { Authorization: "Bearer " + token } });
    const j = await r.json().catch(() => ({}));
    if (j && j.url) { shell.openExternal(j.url); return { ok: true }; }
    return { error: (j && j.error) || "server " + r.status, detail: (j && j.detail) || "" };
  } catch { return { error: "offline" }; }
}

async function signOut(authBaseUrl) {
  const token = loadToken();
  if (token) { try { await fetch(`${authBaseUrl.replace(/\/+$/, "")}/auth/logout`, { method: "POST", headers: { Authorization: "Bearer " + token } }); } catch {} }
  clearToken();
  return { ok: true };
}

module.exports = { signIn, me, signOut, billing };
