// src/bridge/projectEngineWeb.js — WEB adapters for the SINGLE-SOURCE project engine.
// The flow (inspect -> replay-or-author -> run -> validate -> save recipe) lives ONCE in
// core/project-runner.js; this file only provides the browser platform plumbing so the web runs the
// SAME engine desktop does: Pyodide for Python (private, free, in-browser), the web model caller for
// the one authoring step, and a caller-supplied recipe store. No folder — data files are passed in.
import { runProjectJob, INSPECT_PY } from "../../core/project-runner.js";
import { authoringPrompt, extractScript, datedName } from "../../core/project-job.js";
import { runPython } from "./pyodideRunner.js";

// Same progress wording as desktop (electron/session-manager.cjs). NOTE: mirrored, not yet shared —
// a follow-up can lift this phrase map into core so both surfaces read one copy.
function narrate(emit, phase, data) {
  let t = "";
  if (phase === "inspect") t = "Taking a look at your files…";
  else if (phase === "inspected") t = "Got your data — " + (data.count || 0) + " file(s)" + (data.files && data.files.length ? " (" + data.files.join(", ") + ")" : "") + ".";
  else if (phase === "author") t = "Building your report…";
  else if (phase === "running") t = "Crunching the numbers…";
  else if (phase === "replay") t = "Reusing the steps from last time — this should be quick…";
  else if (phase === "repair") t = "That didn't come out right — adjusting and trying again…";
  else if (phase === "stuck") t = "It keeps hitting the same snag — stopping here so you're not left waiting…";
  else if (phase === "replay_failed") t = "The saved steps did not re-run cleanly this time" + (data.detail ? " (" + data.detail + ")" : "") + " - rebuilding it...";
  else t = (data && data.reason) || "";
  if (t) emit("assistant_delta", { text: "\n• " + t });
}

// files:   [{ name, base64 }]  the project's data files (xlsx/csv) loaded into the browser sandbox.
// callModel(messages, signal) -> { text }   the web model caller (webBridge.callModel).
// loadJobs()/saveJobs(list)               persisted recipes (e.g. localStorage), so 2nd run replays.
// emit(kind, data)                        session events (assistant_delta, file_output, ...).
// Returns the engine result; produced files are also emitted as file_output cards (base64).
export async function runProjectJobWeb({ task, instructions, files, callModel, loadJobs, saveJobs, emit, signal, model, provider, onStatus }) {
  const inputFiles = (files || []).filter((f) => f && f.name).map((f) => ({ name: f.name, content: f.base64 || "", encoding: "base64" }));
  const aborted = () => !!(signal && signal.aborted);

  const adapters = {
    model, provider,
    emit: (kind, data) => { if (kind === "status") narrate(emit, data && data.phase, data || {}); },
    inspect: async () => {
      const r = await runPython(INSPECT_PY, inputFiles, onStatus);
      try { return JSON.parse(r.stdout); } catch { return []; }
    },
    loadJobs: async () => (loadJobs ? (await loadJobs()) || [] : []),
    saveJobs: async (list) => { if (saveJobs) await saveJobs(list); },
    author: async ({ task, instructions, schema, fixError, prevScript }) => {
      if (aborted()) return { script: "", outputs: [] };
      const prompt = authoringPrompt({ task, instructions, schema, fixError, prevScript });
      try {
        const out = await callModel([
          { role: "system", content: "You write ONE complete Python script. Output only a single python code block, no prose." },
          { role: "user", content: prompt },
        ], signal);
        return { script: extractScript(out && out.text), outputs: [] };
      } catch { return { script: "", outputs: [] }; }
    },
    run: async (script) => {
      if (aborted()) return { ok: false, error: "stopped", produced: [] };
      const r = await runPython(script, inputFiles, onStatus);
      // Version each produced file with a date+time stamp (parity with desktop) and surface as a card.
      const stamped = (r.files || []).map((f) => ({ name: datedName(f.name, new Date()), base64: f.base64 }));
      for (const f of stamped) emit("file_output", { name: f.name, b64: f.base64 });
      const err = stamped.length ? "" : (r.stderr ? String(r.stderr).slice(-2000) : "the script produced no output file");
      return { ok: stamped.length > 0, error: err, produced: stamped.map((f) => f.name) };
    },
  };

  return runProjectJob({ task, instructions, folder: "web" }, adapters, { signal, maxRepair: 3 });
}
