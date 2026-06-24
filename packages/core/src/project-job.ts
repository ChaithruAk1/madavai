// @madav/core — the recurring "project job" lifecycle: REPLAY a saved script when nothing structural
// changed, RE-AUTHOR when the instructions or the data shape change. Pure decision logic + fingerprints.
import { taskKeyOf } from './recipes.js';

export const OUTPUT_DIR = 'Madav Results';

export interface SchemaFile {
  file: string;
  rows?: number;
  columns?: string[];
  dtypes?: Record<string, string>;
  sample?: Record<string, unknown>[];
  error?: string;
}
export interface Job {
  taskKey: string;
  task: string;
  instr: string;
  schemaSig: string;
  script: string | null;
  outputs: string[];
  model: string;
  provider: string;
  status: string;
  createdAt: number;
}

export function datedName(name: string, date: Date = new Date(), seq = 1): string {
  const s = String(name || 'file');
  const dot = s.lastIndexOf('.');
  const stem = dot > 0 ? s.slice(0, dot) : s;
  const ext = dot > 0 ? s.slice(dot) : '';
  const p = (n: number) => String(n).padStart(2, '0');
  const dmy = `${p(date.getDate())}${p(date.getMonth() + 1)}${date.getFullYear()}`;
  const hms = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${stem}_${dmy}_${hms}${seq > 1 ? '_' + seq : ''}${ext}`;
}

export function outputBase(name: string): string {
  const s = String(name || '');
  const dot = s.lastIndexOf('.');
  const stem = (dot > 0 ? s.slice(0, dot) : s).replace(/_\d{8}(_\d{6})?(_\d+)?$/, '');
  const ext = dot > 0 ? s.slice(dot) : '';
  return (stem + ext).toLowerCase();
}

function djb2(s: unknown): string {
  let h = 5381;
  const str = String(s == null ? '' : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function schemaSignature(schema: unknown): string {
  if (!Array.isArray(schema)) return '';
  const norm = (schema as SchemaFile[])
    .map((f) => ({ file: String((f && f.file) || '').trim().toLowerCase(), cols: ((f && f.columns) || []).map((c) => String(c).trim().toLowerCase()).sort() }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return djb2(JSON.stringify(norm));
}

export function instructionsHash(text: unknown): string {
  return djb2(String(text || '').replace(/\s+/g, ' ').trim().toLowerCase());
}

export function makeJob(
  { task, instructions, schema, script, outputs, model, provider }:
  { task?: string; instructions?: string; schema?: SchemaFile[]; script?: string | null; outputs?: string[]; model?: string; provider?: string } = {},
): Job {
  return {
    taskKey: taskKeyOf(task || ''),
    task: task || '',
    instr: instructionsHash(instructions),
    schemaSig: schemaSignature(schema),
    script: script || null,
    outputs: (outputs || []).slice(),
    model: model || '',
    provider: provider || '',
    status: 'active',
    createdAt: Date.now(),
  };
}

export function findJob(jobs: Job[] | null | undefined, task: string): Job | null {
  const key = taskKeyOf(task || '');
  const hits = (jobs || []).filter((j) => j && j.taskKey === key && j.status !== 'retired');
  return hits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

export function decideRun(job: Job | null | undefined, currentInstructions: unknown, currentSchema: unknown): { action: 'replay' | 'author'; reason: string } {
  if (!job || !job.script) return { action: 'author', reason: 'no saved procedure yet' };
  if (job.status === 'provisional') return { action: 'author', reason: 'the saved procedure is not confirmed yet' };
  if (job.instr !== instructionsHash(currentInstructions)) return { action: 'author', reason: 'the instructions changed' };
  const outs = new Set((job.outputs || []).map((x) => String(x).toLowerCase()));
  const inputs = (Array.isArray(currentSchema) ? (currentSchema as SchemaFile[]) : []).filter((ff) => !outs.has(String((ff && ff.file) || '').toLowerCase()));
  if (job.schemaSig !== schemaSignature(inputs)) return { action: 'author', reason: 'the data files or columns changed' };
  return { action: 'replay', reason: 'same task, same data shape' };
}

export function upsertJob(jobs: Job[] | null | undefined, job: Job): Job[] {
  const out = (jobs || []).filter((j) => j && j.taskKey !== job.taskKey);
  out.push(job);
  return out;
}

export function validateOutputs(job: Job | null | undefined, produced: string[] | null | undefined): { ok: boolean; missing: string[] } {
  const want = ((job && job.outputs) || []).map(outputBase);
  const have = new Set((produced || []).map(outputBase));
  const missing = want.filter((w) => !have.has(w));
  return { ok: want.length > 0 && missing.length === 0, missing };
}

export function authoringPrompt(
  { task, instructions, schema, fixError, prevScript }:
  { task?: string; instructions?: string; schema?: SchemaFile[]; fixError?: string; prevScript?: string } = {},
): string {
  const files = (schema || [])
    .map((f) => {
      if (f && f.error) return `- ${f.file}: COULD NOT READ (${f.error})`;
      const cols = ((f && f.columns) || []).join(' | ');
      const sample = ((f && f.sample) || []).slice(0, 2).map((r) => JSON.stringify(r)).join('\n      ');
      return `- ${f.file} (${f && f.rows != null ? f.rows + ' rows' : '?'})\n    columns: ${cols}` + (sample ? `\n    sample rows:\n      ${sample}` : '');
    })
    .join('\n');
  const parts = [
    'Write ONE complete, self-contained Python script (pandas + openpyxl) to produce this deliverable. Do NOT explore or re-inspect the data — it is already inspected for you below.',
    `TASK: ${task || '(produce the deliverable)'}`,
    instructions ? `INSTRUCTIONS (follow exactly):\n${instructions}` : '',
    `DATA FILES in the current working folder — use these EXACT file and column names:\n${files || '(no data files found)'}`,
    "Requirements: read the files with pandas; compute everything the instructions require; create an output folder with os.makedirs('" + OUTPUT_DIR + "', exist_ok=True) and SAVE the finished file(s) THERE. The saved file IS the deliverable. Output ONLY the script inside a single ```python code block — no prose before or after.",
  ];
  if (fixError) parts.push(`Your previous script FAILED with this error:\n${String(fixError).slice(0, 1500)}\n\nPrevious script:\n${String(prevScript || '').slice(0, 4000)}\n\nReturn a CORRECTED, complete script (again, ONLY the \`\`\`python block).`);
  return parts.filter(Boolean).join('\n\n');
}

export function extractScript(text: unknown): string {
  const s = String(text || '');
  const closed = s.match(/```(?:python|py)?\s*\n?([\s\S]*?)```/);
  if (closed) return closed[1].trim();
  const open = s.match(/```(?:python|py)?\s*\n?([\s\S]*)$/);
  if (open) return open[1].trim();
  return s.trim();
}
