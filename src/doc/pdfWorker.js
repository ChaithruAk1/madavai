// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed BESPOKE PDF builder. Runs MODEL-WRITTEN jsPDF code (it draws on `doc`), records the text it
// draws to validate (Layer 2 — catches "[object Object]"/NaN/empty from code-gen), then outputs PDF bytes.
import { jsPDF } from "jspdf";
try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; } catch {}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function toArrayBuffer(out) {
  if (out instanceof ArrayBuffer) return out;
  if (out && out.buffer instanceof ArrayBuffer) { const s = out.byteOffset || 0; return out.buffer.slice(s, s + out.byteLength); }
  return new Uint8Array(out).buffer;
}
function issuesFor(seen) {
  const issues = []; const j = seen.join("  ");
  if (/\[object Object\]/.test(j)) issues.push({ sheet: "text", cell: "—", formula: "[object Object] appears in the PDF text" });
  if (/\bNaN\b/.test(j)) issues.push({ sheet: "text", cell: "—", formula: "NaN appears in the PDF text" });
  if (!seen.length) issues.push({ sheet: "doc", cell: "—", formula: "the PDF has no text" });
  return issues.slice(0, 25);
}
self.onmessage = async (e) => {
  const seen = [];
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const orig = doc.text.bind(doc);
    doc.text = function (txt, ...rest) { try { if (Array.isArray(txt)) txt.forEach((t) => { if (t != null) seen.push(String(t)); }); else if (txt != null) seen.push(String(txt)); } catch {} return orig(txt, ...rest); };
    const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, "") };
    const fn = new AsyncFunction("doc", "jsPDF", "helpers", String((e.data || {}).code || ""));
    await fn(doc, jsPDF, helpers);
    const issues = issuesFor(seen);
    const ab = toArrayBuffer(doc.output("arraybuffer"));
    self.postMessage({ ok: true, buf: ab, issues }, [ab]);
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) }); }
};
