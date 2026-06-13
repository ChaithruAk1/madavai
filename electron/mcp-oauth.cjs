// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// OAuth for REMOTE MCP connectors — the mechanism behind one-click cloud connectors
// (Gmail, Drive, Slack, …). The MCP SDK does discovery + dynamic client registration +
// PKCE + token refresh; this module supplies the three things the SDK can't: a place to
// store client registration + tokens (encrypted at rest), a loopback redirect server to
// catch the authorization code, and opening the consent page in the user's browser.
//
//   signIn(server)  → interactive: opens the browser, captures the code, saves tokens
//   silentProvider  → used by mcp-manager on every connect: supplies/refreshes tokens,
//                     and REFUSES to pop a browser mid-run (throws "needs sign-in")
//
// Keys never live in the renderer; tokens are encrypted with the OS keychain (safeStorage).
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const REDIRECT_PORT = 8766;                                  // FIXED so the registered
const REDIRECT_URL = `http://127.0.0.1:${REDIRECT_PORT}/callback`; // redirect_uri is stable

// ---- SDK (ESM) loaded from this CJS module ----
let _mod = null;
async function sdk() {
  if (!_mod) {
    const client = await import("@modelcontextprotocol/sdk/client/index.js");
    const auth = await import("@modelcontextprotocol/sdk/client/auth.js");
    let StreamableHTTPClientTransport, SSEClientTransport;
    try { ({ StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js")); } catch {}
    try { ({ SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js")); } catch {}
    _mod = { Client: client.Client, StreamableHTTPClientTransport, SSEClientTransport, UnauthorizedError: auth.UnauthorizedError };
  }
  return _mod;
}
const isUnauthorized = (e, M) => (M && M.UnauthorizedError && e instanceof M.UnauthorizedError)
  || /unauthor/i.test(String((e && e.message) || e)) || e instanceof NeedsSignIn;

class NeedsSignIn extends Error { constructor() { super("Sign-in required for this connector."); this.name = "NeedsSignIn"; } }

// ---- encrypted store: { [serverId]: { client?: {...}, tokens?: {...} } } ----
const FILE = () => path.join(app.getPath("userData"), "mcp-oauth.json");
function load() {
  try {
    const raw = fs.readFileSync(FILE(), "utf8");
    if (raw.startsWith("enc:") && safeStorage.isEncryptionAvailable())
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw.slice(4), "base64")));
    return JSON.parse(raw);
  } catch { return {}; }
}
function save(obj) {
  let out = JSON.stringify(obj);
  try { if (safeStorage.isEncryptionAvailable()) out = "enc:" + safeStorage.encryptString(out).toString("base64"); } catch {}
  try { fs.writeFileSync(FILE(), out, { mode: 0o600 }); } catch {}
}

// ---- OAuthClientProvider implementation ----
class Provider {
  constructor(serverId, { interactive = false, onAuthUrl = null } = {}) {
    this.serverId = serverId;
    this.interactive = interactive;
    this._onAuthUrl = onAuthUrl;
    this._verifier = null;
    this._state = crypto.randomBytes(16).toString("hex");
  }
  get redirectUrl() { return REDIRECT_URL; }
  get clientMetadata() {
    return {
      client_name: "Madav",
      redirect_uris: [REDIRECT_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state() { return this._state; }
  clientInformation() { return (load()[this.serverId] || {}).client; }
  saveClientInformation(info) { const s = load(); s[this.serverId] = { ...(s[this.serverId] || {}), client: info }; save(s); }
  tokens() { return (load()[this.serverId] || {}).tokens; }
  saveTokens(t) { const s = load(); s[this.serverId] = { ...(s[this.serverId] || {}), tokens: t }; save(s); }
  saveCodeVerifier(v) { this._verifier = v; }
  codeVerifier() { if (!this._verifier) throw new Error("missing PKCE code verifier"); return this._verifier; }
  redirectToAuthorization(url) {
    if (!this.interactive) throw new NeedsSignIn();   // never surprise-open a browser mid-run
    if (this._onAuthUrl) this._onAuthUrl(url.toString());
  }
  invalidateCredentials(scope) {
    const s = load();
    if (!s[this.serverId]) return;
    if (scope === "all" || scope === "tokens") delete s[this.serverId].tokens;
    if (scope === "all" || scope === "client") delete s[this.serverId].client;
    save(s);
  }
}

// Provider used by mcp-manager.connect() for every remote server: supplies stored tokens
// and lets the SDK refresh them silently; if none/expired-unrefreshable it throws NeedsSignIn.
function silentProvider(serverId) { return new Provider(serverId); }

function transportFor(M, server, provider) {
  const url = new URL(server.url);
  const opts = { authProvider: provider };
  if (server.headers) opts.requestInit = { headers: server.headers };
  const Cls = server.transport === "sse" ? M.SSEClientTransport : M.StreamableHTTPClientTransport;
  if (!Cls) throw new Error("This MCP SDK build lacks the required transport.");
  return new Cls(url, opts);
}

// Loopback server that catches the OAuth redirect on the FIXED port.
function startCallback() {
  return new Promise((resolve, reject) => {
    let resolveCode;
    const codeP = new Promise((r) => { resolveCode = r; });
    const srv = http.createServer((req, res) => {
      let u; try { u = new URL(req.url, REDIRECT_URL); } catch { res.writeHead(400); return res.end(); }
      if (u.pathname !== "/callback") { res.writeHead(404); return res.end(); }
      const code = u.searchParams.get("code"); const state = u.searchParams.get("state"); const err = u.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0a0c10;color:#e7ebf5;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="margin:0 0 8px">${err ? "Sign-in failed" : "Connected to Madav"}</h2><p style="color:#8893ad">${err ? String(err).slice(0, 120) : "You can close this tab and return to Madav."}</p></div></body>`);
      resolveCode(err ? { error: err } : { code, state });
    });
    srv.on("error", (e) => reject(new Error("Couldn't open the sign-in listener on port " + REDIRECT_PORT + " (" + ((e && e.message) || e) + "). Close whatever is using it and retry.")));
    srv.listen(REDIRECT_PORT, "127.0.0.1", () => resolve({
      waitForCode: (ms) => Promise.race([
        codeP,
        new Promise((_, rej) => setTimeout(() => rej(new Error("sign-in timed out — please try again")), ms)),
      ]).then((r) => { if (r.error) throw new Error("authorization denied: " + r.error); return r; }),
      close: () => { try { srv.close(); } catch {} },
    }));
  });
}

const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(tag)), ms))]);

// Interactive sign-in: open the browser, capture the code, exchange + store tokens.
// openExternal(url) is injected by main (shell.openExternal).
async function signIn(server, openExternal) {
  if (!server || !server.url) return { ok: false, error: "Sign-in is only for remote (URL) connectors." };
  const M = await sdk();
  let cb;
  try { cb = await startCallback(); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  let browserOpened = false;
  const provider = new Provider(server.id, { interactive: true, onAuthUrl: (u) => { browserOpened = true; try { openExternal && openExternal(u); } catch {} } });
  try {
    let transport = transportFor(M, server, provider);
    const client = new M.Client({ name: "madav", version: "0.1.0" }, { capabilities: {} });
    try {
      // Time-bound the first connect so a server that just hangs (no proper OAuth 401)
      // can't freeze the sign-in. A real OAuth server rejects fast with UnauthorizedError
      // right after opening the browser; a hang means it isn't doing OAuth.
      await withTimeout(client.connect(transport), 30000, "__timeout__");
      const tools = (await client.listTools()).tools || [];
      try { await client.close(); } catch {}
      return { ok: true, alreadyConnected: true, tools: tools.map((t) => t.name) };
    } catch (e) {
      if (String(e && e.message) === "__timeout__" && !browserOpened) {
        return { ok: false, error: "This server didn't start a browser sign-in. Many hosted MCP servers (e.g. Smithery community servers) authenticate with an API key or per-user config in the URL — not OAuth. Put that key in the Server URL (e.g. ?api_key=…) or Headers, then click Test connection." };
      }
      if (String(e && e.message) !== "__timeout__" && !isUnauthorized(e, M)) throw e;  // a real error
      if (!browserOpened) return { ok: false, error: "The server requires authentication but didn't provide an OAuth sign-in endpoint. It likely needs an API key/config instead." };
    }
    // The browser was opened by redirectToAuthorization. Wait for the redirect.
    const { code, state } = await cb.waitForCode(180000);
    if (state && state !== provider.state()) return { ok: false, error: "state mismatch — sign-in aborted for safety" };
    await transport.finishAuth(code);                  // exchanges code → tokens (saved)
    // Reconnect cleanly with the stored tokens.
    transport = transportFor(M, server, provider);
    const client2 = new M.Client({ name: "madav", version: "0.1.0" }, { capabilities: {} });
    await client2.connect(transport);
    const tools = (await client2.listTools()).tools || [];
    try { await client2.close(); } catch {}
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  } finally {
    cb.close();
  }
}

function authStatus(serverId) { const e = load()[serverId] || {}; return { connected: !!e.tokens, registered: !!e.client }; }
function signOut(serverId) { const s = load(); delete s[serverId]; save(s); return { ok: true }; }

module.exports = { silentProvider, signIn, authStatus, signOut, REDIRECT_URL, REDIRECT_PORT };
