import { config } from "./config.js";
import type { SearchOptions, SearchResponse, SearchResultItem } from "./types.js";
import { serperSearch, type Candidate } from "./serper.js";
import { freeSearch } from "./free.js";
import { fetchAndExtractMany } from "./extract.js";
import { chunkText, scoreChunks, rerankTexts } from "./rank.js";
import { generateAnswer } from "./answer.js";
import * as budget from "./budget.js";
import * as cache from "./cache.js";

function domainOk(url: string, inc?: string[], exc?: string[]): boolean {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  if (inc?.length && !inc.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()))) return false;
  if (exc?.length && exc.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()))) return false;
  return true;
}

async function retrieve(query: string, opts: SearchOptions): Promise<Candidate[]> {
  const canPay = config.serpStrategy !== "off" && !!config.serpApiKey && (await budget.canSpend(config.serpCostPerQuery));
  if (canPay) {
    const paid = await serperSearch(query, opts);
    if (paid.length) { await budget.recordPaid(config.serpCostPerQuery); return paid; }
  }
  const free = await freeSearch(query, opts);
  await budget.recordFree();
  return free;
}

export async function search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
  const t0 = Date.now();
  const cacheKey = { query, ...opts };
  const hit = await cache.cacheGet<SearchResponse>(cacheKey);
  if (hit) return hit;

  const candidates = await retrieve(query, opts);

  const seen = new Set<string>();
  const filtered: Candidate[] = [];
  for (const c of candidates) {
    if (!c.url || seen.has(c.url)) continue;
    if (!domainOk(c.url, opts.includeDomains, opts.excludeDomains)) continue;
    seen.add(c.url);
    filtered.push(c);
  }
  const top = filtered.slice(0, Math.max(opts.maxResults ?? 5, 1));

  const deep = opts.searchDepth === "advanced";
  const needRaw = !!opts.includeRawContent;
  let extracted = new Map<string, string | null>();
  if (deep || needRaw || opts.includeAnswer) extracted = await fetchAndExtractMany(top.map((c) => c.url));

  // Build per-result content (advanced: best chunks via fast lexical pre-select; basic: snippet)
  const results: SearchResultItem[] = [];
  const answerCtx: string[] = [];
  for (const c of top) {
    const raw = extracted.get(c.url) ?? null;
    let content = c.content;
    if (deep && raw) {
      const chunks = chunkText(raw, 500);
      const scores = scoreChunks(query, chunks);
      const ranked = chunks.map((ch, i) => [ch, scores[i]] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      content = ranked.length ? ranked.map((r) => r[0]).join(" [...] ") : c.content;
    }
    results.push({ title: c.title, url: c.url, content, score: 0, rawContent: needRaw ? raw : null });
    if (raw) answerCtx.push(content);
  }

  // FINAL relevance ordering via the reranker (embeddings/Cohere; lexical fallback).
  if (results.length) {
    const scores = await rerankTexts(query, results.map((r) => r.content));
    results.forEach((r, i) => { r.score = +Number(scores[i] ?? 0).toFixed(6); });
    results.sort((a, b) => b.score - a.score);
  }

  let answer: string | null = null;
  if (opts.includeAnswer) answer = await generateAnswer(query, (answerCtx.length ? answerCtx : results.map((r) => r.content)).slice(0, 6), false);

  const resp: SearchResponse = { query, answer, results, responseTime: +((Date.now() - t0) / 1000).toFixed(3) };
  await cache.cacheSet(cacheKey, resp);
  return resp;
}
