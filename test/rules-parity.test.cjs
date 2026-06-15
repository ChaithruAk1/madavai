// Renderer copy (src/office.js) must stay byte-identical to the authoritative shared/office-rules.cjs.
const fs = require("fs"), assert = require("assert");
const grab = (src, startRe, endMarker) => { const i = src.search(startRe); const j = src.indexOf(endMarker, i); return src.slice(i, j).trim(); };
const sh = fs.readFileSync(__dirname + "/../shared/office-rules.cjs", "utf8");
const of = fs.readFileSync(__dirname + "/../src/office.js", "utf8");
// normalize: drop the `export ` prefix the renderer adds, compare the declarations
const shBlock = sh.slice(sh.search(/function isDeckCapable/), sh.indexOf("module.exports")).trim();
const ofBlock = grab(of, /export function isDeckCapable/, "// ---- ").replace(/^export /gm, "").replace(/\bexport (function|const) /g, "$1 ").trim();
const norm = (s) => s.replace(/\bexport\s+/g, "").replace(/\s+/g, " ").trim();
assert.strictEqual(norm(ofBlock), norm(shBlock), "RULE DRIFT between src/office.js and shared/office-rules.cjs");
console.log("PARITY OK — renderer rule text identical to shared/office-rules.cjs (" + shBlock.length + " chars)");
