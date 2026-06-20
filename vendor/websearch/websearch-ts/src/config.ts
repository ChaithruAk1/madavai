function num(v: string | undefined, d: number): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
export const config = {
  // ----- PAID Google tier (Serper) -----
  serpApiKey: process.env.SERP_API_KEY ?? "",
  serpBaseUrl: process.env.SERP_BASE_URL ?? "https://google.serper.dev",
  serpCostPerQuery: num(process.env.SERP_COST_PER_QUERY, 0.001),
  serpStrategy: (process.env.SERP_STRATEGY ?? "always") as "always" | "off",

  // ----- Spend limit -----
  // "hard" (default): stop PAYING at the cap and fall back to FREE search (never stops searching).
  // "soft": never stop paying, just warn when over.
  budgetMode: (process.env.BUDGET_MODE ?? "hard") as "soft" | "hard",
  monthlyBudgetUsd: num(process.env.MONTHLY_BUDGET_USD, 1000),

  // ----- FREE fallback (used after the cap) -----
  // If SEARXNG_URL is set -> use your SearXNG (reliable). Else -> DuckDuckGo (zero infra, best-effort).
  searxngUrl: process.env.SEARXNG_URL ?? "",

  // ----- infra / misc -----
  fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 10000),
  maxConcurrency: num(process.env.MAX_FETCH_CONCURRENCY, 8),
  llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  redisUrl: process.env.REDIS_URL ?? "",
  cacheTtlSec: num(process.env.CACHE_TTL, 900),
};
