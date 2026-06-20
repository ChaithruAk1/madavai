# websearch — Google-grade web search for your Node/TS AI engine

> **Fastest path:** see `QUICKSTART.md` — drop in one prebuilt file (`bundle/websearch.mjs`), paste `core/search.js`, set env. No build, no call-site hunting.

A drop-in-ish replacement for the Tavily JS SDK that lives **inside your codebase**.
Google results (via Serper), cleaned + ranked, returned in Tavily's shape. The
spend cap is **soft by default — it never stops your AI**, it just tracks spend
and warns when you go over, so you keep full flexibility to raise it.

```ts
import { createWebSearch } from "websearch";
const tvly = createWebSearch();

const res = await tvly.search("latest EU AI Act changes", { searchDepth: "advanced", maxResults: 5 });
const context = res.results.map(r => `${r.title}\n${r.url}\n${r.content}`);

await tvly.usage();      // { spentUsd, overBudget, paidCalls, ... }
tvly.setBudget(1000);    // raise the limit any time, no redeploy
```

- **Zero infra**: no Python service, no Docker, no GPU. Pure Node, plus a Serper key.
- **Multi-replica safe**: set `REDIS_URL` and the spend cap + cache are shared across all instances.
- **Soft cap**: `BUDGET_MODE=soft` (default) never blocks; `hard` enforces a ceiling if you want one.

See **SETUP.md** for the full guide. Same $500 ≈ 5–15× more searches than Tavily.

---

## Verify your copy is current (v1.1.0)

If a teammate/agent reports the package "has no reranker" or "no RERANKER_PROVIDER",
they have a stale pre-1.1 copy. Confirm the copy is current:

```bash
npm test          # builds + runs all 5 smoke tests offline (no network/keys needed)
```
A current copy must have ALL of these:
- `src/config.ts` contains `rerankerProvider` (RERANKER_PROVIDER) + `cohereApiKey`
- `src/rank.ts` exports `rerankTexts` (embeddings/Cohere rerank, lexical fallback)
- `src/free.ts` exists (DuckDuckGo / SearXNG free fallback)
- `src/budget.ts` has `setBudget` + soft/hard modes
- `package.json` version is `1.1.0`

## Integrating into an existing `searchWeb()` (recommended, lowest-risk)

If your app already funnels search through one function, do a **one-file swap** — see
`examples/searchWeb-adapter.ts`. Rewrite that function's body to call the engine and
keep its signature; every caller picks it up automatically (no call-site hunting).
