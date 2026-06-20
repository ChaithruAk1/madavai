// core/search.js — paste over (or into) your existing search module. ESM version.
// Backs searchWeb() with the websearch engine. NO build step: imports the prebuilt bundle.
import { createWebSearch } from "./websearch.mjs"; // put bundle/websearch.mjs next to this file

const engine = createWebSearch(); // reads env: SERP_API_KEY, BUDGET_MODE, MONTHLY_BUDGET_USD, ...

// Keep this signature + return shape identical to your current searchWeb() so every caller
// works unchanged. Adjust the field mapping below if your callers expect different keys.
export async function searchWeb(query, { maxResults = 5, depth = "advanced" } = {}) {
  const res = await engine.search(query, { searchDepth: depth, maxResults });
  return res.results.map((r) => ({ title: r.title, url: r.url, content: r.content, score: r.score }));
}

// Optional ops helpers:
export const searchUsage = engine.usage;          // -> { spentUsd, remainingUsd, overBudget, ... }
export const setSearchBudget = engine.setBudget;   // raise/lower the cap at runtime
