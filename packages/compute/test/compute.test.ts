import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCode, DenySandbox } from '../src/index.js';
import { NodeVmSandbox } from '../src/node.js';

const box = new NodeVmSandbox();

test('runs JS in isolation and captures stdout + result', async () => {
  const r = await runCode(box, { language: 'js', source: "console.log('hi'); 1 + 1" });
  assert.equal(r.ok, true); assert.equal(r.stdout, 'hi'); assert.equal(r.result, 2);
});

test('an infinite loop is killed by the timeout (no hang)', async () => {
  const r = await runCode(box, { language: 'js', source: 'while(true){}', timeoutMs: 50 });
  assert.equal(r.ok, false); assert.match(r.error || '', /tim(ed )?out/i);
});

test('a thrown error is captured, not propagated', async () => {
  const r = await runCode(box, { language: 'js', source: "throw new Error('boom')" });
  assert.equal(r.ok, false); assert.match(r.error || '', /boom/);
});

test('isolation: sandboxed code cannot see the host scope', async () => {
  (globalThis as any).__secret = 'leak';
  const r = await runCode(box, { language: 'js', source: 'typeof __secret' });
  assert.equal(r.result, 'undefined');
  delete (globalThis as any).__secret;
});

test('Python is routed to the server tier, not run here', async () => {
  assert.equal((await runCode(box, { language: 'python', source: 'print(1)' })).ok, false);
});

test('DenySandbox refuses execution (no sandbox = no eval)', async () => {
  const r = await runCode(new DenySandbox(), { language: 'js', source: '1+1' });
  assert.equal(r.ok, false); assert.match(r.error || '', /refused/);
});

test('empty source is rejected before reaching the sandbox', async () => {
  assert.equal((await runCode(box, { language: 'js', source: '   ' })).ok, false);
});
