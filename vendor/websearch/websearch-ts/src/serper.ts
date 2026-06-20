import { config } from "./config.js";
import type { SearchOptions } from "./types.js";

export interface Candidate { title: string; url: string; content: string; }
const TBS: Record<string, string> = { day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" };

// Google-grade results via Serper. The only external/paid call. [] on any failure.
export async function serperSearch(query: string, opts: SearchOptions): Promise<Candidate[]> {
  if (!config.serpApiKey) return [];
  const body: Record<string, unknown> = { q: query, num: Math.min(Math.max(opts.maxResults ?? 5, 1), 20) };
  if (opts.timeRange && TBS[opts.timeRange]) body.tbs = TBS[opts.timeRange];
  const path = opts.topic === "news" ? "/news" : "/search";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const r = await fetch(config.serpBaseUrl + path, {
      method: "POST",
      headers: { "X-API-KEY": config.serpApiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const data = await r.json() as Record<string, any>;
    const items: any[] = (opts.topic === "news" ? data.news : data.organic) ?? [];
    return items
      .map((i) => ({ title: i.title ?? "", url: i.link ?? "", content: i.snippet ?? "" }))
      .filter((c) => c.url);
  } catch { return []; }
  finally { clearTimeout(timer); }
}
