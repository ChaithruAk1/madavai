// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed BESPOKE WORD builder. Runs MODEL-WRITTEN `docx`-library code (it returns a Document),
// validates the rendered text (Layer 2 — catches "[object Object]" / empty output from code-gen),
// then packs the real .docx bytes. No DOM/network.
import * as docx from "docx";
try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; } catch {}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function collectIssues(seen) {
  const issues = [];
  const joined = seen.join("  ");
  if (/\[object Object\]/.test(joined)) issues.push({ sheet: "text", cell: "—", formula: "[object Object] appears in the document text" });
  if (!seen.length) issues.push({ sheet: "doc", cell: "—", formula: "the document has no text" });
  return issues.slice(0, 25);
}
// A docx proxy that records the text the model emits, so we can see corruption before packing.
function instrument(seen) {
  const rec = (t) => { if (t != null) seen.push(String(t)); };
  const wrap = (Orig, pick) => function (...a) { try { pick(a[0]); } catch {} return new Orig(...a); };
  return new Proxy(docx, { get(t, k) {
    if (k === "TextRun") return wrap(t.TextRun, (o) => { if (typeof o === "string") rec(o); else if (o && o.text != null) rec(o.text); });
    if (k === "Paragraph") return wrap(t.Paragraph, (o) => { if (o && o.text != null) rec(o.text); });
    return t[k];
  }});
}
self.onmessage = async (e) => {
  const seen = [];
  try {
    const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, "") };
    const fn = new AsyncFunction("docx", "helpers", String((e.data || {}).code || ""));
    const doc = await fn(instrument(seen), helpers);
    if (!doc) throw new Error("the docx code must `return new docx.Document({...})`");
    const issues = collectIssues(seen);
    const blob = await docx.Packer.toBlob(doc);
    const buf = await blob.arrayBuffer();
    self.postMessage({ ok: true, buf, issues }, [buf]);
  } catch (err) { self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) }); }
};
