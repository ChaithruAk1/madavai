# Madav — working memory (web↔desktop parity effort)

_Last updated: 2026-06-17. This is the durable handoff note. Pair with `docs/WEB-PARITY-PLAN.md`,
`docs/PARITY-PHASE-TESTS.md`, `docs/adr/0001-architecture.md`, and the `docs/PHASE3-*` design docs._

## Mission
Bring **Madav Web** as close as possible to **Desktop** capability **without destabilizing Desktop**
(desktop is validated first, web follows; never modify desktop to accommodate web without explicit sign-off).
Replicate Claude's proven agent patterns for stability/longevity. Be honest about what NOT to build.

## Architecture (decided, in ADR-0001)
- **Single source of truth** behind a platform adapter; **desktop is the reference**; migrate the engine
  incrementally (strangler-fig, harness-first, never big-bang).
- **Infra = browser + managed 3rd-party** (server-brokered hosted services are OK).
- Two surfaces, one renderer (`src/**`). Desktop backend = `electron/*.cjs` (IPC). Web backend =
  `src/bridge/webBridge.js` + `server/auth-server.mjs`. Bridge select: `window.madav || webBridge`.
- Anti-drift: `webCapabilities` manifest, `tests/parity/**`, turn-replay harness, ADR, per-feature rule.

## What shipped this session (all WEB/SERVER only; desktop untouched — verified against git repeatedly)
- **Phase 0** harness/manifest/adapter-contract/parity tests/CI.
- **Phase 1** (increments 1–6): web chat tool loop (search/image), agent-team tools, web-Projects file note,
  Madav identity, file-output card hides desktop-only buttons on web.
- **Phase 3 MCP** P3.1–P3.7: server MCP broker (`server/mcp-broker.mjs`, SSRF guard) → `/mcp/tools` + `/mcp/call`
  routes → wired into web chat → Collaborate + agent teams → tool-support cache TTL fix. Verified live w/ DeepWiki.
- **P3.4 connector OAuth + token vault** (the big one — see next section).

## P3.4 connector OAuth — final design (IMPORTANT: realigned mid-flight)
**Deviation + correction (key lesson):** I first built a *bespoke, per-provider Google OAuth* (own client id,
hardcoded Google endpoints). That **diverged from desktop**, duplicated the working gateway/Composio path, and
reintroduced the Google app-verification burden the team had avoided. User flagged it. We **realigned to
desktop's mechanism**: a connector is an **MCP server URL**, and the **MCP SDK** does discovery + dynamic client
registration + PKCE + refresh — **ONE generic path, zero per-connector code**. Only platform-forced differences
vs desktop's `electron/mcp-oauth.cjs`: (1) HTTPS callback route instead of a loopback catcher; (2) the encrypted
**vault** instead of the OS keychain; (3) store-backed in-flight state across the two web requests.

### KEPT modules (the live, realigned path)
- `server/token-vault.mjs` — AES-256-GCM seal/open, `vaultKey()` (prod-guarded), `makeVault`.
- `server/connector-vault.mjs` — binds the vault to the store `conntokens` collection (per-user).
- `server/oauth-state.mjs` — store-backed, single-use, user-bound, 10-min OAuth state (`create`/`putWithId`/`consume`/`sweep`).
- `server/connector-oauth-web.mjs` — the web **OAuthClientProvider** (vault-backed) + `beginConnectorSignIn`/
  `finishConnectorSignIn` (two-request SDK orchestration). Generic; works for any MCP URL.
- `server/mcp-broker.mjs` — added `transportInit(headers, authProvider)`; `listTools`/`callTool` accept an
  optional silent provider so connected tokens are attached + SDK-refreshed on each call.
- `server/auth-server.mjs` — routes: `POST /connectors/signin`, `GET /connectors/oauth/callback`,
  `GET /connectors/status`, `POST /connectors/signout`; `/mcp/*` build a silent vault provider keyed by user+id.
