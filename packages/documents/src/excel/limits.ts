import { LIMITS } from '../contracts/office.js';
import type { OfficeSpec, Sheet } from '../contracts/office.js';
import { type Issue, warn } from './issues.js';

export function applyLimits(spec: OfficeSpec): { spec: OfficeSpec; issues: Issue[] } {
  const issues: Issue[] = [];
  let sheets = spec.sheets;

  if (sheets.length > LIMITS.sheets) {
    issues.push(
      warn(
        'SHEETS_CLAMPED',
        `Showing ${LIMITS.sheets} of ${sheets.length} sheets (workbook cap). Nothing was dropped silently.`,
      ),
    );
    sheets = sheets.slice(0, LIMITS.sheets);
  }

  sheets = sheets.map((s): Sheet => {
    let metrics = s.metrics;
    if (metrics.length > LIMITS.rowsPerSheet) {
      issues.push(
        warn('ROWS_CLAMPED', `Sheet "${s.name}": showing ${LIMITS.rowsPerSheet} of ${metrics.length} rows.`, s.name),
      );
      metrics = metrics.slice(0, LIMITS.rowsPerSheet);
    }
    const next: Sheet = { ...s, metrics };
    if (s.periods !== undefined && s.periods > LIMITS.periods) {
      issues.push(
        warn('PERIODS_CLAMPED', `Sheet "${s.name}": ${s.periods} periods exceeds cap ${LIMITS.periods}.`, s.name),
      );
      next.periods = LIMITS.periods;
    }
    return next;
  });

  return { spec: { ...spec, sheets }, issues };
}
