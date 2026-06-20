// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Data-driven provider classification used app-wide. To support a NEW provider in future,
// add ONE rule to PROVIDER_RULES below — nothing else needs to change. Each rule matches a
// provider by its baseUrl or name, and declares:
//   host : "local" | "cloud"
//   free : true        → all of this provider's hosted models are free (e.g. local, free-tier hosts)
//          false       → paid commercial API
//          "per-model" → decided per model (we read real pricing, e.g. OpenRouter)
//          null/omit   → unknown
// Order matters: the FIRST matching rule wins, so put specific patterns before generic ones.

export const PROVIDER_RULES = [
  // Local runtimes — always free, no key needed.
  { match: /localhost|127\.0\.0\.1|0\.0\.0\.0|ollama|lm ?studio|llama\.?cpp|:11434|:1234|:8080/i, host: "local", free: true, label: "Local" },
  // Madav Starter — the zero-setup house key, free to the user. Its profile name ("Madav Starter (free)")
  // and "/starter" baseUrl both carry "starter", so this matches by name/baseUrl before the OpenRouter rule.
  { match: /madav\s*starter|\/starter\b|\bstarter\b/i, host: "cloud", free: true, label: "Madav Starter" },
  // Per-model pricing providers (we read exact prices and free flags from their catalog).
  { match: /openrouter/i, host: "cloud", free: "per-model", label: "OpenRouter" },
  // Free-tier hosted APIs.
  { match: /nvidia|\bnim\b|integrate\.api\.nvidia|build\.nvidia/i, host: "cloud", free: true, label: "NVIDIA NIM" },
  { match: /groq/i, host: "cloud", free: true, label: "Groq" },
  { match: /cerebras/i, host: "cloud", free: true, label: "Cerebras" },
  // Paid commercial APIs.
  { match: /openai\.com/i, host: "cloud", free: false, label: "OpenAI" },
  { match: /anthropic/i, host: "cloud", free: false, label: "Anthropic" },
  { match: /deepseek/i, host: "cloud", free: false, label: "DeepSeek" },
  { match: /generativelanguage|googleapis/i, host: "cloud", free: false, label: "Google" },
  { match: /mistral/i, host: "cloud", free: false, label: "Mistral" },
  { match: /cohere/i, host: "cloud", free: false, label: "Cohere" },
  { match: /x\.ai|\bxai\b/i, host: "cloud", free: false, label: "xAI" },
  { match: /together\.xyz|together\.ai/i, host: "cloud", free: false, label: "Together AI" },
  { match: /fireworks/i, host: "cloud", free: false, label: "Fireworks AI" },
  { match: /perplexity/i, host: "cloud", free: false, label: "Perplexity" },
  { match: /deepinfra/i, host: "cloud", free: false, label: "DeepInfra" },
  { match: /hyperbolic/i, host: "cloud", free: false, label: "Hyperbolic" },
];

// Classify a provider profile. Unknown/future providers fall back to a safe default that the
// per-model logic can still refine (host inferred from the URL; free = unknown).
export function classifyProvider(profile) {
  const hay = ((profile && profile.baseUrl) || "") + " " + ((profile && profile.name) || "");
  const r = PROVIDER_RULES.find((x) => x.match.test(hay));
  if (r) return r;
  const local = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(hay);
  return { host: local ? "local" : "cloud", free: local ? true : null, label: (profile && profile.name) || "Provider" };
}

// Decide whether a specific model is free. Precedence:
//   1. per-model pricing / ":free" id suffix (most precise)
//   2. the provider rule's blanket free flag
//   3. unknown (null) for future providers we can't classify
// `orFree` is the OpenRouter catalog's free flag for this id when available (true/false/null).
export function isModelFree({ profile, modelId, orFree }) {
  const c = classifyProvider(profile);
  if (c.host === "local") return true;
  if (/(:free)$/i.test(modelId || "")) return true;               // explicit free variant on any provider
  if (c.free === "per-model") return orFree != null ? orFree : null;
  if (c.free === true || c.free === false) return c.free;
  return orFree != null ? orFree : null;                          // unknown/future provider
}

// Best-guess of a model's core PURPOSE from its name (no universal API exposes this). Lives here, in a
// plain data module, rather than in ModelPicker.jsx so the picker exports ONLY its component — a mixed
// component + plain-function export breaks React Fast Refresh and forces a FULL app reload on every edit
// to the picker (which silently interrupts an in-flight chat/Excel run on the desktop dev build).
export function classify(id) {
  const n = (id || "").toLowerCase();
  if (/cod(er|e)\b|coder|deepseek-coder/.test(n)) return "coding";
  if (/reason|\br1\b|\bo1\b|\bo3\b|qwq|thinking|think\b/.test(n)) return "reasoning";
  if (/vision|multimodal|\bvl\b|llava|-v\b/.test(n)) return "vision";
  if (/embed/.test(n)) return "embeddings";
  if (/flash|mini|lite|haiku|tiny|small|turbo|nano|\b[1-9]b\b/.test(n)) return "fast";
  return "general";
}