- `src/bridge/webBridge.js` — `connectorSignIn` (popup + poll), `connectorAuthStatus`, `connectorSignOut`,
  `testConnector`; `mcpListTools`/`mcpCallTool` send the connector id so the broker can attach the token.
- Store: `server/store.mjs` `COLLECTIONS` gained `conntokens` + `oauthstate` (additive; both backends).

### RETIRED (bespoke; superseded — DELETE via the R3c `git rm`, sandbox can't rm)
`server/connector-registry.mjs`, `server/oauth-pkce.mjs`, `server/connector-oauth.mjs`,
`server/connector-tokens.mjs`, and their tests `tests/parity/{oauth-pkce,connector-oauth-exchange,connector-tokens}.test.js`.
`connector-routes.test.js` repurposed as a retirement guard; `connector-oauth-foundation.test.js` trimmed to oauth-state only.

### Increment ledger (each was tested + committed separately; messages prefixed P3.4.x)
P3.4.1 vault · P3.4.2 store binding · (P3.4.3a/b/c + P3.4.4 = the bespoke path, now retired) ·
P3.4.5 realign: R1 web provider · R2a orchestration · R2b routes · R3a bridge wiring · R3b broker token use ·
R3c cleanup. Design docs: `docs/PHASE3-P3.4.3-*`, `-P3.4.4-*`, `-P3.4.3c-*`, `-P3.4.5-CONNECTOR-REALIGN.md`.

## Tests
- Unit/contract: `npx vitest run tests/parity` — green (~88 after the R3c `git rm`; 100 in-sandbox until then).
- E2E (server chain, SDK mocked): `node tests/e2e/connectors-flow.e2e.mjs` → `✅ E2E PASSED` (7 steps).
- Manual HTTP + browser E2E: `docs/E2E-CONNECTORS-WEB.md`.

## Operational gotchas (this sandbox/mount)
- **Cannot `rm` files** (mount: "Operation not permitted") → deletions are the user's `git rm` on their machine.
- **Write tool truncates large files** → always write via `cat > … <<'EOF'` (python/heredoc).
- **Sandbox git index is intermittently corrupt** (phantom renames, `UU` garbage) → trust the USER's
  `git status`, not the sandbox's. Working-tree edits are fine; index/staging from the sandbox is unreliable.
- `*.timestamp-*.mjs` are Vitest temp litter (gitignored) — delete on the machine with `del *.timestamp-*.mjs`.
- Local web: `npm run dev` (Vite 5174) + `node server/auth-server.mjs` (8787). Web prod: `npm run build`→Render.
- Vault prod key: set `CONNECTOR_VAULT_KEY` (32B hex/base64) or strong `SESSION_SECRET`. Dev login: `ALLOW_DEV_LOGIN=1`.

## OPEN / NEXT
1. **User to run** the R3c `git rm` + commit (see `docs/PARITY-PHASE-TESTS.md` R3c section) and any pending
   R2a/R2b/R3a/R3b commits.
2. **Real end-to-end** browser test needs a reachable OAuth MCP server + a web deploy (Layer 4 of the runbook).
3. **Hardening follow-up:** the MCP SDK's OAuth discovery can fetch a provider-declared auth-server URL; only the
   MCP URL is SSRF-checked today (DNS-rebinding note in `mcp-broker.mjs`). Validate discovered endpoints before
   exposing untrusted connectors broadly.
4. **Broader parity (non-connector):** revisit remaining P-items in `docs/WEB-PARITY-PLAN.md`.
5. **Single-source migration** of the desktop engine (ADR-0001) — not started; still desktop-first + gated.

## Hard rules (do not break)
- Desktop-first; never edit `electron/**` or `shared/**` to accommodate web without explicit user sign-off.
- Token-accepting / token-injecting code is **security-gated** → design+threat-model note + approval first.
- Small, tested increments; provide plain-English test scenarios; the USER commits.
