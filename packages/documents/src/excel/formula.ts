import type { OfficeSpec } from '../contracts/office.js';
import { type Issue, err } from './issues.js';

/** [id] | [Sheet!id] | [id@-1] (prior-period offset). */
const REF = /\[([A-Za-z0-9_]+!)?([A-Za-z0-9_]+)(@-?\d+)?\]/g;

export function validateFormulas(spec: OfficeSpec): Issue[] {
  const issues: Issue[] = [];
  const idsBySheet = new Map<string, Set<string>>();
  for (const s of spec.sheets) idsBySheet.set(s.name, new Set(s.metrics.map((m) => m.id)));

  for (const s of spec.sheets) {
    const localIds = idsBySheet.get(s.name) ?? new Set<string>();
    const deps = new Map<string, Set<string>>();

    for (const m of s.metrics) {
      const d = new Set<string>();
      if (m.expr) {
        for (const match of m.expr.matchAll(REF)) {
          const sheetPrefix = match[1] ? match[1].slice(0, -1) : undefined;
          const refId = match[2];
          const offset = match[3];
          const targetIds = sheetPrefix ? idsBySheet.get(sheetPrefix) : localIds;
          if (!targetIds) {
            issues.push(err('REF_SHEET_MISSING', `references unknown sheet "${sheetPrefix}"`, `${s.name}!${m.id}`));
            continue;
          }
          if (!targetIds.has(refId)) {
            issues.push(err('REF_ID_MISSING', `references unknown id "${refId}"`, `${s.name}!${m.id}`));
            continue;
          }
          // Only same-sheet, same-period references can form a true cycle.
          if (!sheetPrefix && !offset) d.add(refId);
        }
      }
      deps.set(m.id, d);
    }

    // DFS cycle detection
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const id of deps.keys()) color.set(id, WHITE);
    const stack: string[] = [];
    const visit = (id: string): boolean => {
      color.set(id, GRAY);
      stack.push(id);
      for (const n of deps.get(id) ?? []) {
        const c = color.get(n) ?? WHITE;
        if (c === GRAY) {
          issues.push(err('FORMULA_CYCLE', `circular reference: ${[...stack, n].join(' -> ')}`, `${s.name}!${id}`));
          return true;
        }
        if (c === WHITE && visit(n)) return true;
      }
      color.set(id, BLACK);
      stack.pop();
      return false;
    };
    for (const id of deps.keys()) if ((color.get(id) ?? WHITE) === WHITE && visit(id)) break;
  }
  return issues;
}
