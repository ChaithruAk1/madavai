// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Front-end wrapper for the bespoke spreadsheet engine. Preferred: sandboxed Worker; main-thread
// fallback if module workers aren't available. Returns { blob, issues } so callers can offer a self-repair.
import { findFormulaIssues } from "./xlsxValidate.js";
import { renderXlsxHTML } from "./xlsxPreview.js";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function runInWorker(code, timeoutMs) {
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL("./xlsxWorker.js", import.meta.url), { type: "module" }); }
    catch (e) { return reject(new Error("WORKER_INFRA: " + ((e && e.message) || e))); }
    let settled = false;
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(t); try { worker.terminate(); } catch {} fn(arg); };
    const t = setTimeout(() => finish(reject, new Error("spreadsheet build timed out")), timeoutMs);
    worker.onmessage = (e) => { const d = e.data || {}; if (d.ok && d.buf) finish(resolve, { blob: new Blob([d.buf], { type: XLSX_MIME }), issues: d.issues || [], html: d.html || "" }); else finish(reject, new Error(d.error || "spreadsheet build failed")); };
    worker.onerror = (ev) => finish(reject, new Error("WORKER_INFRA: " + ((ev && ev.message) || "worker error")));
    worker.postMessage({ code: String(code || "") });
  });
}
async function runOnMainThread(code) {
  const mod = await import("exceljs"); const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook(); wb.creator = "Madav";
  const colLetter = (n) => { let s = ""; n = Number(n) || 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || "A"; };
  const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, ""), col: colLetter };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("wb", "ExcelJS", "helpers", String(code || ""))(wb, ExcelJS, helpers);
  const issues = findFormulaIssues(wb);
  const html = renderXlsxHTML(wb);
  const buf = await wb.xlsx.writeBuffer();
  return { blob: new Blob([buf], { type: XLSX_MIME }), issues, html };
}
export async function runXlsxCode(code, { timeoutMs = 20000 } = {}) {
  try { return await runInWorker(code, timeoutMs); }
  catch (e) { const msg = String((e && e.message) || e); if (msg.startsWith("WORKER_INFRA") || /unsafe-eval|Content Security Policy|EvalError/i.test(msg)) return await runOnMainThread(code); throw e; }
}
export function xlsxNameFrom(code) {
  const m = /(?:\/\/|\/\*)\s*name:\s*([^\n*]+)/i.exec(String(code || ""));
  let n = (m ? m[1] : "").trim().replace(/[^\w .()-]/g, "_").slice(0, 60);
  if (!n) n = "spreadsheet"; if (!/\.xlsx$/i.test(n)) n += ".xlsx"; return n;
}
