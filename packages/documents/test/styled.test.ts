import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStyledWorkbook } from '../src/excel/styled.js';

test('styled writer: produces a valid .xlsx with Madav styling (header fill + frozen + values)', async () => {
  const r = await buildStyledWorkbook({ name: 's.xlsx', sheets: [{ name: 'Sales', rows: [['Region', 'Revenue'], ['NA', 12000], ['EU', 9000]] }] }, { accent: '1F3864' });
  assert.equal(r.ok, true);
  assert.ok(r.bytes.byteLength > 0);
  const m: any = await import('exceljs');
  const wb = new (m.default || m).Workbook();
  await wb.xlsx.load(r.bytes);
  const ws = wb.getWorksheet('Sales');
  assert.equal(ws.getCell('A1').value, 'Region');
  assert.equal(ws.getCell('B3').value, 9000);
  assert.equal(ws.getCell('A1').font.bold, true);
  assert.equal(ws.views[0].state, 'frozen');
});

test('a malformed spec yields no bytes (schema gate holds)', async () => {
  const r = await buildStyledWorkbook({ sheets: [] });
  assert.equal(r.ok, false);
  assert.equal(r.bytes.byteLength, 0);
});
