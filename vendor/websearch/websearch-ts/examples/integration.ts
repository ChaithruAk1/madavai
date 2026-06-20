// Migrating off Tavily? It's almost a find-and-replace:
//   import { tavily } from "@tavily/core";
//   const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
// becomes:
import { createWebSearch } from "websearch";
const tvly = createWebSearch();

export async function getWebContext(question: string): Promise<string[]> {
  const res = await tvly.search(question, { searchDepth: "advanced", maxResults: 5 });
  return res.results.map((r) => `${r.title}\n${r.url}\n${r.content}`);
}

// somewhere in your agent/RAG loop:
//   const context = await getWebContext(userQuestion);
//   const usage = await tvly.usage();   // { spentUsd, overBudget, ... } — soft cap, never blocks
