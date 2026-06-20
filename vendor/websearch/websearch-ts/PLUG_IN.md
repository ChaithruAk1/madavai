# PLUG_IN.md — instructions for Claude (Cowork) to adopt this search engine

You are integrating the `websearch` package (this folder) into the user's Node/TypeScript
AI codebase as a **drop-in replacement for the Tavily JS SDK** (`@tavily/core`).
It is an in-process library — do NOT stand up a separate service. Reference: README.md, SETUP.md.

## What this package does
- Returns Google-grade web search (via Serper) in Tavily's response shape.
- Pipeline: Serper (Google) → fetch pages → Readability extraction → chunk → **rerank** → optional answer.
- **Pay-as-you-go, capped, then free:** pays Serper per search up to MONTHLY_BUDGET_USD, then
  automatically falls back to FREE search (SearXNG if SEARXNG_URL set, else DuckDuckGo). Never stops.
- Reranker uses the user's existing OpenAI embeddings by default (or Cohere). Graceful lexical fallback.
- Multi-replica safe via REDIS_URL (shared spend cap + cache).
- API: `import { createWebSearch } from "websearch"` → `tvly.search(query, opts)`, `tvly.usage()`,
  `tvly.setBudget(n)`, `tvly.setBudgetMode("soft"|"hard")`.

## This user's known setup (don't re-ask these)
- Stack: Node / TypeScript. Currently uses `@tavily/core`.
- Deployment: MULTIPLE REPLICAS → you MUST set REDIS_URL so the $1000 cap is global.
- LLM: OpenAI-compatible (use it for the reranker embeddings and optional answers).
- Spend policy: pay-as-you-go, HARD cap $1000/month, then free search. BUDGET_MODE=hard.

## Steps
1. COPY IN: place this folder in their repo (e.g. `vendor/websearch/`) OR `npm install <abs-path>`
   from the project root. Verify `import { createWebSearch } from "websearch"` resolves.
2. INSTALL deps in their project:
   `npm install jsdom @mozilla/readability ioredis`
   (jsdom+readability = better extraction; ioredis = shared cap/cache across replicas.)
3. BUILD: `npm run build` (outputs dist/). If they use tsx/ts-node/a bundler, import from `src/index.ts`
   instead and match their toolchain/module settings.
4. REPLACE TAVILY at every call site (grep: `@tavily/core`, `tavily(`, `.search(`):
   - `import { tavily } from "@tavily/core"`            → `import { createWebSearch } from "websearch"`
   - `const tvly = tavily({ apiKey: ... })`             → `const tvly = createWebSearch()`
   - `tvly.search(q, { searchDepth, maxResults, includeAnswer, includeDomains })` — unchanged.
   - Response unchanged: `res.results[i].{title,url,content,score,rawContent}`, `res.answer`, `res.responseTime`.
   - If the user relied on a Tavily-only field, flag it and ask.
5. ENV (add to their secrets manager / .env):
   SERP_API_KEY=<their serper key>
   BUDGET_MODE=hard
   MONTHLY_BUDGET_USD=1000
   SERP_COST_PER_QUERY=0.001
   SERP_STRATEGY=always
   REDIS_URL=<their redis url>            # REQUIRED — they run multiple replicas
   RERANKER_PROVIDER=openai
   EMBEDDING_MODEL=text-embedding-3-small
   LLM_BASE_URL=<their openai-compatible base url>
   LLM_API_KEY=<their key>
   LLM_MODEL=<their chat model>           # only needed if they use includeAnswer
   # optional: SEARXNG_URL=<url> to use SearXNG as the free tier instead of DuckDuckGo
   # optional: COHERE_API_KEY=<key> + RERANKER_PROVIDER=cohere for a stronger reranker
6. VERIFY: type-check/build their project; run ONE real search and print `await tvly.usage()`.
   Confirm results are sensible and `spentUsd`/`paidCalls` increment. Confirm the reranker is active
   (set RERANKER_PROVIDER=openai and check results are ordered sensibly).
7. CLEANUP: remove `@tavily/core` from package.json once all call sites are migrated.

## Guardrails
- In-process Node library only — never a Python sidecar.
- Multi-replica → REDIS_URL is mandatory or the $1000 cap becomes per-instance.
- Keep BUDGET_MODE=hard (pay-as-you-go up to $1000, then free). Don't switch to soft unless asked.
- If `import "websearch"` won't resolve in their toolchain, copy `src/` in and import by relative path.

## Done when
Their project builds, one live query returns Google-grade reranked results, `usage()` shows spend
incrementing toward the $1000 cap, the free fallback works past the cap, and `@tavily/core` is removed.
