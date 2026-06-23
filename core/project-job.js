// core/project-job.js — SINGLE SOURCE for the recurring "project job" lifecycle.
// A Job is a saved, deterministic procedure for a recurring project task. It is REPLAYED
// (run the saved script, no model) when nothing structural changed, and RE-AUTHORED
// (the model writes a fresh script once, then it's reviewed) when the instructions OR the
// data SHAPE change. Pure ESM — shared by desktop and web. This module owns the decision
// logic + fingerprints; the actual inspection/execution is platform plumbing the caller does.
import { taskKeyOf } from "./recipes.js";

export const OUTPUT_DIR = "Madav Results"; // run outputs go into this subfolder of the project folder, keeping the source data clean

// Date-stamped output name so each run keeps its OWN file and NEVER overwrites a previous one.
// "Report.xlsx" + 23 Jun 2026 14:30:05 -> "Report_23062026_143005.xlsx" (date + time, so every run is unique).
// SINGLE SOURCE (desktop + web).
export function datedName(name, date = new Date(), seq = 1) {
  const s = String(name || "file");
  const dot = s.lastIndexOf(".");
  const stem = dot > 0 ? s.slice(0, dot) : s;
  const ext = dot > 0 ? s.slice(dot) : "";
  const p = (n) => String(n).padStart(2, "0");
  const dmy = `${p(date.getDate())}${p(date.getMonth() + 1)}${date.getFullYear()}`;
  const hms = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `${stem}_${dmy}_${hms}${seq > 1 ? "_" + seq : ""}${ext}`;
}

// The "base" of an output name with any trailing _DDMMYYYY (and optional _N counter) removed, so replay
// recognises today's dated file as the SAME deliverable that was saved on the previous run.
export function outputBase(name) {
  const s = String(name || "");
  const dot = s.lastIndexOf(".");
  const stem = (dot > 0 ? s.slice(0, dot) : s).replace(/_\d{8}(_\d{6})?(_\d+)?$/, "");
  const ext = dot > 0 ? s.slice(dot) : "";
  return (stem + ext).toLowerCase();
}

