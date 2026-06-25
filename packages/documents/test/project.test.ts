import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDataProject } from '../src/index.js';

const SALES = 'region,units,revenue\nNA,10,1000\nEU,5,800\nNA,7,600\nEU,3,400\nAPAC,9,900';
function adapters(replies: string[], saved: { name?: string; bytes?: Uint8Array }) {
  let i = 0;
  return {
    listFiles: async () => [{ name: 'sales.csv', text: SALES }],
    askModel: async () => replies[Math.min(i++, replies.length - 1)]!,
    saveOutput: async (_f: string, name: string, bytes: Uint8Array) => { saved.name = name; saved.bytes = bytes; },
    emit: () => {},
  };
}

test('weak model: a valid plan -> deterministic ingest+compute+author, output saved (model wrote NO code)', async () => {
  const saved: any = {};
  const plan = '{"source":"sales","ops":[{"op":"aggregate","groupBy":["region"],"measures":[{"column":"revenue","fn":"sum","as":"Total"}]}]}';
  const res = await runDataProject({ task: 'total revenue by region', folder: '/p' }, adapters([plan], saved));
  assert.equal(res.ok, true);
  assert.equal(res.output, 'Result.xlsx');
  assert.ok(saved.bytes && saved.bytes.length > 0);
});

test('weak model: a malformed reply is caught by the schema gate and REPAIRED on re-ask (no crash)', async () => {
  const saved: any = {};
  const bad = 'Sure, I will sum revenue by region for you!';  // prose, no JSON
  const good = '{"source":"sales","ops":[{"op":"aggregate","groupBy":["region"],"measures":[{"column":"revenue","fn":"sum"}]}]}';
  const res = await runDataProject({ task: 'sum revenue by region', folder: '/p' }, adapters([bad, good], saved), { maxRepair: 1 });
  assert.equal(res.ok, true);
  assert.ok(saved.bytes);
});

test('weak model: a persistently invalid plan FAILS CLEANLY (clear issue, never a crash or silent run)', async () => {
  const saved: any = {};
  const res = await runDataProject({ task: 'do magic', folder: '/p' }, adapters(['nope', 'still nope'], saved), { maxRepair: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === 'PLAN_INVALID'));
  assert.equal(saved.bytes, undefined);
});

test('no data files -> a clean, explained failure, not a crash', async () => {
  const res = await runDataProject({ task: 'x', folder: '/p' }, { listFiles: async () => [], askModel: async () => '', saveOutput: async () => {}, emit: () => {} });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === 'NO_DATA'));
});
