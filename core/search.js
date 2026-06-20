// core/search.js — THE SINGLE SOURCE for web search across the WHOLE app (chat web_search, Deep
// Research, agents — web AND desktop). One complete search: a configured provider (Tavily / Serper /
// Brave, chosen by which key is set) with a built-in DuckDuckGo fallback, returning ONE shape:
// [{ title, url, content }]. Pure logic — the platform injects `fetchImpl` (the server's global fetch)
// and `cfg` (the keys). The SERVER runs this with the house key; web and desktop both call the server,
// so there is exactly one search backend and no per-surface search code.

// Which engine: explicit provider wins, else the first key present, else DuckDuckGo.
export function pickProvider(cfg = {}) {
  const p = (cfg.provider || "").toLowerCase();
  if (p && p !== "auto") return p;
  if (cfg.tavilyKey) return "tavily";
  if (cfg.serperKey) return "serper";
  if (cfg.braveKey) return "brave";
  return "duckduckgo";
}

function buildRequest(provider, query, cfg, count) {
  if (provider === "tavily") {
    return { url: "https://api.tavily.com/search", options: {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: cfg.tavilyKey, query, max_results: count, search_depth: "basic", include_answer: false }),
    } };
  }
  if (provider === "serper") {
    return { url: "https://google.serper.dev/search", options: {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": cfg.serperKey },
      body: JSON.stringify({ q: query, num: count }),
    } };
  }
  if (provider === "brave") {
    return { url: "https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) + "&count=" + count, options: {
      method: "GET", headers: { "Accept": "application/json", "X-Subscription-Token": cfg.braveKey },
    } };
  }
  throw new Error("search: unknown provider '" + provider + "'");
}

function parseProvider(provider, json) {
  const out = [];
  if (!json || typeof json !== "object") return out;
  if (provider === "tavily") {
    for (const r of (json.results || [])) if (r && r.url) out.push({ title: r.title || r.url, url: r.url, content: r.content || "" });
  } else if (provider === "serper") {
    for (const r of (json.organic || [])) if (r && r.link) out.push({ title: r.title || r.link, url: r.link, content: r.snippet || "" });
  } else if (provider === "brave") {
    for (const r of (((json.web || {}).results) || [])) if (r && r.url) out.push({ title: r.title || r.url, url: r.url, content: r.description || "" });
  }
  return out;
}

// ---- DuckDuckGo fallback (ONE copy; moved here from electron/research.cjs) ----
function stripTags(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
export function parseDuckResults(html) {
  const out = []; const seen = new Set();
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let href = m[1];
    const ud = /[?&]uddg=([^&]+)/.exec(href);
    if (ud) { try { href = decodeURIComponent(ud[1]); } catch {} }
    else if (href.startsWith("//")) href = "https:" + href;
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ title: stripTags(m[2]).slice(0, 200) || href, url: href, content: "" });
  }
  return out;
}
async function duckSearch(query, fetchImpl, signal, count) {
  const res = await fetchImpl("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), { headers: { "User-Agent": "Mozilla/5.0 (compatible; Madav/1.0)" }, signal });
  const html = await res.text();
  return parseDuckResults(html).slice(0, count);
}

/**
 * THE complete web search: the configured provider (Tavily/Serper/Brave) first, DuckDuckGo as the
 * automatic fallback on no-key / out-of-credits / error / empty. Always returns a unified
 * [{ title, url, content }] (possibly empty). This is the only search function the app should call.
 */
export async function searchWeb(query, { fetchImpl, cfg = {}, count = 6, signal, engine } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  // Custom in-process search engine (the SERVER injects it for HOUSE search): Serper → free, with a global
  // budget cap + reranking, all INSIDE the engine. It already returns the unified shape; on a hard throw we
  // still drop to the DuckDuckGo net so search NEVER dies. BYO-key / explicit-DDG callers pass no engine.
  if (engine && typeof engine.search === "function") {
    try {
      const r = await engine.search(q, { maxResults: count, searchDepth: "advanced" });
      const hits = (((r && r.results) || []).map((x) => ({ title: (x && (x.title || x.url)) || "", url: (x && x.url) || "", content: (x && x.content) || "" })).filter((x) => x.url));
      if (hits.length) return hits;
    } catch { /* engine threw → DuckDuckGo net below */ }
    try { return typeof fetchImpl === "function" ? await duckSearch(q, fetchImpl, signal, count) : []; } catch { return []; }
  }
  if (typeof fetchImpl !== "function") throw new Error("searchWeb: fetchImpl is required");
  const provider = pickProvider(cfg);
  if (provider !== "duckduckgo") {
    try {
      const { url, options } = buildRequest(provider, q, cfg, count);
      const res = await fetchImpl(url, { ...options, signal });
      if (res && res.ok) { const json = await res.json(); const hits = parseProvider(provider, json); if (hits.length) return hits; }
    } catch { /* provider failed → DuckDuckGo fallback below */ }
  }
  try { return await duckSearch(q, fetchImpl, signal, count); } catch { return []; }
}

// Render unified results as the compact text the model reads — title, REAL url, snippet — so it answers
// and cites the actual link (the anti-fabrication rule then forbids inventing URLs).
export function formatResults(results, query) {
  if (!results || !results.length) return "(no web results)";
  const head = "# Web results for: " + String(query || "").trim() + "\n\n";
  return head + results.map((r, i) =>
    (i + 1) + ". " + (r.title || r.url) + "\n" + r.url + (r.content ? "\n" + String(r.content).replace(/\s+/g, " ").slice(0, 600) : "")
  ).join("\n\n");
}
