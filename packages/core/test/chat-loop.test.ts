import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coreChatTurn, validateChatAdapter, type ChatAdapter, type StreamResponse } from '../src/index.js';

function mock(responses: StreamResponse[] | ((n: number) => StreamResponse)) {
  const events: { type: string; [k: string]: unknown }[] = [];
  let n = 0;
  const adapter: ChatAdapter = {
    stream: async () => (typeof responses === 'function' ? responses(n++) : responses[n++] || { content: '' }),
    runTool: async (name: string) => 'RESULT:' + name,
    emit: (e) => events.push(e),
    tools: () => [{ function: { name: 'read', parameters: { properties: {} } } }],
  };
  return { adapter, events };
}

test('validateChatAdapter: detects missing methods', () => {
  assert.equal(validateChatAdapter({}).ok, false);
  assert.equal(validateChatAdapter({ stream() {}, runTool() {}, emit() {} }).ok, true);
});

test('plain final answer in one step', async () => {
  const { adapter, events } = mock([{ content: 'Hello there' }]);
  const r = await coreChatTurn({ adapter, prompt: 'hi' });
  assert.equal(r.text, 'Hello there');
  assert.equal(r.steps, 1);
  assert.ok(events.some((e) => e.type === 'final' && e.text === 'Hello there'));
});

test('tool call then final answer', async () => {
  const { adapter, events } = mock([
    { content: '', tool_calls: [{ id: '1', function: { name: 'read', arguments: '{"path":"a"}' } }] },
    { content: 'Done' },
  ]);
  const r = await coreChatTurn({ adapter, prompt: 'go' });
  assert.equal(r.text, 'Done');
  assert.deepEqual(r.observedTools, ['read']);
  assert.ok(events.some((e) => e.type === 'tool_result' && e.ok === true));
});

test('loop breaker blocks the 3rd identical consecutive call', async () => {
  const call = { content: '', tool_calls: [{ id: 'x', function: { name: 'read', arguments: '{"path":"a"}' } }] };
  const { adapter, events } = mock([call, call, call, { content: 'final' }]);
  const r = await coreChatTurn({ adapter, prompt: 'go' });
  // the CallGuard blocks the repeated call; the run-guard's repeat detector also ends the run.
  assert.ok(events.some((e) => e.type === 'tool_blocked'));
  assert.ok(r.text.length > 0);
});

test('text-mode: parses a fenced tool block from assistant text', async () => {
  const { adapter } = mock([{ content: '```tool\n{"name":"read","args":{"path":"a"}}\n```' }, { content: 'after tool' }]);
  const r = await coreChatTurn({ adapter, prompt: 'go', opts: { textMode: true } });
  assert.equal(r.text, 'after tool');
  assert.deepEqual(r.observedTools, ['read']);
});

test('step cap ends the run with a clear reason', async () => {
  const { adapter, events } = mock(() => ({ content: '', tool_calls: [{ id: 'y', function: { name: 'read', arguments: '{}' } }] }));
  const r = await coreChatTurn({ adapter, prompt: 'go', opts: { stepCap: 2 } });
  assert.equal(r.steps, 2);
  assert.match(r.text, /step cap reached/);
  assert.ok(events.some((e) => e.type === 'cap_reached'));
});
