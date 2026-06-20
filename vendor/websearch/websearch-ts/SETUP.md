# Setup — Google-grade web search inside your Node/TS AI engine

Replaces the Tavily SDK with a package in your own repo. ~15 minutes, nothing to maintain.

## 1. Get your Serper (Google) key
Sign up at **https://serper.dev** (2,500 free queries to test), copy the API key.
Serper *is* your Google access — **no Google Cloud account needed**. To use a
different provider later, just change `SERP_BASE_URL`.

## 2. Add the package to your repo
**Copy** the `websearch/` build into your project, or install it:
```bash
npm install /path/to/websearch-ts        # or publish to your private registry
# core has ZERO heavy deps. Optional, only if you want them:
npm install ioredis                        # shared spend cap + cache across replicas
npm install jsdom @mozilla/readability     # higher-quality page extraction
```
Build (if using the source): `npm run build` → outputs `dist/`.

## 3. Configure (env / your secrets manager)
```
SERP_API_KEY=<your serper key>     # required
BUDGET_MODE=soft                   # soft = NEVER stops your AI (default). hard = ceiling.
MONTHLY_BUDGET_USD=500             # your target/alert threshold — raise anytime
SERP_COST_PER_QUERY=0.001          # your Serper rate, so spend math is accurate
REDIS_URL=redis://...              # REQUIRED in production (you run multiple replicas)
# optional written answers, using the LLM you already run:
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=<your openai-compatible key>
LLM_MODEL=gpt-4o-mini
```

> **Multiple replicas:** without `REDIS_URL`, each instance counts spend on its
> own (so the cap is per-replica). With `REDIS_URL` set, spend and cache are
> shared, so `MONTHLY_BUDGET_USD` and `usage()` are global. Set it in production.

## 4. Migrate from Tavily (almost a find-and-replace)
```ts
// before
import { tavily } from "@tavily/core";
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

// after
import { createWebSearch } from "websearch";
const tvly = createWebSearch();                 // key comes from SERP_API_KEY env
```
The call and the response shape are the same:
```ts
const res = await tvly.search(query, { searchDepth: "advanced", maxResults: 5, includeAnswer: true });
// res.results[i] = { title, url, content, score, rawContent }
// res.answer, res.responseTime
```

## 5. The soft cap = flexibility (what you asked for)
- It **never blocks** a search. If you cross `MONTHLY_BUDGET_USD`, it keeps
  serving and sets `overBudget: true` (and logs one warning).
- Check spend anytime: `const u = await tvly.usage();  // { spentUsd, remainingUsd, overBudget, paidCalls }`
- Raise the limit live, no redeploy: `tvly.setBudget(1000);`
- Want a hard ceiling instead? `BUDGET_MODE=hard` (or `tvly.setBudgetMode("hard")`).

## 6. Ship it
There's nothing to deploy separately — it runs inside your AI process. Put the
env vars in your secrets manager and ship as usual. Point `REDIS_URL` at the
Redis you already run.

## 7. Cost dial
| `MONTHLY_BUDGET_USD` | Google-grade searches/month (~$0.0003–0.001 each) |
|---|---|
| $50    | ~50k–166k |
| $500   | ~500k–1.6M  (Tavily gives 100k for the same $500) |
| $5,000 | ~5M–16M |

## FAQ
- **Need Google Cloud?** No — Serper is your Google access.
- **Quality vs Tavily?** Raw results are Google (often better than Tavily's hybrid).
  Default ranking is lexical; install `jsdom`+`@mozilla/readability` for cleaner
  page text, which is what closes the gap.
- **Will I get a surprise bill?** In soft mode you can overspend by design — watch
  `usage().overBudget` (or wire it to an alert). Use `hard` mode if you want a wall.
