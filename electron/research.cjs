// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// research.cjs — DEEP RESEARCH mode. A single tool that runs a multi-source web
// research pass entirely from Electron main: it asks the model to PLAN a few search
// queries, SEARCHES DuckDuckGo's HTML endpoint, READS the top sources in parallel
// (stripped to readable text), then asks the model to SYNTHESIZE a citation-numbered
// report. Zero new dependencies — Node 18+/Electron has global fetch + AbortController.
//
// SECURITY: every outbound fetch is funneled through fetchGuarded(), which MIRRORS the
// server's SSRF rules (server/auth-server.mjs isForbiddenTarget) — we do NOT import
// server code into the desktop app, we re-implement the same allow/deny logic locally.
// All fetches are http(s)-only, time-boxed to 10s, and capped at 1MB.

const { streamChat } = require("./providers.cjs");
const harness = require("./harness.cjs");

// Reuse the harness truncation helper (head+tail keeps the start AND end of a page).
const headTail = harness.headTail;
// Reuse the tolerant JSON parser if exported; otherwise fall back to a tiny local ladder.
const tolerantParse = typeof harness.tolerantParse === "function"
  ? harness.tolerantParse
  : (raw) => { try { return { ok: true, value: JSON.parse(String(raw || "")) }; } catch { return { ok: false, value: {} }; } };

// ---------- the tool schema the agent loop advertises to the model ----------
const RESEARCH_TOOL = {
  type: "function",
  function: {
    name: "deep_research",
    description: "Run a deep multi-source web research pass: plans search queries, reads several sources in parallel, and returns a synthesized, citation-numbered report with a source list. Use for questions needing current or multi-source information.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "the research question to investigate" },
        focus: { type: "string", description: "optional extra angle/constraint to steer the research" },
      },
      required: ["query"],
    },
  },
};

// ---------- SSRF mirror (kept in sync with server/auth-server.mjs isForbiddenTarget) ----------
// true when a URL must NOT be fetched: non-http(s), loopback, RFC1918 private ranges,
// link-local / cloud-metadata, or *.local / *.internal / *.localhost hostnames.
function isForbiddenTarget(urlString) {
  let t;
  try { t = new URL(urlString); } catch { return true; }
  if (t.protocol !== "http:" && t.protocol !== "https:") return true;
  const h = t.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "::1" || h === "::" || h === "0.0.0.0" ||
      h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^::ffff:127\./.test(h)) return true;                    // IPv4-mapped loopback
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const a = +m4[1], b = +m4[2];
    if (a === 0 || a === 127 || a === 10) return true;          // 0/8, loopback, 10/8
    if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16/12
    if (a === 192 && b === 168) return true;                    // 192.168/16
    if (a === 169 && b === 254) return true;                    // link-local / cloud metadata
  }
  return false;
}

// Desktop UA — DDG's HTML endpoint serves a leaner page to bot-ish agents otherwise.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 10000;
const MAX_BYTES = 1024 * 1024; // 1MB cap per response

// Guarded fetch: SSRF check, http(s) only, 10s timeout (AbortController), 1MB read cap.
// Returns the response text (possibly truncated) or throws/aborts. The caller's abort
// signal is chained so an upstream cancel also tears this down.
async function fetchGuarded(url, signal) {
  if (isForbiddenTarget(url)) throw new Error("blocked host");
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", onAbort, { once: true }); }
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    });
    // Re-check the FINAL url after redirects (a redirect could land on a private host).
    if (isForbiddenTarget(res.url || url)) throw new Error("blocked host (redirect)");
    // Read with a hard byte cap so a giant/streaming page can't exhaust memory.
    const reader = res.body && res.body.getReader ? res.body.getReader() : null;
    if (!reader) return (await res.text()).slice(0, MAX_BYTES);
    const decoder = new TextDecoder();
    let out = "", bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      out += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES) { try { reader.cancel(); } catch {} break; }
    }
    return out;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// ---------- HTML → readable text (mirrors the server's strip pipeline) ----------
function htmlToText(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}

// DuckDuckGo result parsing now lives in the SINGLE SOURCE core/search.js (parseDuckResults), used by
// the server's search backend. Desktop no longer parses search results locally — it calls the server.

