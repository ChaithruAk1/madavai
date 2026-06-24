import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpConnector, ConnectorManager, ConnectorVault, MemoryVaultStore, type RpcTransport } from '../src/index.js';
import { deriveKey } from '@madav/storage';

function mockMcp(tools: any[], onCall: (p: any) => any): RpcTransport {
  return { send: async (req: any) => {
    if (req.method === 'initialize') return { jsonrpc: '2.0', id: req.id, result: { protocolVersion: '2024-11-05' } };
    if (req.method === 'tools/list') return { jsonrpc: '2.0', id: req.id, result: { tools } };
    if (req.method === 'tools/call') return { jsonrpc: '2.0', id: req.id, result: onCall(req.params) };
    return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'method not found' } };
  } };
}

test('McpConnector lists and calls tools over JSON-RPC', async () => {
  const c = new McpConnector(mockMcp([{ name: 'send_message', description: 'post' }], (p) => ({ content: [{ type: 'text', text: `sent: ${p.arguments.text}` }] })));
  await c.initialize();
  assert.equal((await c.listTools())[0]!.name, 'send_message');
  assert.equal((await c.callTool('send_message', { text: 'hi' })).content[0]!.text, 'sent: hi');
});

test('a JSON-RPC error is thrown, not returned as a silent bad result', async () => {
  const c = new McpConnector({ send: async (req: any) => ({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: 'unauthorized' } }) });
  await assert.rejects(() => c.listTools());
});

test('ConnectorManager decrypts the vault token and hands it to the connector (web user, no desktop)', async () => {
  const vault = new ConnectorVault(new MemoryVaultStore(), await deriveKey('vault-key', new Uint8Array(16)));
  await vault.put('u1', 'workspace-app', { accessToken: 'tok-XYZ' });
  let sawToken: string | undefined;
  const registry = { resolve: (p: string) => (p === 'workspace-app' ? { provider: p, url: 'https://connector.example' } : null) };
  const mgr = new ConnectorManager(vault, registry, (_url, token) => { sawToken = token; return mockMcp([{ name: 'post' }], () => ({ content: [] })); });
  assert.equal((await mgr.listTools('u1', 'workspace-app'))[0]!.name, 'post');
  assert.equal(sawToken, 'tok-XYZ');
});

test('an unknown connector is rejected', async () => {
  const vault = new ConnectorVault(new MemoryVaultStore(), await deriveKey('k', new Uint8Array(16)));
  await assert.rejects(() => new ConnectorManager(vault, { resolve: () => null }).listTools('u1', 'nope'));
});
