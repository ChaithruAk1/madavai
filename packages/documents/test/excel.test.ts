import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWorkbook, type Issue } from '../src/excel/index.js';

const base = (over: Record<string, unknown> = {}) => ({
  kind: 'workbook',
  name: 'Model.xlsx',
  sheets: [
    {
      name: 'P&L',
      metrics: [
        { id: 'revenue', label: 'Revenue', value: 1000 },
        { id: 'cost', label: 'Cost', value: 400 },
        { id: 'profit', label: 'Profit', expr: '[revenue]-[cost]' },
      ],
    },
  ],
  ...over,
});

const has = (issues: Issue[], code: string) => issues.some((i) => i.code === code);

test('accepts a valid spec with no errors', () => {
  const r = planWorkbook(base());
  assert.equal(r.ok, true);
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0);
});

test('rejects a malformed spec BEFORE building (schema gate)', () => {
  const r = planWorkbook({ kind: 'workbook', name: 'x', sheets: [] });
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'SPEC_INVALID'));
});

test('warns (never silently drops) when sheets exceed the cap', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: 'S' + i, metrics: [{ id: 'a', label: 'A', value: 1 }] }));
  const r = planWorkbook(base({ sheets: many }));
  assert.ok(r.issues.some((i) => i.code === 'SHEETS_CLAMPED' && i.level === 'warning'));
});

test('flags an unresolved formula reference', () => {
  const r = planWorkbook(base({ sheets: [{ name: 'P&L', metrics: [{ id: 'profit', label: 'Profit', expr: '[revenue]-[cost]' }] }] }));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'REF_ID_MISSING'));
});

test('detects a circular formula reference', () => {
  const r = planWorkbook(base({ sheets: [{ name: 'P&L', metrics: [
    { id: 'a', label: 'A', expr: '[b]' },
    { id: 'b', label: 'B', expr: '[a]' },
  ] }] }));
  assert.equal(r.ok, false);
  assert.ok(has(r.issues, 'FORMULA_CYCLE'));
});

test('treats prior-period [id@-1] as a recurrence, not a cycle', () => {
  const r = planWorkbook(base({ sheets: [{ name: 'Proj', periods: 12, metrics: [
    { id: 'mrr', label: 'MRR', expr: '[mrr@-1]+[new]' },
    { id: 'new', label: 'New', value: 100 },
  ] }] }));
  assert.equal(has(r.issues, 'FORMULA_CYCLE'), false);
});

test('accepts a freeform table sheet and defaults kind/name (the live-app shape)', () => {
  const r = planWorkbook({ sheets: [{ name: 'Data', columns: ['A', 'B'], rows: [[1, 2], [3, 4]] }] });
  assert.equal(r.ok, true);
  assert.equal(r.issues.filter((i) => i.level === 'error').length, 0);
});

test('clamps an oversize table (rows) with a VISIBLE warning, never silently', () => {
  const rows = Array.from({ length: 10005 }, (_, i) => [i, i * 2]);
  const r = planWorkbook({ sheets: [{ name: 'Big', rows }] });
  assert.ok(r.issues.some((i) => i.code === 'ROWS_CLAMPED' && i.level === 'warning'));
});

test('clamps an oversize row (columns) with a VISIBLE warning', () => {
  const wide = Array.from({ length: 300 }, (_, i) => i);
  const r = planWorkbook({ sheets: [{ name: 'Wide', rows: [wide] }] });
  assert.ok(r.issues.some((i) => i.code === 'COLUMNS_CLAMPED' && i.level === 'warning'));
});
