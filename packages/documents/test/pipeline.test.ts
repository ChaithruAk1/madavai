import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMarkdownTables, normalizeTable } from '../src/ingest/index.js';

test('END-TO-END: a weak-model markdown table becomes a REAL .xlsx (no officedoc, no strong model)', async () => {
  const reply = [
    "Here's a simple spreadsheet example in a markdown-style block:",
    '',
    '| Month    | Sales | Expenses | Profit |',
    '|----------|-------|----------|--------|',
    '| January  | 1000  | 400      | 600    |',
    '| February | 1200  | 450      | 750    |',
    '| March    | 1500  | 500      | 1000   |',
  ].join('\n');

  const tables = extractMarkdownTables(reply);
  assert.equal(tables.length, 1);

  const { table } = normalizeTable('Sheet1', tables[0].header, tables[0].rows);
  assert.deepEqual(table.columns.map((c) => c.name), ['Month', 'Sales', 'Expenses', 'Profit']);
  assert.deepEqual(table.columns.map((c) => c.type), ['string', 'number', 'number', 'number']);

  const XLSX: any = await import('xlsx');
  const aoa = [table.columns.map((c) => c.name), ...table.rows];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  assert.ok(buf && buf.byteLength > 0, 'produced real xlsx bytes');

  const back = XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(buf), { type: 'array' }).Sheets['Sheet1'], { header: 1 });
  assert.equal(back[0][0], 'Month');
  assert.equal(back[1][1], 1000);
});
