import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DataPlan, MultiPlan, DeriveOp, DataOp, AnyStep } from '../src/ops.js';

test('the simple single-table plan still parses (back-compat)', () => {
  const ok = DataPlan.safeParse({ source: 'Sales', ops: [{ op: 'aggregate', groupBy: ['Region'], measures: [{ column: 'Revenue', fn: 'sum', as: 'Total' }] }] });
  assert.equal(ok.success, true);
});

test('a calculated column (derive) validates; div-by-zero is an engine concern, not a schema one', () => {
  const ok = DeriveOp.safeParse({ op: 'derive', as: 'Backlog %', left: { col: 'Backlog' }, fn: 'div', right: { col: 'Received' } });
  assert.equal(ok.success, true);
  const constArg = DeriveOp.safeParse({ op: 'derive', as: 'Doubled', left: { col: 'X' }, fn: 'mul', right: { val: 2 } });
  assert.equal(constArg.success, true);
  const bad = DeriveOp.safeParse({ op: 'derive', as: 'Bad', left: { col: 'X' }, fn: 'pow', right: { val: 2 } });
  assert.equal(bad.success, false);
});

test('derive is a first-class op in the op union', () => {
  assert.equal(DataOp.safeParse({ op: 'derive', as: 'R', left: { col: 'a' }, fn: 'div', right: { col: 'b' } }).success, true);
});

test('a step is either a single-source pipeline (from) or a join (join+on)', () => {
  assert.equal(AnyStep.safeParse({ name: 's1', from: 'Submitted', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'SESA', fn: 'count', as: 'Received' }] }] }).success, true);
  assert.equal(AnyStep.safeParse({ name: 'j1', join: ['s1', 's2'], on: ['SESA'], ops: [] }).success, true);
  assert.equal(AnyStep.safeParse({ name: 'bad' }).success, false); // neither from nor join
});

test('a full multi-file, multi-sheet plan validates', () => {
  const plan = {
    steps: [
      { name: 'rec', from: 'Submitted', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'SESA', fn: 'count', as: 'Received' }] }] },
      { name: 'res', from: 'Resolved', ops: [{ op: 'aggregate', groupBy: ['SESA'], measures: [{ column: 'SESA', fn: 'count', as: 'Resolved' }] }] },
      { name: 'joined', join: ['rec', 'res'], on: ['SESA'], ops: [{ op: 'derive', as: 'Rate', left: { col: 'Resolved' }, fn: 'div', right: { col: 'Received' } }] },
    ],
    output: [{ sheet: 'Incidents', table: 'joined' }],
  };
  const ok = MultiPlan.safeParse(plan);
  assert.equal(ok.success, true);
});

test('a malformed multi plan is REJECTED (so the engine repairs, never silently empties)', () => {
  const bad = { steps: [{ name: 'x', from: 'T', ops: [{ op: 'aggregate' }] }], output: [{ sheet: 'S', table: 'x' }] };
  assert.equal(MultiPlan.safeParse(bad).success, false);
  const noOutput = { steps: [{ name: 'x', from: 'T', ops: [] }], output: [] };
  assert.equal(MultiPlan.safeParse(noOutput).success, false);
});
