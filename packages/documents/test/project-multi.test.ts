import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDataProject, ingestWorkbook } from '../src/index.js';
import type { Table } from '@madav/contracts';

const SUBMITTED = 'SESA,Ticket\ns1,t1\ns1,t2\ns2,t3';
const RESOLVED = 'SESA,Ticket\ns1,a\ns1,b\ns1,c\ns2,d';

function adapters(replies: string[], saved: { name?: string; bytes?: Uint8Array }) {
  let i = 0;
  return {
    listFiles: async () => [{ name: 'Submitted.csv', text: SUBMITTED }, { name: 'Resolved.csv', text: RESOLVED }],
    askModel: async () => replies[Math.min(i++, replies.length - 1)]!,
    saveOutput: async (_f: string, name: string, bytes: Uint8Array) => { saved.name = name; saved.bytes = bytes; },
    emit: () => {},
  };
}
const cell = (t: Table, key: string, col: string) => { const c = t.columns.findIndex((x) => x.name === col); const r = t.rows.find((rr) => String(rr[0]) === key); return r ? r[c] : undefined; };

const MULTI = JSON.stringify({
  steps: [
    { name: 'rec', from: 'Submitted', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'SESA', fn: 'count', as: 'Received' }] }] },
    { name: 'res', from: 'Resolved', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'SESA', fn: 'count', as: 'Resolved' }] }] },
    { name: 'out', join: ['rec', 'res'], on: ['SESA'], how: 'left', ops: [{ op: 'derive', as: 'Rate', left: { col: 'Resolved' }, fn: 'div', right: { col: 'Received' } }] },
  ],
  output: [{ sheet: 'Summary', table: 'out' }],
});

test('multi-file: two files joined + a derived ratio -> ONE correct sheet (weak model, no code)', async () => {
  const saved: any = {};
  const res = await runDataProject({ task: 'received vs resolved per consultant', folder: '/p' }, adapters([MULTI], saved));
  assert.equal(res.ok, true);
  assert.ok(saved.bytes && saved.bytes.length > 0);
  const t = ingestWorkbook(saved.bytes!).tables[0]!;
  assert.deepEqual(t.columns.map((c) => c.name), ['SESA', 'Received', 'Resolved', 'Rate']);
  assert.equal(cell(t, 's1', 'Received'), 2);
  assert.equal(cell(t, 's1', 'Resolved'), 3);
  assert.equal(cell(t, 's1', 'Rate'), 1.5);
  assert.equal(cell(t, 's2', 'Rate'), 1);
});

test('multi-sheet: a plan with two output sheets writes two tabs', async () => {
  const saved: any = {};
  const plan = JSON.stringify({ steps: [{ name: 'a', from: 'Submitted', ops: [] }, { name: 'b', from: 'Resolved', ops: [] }], output: [{ sheet: 'Subs', table: 'a' }, { sheet: 'Res', table: 'b' }] });
  const res = await runDataProject({ task: 'two tabs', folder: '/p' }, adapters([plan], saved));
  assert.equal(res.ok, true);
  assert.deepEqual(ingestWorkbook(saved.bytes!).tables.map((t) => t.name).sort(), ['Res', 'Subs']);
});

test('multi-file: a malformed multi plan is repaired on re-ask (not silently emptied)', async () => {
  const saved: any = {};
  const bad = '{"steps":[{"name":"x","from":"Submitted","ops":[{"op":"aggregate"}]}],"output":[{"sheet":"S","table":"x"}]}';
  const res = await runDataProject({ task: 'x', folder: '/p' }, adapters([bad, MULTI], saved), { maxRepair: 2 });
  assert.equal(res.ok, true);
});

test('multi-file: a plan referencing an unknown table fails CLEANLY', async () => {
  const saved: any = {};
  const bad = '{"steps":[{"name":"x","from":"DoesNotExist","ops":[]}],"output":[{"sheet":"S","table":"x"}]}';
  const res = await runDataProject({ task: 'x', folder: '/p' }, adapters([bad, bad], saved), { maxRepair: 1 });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.code === 'STEP_REF_MISSING' || i.code === 'PLAN_INVALID'));
  assert.equal(saved.bytes, undefined);
});

test('simple single-table plan still works unchanged (back-compat)', async () => {
  const saved: any = {};
  const simple = '{"source":"Submitted","ops":[{"op":"aggregate","groupBy":["SESA"],"measures":[{"column":"SESA","fn":"count","as":"N"}]}]}';
  const res = await runDataProject({ task: 'count per consultant', folder: '/p' }, adapters([simple], saved));
  assert.equal(res.ok, true);
  const t = ingestWorkbook(saved.bytes!).tables[0]!;
  assert.deepEqual(t.columns.map((c) => c.name), ['SESA', 'N']);
});
