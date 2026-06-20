import { config } from "./config.js";

// Optional, high-quality extraction via Readability. Loaded dynamically so the
// package installs with ZERO heavy deps; falls back to a tag-stripper if absent.
async function loadReadability(): Promise<any> {
  try {
    const jsdomName: string = "jsdom";
    const readName: string = "@mozilla/readability";
    const { JSDOM } = await import(jsdomName);
    const { Readability } = await import(readName);
    return { JSDOM, Readability };
  } catch { return null; }
}
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export async function fetchAndExtract(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  let html: string;
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WebSearchBot/1.0)" },
    });
    if (!r.ok) return null;
    if (!(r.headers.get("content-type") ?? "").includes("html")) return null;
    html = await r.text();
  } catch { return null; }
  finally { clearTimeout(timer); }

  const lib = await loadReadability();
  if (lib) {
    try {
      const dom = new lib.JSDOM(html, { url });
      const article = new lib.Readability(dom.window.document).parse();
      if (article?.textContent) return article.textContent.replace(/\s+/g, " ").trim();
    } catch { /* fall through to strip */ }
  }
  const stripped = stripHtml(html).slice(0, 8000);
  return stripped || null;
}
export async function fetchAndExtractMany(urls: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const queue = [...urls];
  const n = Math.min(config.maxConcurrency, urls.length || 1);
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) { const u = queue.shift()!; out.set(u, await fetchAndExtract(u)); }
  });
  await Promise.all(workers);
  return out;
}
