// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sandboxed DECK BUILDER worker. Runs MODEL-WRITTEN pptxgenjs code with no DOM, no network, no
// storage. The forgiving build logic lives in deckBuild.js (shared with the main-thread fallback).
import Pptx from "pptxgenjs/dist/pptxgen.es.js";
import { buildDeck } from "./deckBuild.js";
try { self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined; self.WebSocket = undefined; self.indexedDB = undefined; } catch {}

self.onmessage = async (e) => {
  try {
    const buf = await buildDeck(Pptx, (e.data || {}).code, "arraybuffer");
    self.postMessage({ ok: true, buf }, [buf]);
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err).slice(0, 400) });
  }
};
