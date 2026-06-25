import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Ports the orphaned test/rules-parity.test.cjs into the LIVE vitest gate (MEMORY pending #4):
// the renderer copy of the office rule (src/office.js) must stay byte-identical (modulo `export`
// and whitespace) to the authoritative shared/office-rules.cjs.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sh = fs.readFileSync(path.join(root, "shared/office-rules.cjs"), "utf8");
const of = fs.readFileSync(path.join(root, "src/office.js"), "utf8");
const co = fs.readFileSync(path.join(root, "core/office-rules.js"), "utf8"); // third copy (ESM, web-bundled via chat-loop/model-fit) — guard it too

const grab = (src, startRe, endMarker) => {
  const i = src.search(startRe);
  const j = src.indexOf(endMarker, i);
  return src.slice(i, j).trim();
};
const shBlock = sh.slice(sh.search(/function isDeckCapable/), sh.indexOf("module.exports")).trim();
const ofBlock = grab(of, /export function isDeckCapable/, "// ---- ")
  .replace(/^export /gm, "")
  .replace(/\bexport (function|const) /g, "$1 ")
  .trim();
const coBlock = co.slice(co.search(/export function isDeckCapable/)).trim();
const norm = (s) => s.replace(/\bexport\s+/g, "").replace(/\s+/g, " ").trim();

describe("office-rules single-source parity", () => {
  it("both rule blocks are found", () => {
    expect(shBlock.length).toBeGreaterThan(0);
    expect(ofBlock.length).toBeGreaterThan(0);
  });
  it("renderer copy matches the authoritative shared module", () => {
    expect(norm(ofBlock)).toBe(norm(shBlock));
  });
  it("core ESM copy (core/office-rules.js) matches the authoritative shared module", () => {
    expect(coBlock.length).toBeGreaterThan(0);
    expect(norm(coBlock)).toBe(norm(shBlock));
  });
});
