import { config } from "./config.js";
function stripTags(s) { return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); }
// SearXNG JSON (self-hosted; reliable). Returns [] on failure.
async function searxng(query, opts) {
    const u = new URL(config.searxngUrl.replace(/\/$/, "") + "/search");
    u.searchParams.set("q", query);
    u.searchParams.set("format", "json");
    if (opts.topic === "news")
        u.searchParams.set("categories", "news");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
    try {
        const r = await fetch(u, { signal: ctrl.signal });
        if (!r.ok)
            return [];
        const data = await r.json();
        return (data.results ?? []).map((i) => ({ title: i.title ?? "", url: i.url ?? "", content: i.content ?? "" })).filter((c) => c.url);
    }
    catch {
        return [];
    }
    finally {
        clearTimeout(t);
    }
}
// DuckDuckGo HTML endpoint (no key, no infra; best-effort, can be rate-limited).
async function duckduckgo(query) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
    let html;
    try {
        const r = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query), {
            signal: ctrl.signal,
            headers: { "User-Agent": "Mozilla/5.0 (compatible; WebSearchBot/1.0)" },
        });
        if (!r.ok)
            return [];
        html = await r.text();
    }
    catch {
        return [];
    }
    finally {
        clearTimeout(t);
    }
    return parseDuckduckgo(html);
}
export function parseDuckduckgo(html) {
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
            }
            catch { /* keep */ }
        }
        else if (url.startsWith("//"))
            url = "https:" + url;
        const title = stripTags(m[2] ?? "");
        const content = stripTags(snippets[idx]?.[1] ?? "");
        if (url)
            out.push({ title, url, content });
    });
    return out;
}
export async function freeSearch(query, opts) {
    return config.searxngUrl ? searxng(query, opts) : duckduckgo(query);
}
