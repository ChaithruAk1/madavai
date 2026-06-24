import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkbook } from '../src/excel/build.js';

test('GOLDEN: author -> .xlsx bytes -> read back yields identical cells (deterministic, no model)', async () => {
  const spec = { name: 'g.xlsx', sheets: [{ name: 'S', rows: [['a', 'b'], [1, 2], [3, 4]] }] };
  const r = buildWorkbook(spec);
  assert.equal(r.ok, true);
  assert.ok(r.bytes.byteLength > 0);
  const XLSX: any = await import('xlsx');
  const back = XLSX.utils.sheet_to_json(XLSX.read(r.bytes, { type: 'array' }).Sheets['S'], { header: 1 });
  assert.deepEqual(back, [['a', 'b'], [1, 2], [3, 4]]);
});

test('GOLDEN: a malformed spec is rejected, no bytes produced', () => {
  const r = buildWorkbook({ sheets: [] });
  assert.equal(r.ok, false);
  assert.equal(r.bytes.byteLength, 0);
  assert.ok(r.issues.some((i) => i.code === 'SPEC_INVALID'));
});
