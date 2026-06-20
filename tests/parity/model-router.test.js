import { describe, it, expect, beforeEach } from "vitest";
import { categoryFor, resolveCandidates, noteFailure, onCooldown, clearCooldowns } from "../../core/model-router.js";

// SINGLE SOURCE model routing (Phase 1, manual). Picker selection is always primary; the category chain
// is the ordered fallback; cooldowns stop a just-failed model being re-hit. Same module, desktop + web.
describe("core/model-router — category detection (surface + image, not content)", () => {
  it("an attached image overrides everything -> vision", () => {
    expect(categoryFor({ hasImage: true })).toBe("vision");
    expect(categoryFor({ hasImage: true, mode: "code" })).toBe("vision");
  });
  it("code/build -> coding; data-tool turn or agentic surface -> agentic; chat -> general", () => {
    expect(categoryFor({ mode: "code" })).toBe("coding");
    expect(categoryFor({ mode: "build" })).toBe("coding");
    expect(categoryFor({ mode: "chat", needsData: true })).toBe("agentic");
    expect(categoryFor({ mode: "cowork" })).toBe("agentic");
    expect(categoryFor({ mode: "project" })).toBe("agentic");
    expect(categoryFor({ mode: "chat" })).toBe("general");
    expect(categoryFor({})).toBe("general");
  });
});

describe("core/model-router — resolveCandidates (selected-first, chain fallback, filtered)", () => {
  beforeEach(() => clearCooldowns());
  const profiles = {
    nv: { baseUrl: "https://integrate.api.nvidia.com", apiKey: "k1", kind: "openai", name: "Nvidia" },
    or: { baseUrl: "https://openrouter.ai/api", apiKey: "k2", kind: "openai", name: "OpenRouter" },
    nokey: { baseUrl: "https://x.example", apiKey: "", kind: "openai", name: "NoKey" },
  };
  const selected = { baseUrl: "https://integrate.api.nvidia.com", apiKey: "k1", model: "deepseek-v4-pro", kind: "openai", name: "Nvidia" };
  const routing = { general: ["or::meta/llama-3.3-70b", "or::mistralai/mistral-large", "nokey::ghost"] };

  it("puts the live picker selection FIRST, then the chain in order", () => {
    const c = resolveCandidates({ category: "general", selected, profiles, routing });
    expect(c.map((x) => x.model)).toEqual(["deepseek-v4-pro", "meta/llama-3.3-70b", "mistralai/mistral-large"]);
  });
  it("drops chain refs whose provider has no key", () => {
    const c = resolveCandidates({ category: "general", selected, profiles, routing });
    expect(c.some((x) => x.model === "ghost")).toBe(false);
  });
  it("dedupes when the selected model also appears in the chain", () => {
    const r2 = { general: ["nv::deepseek-v4-pro", "or::meta/llama-3.3-70b"] };
    const c = resolveCandidates({ category: "general", selected, profiles, routing: r2 });
    expect(c.map((x) => x.model)).toEqual(["deepseek-v4-pro", "meta/llama-3.3-70b"]); // not twice
  });
  it("skips a candidate that is on cooldown", () => {
    const c0 = resolveCandidates({ category: "general", selected, profiles, routing });
    noteFailure(c0[0].key); // selected just failed
    const c1 = resolveCandidates({ category: "general", selected, profiles, routing });
    expect(c1[0].model).toBe("meta/llama-3.3-70b"); // selected skipped while cooling down
    expect(onCooldown(c0[0].key)).toBe(true);
  });
});
