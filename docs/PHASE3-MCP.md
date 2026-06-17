# Phase 3 — MCP connectors on web (server broker)

**Goal:** give web agents access to MCP connector tools (Gmail, Slack, Drive, etc.), matching the
desktop connector experience — using a **server-side broker** (the chosen managed/3rd-party posture).
**Desktop is untouched** (it has its own `electron/mcp-manager.cjs` + `mcp-oauth.cjs`); this is web/server only.

## Why a server broker
A browser can't run **stdio** MCP servers and must never hold connector secrets. So the server connects
to remote **HTTP / SSE** MCP servers on the agent's behalf, lists their tools, and calls them. stdio MCP
servers stay **desktop-only by design**.

## Security model (non-negotiable)
- **Auth:** every `/mcp/*` route requires a valid Madav session token (same as `/proxy/*`).
- **Rate-limit:** dedicated bucket, mirroring `/proxy/fetch`.
- **SSRF guard:** `assertSafeMcpUrl` — https-only, blocks loopback / private / link-local / cloud-metadata
  / `.internal`/`.local` hosts (`server/mcp-broker.mjs`, unit-tested). ⚠ **Follow-up before prod:** also
  DNS-resolve the host and re-check the resolved IP (defends DNS-rebinding).
- **Secrets server-side only:** connector OAuth tokens live in an encrypted server vault (P3.4) and are
  attached to MCP requests server-side; they are **never** sent to the browser (plan P7).

## Increments
- **P3.1 — broker module (DONE, this build):** `server/mcp-broker.mjs` — `listTools` / `callTool` over
  HTTP/SSE via `@modelcontextprotocol/sdk` (mirrors desktop usage) + `toOpenAiTools` + the SSRF guard.
  Additive new file, **not wired** to any route or agent; pure functions unit-tested in
  `tests/parity/mcp-broker.test.js`. Live calls verified after P3.2 deploy.
- **P3.2 — routes:** additive `POST /mcp/tools` and `POST /mcp/call` in `server/auth-server.mjs`
  (auth + rate-limit + SSRF guard), mirroring `/proxy/fetch`. No existing route changes. Verified by a
  route-contract test + a manual `curl` against a public HTTP MCP server post-deploy.
- **P3.3 — agent wiring:** expose a connected server's tools to web chat/cowork agents (convert via
  `toOpenAiTools`, route tool calls through `/mcp/call`); gated by connector config. Web-only (`webBridge.js`).
- **P3.4 — OAuth + token vault:** server-side OAuth for cloud connectors + encrypted per-user token
  store; replaces the web `connectorSignIn` stub. Requires a security review.
- **P3.5 — connector UI:** wire the web Connectors screen to the routes, driven by the `webCapabilities`
  manifest (status `service`). Web-only renderer.

## Status
P3.1 built + unit-tested (SSRF guard + schema mapping). Nothing is wired yet, so the running web app is
unchanged. Next: P3.2 routes (touches the production `auth-server.mjs` — additive, with its own test).
