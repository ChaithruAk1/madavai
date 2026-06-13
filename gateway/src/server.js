// Madav connector gateway — one small Express service. A SINGLE OAuth authorization server
// (at the gateway root, where the MCP SDK expects /authorize, /token, /register) brokers
// every configured provider, chosen per-request by the RFC 8707 `resource` parameter.
// Each provider is exposed as an OAuth-protected remote MCP server at  <PUBLIC_URL>/<id>/mcp
// — paste that URL into Madav and click "Sign in with your browser".
import express from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { listProviders } from "./providers.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { makeSharedProvider, handleProviderCallback, handleComposioCallback } from "./auth.js";
import { composioEnabled, COMPOSIO_TOOLKITS, composioToolkit, composioListTools, composioExecute } from "./composio.js";

const PORT = process.env.PORT || 8077;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const app = express();
app.disable("x-powered-by");

const active = listProviders();
const sessions = new Map(); // mcp-session-id -> { transport, server }
if (!active.length) console.warn("[gateway] No providers configured — set CLIENT_ID/SECRET env vars (see .env.example).");

const provider = makeSharedProvider({ publicUrl: PUBLIC_URL });
const allScopes = [...new Set(active.flatMap((p) => (p.scopes ? p.scopes.split(/[ ,]+/) : [])).filter(Boolean))];

// Single authorization server at the root: metadata, /authorize, /token, /register, /revoke.
app.use(mcpAuthRouter({
  provider,
  issuerUrl: new URL(PUBLIC_URL),
  baseUrl: new URL(PUBLIC_URL),
  resourceName: "Madav Connectors",
  scopesSupported: allScopes,
}));

// Health + the URLs to paste into Madav.
app.get("/", (_req, res) => res.json({
  ok: true, service: "madav-connector-gateway",
  connect: [
    ...active.map((p) => ({ provider: p.id, label: p.label, mcpUrl: `${PUBLIC_URL}/${p.id}/mcp` })),
    ...(composioEnabled() ? COMPOSIO_TOOLKITS.map((t) => ({ provider: t.slug, label: t.label, via: "composio", mcpUrl: `${PUBLIC_URL}/c/${t.slug}/mcp` })) : []),
  ],
}));

function buildMcpServer(prov) {
  const server = new McpServer({ name: `madav-${prov.id}`, version: "0.1.0" });
  for (const t of prov.tools) {
    server.registerTool(t.name, { description: t.description, inputSchema: t.schema || {} }, async (args, extra) => {
      const token = extra && extra.authInfo && extra.authInfo.extra && extra.authInfo.extra.providerToken;
      if (!token) return { content: [{ type: "text", text: "Not signed in to " + prov.label + "." }], isError: true };
      try { return { content: [{ type: "text", text: String(await t.run(token, args || {})) }] }; }
      catch (e) { return { content: [{ type: "text", text: "Error: " + String((e && e.message) || e) }], isError: true }; }
    });
  }
  return server;
}

