process.env.SERP_API_KEY = "test";
process.env.BUDGET_MODE = "hard";
process.env.MONTHLY_BUDGET_USD = "0.002";    // tiny cap: ~2 paid then FREE
process.env.SERP_COST_PER_QUERY = "0.001";
process.env.SEARXNG_URL = "http://fake-searxng:8080";  // free tier = searxng (deterministic mock)
import { installMockFetch } from "./mock-free.mjs";
installMockFetch();
const { search, usage } = await import("../dist/index.js");

let sawGoogle = false, sawFree = false;
for (let i = 0; i < 6; i++) {
  const r = await search("unique q " + i, { maxResults: 3 });
  if (!r.results.length) throw new Error("EMPTY results at i=" + i + " (should fall back to free)");
  if (r.results[0].url.includes("google-result")) sawGoogle = true;
  if (r.results[0].url.includes("free-result")) sawFree = true;
}
const u = await usage();
if (u.paidCalls > 2) throw new Error("paid exceeded $1000-style cap: " + JSON.stringify(u));
if (!sawGoogle) throw new Error("never used Google under cap");
if (!sawFree) throw new Error("never fell back to free after cap");
console.log(`[ok] under cap -> Google, over cap -> FREE (never empty). paid=${u.paidCalls} free=${u.freeCalls} spent=$${u.spentUsd} cap=$${u.budgetUsd}`);

// DDG parser unit check
const { parseDuckduckgo } = await import("../dist/free.js");
const sample = '<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FRAG&rut=x">RAG Wiki</a><a class="result__snippet" href="x">retrieval augmented generation</a>';
const parsed = parseDuckduckgo(sample);
if (!(parsed.length === 1 && parsed[0].url === "https://en.wikipedia.org/wiki/RAG")) throw new Error("DDG parse failed: " + JSON.stringify(parsed));
console.log("[ok] DuckDuckGo free parser decodes real result URLs");
console.log("CAP->FREE TESTS PASSED");
