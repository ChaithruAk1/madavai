# P3.4.5 — Connector OAuth, REALIGNED to desktop: design + review (GATE)

**Status: DESIGN ONLY. No broker code yet.** Supersedes the bespoke Google OAuth path (P3.4.3a–c, P3.4.4).
Goal: web connector sign-in brokers the **same MCP-SDK OAuth flow desktop uses** (`electron/mcp-oauth.cjs`),
so web and desktop share one mechanism, one UI, one connector model. Desktop is untouched.

## Why (the deviation we're correcting)
Desktop treats a connector as a **remote MCP server URL** and lets the **MCP SDK** do discovery + dynamic
client registration + PKCE + refresh. My P3.4.3/4.4 instead hand-rolled a Google-specific OAuth with our own
client app — a different mechanism, duplicating the working gateway/Composio path and reintroducing the
Google app-verification burden the team avoided. Realigning = use the SDK flow, brokered server-side for web.

## Desktop reference (what we mirror — `electron/mcp-oauth.cjs`)
- A `Provider` implementing the SDK's **OAuthClientProvider**: `redirectUrl`, `clientMetadata`, `state()`,
  `clientInformation()/saveClientInformation()`, `tokens()/saveTokens()`, `saveCodeVerifier()/codeVerifier()`,
  `redirectToAuthorization(url)`, `invalidateCredentials()`. Storage = encrypted file per `serverId`.
- `signIn`: start loopback catcher → SDK `client.connect()` (401 → `redirectToAuthorization` opens browser) →
  wait for code → `transport.finishAuth(code)` (exchanges + saves tokens) → reconnect → `listTools`.
- `silentProvider`: non-interactive; supplies stored tokens, lets the SDK refresh, throws `NeedsSignIn` rather
  than pop a browser mid-run. Used by the manager on **every** connect — this is how tokens get USED.

## Web design (same SDK, web-appropriate adapter差异)
Three platform differences are legitimate (the adapter pattern), everything else is identical to desktop:

| Concern | Desktop | Web |
|---|---|---|
| Token storage | OS keychain (safeStorage) file per serverId | **The vault** (`connector-vault.mjs`), per `(userId, serverId)`, value = `{ client, tokens }` |
| Redirect catcher | loopback `127.0.0.1:8766` | **HTTPS callback route** on the auth server (constant `BASE + /connectors/oauth/callback`) |
| In-flight PKCE/state | same process (one `signIn` call) | **store-backed pending state** (`oauth-state.mjs`) carries `{userId, serverId, codeVerifier, clientInfo, server}` across the two requests |
| Open browser | `shell.openExternal` | return `{ authorizeUrl }` to the SPA, which navigates |

**Web Provider** (`server/connector-oauth-web.mjs`): the same OAuthClientProvider, but `saveTokens`/`tokens`/
`saveClientInformation`/`clientInformation` read/write the **vault** for the current `(userId, serverId)`;
`saveCodeVerifier`/`state` persist into the pending-state record; `redirectUrl` = the HTTPS callback;
`redirectToAuthorization(url)` (interactive) stashes the URL to return to the client, (silent) throws NeedsSignIn.

**Routes** (all `authUser`-gated, rate-limited; SSRF-checked with the existing `assertSafeMcpUrl`):
- `POST /connectors/signin` `{server}` → run the SDK until it produces the authorize URL; persist pending
  state; return `{ authorizeUrl }` (or `{ ok:true, alreadyConnected, tools }` if no auth needed).
- `GET  /connectors/oauth/callback?code&state` → load+delete pending state (single-use, user-bound);
  `transport.finishAuth(code)` → tokens saved to the vault; 302 to an allowlisted SPA page. **No token to browser.**
- `GET  /connectors/status?id` → `{ connected, registered }` from the vault.
- `POST /connectors/signout` `{id}` → vault.remove.

**The consumer (closes the loop my P3.4.4 lacked):** the existing `/mcp/tools` + `/mcp/call` broker connects
with a **silent vault-backed Provider**, so a connected server's tokens are attached + refreshed by the SDK on
every call — never a browser, never a token to the client.

## Reuse vs retire
- **Reuse:** `token-vault.mjs` + `connector-vault.mjs` (token store), `oauth-state.mjs` (pending state),
  `assertSafeMcpUrl` (SSRF guard, already in the broker).
- **Retire (superseded by the SDK):** `connector-registry.mjs` (SDK discovers from the URL — no hardcoded
  Google), `oauth-pkce.mjs` (SDK does PKCE), `connector-oauth.mjs` (SDK does the exchange), `connector-tokens.mjs`
  (SDK refreshes), and the bespoke `/connectors/:id/oauth/start|callback|disconnect` routes. Removed together in R3.

## Threat model (web twin of desktop OAuth)
- **Tokens at rest:** vault (AES-256-GCM), per-user, prod-key-guarded (unchanged from P3.4.1/2).
- **CSRF / cross-user:** pending state is random, single-use, TTL'd, and **bound to the authenticated userId**;
  `state` is also checked against the Provider's state (as desktop does).
- **Never to browser:** tokens live only in the vault; routes return status/`connected=`, never a token.
- **SSRF:** the server URL is run through `assertSafeMcpUrl` before the SDK connects (blocks loopback/private/metadata).
- **No surprise browser:** the agent/use path uses the silent Provider → `NeedsSignIn`, never a popup.
- **Secrets:** no provider client secret needed at all (SDK uses dynamic registration, `token_endpoint_auth_method:"none"` + PKCE).

## Increment plan (each verifiable; desktop untouched; gated)
- **R1:** `connector-oauth-web.mjs` Provider + vault/pending-state wiring, **no routes**. Unit tests: Provider
  round-trips client/tokens through a fake vault; pending state carries the verifier across requests. (No live surface.)
- **R2:** the four routes (signin/callback/status/signout). **Security-review gate** at the callback (accepts the code).
- **R3:** wire the `/mcp` broker to the silent Provider (tokens get USED) + implement web bridge
  `connectorSignIn/authStatus/signOut/testConnector` to call the routes + **retire** the bespoke modules. The
  existing Connectors UI then works on web unchanged.

## Pre-check before R2
Confirm the installed `@modelcontextprotocol/sdk` exposes the OAuthClientProvider hooks + `transport.finishAuth`
server-side (P3.1's `mcp-broker.mjs` already runs the SDK server-side, so this is low-risk). Effort: this is
the **largest** P3 piece — porting an OAuth broker — so it's split small and gated, validated against the SDK first.

**Nothing implemented yet. On approval I build R1 (Provider + tests, no routes), then stop for the next gate.**