for (const prov of active) {
  // Per-connector protected-resource metadata → points the client at the single root AS.
  app.get(`/.well-known/oauth-protected-resource/${prov.id}/mcp`, (_req, res) => res.json({
    resource: `${PUBLIC_URL}/${prov.id}/mcp`,
    authorization_servers: [PUBLIC_URL],
    scopes_supported: prov.scopes ? prov.scopes.split(/[ ,]+/).filter(Boolean) : [],
    resource_name: `Madav ${prov.label}`,
  }));

  // Where the real provider (GitHub/Notion/Slack) sends the user back.
  app.get(`/oauth/${prov.id}/callback`, (req, res) => handleProviderCallback(prov.id, req, res, PUBLIC_URL));

  // The MCP endpoint, bearer-protected with the gateway token. Stateful sessions: an
  // initialize request spins up a server+transport keyed by a session id; later requests
  // (tools/list, tools/call) reuse it via the mcp-session-id header.
  const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${PUBLIC_URL}/.well-known/oauth-protected-resource/${prov.id}/mcp` });

  app.post(`/${prov.id}/mcp`, bearer, express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const sid = req.headers["mcp-session-id"];
      let entry = sid ? sessions.get(sid) : null;
      if (!entry) {
        if (!isInitializeRequest(req.body)) {
          return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session — send an initialize request first." }, id: null });
        }
        const server = buildMcpServer(prov);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => sessions.set(id, { transport, server }),
        });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        entry = { transport, server };
      }
      await entry.transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String((e && e.message) || e) }, id: null });
    }
  });

  // GET = server→client stream, DELETE = end session. Both keyed by the session id.
  const bySession = async (req, res) => {
    const sid = req.headers["mcp-session-id"];
    const entry = sid ? sessions.get(sid) : null;
    if (!entry) return res.status(400).send("Unknown or missing session");
    await entry.transport.handleRequest(req, res);
  };
  app.get(`/${prov.id}/mcp`, bearer, bySession);
  app.delete(`/${prov.id}/mcp`, bearer, bySession);
}

// ---- Composio-backed toolkits (one-click for ~hundreds of apps, no per-app OAuth app) ----
if (composioEnabled()) {
  app.get("/oauth/composio/callback", (req, res) => handleComposioCallback(req, res));

  // PRM per toolkit → points the client at the single root AS.
  app.get("/.well-known/oauth-protected-resource/c/:toolkit/mcp", (req, res) => res.json({
    resource: `${PUBLIC_URL}/c/${req.params.toolkit}/mcp`,
    authorization_servers: [PUBLIC_URL],
    resource_name: `Madav · ${req.params.toolkit}`,
  }));

  // Bearer middleware built per-request so the 401 points at this toolkit's PRM.
  const composioBearer = (req, res, next) =>
    requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${PUBLIC_URL}/.well-known/oauth-protected-resource/c/${req.params.toolkit}/mcp` })(req, res, next);

  // A low-level MCP server whose tools are listed + executed via Composio at runtime.
  function buildComposioServer(slug) {
    const server = new Server({ name: `madav-c-${slug}`, version: "0.1.0" }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      try { return { tools: await composioListTools(slug) }; } catch { return { tools: [] }; }
    });
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const a = (extra && extra.authInfo && extra.authInfo.extra) || {};
      if (!a.connectionId) return { content: [{ type: "text", text: "Not signed in." }], isError: true };
      try { return { content: [{ type: "text", text: await composioExecute(request.params.name, a.userId, a.connectionId, request.params.arguments) }] }; }
      catch (e) { return { content: [{ type: "text", text: "Error: " + String((e && e.message) || e) }], isError: true }; }
    });
    return server;
  }

  app.post("/c/:toolkit/mcp", composioBearer, express.json({ limit: "1mb" }), async (req, res) => {
    try {
      if (!composioToolkit(req.params.toolkit)) return res.status(404).json({ jsonrpc: "2.0", error: { code: -32601, message: "Unknown toolkit" }, id: null });
      const sid = req.headers["mcp-session-id"];
      let entry = sid ? sessions.get(sid) : null;
      if (!entry) {
        if (!isInitializeRequest(req.body)) return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session — send initialize first." }, id: null });
        const server = buildComposioServer(req.params.toolkit);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => sessions.set(id, { transport, server }) });
        transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
        await server.connect(transport);
        entry = { transport, server };
      }
      await entry.transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String((e && e.message) || e) }, id: null });
    }
  });
  const composioBySession = async (req, res) => {
    const sid = req.headers["mcp-session-id"]; const entry = sid ? sessions.get(sid) : null;
    if (!entry) return res.status(400).send("Unknown or missing session");
    await entry.transport.handleRequest(req, res);
  };
  app.get("/c/:toolkit/mcp", composioBearer, composioBySession);
  app.delete("/c/:toolkit/mcp", composioBearer, composioBySession);
}

app.listen(PORT, () => {
  console.log(`[gateway] listening on :${PORT}  (public ${PUBLIC_URL})`);
  for (const p of active) console.log(`[gateway]   ${p.label} → paste into Madav:  ${PUBLIC_URL}/${p.id}/mcp`);
  if (composioEnabled()) console.log(`[gateway]   Composio: ${COMPOSIO_TOOLKITS.length} toolkits one-click at ${PUBLIC_URL}/c/<toolkit>/mcp`);
});
