// src/modelCost.js — item-shaped adapters for the picker's free/paid + vision helpers.
// The free/paid DECISION is single-sourced in ./data/providerRules.js (per-model: a ":free" id suffix or
// OpenRouter's $0 catalog flag count as free; NVIDIA / Local / Madav Starter endpoints are free by rule;
// everything else on the user's own billed key is paid). isModelFree(item) just adapts a picker item to it.
// providerFreeTier (kept) still answers the coarser "is the whole endpoint free?" used for the load-time hint.
import { isModelFree as classifyModelFree } from "./data/providerRules.js";

// Endpoints/providers that are FREE to the user. Matched against the profile's name + kind + baseUrl + id.
// Edit this one list to add/remove a free provider. (OpenRouter is intentionally NOT here — it bills per
// model on the user's own key; ask if you want its $0 ":free" endpoints treated as free.)
const FREE_TIER = /(madav\s*starter|p_starter|\bstarter\b|\blocal\b|p_local|lm[\s-]?studio|ollama|llama\.?cpp|127\.0\.0\.1|localhost|nvidia|\bnim\b|build\.nvidia|integrate\.api\.nvidia)/i;

// True if a whole provider PROFILE is a free endpoint to the user. This is the "is it a free endpoint?"
// answer we capture from the provider when its models are pulled.
export function providerFreeTier(profile = {}) {
  const hay = [profile.name, profile.kind, profile.baseUrl, profile.id].filter(Boolean).join(" ");
  return FREE_TIER.test(hay);
}

// Just the profile-id part (before "::"), so a model-maker name in the id never leaks into the provider check.
function profileIdOf(item) {
  const v = String((item && item.id) || "");
  return v.includes("::") ? v.slice(0, v.indexOf("::")) : "";
}

// THE free/paid decision for a picker ITEM — delegates to the ONE per-model classifier (providerRules) so
// it is identical everywhere: honors a ":free" id suffix and OpenRouter's $0 catalog flag (orFree), and
// still treats NVIDIA / Local / Madav Starter endpoints as free via the provider rules. Returns a strict
// boolean for the Free/Paid filter (unknown → not free). Pass item.orFree (the OpenRouter catalog $0 flag)
// when the caller has the catalog — the picker does — for fully accurate per-model pricing.
export function isModelFree(item = {}) {
  const modelId = item.name || item.model || "";
  const profile = { name: item.prov, baseUrl: item.baseUrl, kind: item.kind, id: profileIdOf(item) };
  const orFree = typeof item.orFree === "boolean" ? item.orFree : null;
  return classifyModelFree({ profile, modelId, orFree }) === true;
}

// Does a model accept IMAGE input (vision)? Name-based — the only reliable per-model signal we have
// without a provider catalog — plus an optional catalog image flag where available. Used to warn the user
// BEFORE sending an image to a text-only model (which would just give a confusing "please upload" reply).
const VISION_RE = /vision|multimodal|\bvl\b|\bvlm\b|llava|pixtral|gpt-?4o|gpt-?4\.1|gpt-?5|\bo[34]\b|gemini|claude-3|claude-(opus|sonnet|haiku)|llama-?4|maverick|\bscout\b|qwen2?\.?5?[- ]?vl|internvl|molmo|phi-4-multi|gemma-3|nemotron.*vl|-vl\b/i;
export function isVisionModel(modelId, catalog) {
  const id = String(modelId || "").toLowerCase();
  if (catalog && catalog[id] && typeof catalog[id].image === "boolean") return catalog[id].image;
  return VISION_RE.test(id);
}

// Resolve a saved conversation's model+provider back to a picker value "profileId::model" (Claude-style
// per-chat model memory). Match by provider NAME first, then by the profile that actually carries the
// model. Returns null when no profile matches (caller then leaves the current model untouched).
export function resolveModelValue(profiles, model, provider) {
  if (!model) return null;
  const list = Array.isArray(profiles) ? profiles : Object.values(profiles || {});
  const p = list.find((x) => x && x.name === provider)
         || list.find((x) => x && Array.isArray(x.cachedModels) && x.cachedModels.includes(model))
         || list.find((x) => x && x.model === model);
  return p ? `${p.id}::${model}` : null;
}
