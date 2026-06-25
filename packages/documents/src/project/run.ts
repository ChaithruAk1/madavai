import { DataPlan } from '@madav/contracts';
import type { Table } from '@madav/contracts';
import { ingestWorkbook, ingestCsv } from '../ingest/index.js';
import { runPlan } from '../transform/index.js';
import { buildStyledWorkbook } from '../excel/styled.js';
import { type Issue, err } from '../excel/issues.js';

export interface DataFile { name: string; bytes?: Uint8Array; text?: string }
export interface ProjectAdapters {
  listFiles(folder: string): Promise<DataFile[]>;       // read data files (deterministic; no model)
  askModel(prompt: string): Promise<string>;            // the ONLY model call — asks for a PLAN, not code
  saveOutput(folder: string, name: string, bytes: Uint8Array): Promise<void>;
  emit?(event: string, data?: unknown): void;
}

function ingestFile(f: DataFile): { table: Table; issues: Issue[] } | null {
  const n = f.name.toLowerCase();
  if (n.endsWith('.csv') && f.text != null) return ingestCsv(f.name.replace(/\.csv$/i, ''), f.text);
  if ((n.endsWith('.xlsx') || n.endsWith('.xls')) && f.bytes) { const r = ingestWorkbook(f.bytes); return r.tables[0] ? { table: r.tables[0], issues: r.issues } : null; }
  return null;
}

/** The model is told the data is ALREADY read, and asked for a JSON plan only — never code. */
export function planPrompt(task: string, tables: Table[]): string {
  const schemas = tables.map((t) => `- "${t.name}" (${t.rowCount} rows): ${t.columns.map((c) => `${c.name}:${c.type}`).join(', ')}`).join('\n');
  return [
    'These data tables are already read for you:', schemas, `TASK: ${task}`,
    'Output ONLY a JSON plan to produce the result — do NOT write code. Shape:',
    '{"source":"<table name>","ops":[ <ops> ]}  where each op is one of:',
    'filter {"op":"filter","column":"C","test":"eq|ne|gt|lt|ge|le|contains","value":V}',
    'sort {"op":"sort","column":"C","dir":"asc|desc"}  select {"op":"select","columns":["C"]}',
    'limit {"op":"limit","n":N}  aggregate {"op":"aggregate","groupBy":["C"],"measures":[{"column":"C","fn":"sum|avg|count|min|max","as":"Name"}]}',
    'Return the JSON object only.',
  ].join('\n');
}

function extractPlan(reply: string): unknown {
  const m = String(reply ?? '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Deterministic project run. The model only emits a schema-validated plan; ingest, compute and authoring
 * are deterministic. A bad plan is caught by the gate and repaired (re-ask) or failed CLEANLY — never a
 * crashed/flailing script. Works on any model, including weak ones.
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
  for (const f of files) { const r = ingestFile(f); if (r) { tables.push(r.table); issues.push(...r.issues); } }
  if (!tables.length) return { ok: false, issues: [...issues, err('NO_DATA', 'no readable data files (.xlsx/.csv) in the project folder')] };

  const maxRepair = opts.maxRepair ?? 1;
  let lastErr = '';
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    emit('status', { phase: attempt ? 'replan' : 'plan' });
    const prompt = attempt ? `${planPrompt(task, tables)}\n\nYour previous JSON was invalid (${lastErr}). Return corrected JSON only.` : planPrompt(task, tables);
    const parsed = DataPlan.safeParse(extractPlan(await adapters.askModel(prompt)));
    if (!parsed.success) { lastErr = parsed.error.issues.map((i) => i.message).join('; '); continue; }
    const src = tables.find((t) => t.name === parsed.data.source) ?? tables[0]!;
    const computed = runPlan(src, parsed.data);
    issues.push(...computed.issues);
    if (computed.issues.some((i) => i.level === 'error')) { lastErr = computed.issues.map((i) => i.message).join('; '); continue; }
    emit('status', { phase: 'author' });
    const built = await buildStyledWorkbook({ name: outputName, sheets: [{ name: (computed.table.name || 'Result').slice(0, 28), rows: [computed.table.columns.map((c) => c.name), ...computed.table.rows] }] });
    if (!built.ok) return { ok: false, issues: [...issues, ...built.issues] };
    await adapters.saveOutput(folder, outputName, built.bytes);
    emit('done', { output: outputName });
    return { ok: true, output: outputName, issues };
  }
  return { ok: false, issues: [...issues, err('PLAN_INVALID', `the model could not produce a valid plan after ${maxRepair + 1} tries — ${lastErr}`)] };
}