// ---------- PLAN: ask the model for 3-5 search queries as a JSON array ----------
async function planQueries(profile, query, focus, signal) {
  const sys = "You are a research planner. Given a question, output 3 to 5 effective web search queries that together cover the question from multiple angles. Respond with ONLY a JSON array of strings, no prose, no code fence.";
  const user = "Question: " + query + (focus ? "\nFocus: " + focus : "");
  let text = "";
  try {
    const r = await streamChat(profile, [
      { role: "system", content: sys },
      { role: "user", content: user },
    ], { onDelta: () => {}, signal });
    text = (r && r.text) || "";
  } catch { /* fall through to the fallback below */ }
  // Tolerant-parse; the parser may return an object, so coerce to a string[].
  const parsed = tolerantParse(text);
  let arr = [];
  if (parsed.ok && Array.isArray(parsed.value)) arr = parsed.value;
  else if (parsed.ok && parsed.value && Array.isArray(parsed.value.queries)) arr = parsed.value.queries;
  arr = arr.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 5);
  // Always have at least the raw question to search on.
  if (!arr.length) arr = [focus ? query + " " + focus : query];
  return arr;
}

// ---------- main entry ----------
// runDeepResearch(profile, { query, focus }, { signal, emit })
//   emit(stage, detail) surfaces progress: "planning" | "searching" | "reading 3/8" | "synthesizing"
// Returns { report, sources: [{ n, title, url }] }. NEVER throws — failures become a report string.
async function runDeepResearch(profile, args, opts = {}) {
  // Built-in feature gate (build may not include Deep Research).
  try { if (!require("./features.cjs").builtIn("research")) return { report: "Deep Research isn't included in this build.", sources: [] }; } catch {}

  const signal = opts.signal;
  const emit = typeof opts.emit === "function" ? opts.emit : () => {};
  const aborted = () => signal && signal.aborted;
  const query = String((args && args.query) || "").trim();
  const focus = String((args && args.focus) || "").trim();
  if (!query) return { report: "Research failed: no query provided.", sources: [] };

  try {
    // (a) PLAN
    emit("planning", query);
    if (aborted()) return { report: "Research failed: cancelled.", sources: [] };
    const queries = await planQueries(profile, query, focus, signal);

    // (b) SEARCH — run each query against DDG, collect unique result URLs (cap ~8).
    emit("searching", queries.length + " queries");
    const sources = [];
    const seen = new Set();
    for (const q of queries) {
      if (aborted()) break;
      if (sources.length >= 8) break;
      try {
        const hits = await serverSearch(q, signal, 8); // ONE backend: server house key (core/search.js: Tavily → DuckDuckGo)
        for (const hit of hits) {
          if (seen.has(hit.url)) continue;
          seen.add(hit.url);
          sources.push(hit);
          if (sources.length >= 8) break;
        }
      } catch { /* one bad query shouldn't sink the whole run */ }
    }
    if (!sources.length) return { report: "Research failed: no search results (the search endpoint may be rate-limiting). Try again shortly.", sources: [] };
    if (aborted()) return { report: "Research failed: cancelled.", sources: [] };

    // (c) READ — fetch all sources in parallel, extract MAIN CONTENT as markdown
    // (webmd: structure + links survive, boilerplate doesn't — far denser than tag-strip),
    // head+tail to ~6000 chars. Falls back to the plain strip inside webmd on any surprise.
    let done = 0;
    const webmd = require("./webmd.cjs");
    const reads = await Promise.allSettled(sources.map(async (s) => {
      const html = await fetchGuarded(s.url, signal);
      done++;
      emit("reading", done + "/" + sources.length);
      return headTail(webmd.extract(html, s.url).markdown, { headLines: 200, tailLines: 60, maxChars: 6000 });
    }));
    if (aborted()) return { report: "Research failed: cancelled.", sources: [] };

    // Number ONLY the sources we actually read (so [n] citations line up). Drop dead ones.
    const numbered = [];
    let blocks = "";
    for (let i = 0; i < sources.length; i++) {
      const r = reads[i];
      if (r.status !== "fulfilled" || !r.value) continue;
      const n = numbered.length + 1;
      numbered.push({ n, title: sources[i].title, url: sources[i].url });
      blocks += `\n[${n}] ${sources[i].title}\nURL: ${sources[i].url}\n${r.value}\n`;
    }
    if (!numbered.length) return { report: "Research failed: every source failed to load (network or rate-limit). Try again shortly.", sources: [] };

    // (d) SYNTHESIZE — one model call over ONLY the gathered sources.
    emit("synthesizing", numbered.length + " sources");
    if (aborted()) return { report: "Research failed: cancelled.", sources: [] };
    const sys = "You are a meticulous research analyst. Using ONLY the numbered sources provided, write a thorough, well-structured answer to the user's question. Use inline [n] citations that match the numbered source list whenever you state a fact. If the sources are silent or contradictory on something, say so honestly rather than inventing. End your answer with a 'Sources:' section listing each source as 'n. title — url'.";
    const user = "Question: " + query + (focus ? "\nFocus: " + focus : "") + "\n\nSOURCES:\n" + blocks;
    let report = "";
    try {
      const r = await streamChat(profile, [
        { role: "system", content: sys },
        { role: "user", content: user },
      ], { onDelta: () => {}, signal });
      report = (r && r.text || "").trim();
    } catch (e) {
      return { report: "Research failed during synthesis: " + ((e && e.message) || e), sources: numbered };
    }
    if (!report) {
      // Model returned nothing — still hand back the source list so the run isn't wasted.
      report = "Synthesis produced no text. Gathered sources:\n" + numbered.map((s) => `${s.n}. ${s.title} — ${s.url}`).join("\n");
    }
    return { report, sources: numbered };
  } catch (e) {
    // Catch-all: never throw out of the tool.
    return { report: "Research failed: " + ((e && e.message) || String(e)), sources: [] };
  }
}

