# P3.4.3 — Connector OAuth: design + threat model (SECURITY-REVIEW GATE)

**Status: DESIGN ONLY. No code in this slice.** This document exists so the OAuth flow that *accepts and
stores third-party tokens* is reviewed **before** any token-accepting code exists. Nothing here is wired.

**Read first:** `docs/PHASE3-OAUTH.md` (the P3.4 plan + security model). This doc refines P3.4.3/P3.4.4.

---

## 1. Why this is gated (how connector OAuth differs from the existing login OAuth)

The server already has a Google/GitHub OAuth flow (`/auth/:provider/start|callback`). It is **not** a model
for this, because its threat profile is smaller:

| | Login OAuth (exists) | Connector OAuth (P3.4.3) |
|---|---|---|
| Purpose | Prove identity, mint a Madav session | Connect a 3rd-party account for ongoing API/MCP calls |
| Provider token | **Discarded** right after `userInfo()` | **Stored** (access + refresh), reused for hours/days |
| Scopes | Minimal (email/profile) | Broad, sensitive (e.g. `gmail.readonly`, Slack `channels:read`) |
| If compromised | Attacker can impersonate sign-in | Attacker can **read/act on the user's real Gmail/Slack/etc.** |
| Custodian risk | None (nothing kept) | Madav holds long-lived keys to other systems |

That last row is the whole reason for the gate. We become a token custodian. The bar is higher than login.

**Do NOT reuse the `OAUTH` (google/github login) registry for connectors.** Even when the provider is the
same company, a connector is a *different OAuth client* with *different scopes* and a *different purpose*.
Conflating them would silently widen the login app's scopes. Connectors get their own registry (§4).

---

## 2. Scope of P3.4.3 vs P3.4.4 (two separate gates)

- **P3.4.3 (this doc):** the *acquisition* flow — `start` → provider consent → `callback` → exchange code →
  **seal tokens into the vault** (P3.4.1/4.2). Plus `disconnect` and a `list` that returns **status only**.
- **P3.4.4 (separate gate):** the *use* flow — at MCP/connector call time, fetch the sealed token, refresh if
  expired, attach it **server-side**. Reviewed separately because injecting a secret into an outbound request
  is its own surface (SSRF, header leakage, wrong-tenant). Not in P3.4.3.

---

## 3. Data flow (acquisition)

```
Browser (logged-in Madav user)                 Auth server (holds secrets + vault)         Provider
  |  POST /connectors/:id/oauth/start  ----->  authUser(req) -> require login                   |
  |                                            mint state = randomBytes(16), bind {userId,id,    |
  |                                            codeVerifier(PKCE), redirect, exp=+10m}           |
  |  <----- 200 { authorizeUrl }  (or 302)     store state in pendingConnector (single-use)      |
  |  -- browser navigates to authorizeUrl ------------------------------------------------>  consent
  |                                                                              user approves scopes
  |  <---------------- 302 back to /connectors/:id/oauth/callback?code=&state= --------------    |
  |  GET callback  ------------------------>  look up state (delete it); check exp + id match     |
  |                                            POST code+client_secret+codeVerifier  --------> token endpoint
  |                                            <-------- { access_token, refresh_token, exp } ----|
  |                                            vault.put(userId, connectorId, sealed tokens)      |
  |  <----- 302 to SPA /connected (status only, NO token) ----                                    |
```

Invariant: **the access/refresh tokens never enter any HTTP response body, redirect, cookie, or log.** They
go provider → server memory → sealed → store. The browser only ever learns `{connected:true, scopes,
accountLabel}`.

---

## 4. Connector registry (server-side config, secrets in env)

Mirror the `OAUTH` object's shape, separate constant. Each entry is fixed server-side constants + env secrets
— **no field is ever taken from the request** (this kills SSRF/scope-injection at the source):

```
CONNECTORS = {
  "google-gmail": {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",   // constant
    tokenUrl:     "https://oauth2.googleapis.com/token",            // constant
    scopes:       ["https://www.googleapis.com/auth/gmail.readonly"], // constant, least-privilege
    clientId:     env.GMAIL_CONNECTOR_CLIENT_ID,                    // env
    clientSecret: env.GMAIL_CONNECTOR_CLIENT_SECRET,                // env (server only)
    usePKCE: true, extraAuthParams: { access_type: "offline", prompt: "consent" }, // get refresh_token
  },
  // slack, notion, github-repo, ... same shape
}
```

A connector is "available" only if its `clientId`/`clientSecret` env vars are set; otherwise `start` returns
`501 not configured` (never a stack trace). Adding a connector = a registry entry + two env vars, **no new
code path** — which keeps the audited surface constant as connectors are added.

---

## 5. Routes (all mirror existing helpers: authUser, rateLimited, isAllowedRedirect, json)

- `GET  /connectors` — `authUser` required. Returns `[{id, connected, scopes, accountLabel}]`. **Never tokens.**
- `POST /connectors/:id/oauth/start` — `authUser` required; `:id` must be in `CONNECTORS`; rate-limited
  (`"conn-oauth"`, e.g. 20/15min). Validates optional `redirect` via `isAllowedRedirect`. Mints PKCE +
  user-bound state. Returns `{ authorizeUrl }`.
- `GET  /connectors/:id/oauth/callback?code&state` — looks up + **deletes** state (single-use); rejects if
  missing/expired/`:id` mismatch; exchanges code (with `code_verifier`); seals tokens into
  `makeConnectorVault(store).put(state.userId, id, tokens)`; 302 to an allowlisted SPA "connected" page.
- `POST /connectors/:id/disconnect` — `authUser` required; `vault.remove(user.id, id)`. Idempotent.

