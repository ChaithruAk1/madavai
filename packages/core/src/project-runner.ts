// @madav/core — orchestration for running a project/data job: inspect -> decide replay/author -> run ->
// validate -> save recipe. The flow lives here once; runtimes inject HOW (read files, run a script, ask
// the model, persist jobs, emit progress). Pure logic; no Node/DOM.
import { findJob, makeJob, decideRun, upsertJob, validateOutputs, type Job, type SchemaFile } from './project-job.js';

// Deterministic, Madav-owned inspection script — the single source of "what the data looks like".
export const INSPECT_PY = [
  'import json, os',
  'import pandas as pd',
  'out = []',
  "for f in sorted(os.listdir('.')):",
  '    low = f.lower()',
  "    if not low.endswith(('.xlsx', '.xls', '.csv')): continue",
  '    try:',
  "        df = pd.read_csv(f) if low.endswith('.csv') else pd.read_excel(f)",
  "        out.append({'file': f, 'rows': int(df.shape[0]),",
  "                    'columns': [str(c) for c in df.columns.tolist()],",
  "                    'dtypes': {str(c): str(t) for c, t in df.dtypes.items()},",
  "                    'sample': df.head(3).astype(str).to_dict('records')})",
  '    except Exception as e:',
  "        out.append({'file': f, 'error': str(e)})",
  'print(json.dumps(out))',
].join('\n');

export function errorSignature(e: unknown): string {
  const lines = String(e == null ? '' : e).split('\n').map((x) => x.trim()).filter(Boolean);
  const pick = [...lines].reverse().find((l) => /(error|exception|traceback|eof|invalid|no output)/i.test(l)) || lines[lines.length - 1] || '';
  return pick.toLowerCase().replace(/['"][^'"]*['"]/g, '').replace(/\d+/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

export interface ProjectAdapters {
  inspect: (folder: string) => Promise<SchemaFile[]>;
  author: (a: { task?: string; instructions?: string; schema?: SchemaFile[]; fixError?: string; prevScript?: string }) => Promise<{ script?: string; outputs?: string[] }>;
  run: (script: string, folder: string) => Promise<{ ok?: boolean; error?: string; produced?: string[] }>;
  loadJobs: () => Promise<Job[]>;
  saveJobs: (jobs: Job[]) => Promise<void>;
  emit?: (kind: string, data: Record<string, unknown>) => void;
  model?: string;
  provider?: string;
}
export interface ProjectRunResult { ok: boolean; mode?: string; produced?: string[]; error?: string; aborted?: boolean; }

export async function runProjectJob(
  { task, instructions, folder }: { task: string; instructions?: string; folder: string },
  adapters: ProjectAdapters,
  opts: { maxRepair?: number; signal?: { aborted?: boolean } } = {},
): Promise<ProjectRunResult> {
  const maxRepair = opts.maxRepair == null ? 2 : opts.maxRepair;
  const emit = adapters.emit || (() => {});
  const aborted = () => !!(opts.signal && opts.signal.aborted);

  emit('status', { phase: 'inspect' });
  const schema = await adapters.inspect(folder);
  emit('status', { phase: 'inspected', count: Array.isArray(schema) ? schema.length : 0, files: (schema || []).map((x) => x && x.file).filter(Boolean) });
  const jobs = (await adapters.loadJobs()) || [];
  const job = findJob(jobs, task);
  const decision = decideRun(job, instructions, schema);
  emit('status', { phase: decision.action, reason: decision.reason });

  if (decision.action === 'replay' && job) {
    if (aborted()) return { ok: false, aborted: true };
    emit('status', { phase: 'running' });
    const r = await adapters.run(job.script || '', folder);
    const v = validateOutputs(job, r.produced);
    if (r.ok && v.ok) { emit('done', { mode: 'replay', produced: r.produced }); return { ok: true, mode: 'replay', produced: r.produced }; }
    const why = !r.ok ? errorSignature(r.error) || 'the saved script produced no output file' : 'the output did not match what was expected';
    emit('status', { phase: 'replay_failed', detail: why });
  }

  if (aborted()) return { ok: false, aborted: true };
  let authored = await adapters.author({ task, instructions, schema });
  let last: { ok?: boolean; error?: string; produced?: string[] } | null = null;
  let prevSig: string | null = null;
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    if (aborted()) return { ok: false, aborted: true };
    if (!authored || !authored.script || !String(authored.script).trim()) {
      last = { ok: false, error: "The model didn't return a runnable script — its reply may have been cut off. A stronger or paid model is more reliable for a big report." };
      break;
    }
    emit('status', { phase: 'running' });
    const r = await adapters.run(authored.script, folder);
    last = r;
    if (r.ok && r.produced && r.produced.length) {
      const outputs = authored.outputs && authored.outputs.length ? authored.outputs : r.produced;
      const newJob = makeJob({ task, instructions, schema, script: authored.script, outputs, model: adapters.model, provider: adapters.provider });
      newJob.status = 'active';
      await adapters.saveJobs(upsertJob(jobs, newJob));
      emit('done', { mode: 'authored', produced: r.produced });
      return { ok: true, mode: 'authored', produced: r.produced };
    }
    const sig = errorSignature(r.error);
    if (sig && sig === prevSig) { last = r; emit('status', { phase: 'stuck' }); break; }
    prevSig = sig;
    if (attempt < maxRepair) {
      if (aborted()) return { ok: false, aborted: true };
      emit('status', { phase: 'repair', attempt: attempt + 1, error: r.error });
      authored = await adapters.author({ task, instructions, schema, fixError: r.error, prevScript: authored.script });
    }
  }
  emit('failed', { error: (last && last.error) || 'no output produced' });
  return { ok: false, error: (last && last.error) || 'no output produced' };
}
