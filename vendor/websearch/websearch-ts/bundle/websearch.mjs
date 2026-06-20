// src/config.ts
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
var llmKey = process.env.LLM_API_KEY ?? "";
var config = {
  // ----- PAID Google tier (Serper) -----
  serpApiKey: process.env.SERP_API_KEY ?? "",
  serpBaseUrl: process.env.SERP_BASE_URL ?? "https://google.serper.dev",
  serpCostPerQuery: num(process.env.SERP_COST_PER_QUERY, 1e-3),
  serpStrategy: process.env.SERP_STRATEGY ?? "always",
  // ----- spend limit -----
  budgetMode: process.env.BUDGET_MODE ?? "hard",
  monthlyBudgetUsd: num(process.env.MONTHLY_BUDGET_USD, 1e3),
  // ----- free fallback (after cap) -----
  searxngUrl: process.env.SEARXNG_URL ?? "",
  // ----- RERANKER (quality boost) -----
  // "openai"  -> rerank via embeddings on your existing OpenAI key (default if LLM key present)
  // "cohere"  -> Cohere Rerank API (best quality cross-encoder; needs COHERE_API_KEY)
  // "none"    -> lexical only
  rerankerProvider: process.env.RERANKER_PROVIDER ?? (llmKey ? "openai" : "none"),
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  embeddingApiKey: process.env.EMBEDDING_API_KEY ?? llmKey,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  cohereModel: process.env.COHERE_RERANK_MODEL ?? "rerank-v3.5",
  // ----- infra / misc -----
  fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 1e4),
  maxConcurrency: num(process.env.MAX_FETCH_CONCURRENCY, 8),
  llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  llmApiKey: llmKey,
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  redisUrl: process.env.REDIS_URL ?? "",
  cacheTtlSec: num(process.env.CACHE_TTL, 900)
};

// src/serper.ts
var TBS = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };
async function serperSearch(query, opts) {
  if (!config.serpApiKey) return [];
  const body = { q: query, num: Math.min(Math.max(opts.maxResults ?? 5, 1), 20) };
  if (opts.timeRange && TBS[opts.timeRange]) body.tbs = TBS[opts.timeRange];
  const path = opts.topic === "news" ? "/news" : "/search";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const r = await fetch(config.serpBaseUrl + path, {
      method: "POST",
      headers: { "X-API-KEY": config.serpApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!r.ok) return [];
    const data = await r.json();
    const items = (opts.topic === "news" ? data.news : data.organic) ?? [];
    return items.map((i) => ({ title: i.title ?? "", url: i.link ?? "", content: i.snippet ?? "" })).filter((c) => c.url);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// src/free.ts
function stripTags(s) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
async function searxng(query, opts) {
  const u = new URL(config.searxngUrl.replace(/\/$/, "") + "/search");
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  if (opts.topic === "news") u.searchParams.set("categories", "news");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const r = await fetch(u, { signal: ctrl.signal });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results ?? []).map((i) => ({ title: i.title ?? "", url: i.url ?? "", content: i.content ?? "" })).filter((c) => c.url);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
async function duckduckgo(query) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  let html;
  try {
    const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WebSearchBot/1.0)" }
    });
    if (!r.ok) return [];
    html = await r.text();
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
  return parseDuckduckgo(html);
}
function parseDuckduckgo(html) {
  const titles = [...html.matchAll(/<a\s+([^>]*class="result__a"[^>]*)>([\s\S]*?)<\/a>/g)];
  const snippets = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)];
  const out = [];
  titles.forEach((m, idx) => {
    const attrs = m[1] ?? "";
    const hrefM = /href="([^"]+)"/.exec(attrs);
    let url = hrefM ? hrefM[1] : "";
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {
      }
    } else if (url.startsWith("//")) url = "https:" + url;
    const title = stripTags(m[2] ?? "");
    const content = stripTags(snippets[idx]?.[1] ?? "");
    if (url) out.push({ title, url, content });
  });
  return out;
}
async function freeSearch(query, opts) {
  return config.searxngUrl ? searxng(query, opts) : duckduckgo(query);
}

// src/extract.ts
async function loadReadability() {
  try {
    const jsdomName = "jsdom";
    const readName = "@mozilla/readability";
    const { JSDOM } = await import(jsdomName);
    const { Readability } = await import(readName);
    return { JSDOM, Readability };
  } catch {
    return null;
  }
}
function stripHtml(html) {
  return html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
async function fetchAndExtract(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  let html;
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WebSearchBot/1.0)" }
    });
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") ?? "").includes("html")) return null;
    html = await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  const lib = await loadReadability();
  if (lib) {
    try {
      const dom = new lib.JSDOM(html, { url });
      const article = new lib.Readability(dom.window.document).parse();
      if (article?.textContent) return article.textContent.replace(/\s+/g, " ").trim();
    } catch {
    }
  }
  const stripped = stripHtml(html).slice(0, 8e3);
  return stripped || null;
}
async function fetchAndExtractMany(urls) {
  const out = /* @__PURE__ */ new Map();
  const queue = [...urls];
  const n = Math.min(config.maxConcurrency, urls.length || 1);
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) {
      const u = queue.shift();
      out.set(u, await fetchAndExtract(u));
    }
  });
  await Promise.all(workers);
  return out;
}

