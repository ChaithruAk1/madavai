import { describe, it, expect } from "vitest";
import { isModelFree, providerFreeTier, resolveModelValue } from "../../src/modelCost.js";

describe("model cost — free/paid from the PROVIDER, never the model-name text", () => {
  it("real pricing wins: $0 -> free, >$0 -> paid", () => {
    const cat = { "deepseek/deepseek-v3": { priceIn: 0.0000002, priceOut: 0.0000008 }, "x/y:free": { priceIn: 0, priceOut: 0 } };
    expect(isModelFree({ id: "p_or::deepseek/deepseek-v3", prov: "OpenRouter" }, { catalog: cat })).toBe(false);
    expect(isModelFree({ id: "p_or::x/y:free", prov: "OpenRouter" }, { catalog: cat })).toBe(true);
  });
  it("does NOT use the name: a ':free' name with no price/provider signal is paid", () => {
    expect(isModelFree({ id: "p_x::something:free", prov: "MysteryCo" })).toBe(false);
  });
  it("NVIDIA dev tier with no per-model pricing -> free (the reported bug)", () => {
    expect(isModelFree({ id: "p_nv::nvidia/nemotron-nano-12b-v2-vl", prov: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" })).toBe(true);
  });
  it("NVIDIA-tier model that ALSO has an OpenRouter catalog price stays FREE (provider tier wins)", () => {
    const cat = { "openai/gpt-oss-120b": { priceIn: 0.0000005, priceOut: 0.000002 } };
    // served free via NVIDIA (item.free stamped true OR provider says nvidia) — the OpenRouter price must NOT flip it
    expect(isModelFree({ id: "p_nv::openai/gpt-oss-120b", prov: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", free: true }, { catalog: cat })).toBe(true);
    expect(isModelFree({ id: "p_nv::openai/gpt-oss-120b", prov: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" }, { catalog: cat })).toBe(true);
    // same model on an OpenRouter profile (item.free=false) correctly uses the catalog price -> paid
    expect(isModelFree({ id: "p_or::openai/gpt-oss-120b", prov: "OpenRouter", free: false }, { catalog: cat })).toBe(false);
  });
  it("does NOT mix providers: the OpenRouter catalog never applies to a non-OpenRouter provider's model", () => {
    const cat = { "deepseek/deepseek-v3": { priceIn: 0, priceOut: 0 } }; // free ON OPENROUTER
    // a Together AI profile serving the same id must NOT inherit OpenRouter's $0 — it's paid (we have no Together pricing)
    expect(isModelFree({ id: "p_tg::deepseek/deepseek-v3", prov: "Together AI", baseUrl: "https://api.together.xyz/v1" }, { catalog: cat })).toBe(false);
    // an OpenAI profile likewise never borrows an OpenRouter price
    expect(isModelFree({ id: "p_oa::deepseek/deepseek-v3", prov: "OpenAI", baseUrl: "https://api.openai.com/v1" }, { catalog: cat })).toBe(false);
    // but the SAME id on an actual OpenRouter profile uses the catalog -> free
    expect(isModelFree({ id: "p_or::deepseek/deepseek-v3", prov: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" }, { catalog: cat })).toBe(true);
  });
  it("stamped provider tier (item.free) is honored", () => {
    expect(isModelFree({ id: "p_nv::nvidia/whatever", prov: "NVIDIA", free: true })).toBe(true);
    expect(isModelFree({ id: "p_z::z", prov: "Z", free: false })).toBe(false);
  });
  it("OpenAI / Anthropic on the user's own key -> paid", () => {
    expect(isModelFree({ id: "p_oa::gpt-4o", prov: "OpenAI" })).toBe(false);
    expect(isModelFree({ id: "p_an::claude-sonnet-4-6", prov: "Anthropic" })).toBe(false);
  });
  it("Madav Starter and Local -> free", () => {
    expect(isModelFree({ id: "p_starter::nvidia/x:free", prov: "Madav Starter (free)" })).toBe(true);
    expect(isModelFree({ id: "p_local::qwen", prov: "Local", baseUrl: "http://localhost:1234" })).toBe(true);
  });
  it("model maker 'nvidia' inside an OpenRouter id must NOT flip it to free (no catalog) -> paid", () => {
    expect(isModelFree({ id: "p_openrouter::nvidia/nemotron", prov: "OpenRouter" })).toBe(false);
  });
  it("providerFreeTier table", () => {
    expect(providerFreeTier({ name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com" })).toBe(true);
    expect(providerFreeTier({ name: "OpenAI" })).toBe(false);
    expect(providerFreeTier({ name: "OpenRouter" })).toBe(false);
  });
});

describe("resolveModelValue — per-chat model memory restores a conversation's model", () => {
  const profiles = { p_starter: { id: "p_starter", name: "Madav Starter (free)", cachedModels: ["nvidia/nemotron-nano-9b-v2:free"] }, p_or: { id: "p_or", name: "OpenRouter", model: "deepseek/deepseek-v3", cachedModels: [] } };
  it("matches by provider name", () => {
    expect(resolveModelValue(profiles, "nvidia/nemotron-nano-9b-v2:free", "Madav Starter (free)")).toBe("p_starter::nvidia/nemotron-nano-9b-v2:free");
  });
  it("falls back to the profile that carries the model when the provider name is gone", () => {
    expect(resolveModelValue(profiles, "nvidia/nemotron-nano-9b-v2:free", "Renamed")).toBe("p_starter::nvidia/nemotron-nano-9b-v2:free");
    expect(resolveModelValue(profiles, "deepseek/deepseek-v3", "???")).toBe("p_or::deepseek/deepseek-v3");
  });
  it("returns null when nothing matches (caller keeps current model)", () => {
    expect(resolveModelValue(profiles, "totally/unknown", "Nope")).toBe(null);
    expect(resolveModelValue(profiles, "", "x")).toBe(null);
  });
});
