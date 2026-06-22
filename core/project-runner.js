// core/project-runner.js — SINGLE SOURCE orchestration for running a project job on BOTH surfaces.
// The flow (inspect -> decide replay/author -> run -> validate -> save) lives HERE, once. Desktop
// and web each pass PLATFORM ADAPTERS (how to read files, run a script, ask the model, persist jobs,
// emit progress) -- the only per-surface code, because local-Python vs server-Python genuinely
// cannot be shared. Pure logic; no Node, no DOM.
import { findJob, makeJob, decideRun, upsertJob, validateOutputs } from "./project-job.js";

// Deterministic, Madav-owned inspection script (the single source of "what the data looks like").
// Adapters run THIS exact script in the project folder and parse its JSON to a schema.
export const INSPECT_PY = [
  "import json, os",
  "import pandas as pd",
  "out = []",
  "for f in sorted(os.listdir('.')):",
  "    low = f.lower()",
  "    if not low.endswith(('.xlsx', '.xls', '.csv')): continue",
  "    try:",
  "        df = pd.read_csv(f) if low.endswith('.csv') else pd.read_excel(f)",
  "        out.append({'file': f, 'rows': int(df.shape[0]),",
  "                    'columns': [str(c) for c in df.columns.tolist()],",
  "                    'dtypes': {str(c): str(t) for c, t in df.dtypes.items()},",
  "                    'sample': df.head(3).astype(str).to_dict('records')})",
  "    except Exception as e:",
  "        out.append({'file': f, 'error': str(e)})",
  "print(json.dumps(out))",
].join("\n");

// adapters = {
//   inspect(folder) -> Promise<schema[]>                 // run INSPECT_PY, parse JSON
//   author({task,instructions,schema,fixError,prevScript}) -> Promise<{script, outputs}>
//   run(script, folder) -> Promise<{ok, error, produced[]}>   // write script to file + execute
//   loadJobs() -> Promise<job[]>   saveJobs(jobs) -> Promise<void>
//   emit(kind, data)               // progress to the surface
//   model, provider                // for stamping the saved job
// }
export async function runProjectJob({ task, instructions, folder }, adapters, opts = {}) {
  const maxRepair = opts.maxRepair == null ? 2 : opts.maxRepair;
  const emit = adapters.emit || (() => {});
  emit("status", { phase: "inspect" });
  const schema = await adapters.inspect(folder);
  const jobs = (await adapters.loadJobs()) || [];
  const job = findJob(jobs, task);
  const decision = decideRun(job, instructions, schema);
  emit("status", { phase: decision.action, reason: decision.reason });

  // REPLAY — run the saved procedure deterministically (no model). Self-heals to authoring if it fails.
  if (decision.action === "replay") {
    const r = await adapters.run(job.script, folder);
    const v = validateOutputs(job, r.produced);
    if (r.ok && v.ok) { emit("done", { mode: "replay", produced: r.produced }); return { ok: true, mode: "replay", produced: r.produced }; }
    emit("status", { phase: "author", reason: "saved procedure failed; rebuilding" });
  }

  // AUTHOR — model writes ONE complete script from the spec + inspected schema; run once; bounded repair.
  let authored = await adapters.author({ task, instructions, schema });
  let last = null;
  for (let attempt = 0; attempt <= maxRepair; attempt++) {
    const r = await adapters.run(authored.script, folder);
    last = r;
    if (r.ok && r.produced && r.produced.length) {
      const outputs = authored.outputs && authored.outputs.length ? authored.outputs : r.produced;
      const newJob = makeJob({ task, instructions, schema, script: authored.script, outputs, model: adapters.model, provider: adapters.provider });
      newJob.status = "provisional"; // awaits the user's review (Stage 5) before it is trusted for replay
      await adapters.saveJobs(upsertJob(jobs, newJob));
      emit("done", { mode: "authored", produced: r.produced, provisional: true });
      return { ok: true, mode: "authored", produced: r.produced };
    }
    if (attempt < maxRepair) {
      emit("status", { phase: "repair", attempt: attempt + 1, error: r.error });
      authored = await adapters.author({ task, instructions, schema, fixError: r.error, prevScript: authored.script });
    }
  }
  emit("failed", { error: (last && last.error) || "no output produced" });
  return { ok: false, error: (last && last.error) || "no output produced" };
}
