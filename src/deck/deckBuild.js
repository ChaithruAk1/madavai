// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Shared, forgiving deck builder. Wraps the model's free-form pptxgenjs script in a sandbox tuned so
// even a WEAK model (imperfect code) still gets a real deck:
//   • addSlide is hooked to count slides actually produced
//   • write/writeFile are neutralized (Madav writes — the model calling them is harmless)
//   • stray markdown fences and import/require lines are stripped
//   • if the script throws PARTWAY, we still return the slides built so far (a partial deck beats an error)
// Only a script that produces ZERO slides is treated as a failure.
import { icon } from "./deckIcons.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function sanitize(code) {
  let c = String(code || "");
  c = c.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n```\s*$/i, "");           // un-double-wrap a nested fence
  c = c.replace(/^\s*(?:import|export)\s.*$/gm, "");                            // ESM imports won't resolve in the sandbox
  c = c.replace(/^\s*(?:const|let|var)\s+\w+\s*=\s*require\([^)]*\)\s*;?\s*$/gm, ""); // nor require()
  return c;
}

export async function buildDeck(Pptx, code, outputType) {
  const pptx = new Pptx();
  pptx.layout = "LAYOUT_WIDE";
  try { pptx.author = "Madav"; pptx.company = "Madav"; } catch {}
  let added = 0;
  const origAdd = pptx.addSlide.bind(pptx);
  pptx.addSlide = (...a) => { added++; return origAdd(...a); };
  const realWrite = pptx.write.bind(pptx);
  pptx.write = async () => {};       // model calling write/writeFile is a no-op; Madav does the real write
  pptx.writeFile = async () => "";
  const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, ""), icon };
  let runErr = null;
  try {
    const fn = new AsyncFunction("pptx", "helpers", "ShapeType", "ChartType", sanitize(code));
    await fn(pptx, helpers, pptx.ShapeType, pptx.ChartType);
  } catch (e) { runErr = e; }        // swallow — we still try to emit whatever slides exist
  if (!added) throw new Error(runErr ? ("deck script error: " + ((runErr && runErr.message) || runErr)) : "deck script produced no slides");
  return await realWrite({ outputType });
}
