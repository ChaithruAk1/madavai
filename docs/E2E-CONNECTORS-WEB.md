# E2E test guide — Web connectors (P3.4 / P3.4.5)

How to verify the whole web connector system: registry-free **MCP-SDK OAuth**, the encrypted **token vault**,
the `/connectors/*` routes, the web-bridge wiring, and **token use in chat** via the `/mcp` broker. Three
layers — run top to bottom; the higher layers need no external services, the last needs a real OAuth MCP server.

## What's under test
| Piece | File | Covered by |
|---|---|---|
| Encrypted token vault (AES-256-GCM) | `server/token-vault.mjs`, `server/connector-vault.mjs` | Layer 1 (unit) + Layer 2 (E2E script) |
| Single-use OAuth state | `server/oauth-state.mjs` | Layer 1 + Layer 2 |
| SDK OAuth provider + two-request orchestration | `server/connector-oauth-web.mjs` | Layer 1 + Layer 2 |
| Routes: signin/callback/status/signout | `server/auth-server.mjs` | Layer 1 (contract) + Layer 3 (curl/browser) |
| Broker token attach (silent provider) | `server/mcp-broker.mjs`, `/mcp/*` routes | Layer 1 + Layer 2 + Layer 3 |
| Web bridge: connectorSignIn/authStatus/signOut | `src/bridge/webBridge.js` | Layer 3 (browser) |

---

## Layer 1 — Automated unit + contract (no setup)
    npx vitest run tests/parity
**Expect:** all green (~88 after the R3c `git rm`). Covers vault round-trip + no-plaintext, state single-use/TTL,
the provider, `transportInit` (auth passthrough), and static route-contract checks.

## Layer 2 — Automated E2E of the full server chain (no network/browser)
    node tests/e2e/connectors-flow.e2e.mjs
**Expect:** `✅ E2E PASSED` with 7 steps. This drives begin→consent(mocked)→finish→**sealed tokens**→silent
provider read-back→`transportInit`, asserting single-use state, **no plaintext at rest**, per-user isolation,
and disconnect. The only mock is the MCP SDK's `auth()` (the external provider boundary).

---

## Layer 3 — Live HTTP (curl) against a running auth server

### Start the server with a dev login enabled
    # PowerShell (Windows)
    $env:ALLOW_DEV_LOGIN="1"; $env:SESSION_SECRET="a-strong-dev-secret-0123456789"; node server/auth-server.mjs
    # (auth server listens on 8787 in dev)

### 1) Get a session token
The dev email must pass the private-beta gate (an admin / free-access email — add it to your free-emails list
or use your admin email):

    curl "http://127.0.0.1:8787/auth/dev/start?email=you@youradmin.com"
    # -> {"token":"<JWT-ish>"}   ... save it:
    TOKEN=<paste>

### 2) Status (unauthenticated is rejected; authenticated shows not-connected)
    curl -i "http://127.0.0.1:8787/connectors/status?id=acme-mcp"                       # -> 401
    curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8787/connectors/status?id=acme-mcp"
    # -> {"connected":false,"registered":false}

### 3) Start a sign-in (SSRF guard + auth enforced; returns an authorize URL for an OAuth server)
    curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"server":{"id":"acme-mcp","url":"https://mcp.example.com/mcp","transport":"http"}}' \
      http://127.0.0.1:8787/connectors/signin
    # OAuth server -> {"ok":true,"authorizeUrl":"https://provider/..."}
    # non-OAuth server -> {"ok":false,"error":"didn't start an OAuth sign-in"}
    # private/loopback URL -> 400 "Refusing to connect to a private/loopback/internal address."  (SSRF guard)

### 4) Sign out
    curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d '{"id":"acme-mcp"}' http://127.0.0.1:8787/connectors/signout      # -> {"ok":true}

**Invariant to eyeball:** no response body above ever contains an `access_token`/`refresh_token`.

---

## Layer 4 — Full browser E2E (needs a real OAuth MCP server)

### Prereqs
- A reachable **MCP server that authenticates via OAuth** (dynamic client registration + PKCE). Options:
  your hosted gateway/Composio URLs already listed in the Connectors UI, or any public OAuth-protected MCP.
- Web app running: `npm run dev` (Vite on 5174) with the auth server on 8787 (see Layer 3). For the live site:
  `npm run build` → redeploy to Render. (Desktop needs no rebuild — it's untouched.)

### Steps
1. Open the web app, sign in to Madav.
2. **Connectors** → add/select the OAuth MCP server (paste its URL as a remote connector) → **Connect**.
3. A popup opens to the provider's consent screen → approve.
4. Popup shows "Connected to Madav"; the connector flips to **Connected** in the UI.
5. **Reload** → still Connected (status is read from the server vault).
6. In **Chat**, ask the agent to use that connector's tools → the tool runs (the server attaches your stored
   token); the connector now shows a tool count.
7. **Disconnect** → status returns to not-connected; a subsequent tool call reports needs-sign-in.

### Pass / fail
| Check | Pass |
|---|---|
| Connect → approve → "Connected" | ✓ |
| Reload keeps Connected | ✓ |
| Tool call in chat succeeds with stored token | ✓ |
| Disconnect → not-connected, tools error as needs-sign-in | ✓ |
| Token never visible in browser devtools (Network/Storage) | ✓ (server-side only) |
| Desktop connectors behave exactly as before | ✓ (desktop untouched) |

---

## Notes
- **No per-connector code:** the same flow serves any OAuth MCP server URL — the SDK discovers + registers.
- **Prod env:** set `CONNECTOR_VAULT_KEY` (32 bytes hex/base64) or a strong `SESSION_SECRET`; the vault refuses
  to operate in production without one.
- **`ALLOW_DEV_LOGIN=1` is for local testing only** — never enable it in production.
