// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop RAG adapter — bridges the shared @madav/knowledge engine (built dist, ESM) into the Electron
// main process. Scans a project folder's text docs, ingests them with the LOCAL embedder + in-memory
// store (NO embeddings API needed), and returns a prompt-ready context block for the current query.
// Self-contained + flag-guarded at the call site; requires `node scripts/verify-packages.mjs` once.
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const DIST = path.join(__dirname, "..", "packages", "knowledge", "dist", "src");
const imp = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".text", ".csv", ".tsv", ".json", ".log", ".yml", ".yaml"]);

/** Read a folder's text documents (depth<=2), skipping the output subdir + dotfiles, with sane caps. */
function readFolderDocs(folder, { maxFiles = 60, maxBytes = 2000000 } = {}) {
  const docs = [];
  const walk = (dir, depth) => {
    if (depth > 2 || docs.length >= maxFiles) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (docs.length >= maxFiles) break;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "Madav Results" && !e.name.startsWith(".")) walk(full, depth + 1); }
      else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) {
        try { if (fs.statSync(full).size <= maxBytes) docs.push({ id: path.relative(folder, full) || e.name, text: fs.readFileSync(full, "utf8") }); } catch {}
      }
    }
  };
  if (folder) walk(folder, 0);
  return docs;
}

/**
 * Build a prompt-ready context block from a project folder's text docs for the given query.
 * Returns { text, used } ("" when there are no docs / no match, so the caller can skip injection).
 */
async function buildProjectContext({ folder, query, k = 6, maxChars = 4000 } = {}) {
  if (!folder || !query) return { text: "", used: [] };
  let mod;
  try { mod = await imp("index.js"); }
  catch (e) { return { text: "", used: [], error: "knowledge engine not built — run: node scripts/verify-packages.mjs (" + ((e && e.message) || e) + ")" }; }
  const docs = readFolderDocs(folder);
  if (!docs.length) return { text: "", used: [] };
  const embed = mod.createLocalEmbedder(256);
  const store = new mod.MemoryKnowledgeStore();
  await mod.ingestDocs(docs, { embed, store });
  return mod.buildContext(query, { embed, store }, { k, maxChars });
}

module.exports = { buildProjectContext, readFolderDocs };
