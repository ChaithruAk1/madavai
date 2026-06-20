process.env.SERP_API_KEY = "test";
process.env.SERP_STRATEGY = "always";
process.env.BUDGET_MODE = "hard";         // enforce ceiling
process.env.MONTHLY_BUDGET_USD = "0.002";
process.env.SERP_COST_PER_QUERY = "0.001";
import { installMockFetch } from "./mock.mjs";
installMockFetch();
const { search, usage } = await import("../dist/index.js");
for (let i = 0; i < 6; i++) await search("hard query " + i);
const u = await usage();
if (u.paidCalls > 2) throw new Error("hard cap exceeded: " + JSON.stringify(u));
console.log(`[ok] HARD cap stops at ceiling: paid=${u.paidCalls} spent=$${u.spentUsd} (cap $${u.budgetUsd})`);
console.log("HARD TESTS PASSED");
