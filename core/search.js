// core/search.js — ESM SINGLE SOURCE for web search across the WHOLE app (chat web_search, Deep
// Research, agents — everywhere). Provider-agnostic: the configured key decides which engine runs, so
// you can use Tavily (AI-optimized), Serper (Google results), or Brave — and switch by changing the key.
// Pure logic: the platform injects `fetchImpl` (desktop = Node fetch; web = the server proxy's fetch)
// and `cfg` (the keys). No platform/Node/browser APIs here. DuckDuckGo stays as a keyless fallback the
// CALLER owns (this module returns null for "no provider configured" so the caller can fall back).

// Which engine to use, based on which key is present (priority: explicit provider > Tavily > Serper > Brave).
export function pickProvider(cfg = {}) {
  const p = (cfg.provider || "").toLowerCase();
  if (p && p !== "auto") return p;
  if (cfg.tavilyKey) return "tavily";
  if (cfg.serperKey) return "serper";
  if (cfg.braveKey) return "brave";
  return "duckduckgo"; // no key → caller's DDG fallback
}

// Build the HTTP request for a provider. Returns { url, options } for fetchImpl(url, options).
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

// Normalize each provider's JSON into a unified list: [{ title, url, content }].
function parseResults(provider, json) {
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

/**
 * Run a web search through the configured provider. Returns a unified [{title,url,content}] array,
 * or null when no provider key is configured (the caller then uses its DuckDuckGo fallback).
 * Throws only on a real provider/network error so the caller can fall back gracefully.
 */
export async function webSearch(query, { fetchImpl, cfg = {}, count = 6, signal } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  if (typeof fetchImpl !== "function") throw new Error("webSearch: fetchImpl is required");
  const provider = pickProvider(cfg);
  if (provider === "duckduckgo") return null; // signal "no provider" → caller's fallback
  const { url, options } = buildRequest(provider, q, cfg, count);
  const res = await fetchImpl(url, { ...options, signal });
  if (!res || !res.ok) throw new Error("search " + provider + " failed: HTTP " + (res && res.status));
  const json = await res.json();
  return parseResults(provider, json);
}

// Render unified results as the compact text the model reads — title, REAL url, and a snippet, so the
// model can answer and cite the actual link (the anti-fabrication rule then forbids inventing URLs).
export function formatResults(results, query) {
  if (!results || !results.length) return "";
  const head = "# Web results for: " + String(query || "").trim() + "\n\n";
  return head + results.map((r, i) =>
    (i + 1) + ". " + (r.title || r.url) + "\n" + r.url + (r.content ? "\n" + String(r.content).replace(/\s+/g, " ").slice(0, 600) : "")
  ).join("\n\n");
}
