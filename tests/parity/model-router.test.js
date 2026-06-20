import { describe, it, expect, beforeEach } from "vitest";
import { categoryFor, resolveCandidates, noteFailure, onCooldown, clearCooldowns, isRetryable, retryAfterMs, runChain } from "../../core/model-router.js";

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

const httpErr = (status) => Object.assign(new Error("http " + status), { status });

describe("core/model-router — isRetryable (transient/availability only)", () => {
  it("429 / 408 / 409 / 425 / 5xx → retryable (advance to the next model)", () => {
    [429, 408, 409, 425, 500, 502, 503, 504].forEach((s) => expect(isRetryable(httpErr(s))).toBe(true));
  });
  it("auth / bad-request / not-found / billing → NOT retryable (surface, never mask with a model-swap)", () => {
    [400, 401, 403, 404, 422, 402].forEach((s) => expect(isRetryable(httpErr(s))).toBe(false));
    expect(isRetryable(new Error("network"))).toBe(false);
  });
});

describe("core/model-router — retryAfterMs (honor server Retry-After)", () => {
  it("a seconds value → milliseconds", () => expect(retryAfterMs({ headers: { "retry-after": "2" } })).toBe(2000));
  it("no header → null (caller falls back to the default cooldown)", () => expect(retryAfterMs({})).toBe(null));
});

describe("core/model-router — runChain (the ONE shared fallback loop)", () => {
  beforeEach(() => clearCooldowns());
  const list = [{ key: "a", baseUrl: "u", model: "A" }, { key: "b", baseUrl: "u", model: "B" }];
  it("returns the first success and does not try the rest", async () => {
    const seen = [];
    const r = await runChain({ candidates: list, attempt: (c) => { seen.push(c.model); return "ok-" + c.model; } });
    expect(r).toBe("ok-A"); expect(seen).toEqual(["A"]);
  });
  it("advances on a retryable failure, fires onReroute, and cools the failed model down", async () => {
    const seen = [], reroutes = [];
    const r = await runChain({ candidates: list, attempt: (c) => { seen.push(c.model); if (c.model === "A") throw httpErr(429); return "ok-" + c.model; }, onReroute: (e) => reroutes.push(e.from.model + ">" + e.to.model) });
    expect(r).toBe("ok-B"); expect(seen).toEqual(["A", "B"]); expect(reroutes).toEqual(["A>B"]); expect(onCooldown("a")).toBe(true);
  });
  it("falls back on ANY failure reason — 404 / 400 / network, not just rate limits", async () => {
    const seen = [];
    const r = await runChain({ candidates: list, attempt: (c) => { seen.push(c.model); if (c.model === "A") throw httpErr(404); return "ok-" + c.model; } });
    expect(r).toBe("ok-B"); expect(seen).toEqual(["A", "B"]);
  });
  it("does NOT reroute after output already streamed (no double-streamed half reply)", async () => {
    const seen = [];
    await expect(runChain({ candidates: list, attempt: (c) => { seen.push(c.model); throw Object.assign(new Error("mid-stream"), { streamed: true }); } })).rejects.toMatchObject({ streamed: true });
    expect(seen).toEqual(["A"]);
  });
  it("a user abort throws immediately and never reroutes", async () => {
    const seen = [];
    await expect(runChain({ candidates: list, attempt: (c) => { seen.push(c.model); throw Object.assign(new Error("abort"), { name: "AbortError" }); } })).rejects.toMatchObject({ name: "AbortError" });
    expect(seen).toEqual(["A"]);
  });
  it("when the whole chain is exhausted, surfaces the FIRST (selected-model) failure, not the last fallback's", async () => {
    const seen = [];
    // First model 429 (rate-limited), last a dead 404 fallback id — the user must see the 429, NEVER the 404.
    await expect(runChain({ candidates: list, attempt: (c) => { seen.push(c.model); throw httpErr(c.model === "A" ? 429 : 404); } })).rejects.toMatchObject({ status: 429 });
    expect(seen).toEqual(["A", "B"]);
  });
  it("the exhausted-chain message is plain-language: names the reason, the backup count, and the next step", async () => {
    let msg = "";
    try { await runChain({ candidates: list, attempt: () => { throw httpErr(429); } }); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/rate-limited/i);
    expect(msg).toMatch(/backup/i);
    expect(msg).toMatch(/different model/i);
  });
});
