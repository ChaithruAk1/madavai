import { LIMITS } from '@madav/contracts';
import type { OfficeSpec, AnySheet, Sheet, TableSheet } from '@madav/contracts';
import { type Issue, warn } from './issues.js';

const isTable = (s: AnySheet): s is TableSheet => Array.isArray((s as TableSheet).rows);

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

  sheets = sheets.map((s): AnySheet => (isTable(s) ? clampTable(s, issues) : clampMetric(s, issues)));

  return { spec: { ...spec, sheets }, issues };
}

function clampMetric(s: Sheet, issues: Issue[]): Sheet {
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
}

function clampTable(s: TableSheet, issues: Issue[]): TableSheet {
  let rows = s.rows;
  if (rows.length > LIMITS.rowsPerSheet) {
    issues.push(
      warn(
        'ROWS_CLAMPED',
        `Sheet "${s.name}": showing ${LIMITS.rowsPerSheet} of ${rows.length} rows. Nothing was dropped silently.`,
        s.name,
      ),
    );
    rows = rows.slice(0, LIMITS.rowsPerSheet);
  }
  let clampedRows = 0;
  rows = rows.map((r) => {
    if (r.length > LIMITS.columnsPerRow) {
      clampedRows++;
      return r.slice(0, LIMITS.columnsPerRow);
    }
    return r;
  });
  if (clampedRows > 0) {
    issues.push(
      warn(
        'COLUMNS_CLAMPED',
        `Sheet "${s.name}": ${clampedRows} row(s) exceeded ${LIMITS.columnsPerRow} columns and were trimmed (visible warning, not silent).`,
        s.name,
      ),
    );
  }
  return { ...s, rows };
}
