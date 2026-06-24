// @madav/core — THE single web-search backend for the whole app. A configured provider (chosen by which
// key is set) with a DuckDuckGo fallback, returning ONE shape [{title,url,content}]. Pure; fetch injected.
export interface SearchResult { title: string; url: string; content: string; }
export interface SearchConfig { provider?: string; tavilyKey?: string; serperKey?: string; braveKey?: string; }
type FetchResponse = { ok?: boolean; json?: () => Promise<unknown>; text?: () => Promise<string> };
type SearchFetch = (url: string, opts?: unknown) => Promise<FetchResponse>;
export interface SearchEngine {
  search(q: string, opts: { maxResults: number; searchDepth: string }): Promise<{ results?: Array<{ title?: string; url?: string; content?: string }> }>;
}

export function pickProvider(cfg: SearchConfig = {}): string {
  const p = (cfg.provider || '').toLowerCase();
  if (p && p !== 'auto') return p;
  if (cfg.tavilyKey) return 'tavily';
  if (cfg.serperKey) return 'serper';
  if (cfg.braveKey) return 'brave';
  return 'duckduckgo';
}

function buildRequest(provider: string, query: string, cfg: SearchConfig, count: number): { url: string; options: Record<string, unknown> } {
  if (provider === 'tavily') return { url: 'https://api.tavily.com/search', options: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: cfg.tavilyKey, query, max_results: count, search_depth: 'basic', include_answer: false }) } };
  if (provider === 'serper') return { url: 'https://google.serper.dev/search', options: { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-KEY': cfg.serperKey }, body: JSON.stringify({ q: query, num: count }) } };
  if (provider === 'brave') return { url: 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + count, options: { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': cfg.braveKey } } };
  throw new Error("search: unknown provider '" + provider + "'");
}

function parseProvider(provider: string, json: unknown): SearchResult[] {
  const out: SearchResult[] = [];
  if (!json || typeof json !== 'object') return out;
  const j = json as Record<string, any>;
  if (provider === 'tavily') for (const r of j['results'] || []) { if (r && r.url) out.push({ title: r.title || r.url, url: r.url, content: r.content || '' }); }
  else if (provider === 'serper') for (const r of j['organic'] || []) { if (r && r.link) out.push({ title: r.title || r.link, url: r.link, content: r.snippet || '' }); }
  else if (provider === 'brave') for (const r of (j['web'] && j['web'].results) || []) { if (r && r.url) out.push({ title: r.title || r.url, url: r.url, content: r.description || '' }); }
  return out;
}

function stripTags(s: unknown): string {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}
export function parseDuckResults(html: unknown): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html || '')))) {
    let href = m[1];
    const ud = /[?&]uddg=([^&]+)/.exec(href);
    if (ud) { try { href = decodeURIComponent(ud[1]); } catch { /* keep */ } }
    else if (href.startsWith('//')) href = 'https:' + href;
    if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
    seen.add(href);
    out.push({ title: stripTags(m[2]).slice(0, 200) || href, url: href, content: '' });
  }
  return out;
}
async function duckSearch(query: string, fetchImpl: SearchFetch, signal: unknown, count: number): Promise<SearchResult[]> {
  const res = await fetchImpl('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Madav/1.0)' }, signal });
  const html = res.text ? await res.text() : '';
  return parseDuckResults(html).slice(0, count);
}

export async function searchWeb(
  query: unknown,
  { fetchImpl, cfg = {}, count = 6, signal, engine }: { fetchImpl?: SearchFetch; cfg?: SearchConfig; count?: number; signal?: unknown; engine?: SearchEngine } = {},
): Promise<SearchResult[]> {
  const q = String(query || '').trim();
  if (!q) return [];
  if (engine && typeof engine.search === 'function') {
    try {
      const r = await engine.search(q, { maxResults: count, searchDepth: 'advanced' });
      const hits = ((r && r.results) || []).map((x) => ({ title: (x && (x.title || x.url)) || '', url: (x && x.url) || '', content: (x && x.content) || '' })).filter((x) => x.url);
      if (hits.length) return hits;
    } catch { /* engine threw -> duck net */ }
    try { return typeof fetchImpl === 'function' ? await duckSearch(q, fetchImpl, signal, count) : []; } catch { return []; }
  }
  if (typeof fetchImpl !== 'function') throw new Error('searchWeb: fetchImpl is required');
  const provider = pickProvider(cfg);
  if (provider !== 'duckduckgo') {
    try {
      const { url, options } = buildRequest(provider, q, cfg, count);
      const res = await fetchImpl(url, { ...options, signal });
      if (res && res.ok && res.json) { const json = await res.json(); const hits = parseProvider(provider, json); if (hits.length) return hits; }
    } catch { /* provider failed -> duck */ }
  }
  try { return await duckSearch(q, fetchImpl, signal, count); } catch { return []; }
}

export function formatResults(results: SearchResult[] | null | undefined, query: unknown): string {
  if (!results || !results.length) return '(no web results)';
  const head = '# Web results for: ' + String(query || '').trim() + '\n\n';
  return head + results.map((r, i) => (i + 1) + '. ' + (r.title || r.url) + '\n' + r.url + (r.content ? '\n' + String(r.content).replace(/\s+/g, ' ').slice(0, 600) : '')).join('\n\n');
}
