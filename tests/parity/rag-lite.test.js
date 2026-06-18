import { describe, it, expect } from "vitest";
import { chunkText, selectRelevant, buildKnowledgeContext } from "../../src/bridge/ragLite.js";

describe("ragLite.chunkText", () => {
  it("returns one chunk for short text, [] for empty", () => {
    expect(chunkText("hello world").length).toBe(1);
    expect(chunkText("   ")).toEqual([]);
  });
  it("splits long text into bounded chunks", () => {
    const long = Array.from({ length: 50 }, (_, i) => "Paragraph " + i + " " + "x".repeat(60)).join("\n\n");
    const chunks = chunkText(long, 300);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(320);
  });
});

describe("ragLite.selectRelevant", () => {
  it("ranks passages containing the query terms above those that don't", () => {
    const docs = [{ name: "d", content: "Cats are felines.\n\nThe zebra is a striped equine.\n\nDogs bark loudly." }];
    const ranked = selectRelevant("zebra striped", docs, { chunkSize: 40 });
    expect(ranked[0].text.toLowerCase()).toContain("zebra");
    expect(ranked[0].score).toBeGreaterThan(0);
  });
});

describe("ragLite.buildKnowledgeContext", () => {
  it("returns whole docs unchanged when under budget", () => {
    const out = buildKnowledgeContext("anything", [{ name: "Notes", content: "alpha beta gamma" }]);
    expect(out).toBe("# Notes\nalpha beta gamma");
  });
  it("empty/blank docs -> empty string", () => {
    expect(buildKnowledgeContext("q", [{ name: "x", content: "   " }])).toBe("");
    expect(buildKnowledgeContext("q", [])).toBe("");
  });
  it("large knowledge + query -> ranked excerpts containing the query term, within budget", () => {
    const filler = ("filler ".repeat(2000));                       // ~14k chars, irrelevant
    const content = filler + "\n\nThe zebra fact is unique here.";
    const out = buildKnowledgeContext("zebra", [{ name: "Big", content }], { budget: 6000, chunkSize: 700 });
    expect(out).toContain("Relevant excerpts");
    expect(out.toLowerCase()).toContain("zebra");
    expect(out).not.toContain("filler filler filler filler");      // irrelevant filler dropped
    expect(out.length).toBeLessThan(2000);
  });
  it("large knowledge + no query -> truncated excerpts within budget", () => {
    const content = "para ".repeat(4000);                          // ~20k chars
    const out = buildKnowledgeContext("", [{ name: "Big", content }], { budget: 6000 });
    expect(out).toContain("Excerpts");
    expect(out.length).toBeLessThan(6600);
  });
});
