// server/connector-oauth-web.mjs — the WEB twin of desktop's electron/mcp-oauth.cjs Provider (P3.4.5 / R1).
// Same MCP-SDK OAuthClientProvider interface desktop implements, so web + desktop share ONE generic OAuth
// mechanism: the SDK does discovery + dynamic client registration + PKCE + refresh for ANY MCP server URL.
// There is NO per-connector code here. Only the storage adapter differs from desktop (the legitimate
// platform difference): tokens + client registration live in the per-user encrypted vault instead of the OS
// keychain, and the transient PKCE verifier/state live in a `flow` object the route persists across the two
// web requests. Wired to nothing in R1 (no routes); routes + SDK wiring come in R2/R3.

export class NeedsSignIn extends Error {
  constructor() { super("Sign-in required for this connector."); this.name = "NeedsSignIn"; }
}

// vault: { get(userId,id)->{client?,tokens?}|null, put(userId,id,obj), remove(userId,id) } (async ok).
// flow:  a mutable holder { state?, codeVerifier? } the caller persists between /signin and /callback.
// server: the connector { id, url, transport?, headers? }. redirectUrl: the HTTPS callback (constant).
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
        token_endpoint_auth_method: "none", // public client + PKCE — no provider secret to register/store
      };
    },
    // CSRF state = the pending-record id minted by the route; links /signin to /callback.
    state() { return flow.state; },
    // Dynamic client registration (per user+server), stored sealed in the vault.
    async clientInformation() { return (await rec()).client; },
    async saveClientInformation(info) { const r = await rec(); await vault.put(userId, sid, { ...r, client: info }); },
    // Access/refresh tokens — sealed in the vault, never returned to the browser.
    async tokens() { return (await rec()).tokens; },
    async saveTokens(t) { const r = await rec(); await vault.put(userId, sid, { ...r, tokens: t }); },
    // PKCE verifier — transient, carried across the two requests in `flow` (persisted by the route).
    saveCodeVerifier(v) { flow.codeVerifier = v; },
    codeVerifier() { if (!flow.codeVerifier) throw new Error("missing PKCE code verifier"); return flow.codeVerifier; },
    // Interactive: hand the authorize URL back to the route (which returns it to the SPA). Silent (agent
    // path): refuse — never surprise-open a browser mid-run (mirrors desktop's silentProvider).
    redirectToAuthorization(url) {
      if (!interactive) throw new NeedsSignIn();
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
