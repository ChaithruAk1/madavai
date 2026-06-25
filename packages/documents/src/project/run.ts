import { DataPlan, MultiPlan } from '@madav/contracts';
import type { Table, Cell } from '@madav/contracts';
import { ingestWorkbook, ingestCsv } from '../ingest/index.js';
import { runPlan, runDataPlan } from '../transform/index.js';
import { buildStyledWorkbook } from '../excel/styled.js';
import { type Issue, err } from '../excel/issues.js';

export interface DataFile { name: string; bytes?: Uint8Array; text?: string }
export interface ProjectAdapters {
  listFiles(folder: string): Promise<DataFile[]>;       // read data files (deterministic; no model)
  askModel(prompt: string): Promise<string>;            // the ONLY model call — asks for a PLAN, not code
  saveOutput(folder: string, name: string, bytes: Uint8Array): Promise<void>;
  emit?(event: string, data?: unknown): void;
}

const stemOf = (name: string) => name.replace(/\.[^.]+$/, '');

/**
 * Read ONE file into one or more typed tables. Tables are named after the FILE (not the sheet) so a
 * multi-file project can reference "Submitted", "Resolved", etc. — even when every file's sheet is
 * called "Sheet 1". A multi-sheet workbook yields "<file> - <sheet>" per extra sheet.
 */
function ingestFile(f: DataFile): { table: Table; issues: Issue[] }[] {
  const n = f.name.toLowerCase();
  const stem = stemOf(f.name);
  if (n.endsWith('.csv') && f.text != null) return [ingestCsv(stem, f.text)];
  if ((n.endsWith('.xlsx') || n.endsWith('.xls')) && f.bytes) {
    const r = ingestWorkbook(f.bytes);
    const multi = r.tables.length > 1;
    return r.tables.map((t, i) => ({ table: { ...t, name: multi ? `${stem} - ${t.name}` : stem }, issues: i === 0 ? r.issues : [] }));
  }
  return [];
}

/** The model is told the data is ALREADY read, and asked for a JSON plan only — never code. */
export function planPrompt(task: string, tables: Table[]): string {
  const schemas = tables.map((t) => `- "${t.name}" (${t.rowCount} rows): ${t.columns.map((c) => `${c.name}:${c.type}`).join(', ')}`).join('\n');
  return [
    'These data tables are already read for you:', schemas, '', `TASK: ${task}`, '',
    'Reply with ONE JSON plan that produces the result — never write code. Choose the simplest shape that fits:',
    '',
    'A) SIMPLE — one table in, one sheet out:',
    '   {"source":"<table>","ops":[ <op>, ... ]}',
    '',
    'B) MULTI — combine files, add calculated columns, or emit several sheets:',
    '   {"steps":[ <step>, ... ], "output":[ {"sheet":"<name>","table":"<step name>"}, ... ]}',
    '   single-source step: {"name":"X","from":"<table or earlier step>","ops":[ <op>, ... ]}',
    '   join step:          {"name":"X","join":["A","B"],"on":["<key column>"],"how":"left","ops":[ <op>, ... ]}',
    '',
    'ops:',
    '  filter    {"op":"filter","column":"C","test":"eq|ne|gt|lt|ge|le|contains","value":V}',
    '  sort      {"op":"sort","column":"C","dir":"asc|desc"}',
    '  select    {"op":"select","columns":["C", ...]}',
    '  limit     {"op":"limit","n":N}',
    '  aggregate {"op":"aggregate","groupBy":["C", ...],"measures":[{"column":"C","fn":"sum|avg|count|min|max","as":"Name"}]}',
    '  derive    {"op":"derive","as":"Name","left":{"col":"C"} or {"val":N},"fn":"add|sub|mul|div","right":{"col":"C"} or {"val":N}}',
    '',
    'Rules: aggregate each source to the SAME group-by keys before joining; the join "on" keys must exist in every joined step; give every measure a unique "as"; order steps so each refers only to a source table or an EARLIER step. Return the JSON object only — no prose, no markdown.',
    '',
    'Worked example (combine two files, add a ratio, one sheet):',
    '{"steps":[',
    '  {"name":"rec","from":"Submitted","ops":[{"op":"aggregate","groupBy":["SESA"],"measures":[{"column":"SESA","fn":"count","as":"Received"}]}]},',
    '  {"name":"res","from":"Resolved","ops":[{"op":"aggregate","groupBy":["SESA"],"measures":[{"column":"SESA","fn":"count","as":"Resolved"}]}]},',
    '  {"name":"out","join":["rec","res"],"on":["SESA"],"how":"left","ops":[{"op":"derive","as":"Resolve Rate","left":{"col":"Resolved"},"fn":"div","right":{"col":"Received"}}]}',
    '], "output":[{"sheet":"Summary","table":"out"}]}',
  ].join('\n');
}

