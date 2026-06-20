process.env.SERP_API_KEY = "test";
process.env.SERP_STRATEGY = "always";
process.env.BUDGET_MODE = "soft";        // default; never blocks
process.env.MONTHLY_BUDGET_USD = "0.002"; // tiny, to prove soft does NOT stop
process.env.SERP_COST_PER_QUERY = "0.001";
import { installMockFetch } from "./mock.mjs";
installMockFetch();
const { search, usage } = await import("../dist/index.js");

// shape + dedup + advanced extraction
const r = await search("what is retrieval augmented generation", { searchDepth: "advanced", maxResults: 5 });
if (!(r.results.length === 2)) throw new Error("dedup failed: " + r.results.length);
if (!r.results[0].url.includes("RAG")) throw new Error("ranking failed");
if (!/Retrieval/i.test(r.results[0].content)) throw new Error("extraction failed");
if (typeof r.responseTime !== "number") throw new Error("no responseTime");
console.log("[ok] shape + dedup(3->2) + advanced extraction");

// soft budget: keep going PAST the cap (5 unique paid searches on a $0.002 cap)
for (let i = 0; i < 5; i++) await search("unique soft query " + i);
const u = await usage();
if (u.paidCalls < 5) throw new Error("soft cap wrongly blocked: " + JSON.stringify(u));
if (!u.overBudget) throw new Error("overBudget flag not set");
console.log(`[ok] SOFT cap never blocks: paid=${u.paidCalls} spent=$${u.spentUsd} overBudget=${u.overBudget} (cap $${u.budgetUsd})`);
console.log("SOFT TESTS PASSED");
