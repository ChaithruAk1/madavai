import { McpConnector, httpRpcTransport, type RpcTransport, type McpTool, type ToolResult } from './providers/mcp.js';
import type { ConnectorVault } from './vault.js';

export interface ConnectorConfig { provider: string; url: string }
export interface ConnectorRegistry { resolve(provider: string): ConnectorConfig | null }

/**
 * Bridges a web user to their remote connectors. For each call it pulls the OAuth token from the vault
 * (decrypted in memory only), opens an MCP connector, and proxies the tool call. No desktop required;
 * the registry + tool mapping are shared with the desktop, so behaviour is identical.
 */
export class ConnectorManager {
  constructor(
    private vault: ConnectorVault,
    private registry: ConnectorRegistry,
    private makeTransport: (url: string, token?: string) => RpcTransport = httpRpcTransport,
  ) {}
  private async connect(userId: string, provider: string): Promise<McpConnector> {
    const cfg = this.registry.resolve(provider);
    if (!cfg) throw new Error(`unknown connector "${provider}"`);
    const tok = await this.vault.get(userId, provider);
    const c = new McpConnector(this.makeTransport(cfg.url, tok?.accessToken));
    await c.initialize();
    return c;
  }
  async listTools(userId: string, provider: string): Promise<McpTool[]> { return (await this.connect(userId, provider)).listTools(); }
  async callTool(userId: string, provider: string, name: string, args?: Record<string, unknown>): Promise<ToolResult> {
    return (await this.connect(userId, provider)).callTool(name, args);
  }
}
