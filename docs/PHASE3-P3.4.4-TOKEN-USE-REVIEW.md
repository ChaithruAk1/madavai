# P3.4.4 — using stored tokens (refresh + server-side injection): focused re-review (GATE)

**Status: IMPLEMENTED (option A, approved 2026-06-17; revoked-token -> auto-remove).** P3.4.3 *acquires + stores* tokens; P3.4.4 *uses* them. Injecting
a secret into an outbound request is its own attack surface (SSRF, header leak, wrong-tenant), so it gets its
own review. Builds on the sealed vault (P3.4.1/2) + registry (P3.4.3).

## ⚠ Honest scoping note (read first)
**There is no consumer yet.** Nothing in Madav currently calls Gmail — no Gmail tool, no Gmail-backed MCP
server. So "token injection" today would be a mechanism with no caller. Two ways to scope P3.4.4:

- **(A, recommended) Build only the tested primitive, wired to nothing:** a `getAccessToken(userId, id)` that
  reads the sealed token, **refreshes + re-seals** when expired, returns a usable access token to *server*
  code — plus the documented injection rule. Unit-tested with a stubbed network. This is the security-sensitive
  part (refresh, re-seal, never-leak) and it's small + auditable. A real Gmail capability becomes a separate,
  clearly-scoped feature later (it's a product decision, not parity plumbing).
- **(B) Also build a concrete Gmail read tool now:** e.g. "list recent subjects." Bigger surface, commits us
  to a Gmail feature + its UI. Out of scope for "web↔desktop parity," and premature.

The rest of this note specifies (A).

## What (A) adds (two server-only pieces, no routes, no live outbound call)
1. `refreshAccessToken(...)` in `server/connector-oauth.mjs` — `grant_type=refresh_token` exchange,
   fetch-injectable (no network in tests).
2. `server/connector-tokens.mjs` — `makeConnectorTokens(vault, env, fetchImpl, now)` exposing
   `getAccessToken(userId, connectorId)` with auto-refresh + re-seal. **Returns a token to server code only.**

## The refresh helper
```js
// server/connector-oauth.mjs (alongside exchangeCodeForToken)
export async function refreshAccessToken({ tokenUrl, clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
  const r = await fetchImpl(tokenUrl, { method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
  return r.json(); // { access_token, expires_in?, scope?, refresh_token? (sometimes rotated), error? }
}
```

## The access layer (refresh + re-seal, keyed strictly by user)
```js
// server/connector-tokens.mjs
import { getConnector, connectorCreds } from "./connector-registry.mjs";
import { refreshAccessToken } from "./connector-oauth.mjs";
const SKEW_MS = 60000; // refresh ~1 min before expiry

export function makeConnectorTokens(vault, env = process.env, fetchImpl = fetch, now = () => Date.now()) {
  return {
    async getAccessToken(userId, connectorId) {                       // U1: keyed by the authenticated user
      const rec = await vault.get(userId, connectorId);
      if (!rec || !rec.access_token) return null;
      if (!rec.expires_at || rec.expires_at - SKEW_MS > now()) return rec.access_token; // still valid
      if (!rec.refresh_token) return null;                            // expired, can't refresh -> disconnected
      const conn = getConnector(connectorId); if (!conn) return null;
      const { clientId, clientSecret } = connectorCreds(connectorId, env);
      const t = await refreshAccessToken(
        { tokenUrl: conn.tokenUrl, clientId, clientSecret, refreshToken: rec.refresh_token }, fetchImpl);
      if (!t || !t.access_token) {                                    // U5: refresh failed
        if (t && t.error === "invalid_grant") await vault.remove(userId, connectorId); // revoked -> force reconnect
        return null;
      }
      await vault.put(userId, connectorId, {                          // re-seal refreshed token (U4 rotation-safe)
        ...rec, access_token: t.access_token,
        refresh_token: t.refresh_token || rec.refresh_token,
        expires_at: t.expires_in ? now() + t.expires_in * 1000 : null,
        scope: t.scope || rec.scope });
      return t.access_token;
    },
  };
}
```

## Injection RULE (how a caller must attach the token, when a consumer exists)
```js
const token = await connectorTokens.getAccessToken(user.id, connectorId); // user.id from authUser, never a request field
if (!token) return /* 409 "reconnect <connector>" */;
await fetch(conn.apiBase + path, { headers: { Authorization: "Bearer " + token } }); // apiBase is a REGISTRY CONSTANT
```
Hard rules: (1) the URL is a **registry constant** (or, if ever dynamic, passed through `assertSafeMcpUrl`);
(2) the server sets `Authorization` itself and does **not** merge client-supplied headers for vault-sourced
auth (bypass `mcpForwardHeaders` entirely); (3) the token is **never** logged, returned, or redirected.

## Threat model (use/injection) and mitigations
| # | Threat | Mitigation |
|---|---|---|
| U1 | **Wrong-tenant token use** | `getAccessToken(userId, id)` keyed by the authenticated user id (from `authUser`), never a request field. |
| U2 | **SSRF via outbound URL** | Provider API base is a **registry constant**; any dynamic URL must pass `assertSafeMcpUrl`; never attach a bearer to a client-supplied URL. |
| U3 | **Token in logs / errors** | Never log the token; refresh errors log the provider `error` code only. |
| U4 | **Refresh-token rotation** | Persist a rotated `refresh_token` if the provider returns one; else keep the existing one. |
| U5 | **Revoked / expired token** | Refresh failure → return null (caller shows "reconnect"); on `invalid_grant`, remove the record to force re-auth. |
| U6 | **Concurrent refresh** | Double-refresh is harmless (provider tolerates; last re-seal wins). A per-user lock can come later if needed. |
| U7 | **Token leak to browser** | `getAccessToken` is server-only; nothing returns it to the client. Browser still sees only connected/status. |
| U8 | **Header smuggling** | For connector-backed calls the server sets `Authorization` itself and ignores the client header allowlist. |

## Test plan (no network, no secrets)
- `refreshAccessToken` (stub fetch): sends `grant_type=refresh_token` + creds; parses success/error.
- `getAccessToken` over a fake/in-memory vault + stub fetch: (a) returns the token unchanged when not expired;
  (b) refreshes + **re-seals** when expired (assert the vault now holds the new token + new expiry);
  (c) keeps the old refresh_token when the provider doesn't rotate it; persists a rotated one;
  (d) expired with no refresh_token → null; (e) `invalid_grant` → null **and the record is removed**;
  (f) never returns/throws a token into logs.

## Decisions for the reviewer
- **A — scope:** RECOMMEND **(A) the tested primitive, wired to nothing**; defer a real Gmail tool to a
  separate feature. (Pick (B) only if you want a Gmail capability built now.)
- **B — on revoked token:** RECOMMEND **auto-remove the record on `invalid_grant`** (forces a clean reconnect)
  vs keeping it (UI shows connected but calls fail).

**IMPLEMENTED (option A):** `refreshAccessToken` + `server/connector-tokens.mjs` + tests (87 parity tests green), wired to no live outbound call. A concrete connector *feature* (and P3.4.5 UI) remain separate steps.
