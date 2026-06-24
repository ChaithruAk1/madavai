import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMarkdownTables } from '../src/ingest/markdown.js';

test('extracts a weak-model markdown table (the screenshot case) + coerces numbers', () => {
  const reply = [
    "Here's a simple spreadsheet example:",
    '| Month | Sales | Expenses | Profit |',
    '|----------|-------|----------|--------|',
    '| January | 1000 | 400 | 600 |',
    '| February | 1200 | 450 | 750 |',
  ].join('\n');
  const t = extractMarkdownTables(reply);
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].header, ['Month', 'Sales', 'Expenses', 'Profit']);
  assert.equal(t[0].rows.length, 2);
  assert.equal(t[0].rows[0][1], 1000);
});
test('ignores prose with no real table', () => {
  assert.equal(extractMarkdownTables('a sentence | with a stray pipe but no separator').length, 0);
});