// ADR-0001 — ONE search backend. Desktop search goes through the SAME server endpoint as web
// (/proxy/fetch with { query }), which runs the single source core/search.js (Tavily/Serper/Brave →
// DuckDuckGo fallback) with the server's house key. No local key, no local search engine on desktop —
// identical to web. Returns the server's unified [{title,url,content}] (or [] on failure).
async function serverSearch(query, signal, limit = 6) {
  const cfg = require("./settings.cjs").load();
  const authBaseUrl = cfg.authBaseUrl || "https://madav.ai";
  const r = await require("./auth.cjs").apiCall("POST", "/proxy/fetch", { query: String(query || ""), count: limit, searchProvider: cfg.searchProvider || "auto", searchKey: cfg.searchKey || "" }, authBaseUrl);
  return (r && Array.isArray(r.results)) ? r.results : [];
}
// In-chat web_search tool — formats the shared results for the model. Never throws.
async function quickSearch(query, signal, limit = 6) {
  const q = String(query || "");
  try {
    const hits = await serverSearch(q, signal, limit);
    if (!hits.length) return "(no web results)";
    return hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}` + (h.content ? `\n   ${String(h.content).replace(/\s+/g, " ").slice(0, 300)}` : "")).join("\n\n");
  } catch (e) { return "(web search failed: " + String((e && e.message) || e).slice(0, 120) + ")"; }
}

// In-chat web_fetch tool — fetch a specific URL through the SAME server backend (/proxy/fetch with
// { url }, SSRF-guarded) and return its readable text. ONE backend shared with search; no local fetch
// path on desktop — identical to web. Never throws.
async function quickFetch(url, signal) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return "Provide an http(s) URL to fetch.";
  try {
    const cfg = require("./settings.cjs").load();
    const authBaseUrl = cfg.authBaseUrl || "https://madav.ai";
    const r = await require("./auth.cjs").apiCall("POST", "/proxy/fetch", { url: u }, authBaseUrl);
    const text = r && typeof r.text === "string" ? r.text : "";
    return text.trim() ? text.slice(0, 30000) : "(couldn't read that page)";
  } catch (e) { return "(web fetch failed: " + String((e && e.message) || e).slice(0, 120) + ")"; }
}

module.exports = { RESEARCH_TOOL, runDeepResearch, isForbiddenTarget, quickSearch, quickFetch };
