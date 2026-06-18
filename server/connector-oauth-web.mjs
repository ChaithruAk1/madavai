// server/connector-oauth-web.mjs — the WEB twin of desktop's electron/mcp-oauth.cjs (P3.4.5). Same MCP-SDK
// OAuthClientProvider + the same generic auth() flow desktop uses, brokered server-side across TWO web
// requests. ONE mechanism for ALL connectors (no per-connector code). Platform differences only: tokens live
// in the per-user encrypted vault (not the OS keychain); the redirect is an HTTPS callback (not loopback);
// the transient PKCE verifier/state live in a store-backed pending record (not one process).
import crypto from "node:crypto";

export class NeedsSignIn extends Error {
  constructor() { super("Sign-in required for this connector."); this.name = "NeedsSignIn"; }
}

const randomState = () => crypto.randomBytes(16).toString("hex");

// Lazy SDK auth() loader (the SAME function desktop's transport uses). Injectable for tests.
let _auth = null;
async function sdkAuth() {
  if (!_auth) { const m = await import("@modelcontextprotocol/sdk/client/auth.js"); _auth = m.auth; }
  return _auth;
}

// The OAuthClientProvider the SDK drives. Storage is vault-backed (client reg + tokens, per user+server);
// the PKCE verifier + CSRF state ride in `flow` (persisted to the pending record between the two requests).
export function makeWebOAuthProvider({ vault, userId, server, redirectUrl, flow = {}, interactive = false, onAuthUrl = null }) {
  const sid = server.id;
  const rec = async () => (await vault.get(userId, sid)) || {};
  return {
    get redirectUrl() { return redirectUrl; },
    get clientMetadata() {
      return {
        client_name: "Madav",
        redirect_uris: [redirectUrl],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none", // public client + PKCE — no provider secret
      };
    },
    state() { return flow.state; },
    async clientInformation() { return (await rec()).client; },
    async saveClientInformation(info) { const r = await rec(); await vault.put(userId, sid, { ...r, client: info }); },
    async tokens() { return (await rec()).tokens; },
    async saveTokens(t) { const r = await rec(); await vault.put(userId, sid, { ...r, tokens: t }); },
    saveCodeVerifier(v) { flow.codeVerifier = v; },
    codeVerifier() { if (!flow.codeVerifier) throw new Error("missing PKCE code verifier"); return flow.codeVerifier; },
    redirectToAuthorization(url) {
      if (!interactive) throw new NeedsSignIn();        // agent path: never surprise-open a browser
      if (onAuthUrl) onAuthUrl(url.toString());
    },
    async invalidateCredentials(scope) {
      const r = await rec();
      if (scope === "all") { await vault.remove(userId, sid); return; }
      if (scope === "tokens") { delete r.tokens; await vault.put(userId, sid, r); }
      if (scope === "client") { delete r.client; await vault.put(userId, sid, r); }
    },
  };
}

// REQUEST 1 — begin sign-in: run the SDK far enough to get the authorize URL, persist the in-flight state.
// Returns { ok, authorizeUrl } | { ok, alreadyConnected:true } | { ok:false, error }. `redirect` is the
// (already-validated) post-callback SPA target. The caller must SSRF-check server.url before this.
export async function beginConnectorSignIn({ vault, pending, userId, server, redirectUrl, redirect = "", authFn }) {
  const auth = authFn || (await sdkAuth());
  const stateId = randomState();
  const flow = { state: stateId };
  let captured = null;
  const provider = makeWebOAuthProvider({ vault, userId, server, redirectUrl, flow, interactive: true, onAuthUrl: (u) => { captured = u; } });
  const result = await auth(provider, { serverUrl: server.url });
  if (result === "AUTHORIZED") return { ok: true, alreadyConnected: true };  // already had valid tokens
  if (!captured) return { ok: false, error: "This connector didn't start an OAuth sign-in (it may use an API key instead)." };
  await pending.putWithId(stateId, { userId, serverId: server.id, server, codeVerifier: flow.codeVerifier, redirect });
  return { ok: true, authorizeUrl: captured };
}

// REQUEST 2 — finish sign-in: consume the single-use state, restore the PKCE verifier, let the SDK exchange
// the code → tokens (saved to the vault by the provider). Returns { ok, userId, serverId, redirect } | {ok:false}.
export async function finishConnectorSignIn({ vault, pending, stateId, code, redirectUrl, authFn }) {
  if (!code || !stateId) return { ok: false, error: "Missing code or state." };
  const recd = await pending.consume(stateId);                 // single-use + TTL + user-bound
  if (!recd) return { ok: false, error: "Invalid or expired sign-in state." };
  const auth = authFn || (await sdkAuth());
  const flow = { state: stateId, codeVerifier: recd.codeVerifier };
  const provider = makeWebOAuthProvider({ vault, userId: recd.userId, server: recd.server, redirectUrl, flow, interactive: false });
  const result = await auth(provider, { serverUrl: recd.server.url, authorizationCode: code });
  if (result !== "AUTHORIZED") return { ok: false, error: "Token exchange failed." };
  return { ok: true, userId: recd.userId, serverId: recd.serverId, redirect: recd.redirect || "" };
}
