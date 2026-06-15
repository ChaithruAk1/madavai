// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Front-end wrapper around the deck engine. Preferred path: a sandboxed Web Worker (no DOM, no
// network). If a Worker can't be constructed or errors at the INFRASTRUCTURE level (some Electron /
// renderer setups don't allow module workers), we fall back to running the script on the main
// thread — the deck still builds. A genuine bug in the model's script is surfaced, not retried.
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function runInWorker(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./deckWorker.js", import.meta.url), { type: "module" }); }
    catch (e) { return reject(new Error("WORKER_INFRA: " + ((e && e.message) || e))); }
    let settled = false;
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(t); try { worker.terminate(); } catch {} fn(arg); };
    const t = setTimeout(() => finish(reject, new Error("deck build timed out")), timeoutMs);
    worker.onmessage = (e) => {
      const d = e.data || {};
      if (d.ok && d.buf) finish(resolve, { blob: new Blob([d.buf], { type: PPTX_MIME }), issues: d.issues || [] });
      else finish(reject, new Error(d.error || "deck build failed")); // code-level error from the script
    };
    worker.onerror = (ev) => finish(reject, new Error("WORKER_INFRA: " + ((ev && ev.message) || "worker error")));
    worker.postMessage({ code: String(code || "") });
  });
}

async function runOnMainThread(code) {
  const mod = await import("pptxgenjs/dist/pptxgen.es.js");
  const Pptx = mod.default || mod;
  const { buildDeck } = await import("./deckBuild.js");
  const { buf, issues } = await buildDeck(Pptx, code, "blob"); return { blob: buf, issues }; // same forgiving builder as the worker
}

export async function runDeckCode(code, { timeoutMs = 20000 } = {}) {
  try {
    return await runInWorker(code, timeoutMs);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg.startsWith("WORKER_INFRA") || /unsafe-eval|Content Security Policy|EvalError/i.test(msg)) {
      // Sandbox unavailable in this runtime — build on the main thread instead.
      return await runOnMainThread(code);
    }
    throw e; // genuine script error or timeout — let the card show it
  }
}

// Optional "// name: My Deck.pptx" hint in the script; otherwise a sensible default.
export function deckNameFrom(code) {
  const m = /(?:\/\/|\/\*)\s*name:\s*([^\n*]+)/i.exec(String(code || ""));
  let n = (m ? m[1] : "").trim().replace(/[^\w .()-]/g, "_").slice(0, 60);
  if (!n) n = "presentation";
  if (!/\.pptx$/i.test(n)) n += ".pptx";
  return n;
}
