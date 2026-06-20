function num(v: string | undefined, d: number): number { const n = Number(v); return Number.isFinite(n) ? n : d; }
const llmKey = process.env.LLM_API_KEY ?? "";
export const config = {
  // ----- PAID Google tier (Serper) -----
  serpApiKey: process.env.SERP_API_KEY ?? "",
  serpBaseUrl: process.env.SERP_BASE_URL ?? "https://google.serper.dev",
  serpCostPerQuery: num(process.env.SERP_COST_PER_QUERY, 0.001),
  serpStrategy: (process.env.SERP_STRATEGY ?? "always") as "always" | "off",

  // ----- spend limit -----
  budgetMode: (process.env.BUDGET_MODE ?? "hard") as "soft" | "hard",
  monthlyBudgetUsd: num(process.env.MONTHLY_BUDGET_USD, 1000),

  // ----- free fallback (after cap) -----
  searxngUrl: process.env.SEARXNG_URL ?? "",

  // ----- RERANKER (quality boost) -----
  // "openai"  -> rerank via embeddings on your existing OpenAI key (default if LLM key present)
  // "cohere"  -> Cohere Rerank API (best quality cross-encoder; needs COHERE_API_KEY)
  // "none"    -> lexical only
  rerankerProvider: (process.env.RERANKER_PROVIDER ?? (llmKey ? "openai" : "none")) as "none" | "openai" | "cohere",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL ?? process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  embeddingApiKey: process.env.EMBEDDING_API_KEY ?? llmKey,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  cohereModel: process.env.COHERE_RERANK_MODEL ?? "rerank-v3.5",

  // ----- infra / misc -----
  fetchTimeoutMs: num(process.env.FETCH_TIMEOUT_MS, 10000),
  maxConcurrency: num(process.env.MAX_FETCH_CONCURRENCY, 8),
  llmBaseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
  llmApiKey: llmKey,
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  redisUrl: process.env.REDIS_URL ?? "",
  cacheTtlSec: num(process.env.CACHE_TTL, 900),
};
