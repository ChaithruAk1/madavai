import { DataPlan } from '@madav/contracts';
import type { Table, Cell } from '@madav/contracts';
import { type Issue, err } from '../excel/issues.js';
import { inferColumnType } from '../ingest/normalize.js';

const idxOf = (t: Table, name: string) => t.columns.findIndex((c) => c.name === name);
const num = (c: Cell): number | null =>
  typeof c === 'number' ? c : typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c.trim()) ? Number(c) : null;

function mk(name: string, cols: string[], rows: Cell[][]): Table {
  return { name, columns: cols.map((n, i) => ({ name: n, type: inferColumnType(rows.map((r) => r[i])) })), rows, rowCount: rows.length, truncated: false };
}
function cmp(a: Cell, b: Cell): number {
  const na = num(a), nb = num(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''));
}
function passes(cell: Cell, test: string, value: Cell): boolean {
  if (test === 'contains') return String(cell ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
  if (test === 'eq') return String(cell) === String(value);
  if (test === 'ne') return String(cell) !== String(value);
  const c = num(cell), v = num(value);
  const d = c !== null && v !== null ? c - v : String(cell ?? '').localeCompare(String(value ?? ''));
  return test === 'gt' ? d > 0 : test === 'lt' ? d < 0 : test === 'ge' ? d >= 0 : d <= 0;
}
function reduce(cells: Cell[], fn: string): Cell {
  if (fn === 'count') return cells.length;
  const ns = cells.map(num).filter((x): x is number => x !== null);
  if (!ns.length) return null;
  if (fn === 'sum') return ns.reduce((a, b) => a + b, 0);
  if (fn === 'avg') return Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 1e6) / 1e6;
  if (fn === 'min') return Math.min(...ns);
  return Math.max(...ns);
}

/** Apply a SCHEMA-VALIDATED plan to a table, deterministically. The model produces the plan; this runs it. */
export function runPlan(table: Table, planInput: unknown): { table: Table; issues: Issue[] } {
  const parsed = DataPlan.safeParse(planInput);
  if (!parsed.success) return { table, issues: parsed.error.issues.map((i) => err('PLAN_INVALID', i.message, i.path.join('.'))) };
  let t = table;
  const issues: Issue[] = [];
  const names = () => t.columns.map((c) => c.name);
  for (const op of parsed.data.ops) {
    if (op.op === 'filter') {
      const i = idxOf(t, op.column);
      if (i < 0) { issues.push(err('COLUMN_MISSING', `filter: no column "${op.column}"`, op.column)); continue; }
      t = mk(t.name, names(), t.rows.filter((r) => passes(r[i], op.test, op.value)));
    } else if (op.op === 'sort') {
      const i = idxOf(t, op.column);
      if (i < 0) { issues.push(err('COLUMN_MISSING', `sort: no column "${op.column}"`, op.column)); continue; }
      const s = op.dir === 'desc' ? -1 : 1;
      t = mk(t.name, names(), [...t.rows].sort((a, b) => cmp(a[i], b[i]) * s));
    } else if (op.op === 'select') {
      const ix = op.columns.map((n) => idxOf(t, n));
      const miss = op.columns.filter((_, k) => ix[k] < 0);
      if (miss.length) { issues.push(err('COLUMN_MISSING', `select: missing ${miss.join(', ')}`)); continue; }
      t = mk(t.name, op.columns.slice(), t.rows.map((r) => ix.map((i) => r[i])));
    } else if (op.op === 'limit') {
      t = mk(t.name, names(), t.rows.slice(0, op.n));
    } else if (op.op === 'aggregate') {
      const gi = op.groupBy.map((n) => idxOf(t, n));
      const miss = op.groupBy.filter((_, k) => gi[k] < 0).concat(op.measures.filter((m) => idxOf(t, m.column) < 0).map((m) => m.column));
      if (miss.length) { issues.push(err('COLUMN_MISSING', `aggregate: missing ${miss.join(', ')}`)); continue; }
      const groups = new Map<string, Cell[][]>();
      for (const r of t.rows) { const k = gi.map((i) => String(r[i])).join(''); let a = groups.get(k); if (!a) { a = []; groups.set(k, a); } a.push(r); }
      const measureNames = op.measures.map((m) => m.as ?? `${m.fn}_${m.column}`);
      const rows: Cell[][] = [];
      for (const grp of groups.values()) {
        const head = gi.map((i) => grp[0][i]);
        const meas = op.measures.map((m) => reduce(grp.map((r) => r[idxOf(t, m.column)]), m.fn));
        rows.push([...head, ...meas]);
      }
      t = mk(t.name, [...op.groupBy, ...measureNames], rows);
    }
  }
  return { table: t, issues };
}
