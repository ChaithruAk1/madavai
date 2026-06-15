// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Front-end wrapper for the bespoke Word engine. Sandboxed Worker preferred; main-thread fallback.
// Returns { blob, issues } so the card can offer one self-repair (Layer 3).
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function runInWorker(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./docxWorker.js", import.meta.url), { type: "module" }); }
    catch (e) { return reject(new Error("WORKER_INFRA: " + ((e && e.message) || e))); }
    let settled = false;
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(t); try { worker.terminate(); } catch {} fn(arg); };
    const t = setTimeout(() => finish(reject, new Error("document build timed out")), timeoutMs);
    worker.onmessage = (e) => { const d = e.data || {}; if (d.ok && d.buf) finish(resolve, { blob: new Blob([d.buf], { type: DOCX_MIME }), issues: d.issues || [] }); else finish(reject, new Error(d.error || "document build failed")); };
    worker.onerror = (ev) => finish(reject, new Error("WORKER_INFRA: " + ((ev && ev.message) || "worker error")));
    worker.postMessage({ code: String(code || "") });
  });
}
async function runOnMainThread(code) {
  const docx = await import("docx");
  const seen = [];
  const rec = (t) => { if (t != null) seen.push(String(t)); };
  const wrap = (Orig, pick) => function (...a) { try { pick(a[0]); } catch {} return new Orig(...a); };
  const proxy = new Proxy(docx, { get(t, k) {
    if (k === "TextRun") return wrap(t.TextRun, (o) => { if (typeof o === "string") rec(o); else if (o && o.text != null) rec(o.text); });
    if (k === "Paragraph") return wrap(t.Paragraph, (o) => { if (o && o.text != null) rec(o.text); });
    return t[k];
  }});
  const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, "") };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const doc = await new AsyncFunction("docx", "helpers", String(code || ""))(proxy, helpers);
  if (!doc) throw new Error("the docx code must `return new docx.Document({...})`");
  const issues = [];
  if (/\[object Object\]/.test(seen.join(" "))) issues.push({ sheet: "text", cell: "—", formula: "[object Object] appears in the document text" });
  if (!seen.length) issues.push({ sheet: "doc", cell: "—", formula: "the document has no text" });
  const blob = await docx.Packer.toBlob(doc);
  return { blob, issues };
}
export async function runDocxCode(code, { timeoutMs = 20000 } = {}) {
  try { return await runInWorker(code, timeoutMs); }
  catch (e) { const msg = String((e && e.message) || e); if (msg.startsWith("WORKER_INFRA")) return await runOnMainThread(code); throw e; }
}
export function docxNameFrom(code) {
  const m = /(?:\/\/|\/\*)\s*name:\s*([^\n*]+)/i.exec(String(code || ""));
  let n = (m ? m[1] : "").trim().replace(/[^\w .()-]/g, "_").slice(0, 60);
  if (!n) n = "document"; if (!/\.docx$/i.test(n)) n += ".docx"; return n;
}
