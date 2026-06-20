# QUICKSTART — fastest integration (no build step)

Back your existing `searchWeb()` with this engine in ~5 minutes. The engine runs on
Node's native fetch with **zero required dependencies**, so there's nothing to compile.

## 1. Drop in ONE file
Copy `bundle/websearch.mjs` (ESM) — or `bundle/websearch.cjs` (CommonJS) — into your repo,
e.g. next to your search module as `core/websearch.mjs`. That single file is the whole engine.

## 2. Back searchWeb() with it (the entire swap)
Copy `examples/core-search.js` (ESM) or `examples/core-search.cjs` (CJS) into your
`core/search.js`; fix the import path to the file from step 1. It exports
`searchWeb(query, {maxResults, depth})` returning `{title,url,content,score}[]`.
Match the mapping to your old return shape if it differed. Because every caller already
routes through `searchWeb()`, this one file is the whole swap — no call-site hunting.

## 3. Set env vars (Render → Environment)
    SERP_API_KEY=<your serper key>      # required
    BUDGET_MODE=hard
    MONTHLY_BUDGET_USD=1000
    SERP_STRATEGY=always
    SERP_COST_PER_QUERY=0.001
    LLM_BASE_URL=<openai-compatible base url>   # reranker embeddings (+ optional answers)
    LLM_API_KEY=<your key>
    REDIS_URL=<your redis url>          # makes the $1000 cap shared across your replicas
    # optional: SEARXNG_URL, COHERE_API_KEY

## 4. Deploy and watch
Run one search, then read `searchUsage()`: you should see `spentUsd` climb, stop at the
cap, then fall back to free search.

## Optional upgrades (each is ONE npm install; not needed to start)
    npm install ioredis                      # needed so the $1000 cap is global across replicas
    npm install jsdom @mozilla/readability   # cleaner page extraction (better quality)

No `npm run build`, no grep, no call-site search. That's the whole thing.
