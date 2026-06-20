// ---------------------------------------------------------------------------
// Drop-in for an existing `searchWeb()` chokepoint (e.g. your core/search.ts).
//
// THE SAFE SWAP: if every caller goes through one exported search function,
// you only rewrite THIS function's body and keep its signature + return shape.
// Every caller then uses the new engine automatically — no need to find call
// sites, so a flaky grep can't cause you to miss one.
// ---------------------------------------------------------------------------
import { createWebSearch } from "websearch";

const engine = createWebSearch();

// Match this to whatever your callers already expect from searchWeb():
export interface WebResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export async function searchWeb(
  query: string,
  opts: { maxResults?: number; depth?: "basic" | "advanced" } = {},
): Promise<WebResult[]> {
  const res = await engine.search(query, {
    searchDepth: opts.depth ?? "advanced",   // advanced = fetch + Readability + rerank
    maxResults: opts.maxResults ?? 5,
  });
  // The engine returns Tavily-shaped results: { title, url, content, score, rawContent }.
  // Re-map field names here if your old searchWeb() returned something different.
  return res.results.map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    score: r.score,
  }));
}

// Optional: surface spend + the live cap to your ops dashboards / admin tools.
export { usage, setBudget } from "websearch";
