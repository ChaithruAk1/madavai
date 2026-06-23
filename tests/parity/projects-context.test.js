// Single-source lock for project KNOWLEDGE assembly (ADR-0001). core/projects/context.js is the ONE copy;
// web reaches it via the src/bridge/ragLite.js re-export shim; desktop via a cached dynamic import.
import { describe, it, expect } from "vitest";
import { buildKnowledgeContext, chunkText, selectRelevant } from "../../core/projects/context.js";
import * as shim from "../../src/bridge/ragLite.js";

describe("core/projects/context — single source for project knowledge", () => {
  it("small knowledge -> whole docs, verbatim (unchanged behavior)", () => {
    expect(buildKnowledgeContext("", [{ name: "A", content: "hello world" }])).toBe("# A\nhello world");
  });

  it("no real docs -> empty string", () => {
    expect(buildKnowledgeContext("", [])).toBe("");
    expect(buildKnowledgeContext("", [{ name: "x", content: "   " }])).toBe("");
  });

  it("large knowledge -> bounded excerpts (not an unbounded dump)", () => {
    const big = [{ name: "Big", content: "alpha beta gamma ipsum delta. ".repeat(400) }]; // ~12k chars
    const out = buildKnowledgeContext("ipsum", big, { budget: 2000 });
    expect(out.length).toBeLessThan(3200);                 // bounded, far below the ~12k full dump
    expect(out).toMatch(/excerpts from this project's knowledge/i);
  });

  it("web shim re-exports the SAME bindings (proves one copy, both surfaces)", () => {
    expect(shim.buildKnowledgeContext).toBe(buildKnowledgeContext);
    expect(shim.chunkText).toBe(chunkText);
    expect(shim.selectRelevant).toBe(selectRelevant);
  });
});