// src/rank.ts
function chunkText(text, maxChars = 500) {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+|\n{2,}/);
  const chunks = [];
  let cur = "";
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    if (cur.length + p.length + 1 <= maxChars) cur = (cur + " " + p).trim();
    else {
      if (cur) chunks.push(cur);
      if (p.length <= maxChars) cur = p;
      else {
        for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars));
        cur = "";
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
function lexicalScore(query, text) {
  const q = new Set(query.toLowerCase().match(/\w+/g) ?? []);
  if (q.size === 0) return 0;
  const t = new Set(text.toLowerCase().match(/\w+/g) ?? []);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}
function scoreChunks(query, chunks) {
  return chunks.map((c) => lexicalScore(query, c));
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
async function embeddingRerank(query, texts) {
  const r = await fetch(config.embeddingBaseUrl + "/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.embeddingApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.embeddingModel, input: [query, ...texts] })
  });
  if (!r.ok) throw new Error("embeddings http " + r.status);
  const d = await r.json();
  const emb = d.data.map((x) => x.embedding);
  const q = emb[0];
  return texts.map((_, i) => cosine(q, emb[i + 1]));
}
async function cohereRerank(query, texts) {
  const r = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.cohereApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.cohereModel, query, documents: texts })
  });
  if (!r.ok) throw new Error("cohere http " + r.status);
  const d = await r.json();
  const scores = new Array(texts.length).fill(0);
  for (const res of d.results ?? []) scores[res.index] = res.relevance_score ?? 0;
  return scores;
}
async function rerankTexts(query, texts) {
  if (!texts.length) return [];
  try {
    if (config.rerankerProvider === "cohere" && config.cohereApiKey) return await cohereRerank(query, texts);
    if (config.rerankerProvider === "openai" && config.embeddingApiKey) return await embeddingRerank(query, texts);
  } catch {
  }
  return scoreChunks(query, texts);
}

// src/answer.ts
async function generateAnswer(query, contexts, detailed = false) {
  if (!config.llmApiKey) return null;
  const ctx = contexts.map((c, i) => `[${i + 1}] ${c}`).join("\n\n").slice(0, 8e3);
  const prompt = `You are a factual search-answer engine. Using ONLY the context below, write a concise, accurate answer. If insufficient, say so.

Query: ${query}

Context:
${ctx}

Answer:`;
  try {
    const r = await fetch(config.llmBaseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.llmApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.llmModel, messages: [{ role: "user", content: prompt }], max_tokens: detailed ? 500 : 200, temperature: 0.2 })
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

// src/budget.ts
function monthKey() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
}
var mem = { month: "", spent: 0, paid: 0, free: 0 };
function rollMem() {
  const m = monthKey();
  if (mem.month !== m) {
    mem.month = m;
    mem.spent = 0;
    mem.paid = 0;
    mem.free = 0;
  }
}
var redis = null;
var redisTried = false;
async function getRedis() {
  if (!config.redisUrl) return null;
  if (redisTried) return redis;
  redisTried = true;
  try {
    const name = "ioredis";
    const mod = await import(name);
    const IORedis = mod.default ?? mod;
    redis = new IORedis(config.redisUrl);
  } catch {
    redis = null;
  }
  return redis;
}
var warnedMonth = "";
function maybeWarn(spent) {
  const m = monthKey();
  if (config.budgetMode === "soft" && spent > config.monthlyBudgetUsd && warnedMonth !== m) {
    warnedMonth = m;
    console.warn(`[websearch] soft budget exceeded: $${spent.toFixed(2)} > $${config.monthlyBudgetUsd}. Still serving (mode=soft). Raise MONTHLY_BUDGET_USD or call setBudget() when ready.`);
  }
}
async function currentSpend() {
  const r = await getRedis();
  if (r) return Number(await r.get(`ws:spend:${monthKey()}`) ?? 0);
  rollMem();
  return mem.spent;
}
async function canSpend(cost) {
  if (config.budgetMode === "soft") return true;
  return await currentSpend() + cost <= config.monthlyBudgetUsd;
}
async function recordPaid(cost) {
  const r = await getRedis();
  if (r) {
    const k = `ws:spend:${monthKey()}`;
    const spent = Number(await r.incrbyfloat(k, cost));
    await r.expire(k, 60 * 60 * 24 * 40);
    await r.incr(`ws:paid:${monthKey()}`);
    maybeWarn(spent);
    return;
  }
  rollMem();
  mem.spent += cost;
  mem.paid++;
  maybeWarn(mem.spent);
}
async function recordFree() {
  const r = await getRedis();
  if (r) {
    await r.incr(`ws:free:${monthKey()}`);
    return;
  }
  rollMem();
  mem.free++;
}
async function usage() {
  const m = monthKey();
  const spent = await currentSpend();
  let paid = mem.paid, free = mem.free;
  const r = await getRedis();
  if (r) {
    paid = Number(await r.get(`ws:paid:${m}`) ?? 0);
    free = Number(await r.get(`ws:free:${m}`) ?? 0);
  }
  return {
    month: m,
    budgetUsd: config.monthlyBudgetUsd,
    spentUsd: +spent.toFixed(4),
    remainingUsd: +(config.monthlyBudgetUsd - spent).toFixed(4),
    paidCalls: paid,
    freeCalls: free,
    mode: config.budgetMode,
    overBudget: spent > config.monthlyBudgetUsd
  };
}
function setBudget(usd) {
  config.monthlyBudgetUsd = usd;
}
function setBudgetMode(mode) {
  config.budgetMode = mode;
}

