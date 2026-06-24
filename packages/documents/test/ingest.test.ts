import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestCsv, parseCsv, normalizeTable, inferColumnType } from '../src/ingest/index.js';
import { LIMITS } from '@madav/contracts';

test('CSV parser: quoted commas + newlines inside a field', () => {
  assert.deepEqual(parseCsv('a,b\n"x,y","l1\nl2"'), [['a', 'b'], ['x,y', 'l1\nl2']]);
});

test('ingestCsv: deterministic column types + value coercion', () => {
  const { table } = ingestCsv('Sales', 'region,units,active\nNA,1200,true\nEU,900,false');
  assert.deepEqual(table.columns.map((c) => c.name), ['region', 'units', 'active']);
  assert.deepEqual(table.columns.map((c) => c.type), ['string', 'number', 'boolean']);
  assert.equal(table.rows[0][1], 1200);
  assert.equal(table.rows[0][2], true);
  assert.equal(table.rowCount, 2);
  assert.equal(table.truncated, false);
});

test('inferColumnType: mixed + empty', () => {
  assert.equal(inferColumnType([1, 'two']), 'mixed');
  assert.equal(inferColumnType([null, '']), 'empty');
  assert.equal(inferColumnType([1, 2, null]), 'number');
});

test('Ingestor GOVERNS the read: rows beyond the cap clamp, flag, and keep the true rowCount', () => {
  const rows = Array.from({ length: LIMITS.rowsPerSheet + 3 }, (_, i) => [i] as any);
  const { table, issues } = normalizeTable('Big', ['n'], rows);
  assert.equal(table.rows.length, LIMITS.rowsPerSheet);
  assert.equal(table.rowCount, LIMITS.rowsPerSheet + 3);
  assert.equal(table.truncated, true);
  assert.ok(issues.some((i) => i.code === 'ROWS_CLAMPED'));
});

test('normalizeTable: ragged rows padded to a rectangle', () => {
  const { table } = normalizeTable('M', ['a', 'b'], [[1, 'x'], ['two']]);
  assert.equal(table.columns[0].type, 'mixed');
  assert.equal(table.rows[1].length, 2);
  assert.equal(table.rows[1][1], null);
});

test('ingestWorkbook: reads a real .xlsx deterministically (no model code)', async () => {
  const XLSX: any = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['city', 'pop'], ['NYC', 8000000]]), 'Cities');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const { ingestWorkbook } = await import('../src/ingest/index.js');
  const { tables } = ingestWorkbook(new Uint8Array(buf));
  assert.equal(tables[0].name, 'Cities');
  assert.deepEqual(tables[0].columns.map((c) => c.type), ['string', 'number']);
  assert.equal(tables[0].rows[0][1], 8000000);
});
