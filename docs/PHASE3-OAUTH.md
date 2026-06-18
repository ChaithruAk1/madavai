# Phase 3 — P3.4: connector OAuth + encrypted token vault (web)

**Goal:** let web users connect cloud connectors that need a **login** (Gmail, Slack, GitHub, etc.),
not just no-auth MCP servers like DeepWiki. The server runs the OAuth flow, stores tokens **encrypted**,
and attaches them to connector/MCP calls **server-side** — tokens **never reach the browser** (plan §P7).
**Desktop untouched** (it has its own `mcp-oauth.cjs`); this is web/server only.

## Security model (non-negotiable — every increment is gated on these)
- **Encrypted at rest.** Tokens sealed with **AES-256-GCM** (authenticated). Key from `CONNECTOR_VAULT_KEY`
  (32 bytes) or derived from a strong `SESSION_SECRET`; **refused in production** if neither is real.
- **Never to the browser.** The client may *start* an OAuth flow and see "connected/not", but the
  access/refresh tokens live only in the server vault and are injected server-side at call time.
- **Per-user isolation.** Tokens keyed by the authenticated user id; one user can't read another's.
- **Auth + CSRF + state** on every OAuth route (mirror the existing `/auth/:provider` flow).
- **Least scope**, short-lived access tokens, refresh handled server-side.
- **Security review required** before the OAuth-callback and token-injection increments ship.

## Increments
- **P3.4.1 — token vault (DONE, this slice):** `server/token-vault.mjs` — `seal`/`open` (AES-256-GCM),
  `sealJSON`/`openJSON`, `vaultKey()` (env-resolved, prod-guarded), and `makeVault(kv, key)` with
  per-user `put`/`get`/`list`/`remove`. Pure `node:crypto`; unit-tested (round-trip, tamper, wrong-key,
  no-plaintext). **Wired to nothing** — no routes, no OAuth, no store edit yet. Zero live surface.
- **P3.4.2 — store binding:** back the vault with the real persistence (`server/store.mjs`) under a
  `conntok:<userId>` key; additive. Route-contract + no-plaintext-at-rest test.
- **P3.4.3 — OAuth routes:** `POST /connectors/:id/oauth/start` + `/callback` per connector (env client
  id/secret/scopes), state+exp+exact-origin (mirror `/auth/*`); on success, seal tokens into the vault.
  **Security review gate.**
- **P3.4.4 — broker injection:** when a connector requires auth, the `/mcp/*` (and connector) calls
  attach the user's stored token **server-side** (never via the client header allowlist). **Security review gate.**
- **P3.4.5 — UI:** wire the web Connectors "Sign in / Sign out / status" to the routes (replaces the
  current stubs), driven by `webCapabilities` (`mcp.connectors` = `service`). Web-only renderer.

## Status
P3.4.1 built + unit-tested; nothing wired, so the running app is unchanged. Next: P3.4.2 (store binding),
then the OAuth + injection increments behind explicit security review.
