// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Front-end wrapper for the bespoke PDF engine. Sandboxed Worker preferred; main-thread fallback.
const PDF_MIME = "application/pdf";
function runInWorker(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./pdfWorker.js", import.meta.url), { type: "module" }); }
    catch (e) { return reject(new Error("WORKER_INFRA: " + ((e && e.message) || e))); }
    let settled = false;
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(t); try { worker.terminate(); } catch {} fn(arg); };
    const t = setTimeout(() => finish(reject, new Error("PDF build timed out")), timeoutMs);
    worker.onmessage = (e) => { const d = e.data || {}; if (d.ok && d.buf) finish(resolve, { blob: new Blob([d.buf], { type: PDF_MIME }), issues: d.issues || [] }); else finish(reject, new Error(d.error || "PDF build failed")); };
    worker.onerror = (ev) => finish(reject, new Error("WORKER_INFRA: " + ((ev && ev.message) || "worker error")));
    worker.postMessage({ code: String(code || "") });
  });
}
async function runOnMainThread(code) {
  const mod = await import("jspdf"); const jsPDF = mod.jsPDF || mod.default;
  const seen = [];
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const orig = doc.text.bind(doc);
  doc.text = function (txt, ...rest) { try { if (Array.isArray(txt)) txt.forEach((t) => { if (t != null) seen.push(String(t)); }); else if (txt != null) seen.push(String(txt)); } catch {} return orig(txt, ...rest); };
  const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, "") };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("doc", "jsPDF", "helpers", String(code || ""))(doc, jsPDF, helpers);
  const issues = []; const j = seen.join("  ");
  if (/\[object Object\]/.test(j)) issues.push({ sheet: "text", cell: "—", formula: "[object Object] appears in the PDF text" });
  if (/\bNaN\b/.test(j)) issues.push({ sheet: "text", cell: "—", formula: "NaN appears in the PDF text" });
  if (!seen.length) issues.push({ sheet: "doc", cell: "—", formula: "the PDF has no text" });
  return { blob: new Blob([doc.output("arraybuffer")], { type: PDF_MIME }), issues };
}
export async function runPdfCode(code, { timeoutMs = 20000 } = {}) {
  try { return await runInWorker(code, timeoutMs); }
  catch (e) { const msg = String((e && e.message) || e); if (msg.startsWith("WORKER_INFRA")) return await runOnMainThread(code); throw e; }
}
export function pdfNameFrom(code) {
  const m = /(?:\/\/|\/\*)\s*name:\s*([^\n*]+)/i.exec(String(code || ""));
  let n = (m ? m[1] : "").trim().replace(/[^\w .()-]/g, "_").slice(0, 60);
  if (!n) n = "document"; if (!/\.pdf$/i.test(n)) n += ".pdf"; return n;
}
