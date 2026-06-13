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
import { listProviders } from "./providers.js";
import { makeSharedProvider, handleProviderCallback } from "./auth.js";

const PORT = process.env.PORT || 8077;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const app = express();
app.disable("x-powered-by");

const active = listProviders();
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
  connect: active.map((p) => ({ provider: p.id, label: p.label, mcpUrl: `${PUBLIC_URL}/${p.id}/mcp` })),
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

  // The MCP endpoint, bearer-protected with the gateway token.
  app.post(`/${prov.id}/mcp`,
    requireBearerAuth({ verifier: provider, resourceMetadataUrl: `${PUBLIC_URL}/.well-known/oauth-protected-resource/${prov.id}/mcp` }),
    express.json({ limit: "1mb" }),
    async (req, res) => {
      const server = buildMcpServer(prov);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { try { transport.close(); } catch {} try { server.close(); } catch {} });
      try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
      catch (e) { if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) }); }
    });
}

app.listen(PORT, () => {
  console.log(`[gateway] listening on :${PORT}  (public ${PUBLIC_URL})`);
  for (const p of active) console.log(`[gateway]   ${p.label} → paste into Madav:  ${PUBLIC_URL}/${p.id}/mcp`);
});
