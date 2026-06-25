import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, joinTables, runDataPlan } from '../src/transform/index.js';
import type { Table } from '@madav/contracts';

function tbl(name: string, cols: string[], rows: any[][]): Table {
  return { name, columns: cols.map((n) => ({ name: n, type: 'mixed' as const })), rows, rowCount: rows.length, truncated: false };
}
const ci = (t: Table, n: string) => t.columns.findIndex((c) => c.name === n);

test('derive computes a ratio; division by zero is an empty cell, not NaN', () => {
  const t = tbl('T', ['Backlog', 'Received'], [[1, 7], [3, 0], [2, 4]]);
  const r = applyOps(t, [{ op: 'derive', as: 'Backlog %', left: { col: 'Backlog' }, fn: 'div', right: { col: 'Received' } } as any]);
  assert.equal(r.issues.length, 0);
  const c = ci(r.table, 'Backlog %');
  assert.equal(r.table.rows[0]![c], Math.round((1 / 7) * 1e6) / 1e6);
  assert.equal(r.table.rows[1]![c], null);
  assert.equal(r.table.rows[2]![c], 0.5);
});

test('derive against a missing column raises an issue (engine repairs, never crashes)', () => {
  const r = applyOps(tbl('T', ['A'], [[1]]), [{ op: 'derive', as: 'X', left: { col: 'A' }, fn: 'div', right: { col: 'Missing' } } as any]);
  assert.ok(r.issues.some((i) => i.code === 'COLUMN_MISSING'));
});

test('left-join brings measures from a second table on a shared key', () => {
  const a = tbl('rec', ['SESA', 'Received'], [['s1', 7], ['s2', 6]]);
  const b = tbl('res', ['SESA', 'Resolved'], [['s1', 8], ['s2', 5]]);
  const j = joinTables([a, b], ['SESA'], 'left');
  assert.equal(j.issues.length, 0);
  assert.deepEqual(j.table.columns.map((c) => c.name), ['SESA', 'Received', 'Resolved']);
  assert.deepEqual(j.table.rows[0], ['s1', 7, 8]);
});

test('left-join keeps unmatched rows (null-filled); inner-join drops them', () => {
  const a = tbl('rec', ['SESA', 'Received'], [['s1', 7], ['s3', 9]]);
  const b = tbl('res', ['SESA', 'Resolved'], [['s1', 8]]);
  const left = joinTables([a, b], ['SESA'], 'left');
  assert.equal(left.table.rows.length, 2);
  assert.equal(left.table.rows[1]![2], null);
  assert.equal(joinTables([a, b], ['SESA'], 'inner').table.rows.length, 1);
});

test('a missing join key is reported, not silently wrong', () => {
  assert.ok(joinTables([tbl('a', ['X'], [[1]]), tbl('b', ['Y'], [[2]])], ['SESA']).issues.some((i) => i.code === 'JOIN_KEY_MISSING'));
});

test('runDataPlan: aggregate two sources -> join -> derive -> one sheet (the KPI shape)', () => {
  const submitted = tbl('Submitted', ['SESA', 'Ticket'], [['s1', 't1'], ['s1', 't2'], ['s2', 't3']]);
  const resolved = tbl('Resolved', ['SESA', 'Ticket'], [['s1', 'a'], ['s1', 'b'], ['s1', 'c'], ['s2', 'd']]);
  const plan: any = {
    steps: [
      { name: 'rec', from: 'Submitted', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'Ticket', fn: 'count', as: 'Received' }] }] },
      { name: 'res', from: 'Resolved', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'Ticket', fn: 'count', as: 'Resolved' }] }] },
      { name: 'joined', join: ['rec', 'res'], on: ['SESA'], how: 'left', ops: [{ op: 'derive', as: 'Rate', left: { col: 'Resolved' }, fn: 'div', right: { col: 'Received' } }] },
    ],
    output: [{ sheet: 'Incidents', table: 'joined' }],
  };
  const r = runDataPlan(plan, { Submitted: submitted, Resolved: resolved });
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0);
  assert.equal(r.sheets.length, 1);
  const s = r.sheets[0]!.table;
  const row = (k: string) => s.rows.find((rr) => rr[0] === k)!;
  assert.equal(row('s1')[ci(s, 'Received')], 2);
  assert.equal(row('s1')[ci(s, 'Resolved')], 3);
  assert.equal(row('s1')[ci(s, 'Rate')], 1.5);
  assert.equal(row('s2')[ci(s, 'Rate')], 1);
});

test('runDataPlan: two output sheets from two steps', () => {
  const t = tbl('Data', ['Type', 'V'], [['A', 1], ['A', 2], ['B', 3]]);
  const plan: any = {
    steps: [
      { name: 'a', from: 'Data', ops: [{ op: 'filter', column: 'Type', test: 'eq', value: 'A' }] },
      { name: 'b', from: 'Data', ops: [{ op: 'filter', column: 'Type', test: 'eq', value: 'B' }] },
    ],
    output: [{ sheet: 'Sheet A', table: 'a' }, { sheet: 'Sheet B', table: 'b' }],
  };
  const r = runDataPlan(plan, { Data: t });
  assert.equal(r.sheets.length, 2);
  assert.equal(r.sheets[0]!.table.rows.length, 2);
  assert.equal(r.sheets[1]!.table.rows.length, 1);
});

test('runDataPlan: a step referencing an unknown name is reported', () => {
  const r = runDataPlan({ steps: [{ name: 'x', from: 'Nope', ops: [] }], output: [{ sheet: 'S', table: 'x' }] } as any, {});
  assert.ok(r.issues.some((i) => i.code === 'STEP_REF_MISSING'));
});
