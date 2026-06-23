// core/projects/context.js — SINGLE SOURCE for assembling a project's KNOWLEDGE into model context.
// ESM. Consumed by BOTH surfaces (ADR-0001 single-source): the web renderer imports it (via the
// src/bridge/ragLite.js re-export shim, used by webBridge.systemPrompt) and desktop (CJS) consumes it
// from electron/projects-store.cjs via a cached dynamic import(). Lexical chunk + keyword-overlap
// ranking — no embeddings. Pure -> unit-tested. Small knowledge -> whole docs (unchanged); large ->
// ranked excerpts within a char budget. Moved verbatim from the former src/bridge/ragLite.js so there
// is exactly ONE copy.

const STOP = new Set("the a an and or of to in for on with is are was were be been it this that as at by from your you our we".split(" "));
const norm = (s) => String(s == null ? "" : s);
const terms = (q) => Array.from(new Set((norm(q).toLowerCase().match(/[a-z0-9]{3,}/g) || []))).filter((t) => !STOP.has(t));

// Split a doc into ~size-char passages on blank-line boundaries (hard-splitting any giant paragraph).
export function chunkText(text, size = 700) {
  const t = norm(text).trim(); if (!t) return [];
  const out = []; let buf = "";
  for (const para of t.split(/\n\s*\n/)) {
    if (para.length > size) {
      if (buf) { out.push(buf.trim()); buf = ""; }
      for (let i = 0; i < para.length; i += size) out.push(para.slice(i, i + size).trim());
      continue;
    }
    if ((buf + "\n\n" + para).length > size && buf) { out.push(buf.trim()); buf = ""; }
    buf = buf ? buf + "\n\n" + para : para;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

const scoreChunk = (qterms, chunk) => {
  if (!qterms.length) return 0;
  const lc = chunk.toLowerCase(); let score = 0;
  for (const t of qterms) { const m = lc.split(t).length - 1; if (m) score += 1 + Math.min(m - 1, 3) * 0.25; }
  return score;
};

// Rank passages across docs by relevance to `query`; best-first. Returns [{ name, text, score }].
export function selectRelevant(query, docs, { chunkSize = 700, topK = 20 } = {}) {
  const qterms = terms(query);
  const scored = [];
  for (const d of docs || []) for (const text of chunkText(d.content, chunkSize)) {
    scored.push({ name: d.name || "knowledge", text, score: scoreChunk(qterms, text), ord: scored.length });
  }
  scored.sort((a, b) => (b.score - a.score) || (a.ord - b.ord));
  return scored.slice(0, topK);
}

// Build the knowledge context for the system prompt. Small knowledge -> whole docs (unchanged). Large ->
// ranked excerpts within a char budget. No real docs -> "".
export function buildKnowledgeContext(query, docs, { budget = 6000, chunkSize = 700 } = {}) {
  const real = (docs || []).filter((d) => d && norm(d.content).trim());
  if (!real.length) return "";
  const total = real.reduce((n, d) => n + d.content.length, 0);
  if (total <= budget) return real.map((d) => `# ${d.name}\n${d.content}`).join("\n\n"); // unchanged path
  const qhas = terms(query).length > 0;
  const ranked = selectRelevant(query, real, { chunkSize });
  const picked = []; let used = 0;
  for (const r of ranked) {
    if (qhas && r.score === 0) continue;                       // with a query, skip irrelevant passages
    const block = `# ${r.name}\n${r.text}`;
    if (picked.length && used + block.length > budget) break;  // always keep at least one
    picked.push(block); used += block.length;
  }
  if (!picked.length) picked.push(`# ${ranked[0].name}\n${ranked[0].text}`);
  const head = qhas
    ? "Relevant excerpts from this project's knowledge (cite the source name when you use them):"
    : "Excerpts from this project's knowledge (truncated to fit; cite the source name):";
  return head + "\n\n" + picked.join("\n\n");
}
