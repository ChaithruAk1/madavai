#!/usr/bin/env node
// Assert the production build emitted all four bespoke-engine worker chunks.
// CLAUDE.md requires xlsxWorker / docxWorker / pdfWorker / deckWorker to bundle; a partial
// build (e.g. the obfuscator stage not finishing) silently drops some. Run after `vite build`.
//   usage: node scripts/check-worker-chunks.mjs [distDir=dist]
import fs from "fs";
import path from "path";

const dist = process.argv[2] || "dist";
const assetsDir = path.join(dist, "assets");
const need = ["xlsxWorker", "docxWorker", "pdfWorker", "deckWorker"];

let files;
try {
  files = fs.readdirSync(assetsDir);
} catch {
  console.error(`[check-worker-chunks] no ${assetsDir} — run \`vite build\` first.`);
  process.exit(2);
}

const missing = need.filter((n) => !files.some((f) => f.includes(n) && f.endsWith(".js")));
if (missing.length) {
  console.error("[check-worker-chunks] MISSING worker chunks: " + missing.join(", "));
  process.exit(1);
}
console.log("[check-worker-chunks] OK — all 4 worker chunks present: " + need.join(", "));
