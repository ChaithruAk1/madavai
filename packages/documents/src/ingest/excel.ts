import { LIMITS } from '@madav/contracts';
import type { Cell, Table } from '@madav/contracts';
import { type Issue, warn } from '../excel/issues.js';
import { normalizeTable } from './normalize.js';
// SheetJS does the byte-level parsing deterministically; we keep types loose at this single boundary.
import * as XLSXns from 'xlsx';
const XLSX = XLSXns as any;

/** Deterministic workbook ingestion: real bytes -> normalized Tables. The model never reads the file. */
export function ingestWorkbook(data: ArrayBuffer | Uint8Array | number[]): { tables: Table[]; issues: Issue[] } {
  const wb = XLSX.read(data, { type: 'array' });
  const tables: Table[] = [];
  const issues: Issue[] = [];
  let names: string[] = wb.SheetNames || [];
  if (names.length > LIMITS.sheets) {
    issues.push(warn('SHEETS_CLAMPED', `Workbook: ingested ${LIMITS.sheets} of ${names.length} sheets.`));
    names = names.slice(0, LIMITS.sheets);
  }
  for (const sn of names) {
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null }) as Cell[][];
    const header: Cell[] = (aoa[0] ?? []).map((c) => (c == null ? '' : (c as Cell)));
    const { table, issues: tIssues } = normalizeTable(sn, header, aoa.slice(1));
    tables.push(table);
    issues.push(...tIssues);
  }
  return { tables, issues };
}
