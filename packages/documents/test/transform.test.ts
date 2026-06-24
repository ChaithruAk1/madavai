import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPlan } from '../src/transform/index.js';
import type { Table } from '../src/index.js';

const T: Table = {
  name: 'Sales', truncated: false, rowCount: 5,
  columns: [{ name: 'Region', type: 'string' }, { name: 'Units', type: 'number' }, { name: 'Revenue', type: 'number' }],
  rows: [['NA', 10, 100], ['EU', 5, 80], ['NA', 7, 60], ['EU', 3, 40], ['APAC', 9, 90]],
};

test('group-by + sum is deterministic (the headline weak-model case)', () => {
  const { table, issues } = runPlan(T, { ops: [{ op: 'aggregate', groupBy: ['Region'], measures: [{ column: 'Revenue', fn: 'sum', as: 'TotalRevenue' }, { column: 'Units', fn: 'sum' }] }] });
  assert.equal(issues.length, 0);
  assert.deepEqual(table.columns.map((c) => c.name), ['Region', 'TotalRevenue', 'sum_Units']);
  const byRegion = Object.fromEntries(table.rows.map((r) => [r[0], r[1]]));
  assert.equal(byRegion['NA'], 160); assert.equal(byRegion['EU'], 120); assert.equal(byRegion['APAC'], 90);
});

test('filter → sort → limit chains in order', () => {
  const { table } = runPlan(T, { ops: [{ op: 'filter', column: 'Units', test: 'ge', value: 7 }, { op: 'sort', column: 'Revenue', dir: 'desc' }, { op: 'limit', n: 2 }] });
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows.map((r) => r[0]), ['NA', 'APAC']);  // 100 then 90
});

test('a malformed plan is rejected (schema gate), table unchanged', () => {
  const { table, issues } = runPlan(T, { ops: [{ op: 'frobnicate' }] });
  assert.ok(issues.some((i) => i.code === 'PLAN_INVALID'));
  assert.equal(table.rows.length, 5);
});

test('an op referencing a missing column is reported, not crashed', () => {
  const { issues } = runPlan(T, { ops: [{ op: 'sort', column: 'Nope', dir: 'asc' }] });
  assert.ok(issues.some((i) => i.code === 'COLUMN_MISSING'));
});