// src/cache.ts
import { createHash } from "node:crypto";
var mem2 = /* @__PURE__ */ new Map();
function key(obj) {
  return "ws:cache:" + createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
var redis2 = null;
var redisTried2 = false;
async function getRedis2() {
  if (!config.redisUrl) return null;
  if (redisTried2) return redis2;
  redisTried2 = true;
  try {
    const name = "ioredis";
    const mod = await import(name);
    const IORedis = mod.default ?? mod;
    redis2 = new IORedis(config.redisUrl);
  } catch {
    redis2 = null;
  }
  return redis2;
}
async function cacheGet(obj) {
  const k = key(obj);
  const r = await getRedis2();
  if (r) {
    const v = await r.get(k);
    return v ? JSON.parse(v) : null;
  }
  const it = mem2.get(k);
  if (!it) return null;
  if (Date.now() > it.exp) {
    mem2.delete(k);
    return null;
  }
  return it.v;
}
async function cacheSet(obj, val) {
  const k = key(obj);
  const r = await getRedis2();
  if (r) {
    await r.set(k, JSON.stringify(val), "EX", config.cacheTtlSec);
    return;
  }
  mem2.set(k, { v: val, exp: Date.now() + config.cacheTtlSec * 1e3 });
}

// src/engine.ts
function domainOk(url, inc, exc) {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (inc?.length && !inc.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()))) return false;
  if (exc?.length && exc.some((d) => host === d.toLowerCase() || host.endsWith("." + d.toLowerCase()))) return false;
  return true;
}
async function retrieve(query, opts) {
  const canPay = config.serpStrategy !== "off" && !!config.serpApiKey && await canSpend(config.serpCostPerQuery);
  if (canPay) {
    const paid = await serperSearch(query, opts);
    if (paid.length) {
      await recordPaid(config.serpCostPerQuery);
      return paid;
    }
  }
  const free = await freeSearch(query, opts);
  await recordFree();
  return free;
}
async function search(query, opts = {}) {
  const t0 = Date.now();
  const cacheKey = { query, ...opts };
  const hit = await cacheGet(cacheKey);
  if (hit) return hit;
  const candidates = await retrieve(query, opts);
  const seen = /* @__PURE__ */ new Set();
  const filtered = [];
  for (const c of candidates) {
    if (!c.url || seen.has(c.url)) continue;
    if (!domainOk(c.url, opts.includeDomains, opts.excludeDomains)) continue;
    seen.add(c.url);
    filtered.push(c);
  }
  const top = filtered.slice(0, Math.max(opts.maxResults ?? 5, 1));
  const deep = opts.searchDepth === "advanced";
  const needRaw = !!opts.includeRawContent;
  let extracted = /* @__PURE__ */ new Map();
  if (deep || needRaw || opts.includeAnswer) extracted = await fetchAndExtractMany(top.map((c) => c.url));
  const results = [];
  const answerCtx = [];
  for (const c of top) {
    const raw = extracted.get(c.url) ?? null;
    let content = c.content;
    if (deep && raw) {
      const chunks = chunkText(raw, 500);
      const scores = scoreChunks(query, chunks);
      const ranked = chunks.map((ch, i) => [ch, scores[i]]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      content = ranked.length ? ranked.map((r) => r[0]).join(" [...] ") : c.content;
    }
    results.push({ title: c.title, url: c.url, content, score: 0, rawContent: needRaw ? raw : null });
    if (raw) answerCtx.push(content);
  }
  if (results.length) {
    const scores = await rerankTexts(query, results.map((r) => r.content));
    results.forEach((r, i) => {
      r.score = +Number(scores[i] ?? 0).toFixed(6);
    });
    results.sort((a, b) => b.score - a.score);
  }
  let answer = null;
  if (opts.includeAnswer) answer = await generateAnswer(query, (answerCtx.length ? answerCtx : results.map((r) => r.content)).slice(0, 6), false);
  const resp = { query, answer, results, responseTime: +((Date.now() - t0) / 1e3).toFixed(3) };
  await cacheSet(cacheKey, resp);
  return resp;
}

// src/index.ts
function createWebSearch() {
  return { search, usage, setBudget, setBudgetMode };
}
var src_default = createWebSearch;
export {
  createWebSearch,
  src_default as default,
  search,
  setBudget,
  setBudgetMode,
  usage
};
