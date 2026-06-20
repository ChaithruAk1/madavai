process.env.SERP_API_KEY = "test";
process.env.RERANKER_PROVIDER = "openai";
process.env.LLM_API_KEY = "test";       // enables embedding reranker
process.env.BUDGET_MODE = "soft";
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("serper")) return { ok: true, headers: { get: () => "application/json" }, json: async () => ({
    organic: [
      { title: "Weather", link: "https://ex.com/weather", snippet: "cold rain in oslo today forecast" },
      { title: "Messi", link: "https://ex.com/messi", snippet: "lionel messi argentine footballer goals" },
    ] }) };
  if (url.includes("/embeddings")) {
    const inputs = JSON.parse(init.body).input;
    const vec = (s) => /messi/i.test(s) ? [1,0,0] : (/oslo|weather/i.test(s) ? [0,1,0] : [0,0,1]);
    return { ok: true, json: async () => ({ data: inputs.map((s) => ({ embedding: vec(s) })) }) };
  }
  return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html><body><p>x</p></body></html>" };
};
const { search } = await import("../dist/index.js");
const r = await search("who is lionel messi", { maxResults: 2 });
if (!r.results[0].url.includes("messi")) throw new Error("reranker did NOT reorder: " + JSON.stringify(r.results.map((x) => x.url)));
if (!(r.results[0].score >= r.results[1].score)) throw new Error("not sorted by score");
console.log(`[ok] embeddings reranker reordered (Serper gave weather first -> messi now #1, score=${r.results[0].score})`);

// fallback: embeddings endpoint fails -> lexical, no crash
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("serper")) return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ organic: [{ title: "M", link: "https://ex.com/m", snippet: "messi" }] }) };
  if (url.includes("/embeddings")) return { ok: false, status: 500 };
  return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html></html>" };
};
const r2 = await search("messi", { maxResults: 1 });
if (!r2.results.length) throw new Error("fallback crashed");
console.log("[ok] reranker fails -> graceful lexical fallback, still returns results");
console.log("RERANK TESTS PASSED");
