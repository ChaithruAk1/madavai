// src/bridge/deepResearch.js — pure orchestration for the web `deep_research` tool (Phase 2).
// Desktop has research.cjs; web previously had only a single web_search. The model calls
// deep_research(query[, queries]); we run SEVERAL web searches over the existing /proxy/fetch search
// primitive and return one compact, cited digest for the model to synthesize. Pure + injectable (the
// actual search fn is passed in by webBridge), so it unit-tests with no network and no side effects.

const clean = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

// Decide which search terms to run: the model's decomposition if given, else the query + a few angles.
// Deduped (case-insensitive), original query always included, capped.
export function planSearches(query, queries, max = 5) {
  const out = [], seen = new Set();
  const add = (t) => { const c = clean(t); const k = c.toLowerCase(); if (c && !seen.has(k)) { seen.add(k); out.push(c); } };
  if (Array.isArray(queries)) queries.forEach(add);
  add(query);
  if (out.length < 3 && clean(query)) {
    add(clean(query) + " overview");
    add(clean(query) + " latest");
    add(clean(query) + " pros and cons");
  }
  return out.slice(0, Math.max(1, max));
}

// Build the digest returned to the model. results: [{ term, text }]. Caps per-source + total length.
export function assembleDigest(query, results, { perCap = 1500, totalCap = 8000 } = {}) {
  const parts = []; let used = 0;
  for (const r of results || []) {
    const body = clean(r && r.text).slice(0, perCap);
    if (!body) continue;
    const block = `### ${clean(r.term)}\n${body}`;
    if (used + block.length > totalCap) break;
    parts.push(block); used += block.length;
  }
  if (!parts.length) return `No web results found for: ${clean(query)}`;
  const head = `Research digest for: ${clean(query)}\n(${parts.length} source set${parts.length === 1 ? "" : "s"}; synthesize an answer and cite where each fact came from.)`;
  return head + "\n\n" + parts.join("\n\n");
}

// Orchestrate: run searchFn for each planned term (in parallel), assemble the digest. searchFn(term) ->
// Promise<string>. A failing search degrades to empty (dropped from the digest), never throws the whole run.
export async function runDeepResearch({ query, queries }, searchFn, opts = {}) {
  const terms = planSearches(query, queries, opts.max || 5);
  const results = await Promise.all(terms.map(async (term) => {
    try { return { term, text: await searchFn(term) }; } catch { return { term, text: "" }; }
  }));
  return assembleDigest(query, results, opts);
}
