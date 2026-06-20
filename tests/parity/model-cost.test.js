import { describe, it, expect } from "vitest";
import { isModelFree, providerFreeTier, resolveModelValue, isVisionModel } from "../../src/modelCost.js";

describe("model cost — free/paid is per-MODEL via the one shared classifier (providerRules)", () => {
  const OR = "https://openrouter.ai/api/v1";
  it("free endpoints are free: NVIDIA dev tier, Madav Starter, Local", () => {
    expect(isModelFree({ id: "p_nv::openai/gpt-oss-120b", name: "openai/gpt-oss-120b", prov: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" })).toBe(true);
    expect(isModelFree({ id: "p_starter::nvidia/x", name: "nvidia/x", prov: "Madav Starter (free)" })).toBe(true);
    expect(isModelFree({ id: "p_local::qwen", name: "qwen", prov: "Local", baseUrl: "http://localhost:1234" })).toBe(true);
  });
  it("billed providers are paid when the model isn't free: OpenAI, Anthropic, OpenRouter base, Together", () => {
    expect(isModelFree({ id: "p_oa::gpt-4o", name: "gpt-4o", prov: "OpenAI", baseUrl: "https://api.openai.com/v1" })).toBe(false);
    expect(isModelFree({ id: "p_an::claude-sonnet-4-6", name: "claude-sonnet-4-6", prov: "Anthropic" })).toBe(false);
    expect(isModelFree({ id: "p_or::deepseek/deepseek-v3", name: "deepseek/deepseek-v3", prov: "OpenRouter", baseUrl: OR })).toBe(false);
    expect(isModelFree({ id: "p_tg::deepseek/deepseek-v3", name: "deepseek/deepseek-v3", prov: "Together AI", baseUrl: "https://api.together.xyz/v1" })).toBe(false);
  });
  it("OpenRouter ':free' variants ARE free (per-model, by id suffix)", () => {
    expect(isModelFree({ id: "p_or::deepseek/deepseek-r1:free", name: "deepseek/deepseek-r1:free", prov: "OpenRouter", baseUrl: OR })).toBe(true);
    expect(isModelFree({ id: "p_or::meta-llama/llama-3.3-70b-instruct:free", name: "meta-llama/llama-3.3-70b-instruct:free", prov: "OpenRouter", baseUrl: OR })).toBe(true);
  });
  it("OpenRouter $0 catalog price (orFree) is free; a priced model is paid", () => {
    expect(isModelFree({ id: "p_or::qwen/qwen-2.5", name: "qwen/qwen-2.5", prov: "OpenRouter", baseUrl: OR, orFree: true })).toBe(true);
    expect(isModelFree({ id: "p_or::qwen/qwen-2.5", name: "qwen/qwen-2.5", prov: "OpenRouter", baseUrl: OR, orFree: false })).toBe(false);
  });
  it("a free ENDPOINT stays free regardless of model id (gpt-oss free on NVIDIA, paid on OpenRouter)", () => {
    expect(isModelFree({ id: "p_nv::openai/gpt-oss-120b", name: "openai/gpt-oss-120b", prov: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" })).toBe(true);
    expect(isModelFree({ id: "p_or::openai/gpt-oss-120b", name: "openai/gpt-oss-120b", prov: "OpenRouter", baseUrl: OR })).toBe(false);
  });
  it("providerFreeTier (coarse endpoint check, kept for the load-time hint)", () => {
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
  it("falls back to the profile that carries the model", () => {
    expect(resolveModelValue(profiles, "deepseek/deepseek-v3", "???")).toBe("p_or::deepseek/deepseek-v3");
  });
  it("returns null when nothing matches", () => {
    expect(resolveModelValue(profiles, "totally/unknown", "Nope")).toBe(null);
    expect(resolveModelValue(profiles, "", "x")).toBe(null);
  });
});

describe("isVisionModel — warn before sending an image to a text-only model", () => {
  it("text-only models are NOT vision (gpt-oss, deepseek)", () => {
    expect(isVisionModel("nim/openai/gpt-oss-120b")).toBe(false);
    expect(isVisionModel("nim/deepseek-ai/deepseek-v4-flash")).toBe(false);
  });
  it("vision models ARE vision (by name)", () => {
    expect(isVisionModel("meta/llama-3.2-90b-vision-instruct")).toBe(true);
    expect(isVisionModel("gpt-4o")).toBe(true);
    expect(isVisionModel("google/gemini-2.5-flash")).toBe(true);
    expect(isVisionModel("anthropic/claude-sonnet-4-6")).toBe(true);
    expect(isVisionModel("nvidia/nemotron-nano-12b-v2-vl")).toBe(true);
  });
  it("a catalog image flag overrides the name guess", () => {
    expect(isVisionModel("some/odd-model", { "some/odd-model": { image: true } })).toBe(true);
    expect(isVisionModel("gpt-4o", { "gpt-4o": { image: false } })).toBe(false);
  });
});