function extractPlan(reply: string): unknown {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const sheetRows = (t: Table): Cell[][] => [t.columns.map((c) => c.name), ...t.rows];
const clampSheet = (s: string) => (s || 'Result').slice(0, 28);

/**
 * Deterministic project run. The model only emits a schema-validated plan (simple OR multi-file);
 * ingest, compute and authoring are deterministic. A bad plan is caught by the gate and repaired
 * (re-ask) or failed CLEANLY — never a crashed/flailing script. Works on any model, including weak ones.
 */
export async function runDataProject(
  { task, folder, outputName = 'Result.xlsx' }: { task: string; folder: string; outputName?: string },
  adapters: ProjectAdapters,
  opts: { maxRepair?: number } = {},
): Promise<{ ok: boolean; output?: string; issues: Issue[] }> {
  const emit = adapters.emit ?? (() => {});
  const issues: Issue[] = [];
  emit('status', { phase: 'ingest' });
  const files = await adapters.listFiles(folder);
  const tables: Table[] = [];
  for (const f of files) for (const r of ingestFile(f)) { tables.push(r.table); issues.push(...r.issues); }
  if (!tables.length) return { ok: false, issues: [...issues, err('NO_DATA', 'no readable data files (.xlsx/.csv) in the project folder')] };
  const byName: Record<string, Table> = {};
  for (const t of tables) byName[t.name] = t;

  const maxRepair = opts.maxRepair ?? 1;
  let lastErr = '';
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    emit('status', { phase: attempt ? 'replan' : 'plan' });
    const prompt = attempt ? `${planPrompt(task, tables)}\n\nYour previous JSON was invalid (${lastErr}). Return corrected JSON only.` : planPrompt(task, tables);
    const raw = extractPlan(await adapters.askModel(prompt));
    const isMulti = !!(raw && typeof raw === 'object' && Array.isArray((raw as { steps?: unknown }).steps));

    let sheets: { name: string; table: Table }[] = [];
    if (isMulti) {
      const parsed = MultiPlan.safeParse(raw);
      if (!parsed.success) { lastErr = parsed.error.issues.map((i) => i.message).join('; '); continue; }
      const res = runDataPlan(parsed.data, byName);
      issues.push(...res.issues);
      const fatal = res.issues.filter((i) => i.level === 'error');
      if (fatal.length) { lastErr = fatal.map((i) => i.message).join('; '); continue; }
      sheets = res.sheets;
    } else {
      const parsed = DataPlan.safeParse(raw);
      if (!parsed.success) { lastErr = parsed.error.issues.map((i) => i.message).join('; '); continue; }
      const src = tables.find((t) => t.name === parsed.data.source) ?? tables[0]!;
      const computed = runPlan(src, parsed.data);
      issues.push(...computed.issues);
      if (computed.issues.some((i) => i.level === 'error')) { lastErr = computed.issues.map((i) => i.message).join('; '); continue; }
      sheets = [{ name: clampSheet(computed.table.name || 'Result'), table: computed.table }];
    }
    if (!sheets.length) { lastErr = 'the plan produced no output sheets'; continue; }

    emit('status', { phase: 'author' });
    const built = await buildStyledWorkbook({ name: outputName, sheets: sheets.map((s) => ({ name: clampSheet(s.name), rows: sheetRows(s.table) })) });
    if (!built.ok) return { ok: false, issues: [...issues, ...built.issues] };
    await adapters.saveOutput(folder, outputName, built.bytes);
    emit('done', { output: outputName });
    return { ok: true, output: outputName, issues };
  }
  return { ok: false, issues: [...issues, err('PLAN_INVALID', `the model could not produce a valid plan after ${maxRepair + 1} tries — ${lastErr}`)] };
}
