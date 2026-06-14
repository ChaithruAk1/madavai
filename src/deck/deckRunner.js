// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Front-end wrapper around the sandboxed deck worker. Runs the model's pptxgenjs build script
// and resolves to a real .pptx Blob. A timeout + termination guards against a runaway script.
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function runDeckCode(code, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./deckWorker.js", import.meta.url), { type: "module" }); }
    catch (e) { return reject(new Error("deck sandbox unavailable: " + ((e && e.message) || e))); }
    const t = setTimeout(() => { try { worker.terminate(); } catch {} reject(new Error("deck build timed out")); }, timeoutMs);
    worker.onmessage = (e) => {
      clearTimeout(t); try { worker.terminate(); } catch {}
      const d = e.data || {};
      if (d.ok && d.buf) resolve(new Blob([d.buf], { type: PPTX_MIME }));
      else reject(new Error(d.error || "deck build failed"));
    };
    worker.onerror = (ev) => { clearTimeout(t); try { worker.terminate(); } catch {} reject(new Error((ev && ev.message) || "deck worker error")); };
    worker.postMessage({ code: String(code || "") });
  });
}

// Optional "// name: My Deck.pptx" hint in the script; otherwise a sensible default.
export function deckNameFrom(code) {
  const m = /(?:\/\/|\/\*)\s*name:\s*([^\n*]+)/i.exec(String(code || ""));
  let n = (m ? m[1] : "").trim().replace(/[^\w .()-]/g, "_").slice(0, 60);
  if (!n) n = "presentation";
  if (!/\.pptx$/i.test(n)) n += ".pptx";
  return n;
}
