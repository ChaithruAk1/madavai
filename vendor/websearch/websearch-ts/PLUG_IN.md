# PLUG_IN.md — instructions for Claude (Cowork) to wire this package into the user's AI codebase

You are integrating the `websearch` package (this folder) into the user's Node/TS
AI project as a **drop-in replacement for the Tavily JS SDK**. It is an in-process
library — do NOT stand up a separate service. Full reference: README.md, SETUP.md.

## What this package is
- Node/TS library returning Google-grade web search (via Serper) in Tavily's shape.
- API: `import { createWebSearch } from "websearch"` →
  `const tvly = createWebSearch(); await tvly.search(query, opts)`,
  `await tvly.usage()`, `tvly.setBudget(n)`, `tvly.setBudgetMode("soft"|"hard")`.
- Spend cap is SOFT by default (never blocks searches). Optional Redis for multi-replica.
  Optional OpenAI-compatible answers via LLM_* env.

## First, ask the user for (and wait):
1. Root path of their AI project (folder containing package.json).
2. Their package.json contents (module type "module"/"commonjs", TS setup, is @tavily/core present?).
3. Every place they call search today — grep the repo for: `@tavily/core`, `tavily(`, `.search(`.
4. Their Serper API key (or confirm SERP_API_KEY is already in their secrets).
5. Do they run multiple replicas / serverless? If yes, you will set REDIS_URL.
6. Do they use `includeAnswer` (need LLM_* wired) — and which OpenAI-compatible endpoint?

## Steps
1. COPY IN: place this folder into their repo (e.g. `vendor/websearch/`) OR from their
   project root run `npm install <abs-path-to-this-folder>`. Verify
   `import { createWebSearch } from "websearch"` resolves (add a workspace/path entry if needed).
2. DEPS (in their project): core needs nothing. Add `ioredis` if multi-replica;
   add `jsdom @mozilla/readability` for higher-quality page extraction.
3. BUILD: if shipping the TS source, `npm run build` (outputs dist/). If they use
   tsx/ts-node/a bundler, import from `src/index.ts` instead and match their toolchain.
4. REPLACE TAVILY at each call site:
   - `import { tavily } from "@tavily/core"`  →  `import { createWebSearch } from "websearch"`
   - `const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })`  →  `const tvly = createWebSearch()`
   - `tvly.search(q, { searchDepth, maxResults, includeAnswer, includeDomains, ... })` — unchanged.
   - Response fields match: `res.results[i].{ title, url, content, score, rawContent }`,
     `res.answer`, `res.responseTime`. If the user relied on a Tavily-only field, flag it and ask.
5. ENV: add to their .env / secrets manager:
   `SERP_API_KEY`, `BUDGET_MODE=soft`, `MONTHLY_BUDGET_USD=500`, `SERP_COST_PER_QUERY=0.001`,
   `REDIS_URL=...` (if multi-replica), and `LLM_BASE_URL/LLM_API_KEY/LLM_MODEL` (if they use answers).
6. VERIFY: type-check/build their project; run ONE real search and print `await tvly.usage()`.
   Confirm results are sensible and `spentUsd`/`paidCalls` increment.
7. CLEANUP: remove `@tavily/core` from package.json once all call sites are migrated.

## Guardrails
- In-process Node library only — never a Python sidecar.
- Keep `BUDGET_MODE=soft` unless the user explicitly wants a hard ceiling (soft never blocks).
- If `import "websearch"` won't resolve in their setup, prefer copying `src/` in and importing
  by relative path over fighting module resolution.

## Done when
Their project builds, one live query returns Google-grade results, `usage()` shows spend,
and the old Tavily import is gone.
