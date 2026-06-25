import { DataPlan, MultiPlan } from '@madav/contracts';
import type { Table, Cell, DataOp } from '@madav/contracts';
import { type Issue, err, warn } from '../excel/issues.js';
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
const round6 = (v: number): Cell => (isFinite(v) ? Math.round(v * 1e6) / 1e6 : null);

/**
 * Apply a list of SCHEMA-VALIDATED ops to ONE table, deterministically and in order.
 * The single building block shared by the simple plan and every step of the multi-file plan.
 */
export function applyOps(table: Table, ops: DataOp[]): { table: Table; issues: Issue[] } {
  let t = table;
  const issues: Issue[] = [];
  const names = () => t.columns.map((c) => c.name);
  for (const op of ops) {
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
      const mi = op.measures.map((m) => idxOf(t, m.column));
      const rows: Cell[][] = [];
      for (const grp of groups.values()) {
        const head = gi.map((i) => grp[0]![i]);
        const meas = op.measures.map((m, k) => reduce(grp.map((r) => r[mi[k]!]), m.fn));
        rows.push([...head, ...meas]);
      }
      t = mk(t.name, [...op.groupBy, ...measureNames], rows);
    } else if (op.op === 'derive') {
      const need: string[] = [];
      if ('col' in op.left && idxOf(t, op.left.col) < 0) need.push(op.left.col);
      if ('col' in op.right && idxOf(t, op.right.col) < 0) need.push(op.right.col);
      if (need.length) { issues.push(err('COLUMN_MISSING', `derive "${op.as}": missing ${need.join(', ')}`)); continue; }
      const li = 'col' in op.left ? idxOf(t, op.left.col) : -1;
      const ri = 'col' in op.right ? idxOf(t, op.right.col) : -1;
      const argVal = (which: 'l' | 'r', r: Cell[]): number | null => {
        const a = which === 'l' ? op.left : op.right;
        if ('val' in a) return a.val;
        return num(r[which === 'l' ? li : ri]);
      };
      const vals: Cell[] = t.rows.map((r) => {
        const lv = argVal('l', r), rv = argVal('r', r);
        if (lv === null || rv === null) return null;
        if (op.fn === 'add') return round6(lv + rv);
        if (op.fn === 'sub') return round6(lv - rv);
        if (op.fn === 'mul') return round6(lv * rv);
        return rv === 0 ? null : round6(lv / rv);
      });
      const ai = idxOf(t, op.as);
      if (ai >= 0) t = mk(t.name, names(), t.rows.map((r, k) => { const c = r.slice(); c[ai] = vals[k]!; return c; }));
      else t = mk(t.name, [...names(), op.as], t.rows.map((r, k) => [...r, vals[k]!]));
    }
  }
  return { table: t, issues };
}

/** Apply a SCHEMA-VALIDATED simple plan to a table (back-compat wrapper around applyOps). */
export function runPlan(table: Table, planInput: unknown): { table: Table; issues: Issue[] } {
  const parsed = DataPlan.safeParse(planInput);
  if (!parsed.success) return { table, issues: parsed.error.issues.map((i) => err('PLAN_INVALID', i.message, i.path.join('.'))) };
  return applyOps(table, parsed.data.ops);
}

const keyStr = (r: Cell[], idx: number[]) => idx.map((i) => String(r[i] ?? '')).join('');

