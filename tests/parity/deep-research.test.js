import { describe, it, expect } from "vitest";
import { planSearches, assembleDigest, runDeepResearch } from "../../src/bridge/deepResearch.js";

describe("deepResearch.planSearches", () => {
  it("uses the model's sub-queries when given (deduped, original appended)", () => {
    expect(planSearches("main", ["a", "b", "a", "  b  ", "c"], 5)).toEqual(["a", "b", "c", "main"]);
  });
  it("expands a lone query with angles when too few", () => {
    const t = planSearches("quantum batteries");
    expect(t[0]).toBe("quantum batteries");
    expect(t.length).toBeGreaterThanOrEqual(3);
    expect(t).toContain("quantum batteries overview");
  });
  it("caps the number of searches", () => {
    expect(planSearches("q", ["1", "2", "3", "4", "5", "6", "7"], 4).length).toBe(4);
  });
});

describe("deepResearch.assembleDigest", () => {
  it("builds a per-source digest", () => {
    const d = assembleDigest("topic", [{ term: "t1", text: "alpha" }, { term: "t2", text: "beta" }]);
    expect(d).toContain("Research digest for: topic");
    expect(d).toContain("### t1"); expect(d).toContain("alpha");
    expect(d).toContain("### t2"); expect(d).toContain("beta");
  });
  it("respects the total cap", () => {
    const big = "x".repeat(5000);
    const d = assembleDigest("topic", [{ term: "a", text: big }, { term: "b", text: big }], { perCap: 5000, totalCap: 6000 });
    expect(d.length).toBeLessThan(6500);
  });
  it("handles no results", () => {
    expect(assembleDigest("topic", [])).toContain("No web results");
  });
});

describe("deepResearch.runDeepResearch (injected searchFn — no network)", () => {
  it("searches each planned term and assembles a cited digest", async () => {
    const calls = [];
    const searchFn = async (term) => { calls.push(term); return "snippets for " + term; };
    const out = await runDeepResearch({ query: "topic", queries: ["x", "y"] }, searchFn);
    expect(calls).toEqual(expect.arrayContaining(["x", "y", "topic"]));
    expect(out).toContain("### x"); expect(out).toContain("snippets for x");
  });
  it("survives a failing search (digest built from the rest)", async () => {
    const searchFn = async (term) => { if (term === "y") throw new Error("net"); return "ok " + term; };
    const out = await runDeepResearch({ query: "topic", queries: ["x", "y"] }, searchFn);
    expect(out).toContain("ok x");
    expect(out).not.toContain("### y");
  });
});
