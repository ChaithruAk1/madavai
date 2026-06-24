import * as XLSXns from 'xlsx';
import { planWorkbook } from './index.js';
import type { Issue } from './issues.js';
const XLSX = XLSXns as any;

export interface BuildResult { ok: boolean; bytes: Uint8Array; issues: Issue[] }

/**
 * Deterministic authoring: a governed spec -> real .xlsx bytes via SheetJS. No model, no eval. This is
 * the WRITE half of the to-be pipeline; planWorkbook governs (schema-gate, clamps, formulas) first.
 */
export function buildWorkbook(input: unknown): BuildResult {
  const plan = planWorkbook(input);
  if (!plan.ok || !plan.spec) return { ok: false, bytes: new Uint8Array(), issues: plan.issues };
  const wb = XLSX.utils.book_new();
  for (const sheet of plan.spec.sheets as any[]) {
    const rows: unknown[][] = Array.isArray(sheet.rows)
      ? sheet.rows
      : (Array.isArray(sheet.metrics) ? sheet.metrics.map((m: any) => [m.label, m.value ?? m.expr ?? '']) : []);
    const aoa = rows.length ? rows : [['(empty)']];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), String(sheet.name || 'Sheet').slice(0, 28));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return { ok: true, bytes: new Uint8Array(out), issues: plan.issues };
}