function join2(left: Table, right: Table, on: string[], how: 'left' | 'inner'): { table: Table; issues: Issue[] } {
  const issues: Issue[] = [];
  const li = on.map((n) => idxOf(left, n)), ri = on.map((n) => idxOf(right, n));
  const missing = [...on.filter((_, k) => li[k]! < 0), ...on.filter((_, k) => ri[k]! < 0)];
  if (missing.length) { issues.push(err('JOIN_KEY_MISSING', `join: key(s) ${[...new Set(missing)].join(', ')} not present in both tables`)); return { table: left, issues }; }
  const riSet = new Set(ri);
  const rightNonKey = right.columns.map((_, i) => i).filter((i) => !riSet.has(i));
  const leftNames = left.columns.map((c) => c.name);
  const bringNames: string[] = [];
  for (const i of rightNonKey) {
    const base = right.columns[i]!.name; let nm = base; let s = 2;
    while (leftNames.includes(nm) || bringNames.includes(nm)) nm = `${base}_${s++}`;
    if (nm !== base) issues.push(warn('JOIN_RENAME', `joined column "${base}" renamed to "${nm}" to avoid a clash`));
    bringNames.push(nm);
  }
  const rindex = new Map<string, Cell[]>();
  for (const r of right.rows) { const k = keyStr(r, ri); if (!rindex.has(k)) rindex.set(k, r); }
  const rows: Cell[][] = [];
  for (const lr of left.rows) {
    const m = rindex.get(keyStr(lr, li));
    if (m) rows.push([...lr, ...rightNonKey.map((i) => m[i]!)]);
    else if (how === 'left') rows.push([...lr, ...rightNonKey.map(() => null)]);
  }
  return { table: mk(left.name, [...leftNames, ...bringNames], rows), issues };
}

/** Combine 2+ tables by matching key columns, folding left-to-right. Aggregated tables (unique keys) join cleanly. */
export function joinTables(tables: Table[], on: string[], how: 'left' | 'inner' = 'left'): { table: Table; issues: Issue[] } {
  if (!tables.length) return { table: mk('empty', [], []), issues: [err('JOIN_EMPTY', 'join: no input tables')] };
  let acc = tables[0]!; const issues: Issue[] = [];
  for (let i = 1; i < tables.length; i++) { const r = join2(acc, tables[i]!, on, how); acc = r.table; issues.push(...r.issues); }
  return { table: acc, issues };
}

/**
 * Run the general multi-file plan: resolve named steps (single-source pipelines and joins) in order
 * into an environment, then emit the chosen step results as output sheets. Deterministic; model-free.
 */
export function runDataPlan(plan: MultiPlan, sources: Record<string, Table>): { sheets: { name: string; table: Table }[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const env = new Map<string, Table>();
  for (const k of Object.keys(sources)) env.set(k, sources[k]!);
  for (const raw of plan.steps as any[]) {
    if (Array.isArray(raw.join)) {
      const inputs: Table[] = []; let ok = true;
      for (const n of raw.join as string[]) { const tb = env.get(n); if (!tb) { issues.push(err('STEP_REF_MISSING', `join step "${raw.name}": no table/step named "${n}"`)); ok = false; } else inputs.push(tb); }
      if (!ok) { env.set(raw.name, mk(raw.name, [], [])); continue; }
      const j = joinTables(inputs, raw.on as string[], raw.how as 'left' | 'inner'); issues.push(...j.issues);
      const a = applyOps(j.table, raw.ops as DataOp[]); issues.push(...a.issues);
      env.set(raw.name, { ...a.table, name: raw.name });
    } else {
      const base = env.get(raw.from);
      if (!base) { issues.push(err('STEP_REF_MISSING', `step "${raw.name}": no table/step named "${raw.from}"`)); env.set(raw.name, mk(raw.name, [], [])); continue; }
      const a = applyOps(base, raw.ops as DataOp[]); issues.push(...a.issues);
      env.set(raw.name, { ...a.table, name: raw.name });
    }
  }
  const sheets: { name: string; table: Table }[] = [];
  for (const o of plan.output) { const tb = env.get(o.table); if (!tb) { issues.push(err('OUTPUT_REF_MISSING', `output sheet "${o.sheet}": no step/table named "${o.table}"`)); continue; } sheets.push({ name: o.sheet, table: tb }); }
  if (!sheets.length) issues.push(err('NO_OUTPUT', 'the plan produced no output sheets'));
  return { sheets, issues };
}
