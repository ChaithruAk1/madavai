// electron/projectEngineDeterministic.cjs — DESKTOP deterministic Projects engine (flag-guarded).
// The model emits ONLY a schema-validated PLAN — never code. Ingest, compute and authoring are
// deterministic (single source: @madav/documents), so ANY model, even weak, runs a complex-Excel
// project reliably. NEW file; the legacy _projectTurn path stays as fallback. Imports the BUILT
// package (ESM) from the Electron main process by path — requires `node scripts/verify-packages.mjs`.
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "packages", "documents", "dist", "src");
const imp = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

function stampName(name) {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : "";
  return `${stem}_${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ext}`;
}

// emit: ({ kind, data }) — session-manager's shape.  askModel(prompt) -> Promise<string>.
// Returns the SAME shape the legacy runProjectJob does ({ ok, mode, produced, error }) so the caller is unchanged.
async function runDataProjectDesktop({ task, instructions, folder, askModel, emit, signal }) {
  let runDataProject, nodeProjectAdapters;
  try {
    ({ runDataProject } = await imp("index.js"));
    ({ nodeProjectAdapters } = await imp("project/node.js"));
  } catch (e) {
    return { ok: false, mode: "authored", produced: [], error: "deterministic engine not built — run: node scripts/verify-packages.mjs  (" + ((e && e.message) || e) + ")" };
  }
  const narrate = (phase) => {
    const t = phase === "ingest" ? "Reading your files…" : phase === "plan" ? "Working out the steps…"
      : phase === "replan" ? "Adjusting the plan…" : phase === "author" ? "Building your report…" : "";
    if (t && emit) emit({ kind: "assistant_delta", data: { text: "\n• " + t } });
  };
  const base = nodeProjectAdapters(
    async (prompt) => (signal && signal.aborted ? "" : await askModel(prompt)),
    { outputSubdir: "Madav Results" },
  );
  const adapters = Object.assign({}, base, { emit: (kind, data) => { if (kind === "status") narrate(data && data.phase); } });
  const fullTask = instructions ? `${task}\n\nDetails: ${instructions}` : task;
  const res = await runDataProject({ task: fullTask, folder, outputName: stampName("Result.xlsx") }, adapters, { maxRepair: 2 });
  return {
    ok: !!res.ok,
    mode: "authored",
    produced: res.ok && res.output ? [res.output] : [],
    error: res.ok ? "" : (res.issues || []).map((i) => i.message).join("; "),
  };
}

module.exports = { runDataProjectDesktop };
