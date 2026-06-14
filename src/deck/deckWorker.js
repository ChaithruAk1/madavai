// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed DECK BUILDER. Runs MODEL-WRITTEN pptxgenjs code with full layout freedom but
// no DOM, no network, no storage — a Web Worker is an opaque, isolated context. The model
// composes every slide itself (this is what matches Claude's bespoke quality); Madav just
// executes the script and returns the real .pptx bytes. pptxgenjs is DOM-free (proven in Node),
// so it runs cleanly here.
import Pptx from "pptxgenjs/dist/pptxgen.es.js";
// Harden the sandbox: model code must not reach the network or import remote scripts.
try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; self.WebSocket = undefined; self.indexedDB = undefined; } catch {}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

self.onmessage = async (e) => {
  const { code } = e.data || {};
  try {
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in (16:9)
    try { pptx.author = "Madav"; pptx.company = "Madav"; } catch {}
    const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, "") };
    // The model's script receives the live instance + enums. It must NOT call write/writeFile.
    const fn = new AsyncFunction("pptx", "helpers", "ShapeType", "ChartType", String(code || ""));
    await fn(pptx, helpers, pptx.ShapeType, pptx.ChartType);
    const buf = await pptx.write({ outputType: "arraybuffer" });
    self.postMessage({ ok: true, buf }, [buf]);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) });
  }
};
