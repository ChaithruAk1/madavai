// src/bridge/projectEngineDeterministic.js — the DETERMINISTIC project engine (deterministic, model-out-of-parser stability).
// The model emits ONLY a schema-validated plan — never code. Ingest, compute and authoring are
// deterministic (single source: @madav/documents), so ANY model, even a weak one, runs a complex-Excel
// project reliably. Drop-in alternative to runProjectJobWeb; the UI and file-output cards are unchanged.
import { runDataProject } from "@madav/documents";

const b64ToBytes = (b64) => Uint8Array.from(atob(b64 || ""), (c) => c.charCodeAt(0));
function bytesToB64(bytes) {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function narrate(emit, phase) {
  const t = phase === "ingest" ? "Reading your files…" : phase === "plan" ? "Working out the steps…"
    : phase === "replan" ? "Adjusting the plan…" : phase === "author" ? "Building your spreadsheet…" : "";
  if (t) emit("assistant_delta", { text: "\n• " + t });
}

// Same call shape as runProjectJobWeb, so webBridge can route to either behind a flag.
export async function runDataProjectWeb({ task, instructions, files, callModel, emit, signal }) {
  const adapters = {
    listFiles: async () => (files || []).filter((f) => f && f.name).map((f) => {
      const n = f.name.toLowerCase(); const bytes = b64ToBytes(f.base64);
      return n.endsWith(".csv") ? { name: f.name, text: new TextDecoder().decode(bytes) } : { name: f.name, bytes };
    }),
    askModel: async (prompt) => {
      const out = await callModel([
        { role: "system", content: "Output ONLY a JSON plan. No prose, no markdown, no code." },
        { role: "user", content: prompt },
      ], signal);
      return (out && out.text) || "";
    },
    saveOutput: async (_folder, name, bytes) => emit("file_output", { name, b64: bytesToB64(bytes) }),
    emit: (kind, data) => { if (kind === "status") narrate(emit, data && data.phase); },
  };
  const fullTask = instructions ? `${task}\n\nDetails: ${instructions}` : task;
  return runDataProject({ task: fullTask, folder: "web", outputName: "Result.xlsx" }, adapters, { maxRepair: 2 });
}
