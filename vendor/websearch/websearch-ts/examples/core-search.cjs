// core/search.js — CommonJS version (use if your repo uses require/module.exports).
const { createWebSearch } = require("./websearch.cjs"); // put bundle/websearch.cjs next to this file
const engine = createWebSearch();

async function searchWeb(query, { maxResults = 5, depth = "advanced" } = {}) {
  const res = await engine.search(query, { searchDepth: depth, maxResults });
  return res.results.map((r) => ({ title: r.title, url: r.url, content: r.content, score: r.score }));
}

module.exports = { searchWeb, searchUsage: engine.usage, setSearchBudget: engine.setBudget };
