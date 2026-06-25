import { planWorkbook } from './index.js';
import type { Issue } from './issues.js';

export interface StyledResult { ok: boolean; bytes: Uint8Array; issues: Issue[] }
const DEFAULT_ACCENT = '1F3864';

/**
 * Authoritative styled xlsx writer — Madav's EXACT look (accent header fill, banded rows, frozen header,
 * auto-filter, auto widths, thousands number format), governed first by planWorkbook. The deterministic
 * single source for spreadsheet authoring; the app delegates here, so the output is unchanged.
 */
export async function buildStyledWorkbook(input: unknown, opts: { accent?: string } = {}): Promise<StyledResult> {
  const plan = planWorkbook(input);
  if (!plan.ok || !plan.spec) return { ok: false, bytes: new Uint8Array(), issues: plan.issues };
  const m: any = await import('exceljs');
  const ExcelJS = m.default || m;
  const accent = (opts.accent || DEFAULT_ACCENT).replace(/[^0-9a-fA-F]/g, '').slice(0, 6) || DEFAULT_ACCENT;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Madav';
  wb.created = new Date();
  for (const sheet of plan.spec.sheets as any[]) {
    const rows: any[][] = Array.isArray(sheet.rows)
      ? sheet.rows
      : Array.isArray(sheet.metrics) ? sheet.metrics.map((x: any) => [x.label, x.value ?? x.expr ?? '']) : [];
    const data = rows.length ? rows : [['(empty)']];
    const ws = wb.addWorksheet(String(sheet.name || 'Sheet').slice(0, 28));
    const ncols = data.reduce((mx, r) => Math.max(mx, r.length), 1);
    data.forEach((r, i) => {
      const row = ws.addRow(r);
      row.eachCell((cell: any) => {
        if (i === 0) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + accent } };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        } else {
          cell.font = { size: 11, name: 'Calibri', color: { argb: 'FF1F2933' } };
          if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6FB' } };
          if (typeof cell.value === 'number' && Math.abs(cell.value) >= 1000) cell.numFmt = '#,##0.##';
        }
      });
      if (i === 0) row.height = 20;
    });
    for (let c = 1; c <= ncols; c++) {
      let w = 9;
      data.forEach((r) => { const v = r[c - 1]; if (v != null) w = Math.max(w, Math.min(52, String(v).length + 2)); });
      ws.getColumn(c).width = w;
    }
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (data.length > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ncols } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return { ok: true, bytes: new Uint8Array(buf), issues: plan.issues };
}
