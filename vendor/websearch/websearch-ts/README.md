# websearch — Google-grade web search for your Node/TS AI engine

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
