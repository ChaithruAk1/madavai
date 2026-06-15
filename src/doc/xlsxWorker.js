// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed BESPOKE SPREADSHEET builder. Runs MODEL-WRITTEN ExcelJS code (no DOM/network), then
// validates the result (Layer 2) so broken formulas are caught before the user ever downloads.
import ExcelJS from "exceljs";
import { findFormulaIssues } from "./xlsxValidate.js";
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
    const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, ""), col: colLetter };
    const fn = new AsyncFunction("wb", "ExcelJS", "helpers", String((e.data || {}).code || ""));
    await fn(wb, ExcelJS, helpers);
    const issues = findFormulaIssues(wb);
    const ab = toArrayBuffer(await wb.xlsx.writeBuffer());
    self.postMessage({ ok: true, buf: ab, issues }, [ab]);
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) }); }
};
