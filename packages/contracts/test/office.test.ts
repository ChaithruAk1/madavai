import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficeSpec, LIMITS } from '../src/index.js';

test('OfficeSpec accepts a minimal workbook', () => {
  const r = OfficeSpec.safeParse({ kind: 'workbook', name: 'x.xlsx', sheets: [{ name: 'S', metrics: [{ id: 'a', label: 'A', value: 1 }] }] });
  assert.equal(r.success, true);
});
test('OfficeSpec rejects an empty workbook', () => {
  assert.equal(OfficeSpec.safeParse({ kind: 'workbook', name: 'x', sheets: [] }).success, false);
});
test('LIMITS are exposed to all runtimes', () => { assert.ok(LIMITS.sheets > 0 && LIMITS.rowsPerSheet > 0); });
