// Madav web — server-side MCP broker (Phase 3 / P3.1; auth passthrough added P3.4.5 R3b).
//
// The browser can't run stdio MCP servers and shouldn't hold connector secrets, so the SERVER
// brokers MCP calls for web agents: it connects to a remote MCP server over HTTP/SSE, lists its
// tools, and calls them on the agent's behalf. Mirrors the desktop SDK usage in
// electron/mcp-manager.cjs (Client + StreamableHTTP/SSE transports) but is web/server-only and
// adds an SSRF guard (the server must never be tricked into hitting internal/loopback addresses).
//
// R3b: an optional `authProvider` (the silent, vault-backed OAuthClientProvider from
// connector-oauth-web.mjs) lets the SDK attach + refresh a connected server's stored token on each
// call — server-side, never to the browser. stdio MCP servers are desktop-only by design.

let _sdk = null;
async function loadSdk() {
  if (_sdk) return _sdk;
  const client = await import("@modelcontextprotocol/sdk/client/index.js");
  let StreamableHTTPClientTransport, SSEClientTransport;
  try { ({ StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js")); } catch {}
  try { ({ SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js")); } catch {}
  _sdk = { Client: client.Client, StreamableHTTPClientTransport, SSEClientTransport };
  return _sdk;
}

// ---- SSRF guard (pure, unit-tested) -------------------------------------------------------------
function isPrivateIpv4(ip) {
  const o = String(ip).split(".").map(Number);
  if (o.length !== 4 || o.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isPrivateHost(host) {
  if (!host) return true;
  let h = String(host).trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h.includes(":")) {
    if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(h)) return true;
    const m = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m) return isPrivateIpv4(m[1]);
    return false;
  }
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return isPrivateIpv4(h);
  return false;
}

export function assertSafeMcpUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { throw new Error("Invalid MCP server URL."); }
  if (u.protocol !== "https:") throw new Error("MCP server URL must be https://");
  if (isPrivateHost(u.hostname)) throw new Error("Refusing to connect to a private/loopback/internal address.");
  return u;
}

// ---- connection + calls -------------------------------------------------------------------------
function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error((label || "MCP") + " timed out after " + ms + "ms")), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// Build transport options: forwarded headers and/or an SDK OAuthClientProvider. Pure + unit-tested.
export function transportInit(headers, authProvider) {
  const init = {};
  if (headers && Object.keys(headers).length) init.requestInit = { headers };
  if (authProvider) init.authProvider = authProvider;
  return Object.keys(init).length ? init : undefined;
}

async function connect(url, headers, timeoutMs, authProvider) {
  const u = assertSafeMcpUrl(url);
  const sdk = await loadSdk();
  const mk = () => new sdk.Client({ name: "madav-web", version: "0.1.0" }, { capabilities: {} });
  const init = transportInit(headers, authProvider);
  if (sdk.StreamableHTTPClientTransport) {
    try {
      const c = mk();
      await withTimeout(c.connect(new sdk.StreamableHTTPClientTransport(u, init)), timeoutMs, "MCP connect");
      return c;
    } catch (e) { if (!sdk.SSEClientTransport) throw e; }
  }
  if (!sdk.SSEClientTransport) throw new Error("No usable MCP HTTP transport in this SDK build.");
  const c = mk();
  await withTimeout(c.connect(new sdk.SSEClientTransport(u, init)), timeoutMs, "MCP connect");
  return c;
}

/** List a remote MCP server's tools. Returns [{ name, description, inputSchema }]. */
export async function listTools({ url, headers = {}, authProvider = null, timeoutMs = 15000 } = {}) {
  const c = await connect(url, headers, timeoutMs, authProvider);
  try {
    const res = await withTimeout(c.listTools(), timeoutMs, "MCP listTools");
    return (res.tools || []).map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));
  } finally { try { await c.close(); } catch {} }
}

/** Call one tool on a remote MCP server. Returns the raw MCP result ({ content, isError? }). */
export async function callTool({ url, headers = {}, authProvider = null, name, args = {}, timeoutMs = 60000 } = {}) {
  if (!name) throw new Error("callTool requires a tool name.");
  const c = await connect(url, headers, timeoutMs, authProvider);
  try {
    return await withTimeout(c.callTool({ name, arguments: args || {} }), timeoutMs, "MCP callTool");
  } finally { try { await c.close(); } catch {} }
}

/** Convert MCP tools to OpenAI-style function tools (pure). Prefix avoids clashing with built-ins. */
export function toOpenAiTools(tools, prefix = "mcp__") {
  return (tools || []).map((t) => ({
    type: "function",
    function: {
      name: prefix + t.name,
      description: String(t.description || "").slice(0, 1024),
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
}
