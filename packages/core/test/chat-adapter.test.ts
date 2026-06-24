import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeChatAdapter, coreChatTurn } from '../src/index.js';

function base(over = {}) {
  const ui: { k: string; d: Record<string, unknown> }[] = [];
  const platform = {
    streamChatTools: async () => ({ content: 'Final answer', toolCalls: [] }),
    streamChat: async () => ({ text: '' }),
    execLeaf: async (n: string) => 'RES:' + n,
    ui: (k: string, d: Record<string, unknown>) => ui.push({ k, d }),
    toolset: [],
    ...over,
  };
  return { ui, platform };
}

test('runTool: runs and emits tool_use + tool_result', async () => {
  const { ui, platform } = base();
  const a = makeChatAdapter(platform);
  const out = await a.runTool('read', { path: 'a' }, { id: '1' });
  assert.equal(out, 'RES:read');
  assert.ok(ui.some((e) => e.k === 'tool_use'));
  assert.ok(ui.some((e) => e.k === 'tool_result'));
});

test('runTool: a denied authorize short-circuits', async () => {
  const { platform } = base({ authorize: async () => ({ decision: 'denied' }) });
  const a = makeChatAdapter(platform);
  const out = await a.runTool('write', {}, { id: '2' });
  assert.match(String(out), /declined/);
});

test('integration: coreChatTurn drives the adapter to a final answer', async () => {
  const { ui, platform } = base();
  const r = await coreChatTurn({ adapter: makeChatAdapter(platform), prompt: 'hi' });
  assert.equal(r.text, 'Final answer');
  assert.ok(ui.some((e) => e.k === 'assistant_message'));
  assert.ok(ui.some((e) => e.k === 'result'));
});

test('stream: shapes native tool calls into the unified form', async () => {
  const { platform } = base({ streamChatTools: async () => ({ content: '', toolCalls: [{ id: '9', name: 'read', arguments: '{}' }] }) });
  const a = makeChatAdapter(platform);
  const resp = await a.stream({}, [], [], { onDelta: () => {} });
  assert.equal(resp.tool_calls?.[0]?.function?.name, 'read');
});
