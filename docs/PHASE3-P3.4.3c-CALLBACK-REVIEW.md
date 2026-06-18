# P3.4.3c — token-accepting callback: focused re-review (GATE)

**Status: IMPLEMENTED (approved 2026-06-17; accountLabel deferred, plain 400 + redacted log on failure).** This was the first code that *accepts a provider token*, so per
`docs/PHASE3-P3.4.3-CONNECTOR-OAUTH-DESIGN.md` it gets its own review before implementation. Builds only on
already-merged + tested pieces: registry (constants), PKCE, store-backed user-bound state, sealed vault.

## What 3c adds (exactly two things)
1. `server/connector-oauth.mjs` — a pure, **fetch-injectable** `exchangeCodeForToken(...)` (so it unit-tests
   with a stubbed fetch — no network). Lives in its own module because the registry is "constants, no I/O."
2. One route in `server/auth-server.mjs`: `GET /connectors/:id/oauth/callback`. Nothing else changes.

## The exchange helper (network isolated + injectable)
```js
// server/connector-oauth.mjs
export async function exchangeCodeForToken(
  { tokenUrl, clientId, clientSecret, code, codeVerifier, redirectUri }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri,
    grant_type: "authorization_code", code_verifier: codeVerifier,   // PKCE proof (T2)
  });
  const r = await fetchImpl(tokenUrl, { method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
  return r.json();   // { access_token, refresh_token?, expires_in?, scope?, error? }
}
```
This mirrors the existing login-OAuth exchange (auth-server.mjs ~L439) but adds `code_verifier` and takes
`tokenUrl` from the **registry constant**, never the request.

## The callback route (annotated with the threat each line defends)
```js
// GET /connectors/:id/oauth/callback?code&state  — the ONLY route that accepts a provider token.
mConn = p.match(/^\/connectors\/([a-z0-9-]+)\/oauth\/callback$/);
if (mConn && req.method === "GET") {
  if (rateLimited(req, "conn-oauth", 20, 15 * 60000)) return tooMany(res, 900);          // T10 abuse
  const id = mConn[1];
  const conn = getConnector(id);
  const code  = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const ctx = await oauthStates.consume(state);     // T1/T2: single-use + TTL + user-bound; deletes on read
  if (!conn || !code || !ctx || ctx.connectorId !== id)                                   // T1/T3 mismatch
    { res.writeHead(400); return res.end("Invalid or expired connector authorization"); }
  try {
    const { clientId, clientSecret } = connectorCreds(id);                                // server-only secret
    const tok = await exchangeCodeForToken({ tokenUrl: conn.tokenUrl, clientId, clientSecret,
      code, codeVerifier: ctx.codeVerifier, redirectUri: `${BASE}/connectors/${id}/oauth/callback` });
    if (!tok || !tok.access_token) {
      console.error(`[connector] ${id} token exchange failed:`,                           // T9 redacted log
        JSON.stringify({ error: tok && tok.error, description: tok && tok.error_description }));
      res.writeHead(400); return res.end("Connector authorization failed");
    }
    await connectorVault().put(ctx.userId, id, {                                           // T3/T5 sealed, to state's user
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expires_at: tok.expires_in ? Date.now() + tok.expires_in * 1000 : null,
      scope: tok.scope || conn.scopes.join(" "),
      accountLabel: null,                                                                  // see "Decision A"
      connectedAt: new Date().toISOString(),
    });
    const redir = ctx.redirect && isAllowedRedirect(ctx.redirect) ? ctx.redirect : "";     // T7 re-validate
    if (redir) { const sep = redir.includes("?") ? "&" : "?";
      res.writeHead(302, { Location: redir + sep + "connected=" + encodeURIComponent(id) }); return res.end(); } // T4 id only
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<h2>Connected ${esc(conn.label)} to Madav</h2><p>You can close this window.</p>`);          // esc() XSS
  } catch (e) {
    console.error(`[connector] ${id} callback error:`, String(e && e.message));            // T9 message only
    res.writeHead(500); return res.end("Connector error");
  }
}
```

## Every failure path is closed (and leaks nothing)
| Condition | Response to browser | Server log | Token state |
|---|---|---|---|
| missing/expired/unknown `state` | 400 "Invalid or expired…" | none | state already deleted (single-use) |
| `state.connectorId !== :id` | 400 | none | state deleted |
| token endpoint returns no `access_token` | 400 "authorization failed" | provider `error`/`description` only (no secret/token) | nothing stored |
| network/exception during exchange | 500 "Connector error" | exception **message** only | nothing stored |
| vault seal throws (e.g. prod key unset) | 500 | message only | nothing stored |
| success | 302 `?connected=<id>` (or plain HTML) | none | sealed in vault under `ctx.userId` |

Invariant preserved: **no access/refresh token ever appears in a response body, redirect, cookie, or log.**

## Test plan (no network, no secrets)
- `exchangeCodeForToken` with a stub `fetchImpl`: sends `grant_type`/`code_verifier`/constant `tokenUrl`;
  parses success; surfaces `{error}` on failure.
- Static route-contract (regex over auth-server.mjs): callback route exists for **GET**; calls
  `oauthStates.consume(state)`; checks `ctx.connectorId !== id`; calls `connectorVault().put(ctx.userId`;
  re-validates `isAllowedRedirect`; the success redirect carries `connected=` not a token; block contains
  no `res.end(` that serializes `access_token`.

## Decisions for the reviewer
- **A — account label:** RECOMMEND **defer** (store `accountLabel: null` now). Fetching the Gmail address
  means an extra authenticated API call in the callback — that belongs with P3.4.4 (token *use*). Keeps the
  token-accepting slice minimal and easy to audit. UI can show the connector label + "Connected" without it.
- **B — failure UX:** RECOMMEND **plain 400 + redacted server log** (mirrors the existing login callback).
  An SPA error-redirect can come with the UI in P3.4.5 if wanted.

**IMPLEMENTED:** `server/connector-oauth.mjs` + the callback route + tests (80 parity tests green). P3.4.4 (token injection) remains a separate later gate.