// Tiny stable string hash (djb2) — same input -> same short token, cross-platform.
function djb2(s) {
  let h = 5381; const str = String(s == null ? "" : s);
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// schema: [{ file, columns:[...], dtypes:{col:type} }] -> a stable signature of the DATA SHAPE
// (file names + column names; NOT the values). New rows / a new month keep the same signature;
// a renamed/added/removed column or file changes it.
export function schemaSignature(schema) {
  if (!Array.isArray(schema)) return "";
  const norm = schema
    .map((f) => ({
      file: String((f && f.file) || "").trim().toLowerCase(),
      cols: ((f && f.columns) || []).map((c) => String(c).trim().toLowerCase()).sort(),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return djb2(JSON.stringify(norm));
}

// Normalize instructions so trivial whitespace/case edits don't force a re-author, but real
// wording changes do.
export function instructionsHash(text) {
  return djb2(String(text || "").replace(/\s+/g, " ").trim().toLowerCase());
}

export function makeJob({ task, instructions, schema, script, outputs, model, provider } = {}) {
  return {
    taskKey: taskKeyOf(task || ""),
    task: task || "",
    instr: instructionsHash(instructions),
    schemaSig: schemaSignature(schema),
    script: script || null,        // the proven build script (the procedure)
    outputs: (outputs || []).slice(), // expected output file names (for validation)
    model: model || "", provider: provider || "",
    status: "active",              // "active" = trusted for replay; "provisional" = awaiting review
    createdAt: Date.now(),
  };
}

export function findJob(jobs, task) {
  const key = taskKeyOf(task || "");
  const hits = (jobs || []).filter((j) => j && j.taskKey === key && j.status !== "retired");
  return hits.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
}

// THE decision: given the saved job + the CURRENT instructions and schema, replay or re-author?
// -> { action: "replay" | "author", reason }
export function decideRun(job, currentInstructions, currentSchema) {
  if (!job || !job.script) return { action: "author", reason: "no saved procedure yet" };
  if (job.status === "provisional") return { action: "author", reason: "the saved procedure is not confirmed yet" };
  if (job.instr !== instructionsHash(currentInstructions)) return { action: "author", reason: "the instructions changed" };
  const _outs = new Set(((job && job.outputs) || []).map((x) => String(x).toLowerCase()));
  const _inputs = (currentSchema || []).filter((ff) => !_outs.has(String((ff && ff.file) || "").toLowerCase())); // ignore the report we produced last time
  if (job.schemaSig !== schemaSignature(_inputs)) return { action: "author", reason: "the data files or columns changed" };
  return { action: "replay", reason: "same task, same data shape" };
}

export function upsertJob(jobs, job) {
  const out = (jobs || []).filter((j) => j && j.taskKey !== job.taskKey);
  out.push(job);
  return out;
}

// Did the run actually produce the expected output files? produced = file names seen after the run.
// -> { ok, missing }
export function validateOutputs(job, produced) {
  const want = ((job && job.outputs) || []).map(outputBase);
  const have = new Set((produced || []).map(outputBase));
  const missing = want.filter((w) => !have.has(w));
  return { ok: want.length > 0 && missing.length === 0, missing };
}

// --- authoring prompt (SINGLE SOURCE: desktop + web ask the model for the script identically) ---
// Given the task + instructions + the already-inspected schema, ask for ONE complete script.
// The whole point: the model gets the data shape up front, so it writes the script in one shot
// instead of wandering through an inspect/calculate loop.
export function authoringPrompt({ task, instructions, schema, fixError, prevScript } = {}) {
  const files = (schema || []).map((f) => {
    if (f && f.error) return `- ${f.file}: COULD NOT READ (${f.error})`;
    const cols = ((f && f.columns) || []).join(" | ");
    const sample = ((f && f.sample) || []).slice(0, 2).map((r) => JSON.stringify(r)).join("\n      ");
    return `- ${f.file} (${f && f.rows != null ? f.rows + " rows" : "?"})\n    columns: ${cols}` + (sample ? `\n    sample rows:\n      ${sample}` : "");
  }).join("\n");
  const parts = [
    "Write ONE complete, self-contained Python script (pandas + openpyxl) to produce this deliverable. Do NOT explore or re-inspect the data — it is already inspected for you below.",
    `TASK: ${task || "(produce the deliverable)"}`,
    instructions ? `INSTRUCTIONS (follow exactly):\n${instructions}` : "",
    `DATA FILES in the current working folder — use these EXACT file and column names:\n${files || "(no data files found)"}`,
    "Requirements: read the files with pandas; compute everything the instructions require; create an output folder with os.makedirs('" + OUTPUT_DIR + "', exist_ok=True) and SAVE the finished file(s) THERE using the filename the instructions specify (e.g. df.to_excel('" + OUTPUT_DIR + "/Report.xlsx')). The saved file IS the deliverable. Output ONLY the script inside a single ```python code block — no prose before or after.",
  ];
  if (fixError) parts.push(`Your previous script FAILED with this error:\n${String(fixError).slice(0, 1500)}\n\nPrevious script:\n${String(prevScript || "").slice(0, 4000)}\n\nReturn a CORRECTED, complete script (again, ONLY the \`\`\`python block).`);
  return parts.filter(Boolean).join("\n\n");
}

// Pull the python script out of the model's reply. Handles three cases robustly so a flaky model
// can't trigger an endless repair loop:
//  1) a normal ```python ... ``` block -> the code between the fences;
//  2) a TRUNCATED reply (an opening ``` but the closing fence never arrived -- rate-limited / length-
//     capped free models do this constantly) -> salvage the code AFTER the opening fence, so the
//     runner gets real Python (which fails with a clear "unexpected EOF") instead of executing the
//     model's prose + the "```python" marker as if it were code (a useless error that just loops);
//  3) no fence at all -> the raw text (a model that emitted bare code still runs).
export function extractScript(text) {
  const s = String(text || "");
  const closed = s.match(/```(?:python|py)?\s*\n?([\s\S]*?)```/);
  if (closed) return closed[1].trim();
  const open = s.match(/```(?:python|py)?\s*\n?([\s\S]*)$/);
  if (open) return open[1].trim();
  return s.trim();
}
