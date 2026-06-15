// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed BESPOKE SPREADSHEET builder. Runs MODEL-WRITTEN ExcelJS code (no DOM/network), then
// validates the result (Layer 2) so broken formulas are caught before the user ever downloads.
import ExcelJS from "exceljs";
import { findFormulaIssues } from "./xlsxValidate.js";
import { renderXlsxHTML } from "./xlsxPreview.js";
import { makeKit } from "./xlsxKit.js";
import { injectCharts } from "./xlsxChart.js";
try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; } catch {}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function colLetter(n) { let s = ""; n = Number(n) || 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || "A"; }
// ExcelJS.writeBuffer() returns a Buffer/Uint8Array, NOT a raw ArrayBuffer — normalize so postMessage's
// transfer list is valid (pptxgenjs returns a true ArrayBuffer, which is why decks never hit this).
function toArrayBuffer(out) {
  if (out instanceof ArrayBuffer) return out;
  if (out && out.buffer instanceof ArrayBuffer) { const start = out.byteOffset || 0; return out.buffer.slice(start, start + out.byteLength); }
  return new Uint8Array(out).buffer;
}
self.onmessage = async (e) => {
  try {
    const wb = new ExcelJS.Workbook(); wb.creator = "Madav";
    const helpers = makeKit(ExcelJS);
    const fn = new AsyncFunction("wb", "ExcelJS", "helpers", String((e.data || {}).code || ""));
    await fn(wb, ExcelJS, helpers);
    const issues = findFormulaIssues(wb);
    const html = renderXlsxHTML(wb);
    let out = await wb.xlsx.writeBuffer();
    if (helpers._charts && helpers._charts.length) { try { out = await injectCharts(out, helpers._charts); } catch (e) {} }
    const ab = toArrayBuffer(out);
    self.postMessage({ ok: true, buf: ab, issues, html }, [ab]);
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) }); }
};
