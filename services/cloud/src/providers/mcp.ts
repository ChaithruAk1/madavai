/** A Model Context Protocol client (JSON-RPC 2.0). Speaks to a remote connector server; the protocol is
 *  open, so this is integration, not branding. Transport is injected (HTTP/SSE in prod, a fake in tests). */
export interface RpcTransport { send(req: unknown): Promise<any>; }

export interface McpTool { name: string; description?: string; inputSchema?: unknown }
export interface ToolResult { content: Array<{ type: string; text?: string }>; isError?: boolean }

export class McpConnector {
  private idSeq = 0;
  constructor(private transport: RpcTransport) {}
  private async call(method: string, params?: unknown): Promise<any> {
    const res = await this.transport.send({ jsonrpc: '2.0', id: ++this.idSeq, method, params });
    if (res && res.error) throw new Error(`MCP ${method}: ${res.error.message ?? res.error.code}`);
    return res ? res.result : undefined;
  }
  async initialize(): Promise<void> { await this.call('initialize', { protocolVersion: '2024-11-05', capabilities: {} }); }
  async listTools(): Promise<McpTool[]> { const r = await this.call('tools/list'); return (r && r.tools) ?? []; }
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> { return this.call('tools/call', { name, arguments: args }); }
}

/** Real HTTP transport: POST JSON-RPC with the bearer token (used server-side at deploy). */
export function httpRpcTransport(url: string, token?: string): RpcTransport {
  const f: any = (globalThis as any).fetch;
  return {
    send: async (req) => {
      const r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(req) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  };
}
