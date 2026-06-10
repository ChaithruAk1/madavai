// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// RAG-lite knowledge retrieval — no embeddings, no external index. When an agent's
// knowledge is small it is included whole (exactly the old behavior). When it grows
// past the prompt budget, docs are split into heading/paragraph chunks and only the
// passages most relevant to the current task are injected. This lifts the practical
// cap from "a few files" to "a whole folder of docs" without a vector store.

const STOP = new Set(["the", "a", "an", "and", "or", "but", "for", "with", "this", "that", "from", "into", "your", "you", "are", "was", "were", "have", "has", "had", "will", "would", "should", "could", "can", "not", "all", "any", "what", "when", "how", "why", "who", "its", "it's", "their", "them", "they", "then", "than", "also", "about", "over", "under", "more", "most", "some", "such", "only", "very", "just", "been", "being", "does", "did", "each", "which", "while", "where", "there", "here", "these", "those", "please", "make", "give", "write", "want", "need", "use", "using"]);

function terms(query) {
  return [...new Set(String(query || "").toLowerCase().match(/[a-z0-9][a-z0-9._-]{2,}/g) || [])]
    .filter((t) => !STOP.has(t))
    .slice(0, 40);
}

// Split one document into ~1,600-char chunks along headings / paragraph boundaries.
function chunkDoc(name, content) {
  const text = String(content || "");
  const parts = text.split(/\n(?=#{1,6}\s)|\n\s*\n/);
  const chunks = [];
  let buf = "";
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); buf = ""; };
  for (let p of parts) {
    // A single oversized part is sliced hard so nothing is ever lost.
    while (p.length > 3200) { flush(); chunks.push(p.slice(0, 1600)); p = p.slice(1600); }
    if ((buf.length + p.length) > 1600 && buf) flush();
    buf += (buf ? "\n\n" : "") + p;
  }
  flush();
  return chunks.map((c, i) => ({ doc: name, i, text: c }));
}

function scoreChunk(chunk, qTerms) {
  if (!qTerms.length) return 0;
  const low = chunk.text.toLowerCase();
  let s = 0;
  for (const t of qTerms) {
    let idx = low.indexOf(t), hits = 0;
    while (idx >= 0 && hits < 5) { hits++; idx = low.indexOf(t, idx + t.length); }
    if (hits) s += 2 + hits; // presence matters more than repetition
  }
  return s;
}

/**
 * Build the knowledge block for a system prompt.
 * @param {Array<{name, content}>} docs   the agent's knowledge files
 * @param {string} query                  the current task text (used for relevance)
 * @param {number} budget                 max characters of knowledge to inject
 * @returns {string}                      "" when no docs
 */
function knowledgeBlock(docs, query, budget = 60000) {
  const list = (Array.isArray(docs) ? docs : []).filter((d) => d && (d.content || "").trim()).slice(0, 24);
  if (!list.length) return "";
  const total = list.reduce((n, d) => n + String(d.content || "").length, 0);

  // Small library → include everything verbatim (old behavior, zero relevance risk).
  if (total <= budget) {
    return "\n\nAgent knowledge — reference material this agent always has (cite it when relevant):\n" +
      list.map((k) => `--- ${k.name || "doc"} ---\n${String(k.content || "").slice(0, 30000)}`).join("\n\n");
  }

  // Large library → retrieve the most relevant passages for THIS task.
  const qTerms = terms(query);
  let all = [];
  for (const d of list) all = all.concat(chunkDoc(d.name || "doc", d.content));
  const ranked = all
    .map((c) => ({ ...c, score: scoreChunk(c, qTerms) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const picked = [];
  let used = 0;
  for (const c of ranked) {
    if (used + c.text.length > budget) continue;
    if (c.score <= 0 && picked.length >= 6) break; // after the top picks, skip irrelevant filler
    picked.push(c); used += c.text.length;
    if (picked.length >= 18) break;
  }
  // Nothing matched (e.g. greeting) → lead of each doc so the agent still knows what it has.
  if (!picked.length) {
    for (const d of list) {
      const lead = String(d.content || "").slice(0, Math.floor(budget / list.length));
      picked.push({ doc: d.name || "doc", i: 0, text: lead });
    }
  }
  picked.sort((a, b) => (a.doc === b.doc ? a.i - b.i : 0)); // keep in-doc reading order
  const names = list.map((d) => d.name || "doc").join(", ");
  return `\n\nAgent knowledge — the most relevant passages were retrieved for this task from: ${names} (cite them when relevant):\n` +
    picked.map((c) => `--- ${c.doc} (excerpt) ---\n${c.text}`).join("\n\n");
}

module.exports = { knowledgeBlock, chunkDoc, terms };
