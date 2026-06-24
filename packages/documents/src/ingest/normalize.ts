import { LIMITS } from '@madav/contracts';
import type { Cell, Column, ColumnType, Table } from '@madav/contracts';
import { type Issue, warn } from '../excel/issues.js';

const isBlank = (c: Cell): boolean => c === null || c === undefined || (typeof c === 'string' && c.trim() === '');

/** Deterministic column typing: one type if every non-blank value agrees, else 'mixed' (or 'empty'). */
export function inferColumnType(values: Cell[]): ColumnType {
  let seen: ColumnType | null = null;
  for (const v of values) {
    if (isBlank(v)) continue;
    const t: ColumnType = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
    if (seen === null) seen = t;
    else if (seen !== t) return 'mixed';
  }
  return seen ?? 'empty';
}

/**
 * Raw header + rows -> a normalized Table, applying the SAME governance as the writer: clamp rows/columns
 * to LIMITS with a VISIBLE warning (never silent), pad ragged rows to a rectangle, and infer column types.
 */
export function normalizeTable(name: string, header: readonly Cell[], rows: Cell[][]): { table: Table; issues: Issue[] } {
  const issues: Issue[] = [];
  const sourceRowCount = rows.length;

  let body = rows;
  if (body.length > LIMITS.rowsPerSheet) {
    issues.push(warn('ROWS_CLAMPED', `"${name}": ingested ${LIMITS.rowsPerSheet} of ${body.length} rows. Nothing was dropped silently.`, name));
    body = body.slice(0, LIMITS.rowsPerSheet);
  }

  let width = header.length;
  for (const r of body) if (r.length > width) width = r.length;
  if (width > LIMITS.columnsPerRow) {
    issues.push(warn('COLUMNS_CLAMPED', `"${name}": ingested ${LIMITS.columnsPerRow} of ${width} columns.`, name));
    width = LIMITS.columnsPerRow;
  }

  const normRows: Cell[][] = body.map((r) => {
    const row = r.slice(0, width);
    while (row.length < width) row.push(null);
    return row;
  });

  const columns: Column[] = [];
  for (let c = 0; c < width; c++) {
    const h = header[c];
    const colName = h != null && String(h).trim() !== '' ? String(h) : `Column ${c + 1}`;
    columns.push({ name: colName, type: inferColumnType(normRows.map((r) => r[c])) });
  }

  return { table: { name, columns, rows: normRows, rowCount: sourceRowCount, truncated: sourceRowCount > normRows.length }, issues };
}