State store: a dedicated `pendingConnector` Map `{state -> {connectorId, userId, codeVerifier, redirect, exp}}`,
10-min TTL sweeper, single-use — same pattern as `pending`, but **bound to `userId`** (login OAuth's state is
not user-bound because there's no user yet; here there always is).

---

## 6. Threat model (STRIDE) and mitigations

| # | Threat | Mitigation in this design |
|---|---|---|
| T1 | **CSRF on callback** (attacker tricks victim's browser into finishing attacker's auth) | Random 16-byte `state`, single-use (deleted on callback), 10-min TTL, **bound to the authenticated userId**; PKCE S256 binds the code to the original `start`. |
| T2 | **Authorization-code interception / replay** | PKCE S256 (`code_verifier` never leaves server; only `code_challenge` is public). Code is single-use at the provider; we also delete state. |
| T3 | **Confused deputy / cross-user write** (write tokens into the wrong user's vault) | `userId` comes from the *server-side* state record minted under `authUser`, not from any request field at callback time. Callback cannot target another user. |
| T4 | **Token leakage to the browser** | Tokens never serialized to any response/redirect/cookie. `list` returns status only. CSP already blocks inline JS exfil; tokens aren't in the DOM to begin with. |
| T5 | **Token theft at rest** | AES-256-GCM sealed vault (P3.4.1), per-user, key from `CONNECTOR_VAULT_KEY`/strong `SESSION_SECRET`, **refused in production** if weak. No-plaintext-at-rest test already passing (P3.4.2). |
| T6 | **SSRF via OAuth endpoints** | `authorizeUrl`/`tokenUrl` are **fixed constants** in the registry — never from the request. (For P3.4.4 API calls to dynamic URLs, reuse `assertSafeMcpUrl`.) |
| T7 | **Open redirect** after callback | Post-callback `redirect` validated by the existing `isAllowedRedirect` (exact-origin; already hardened against `startsWith` origin-confusion, review H2). |
| T8 | **Scope escalation** | Scopes are registry constants (least-privilege); **no user-supplied scope** parameter is honored. |
| T9 | **Secret leakage in logs** | Mirror the existing token-exchange logging: log `error`/`description`/`clientIdTail`/`secretSet`/`secretLen` only — never the secret or tokens. |
| T10 | **Brute force / abuse** of start/callback | `rateLimited` bucket; `clientIp` already counts `TRUSTED_PROXY_HOPS` from the right (XFF-spoof-resistant, review M5). |
| T11 | **Multi-instance state loss / fixation** | ⚠️ **Known gap to resolve before multi-instance prod:** `pending`/`pendingConnector` are in-memory, so on >1 Render instance a callback may hit an instance without the state and fail (DoS), and in-memory state can't be centrally revoked. **Decision needed (§8):** move connector state into the store (a `pendingoauth` collection, TTL-swept) for P3.4.3, or accept single-instance until then. |
| T12 | **Stale/garbage tokens** | `disconnect` removes; refresh failures (P3.4.4) mark disconnected; vault `open` failure (rotated key) degrades to "not connected", never crashes. |

---

## 7. Test plan (unit-testable, **no live providers** — provider `fetch` is stubbed)

All in `tests/parity/` (web/server only), so they run in CI without secrets:

1. `start` requires auth → 401 without a valid session.
2. `start` rejects unknown `:id` (not in registry) and unconfigured connectors (501), with no stack trace.
3. `start` rejects a non-allowlisted `redirect`.
4. State is single-use (second callback with same state fails) and expires after TTL.
5. State is **user-bound**: a callback cannot write into a different user's vault.
6. PKCE: `code_challenge` = base64url(SHA-256(`code_verifier`)); verifier is high-entropy and server-only.
7. Token exchange (stubbed) → tokens land **sealed** in the vault; the HTTP response/redirect contains **no
   token** (assert the response body/Location has neither `access_token` nor the token value).
8. `list` returns status only (never token values); `disconnect` removes and is idempotent.
9. Registry contains **no request-derived URLs** (authorize/token are constants).

---

## 8. Decisions needed from review before coding P3.4.3

**DECISIONS LOCKED (2026-06-17, reviewer = Chaithru):** (1) **store-backed** OAuth state (survives multi-instance); (2) first connector = **Google Gmail read-only**; (3) store a **minimal non-secret account label** for the UI, never the token.

1. **Multi-instance state (T11):** store-backed connector OAuth state now, or accept single-instance for the
   first connector? (Recommendation: store-backed — Render can scale out, and a DoS on connect is worse than
   a little extra code. It also lets us centrally expire/revoke pending flows.)
2. **First connector(s):** which provider to implement first as the reference? (Recommendation: one Google
   read-only scope, e.g. Gmail `gmail.readonly` — well-documented, supports refresh tokens, low blast radius.)
3. **Account label:** store a non-secret label (e.g. the connected email) for the UI, or show only
   "connected/not"? (Recommendation: store a minimal label; never the token.)

## 9. Implementation order once approved (each its own verifiable slice)

- P3.4.3a: `pendingConnector` state + PKCE helpers + registry scaffold (no routes) + unit tests.
- P3.4.3b: `start`/`list`/`disconnect` routes (no callback yet) + tests.
- P3.4.3c: `callback` (token exchange stubbed in tests) → seal into vault + tests. **Re-review here** — this is
  the first code that accepts a provider token.
- Then P3.4.4 (token injection) under its own gate.

**Status:** §8 signed off. **P3.4.3a + P3.4.3b + P3.4.3c implemented + tested** (PKCE, constants-only registry, store-backed user-bound state, start/list/disconnect routes, and the token-accepting callback exchanging code→tokens sealed into the vault; 80 parity tests green). **Next gate: P3.4.4** (server-side token use/refresh).
