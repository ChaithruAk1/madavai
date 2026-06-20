// src/modelCost.js — SINGLE SOURCE for whether a model is free or paid to the user.
// Free/paid is a per-PROVIDER property, captured from the provider/endpoint when its models are loaded —
// NEVER computed from a price number, and NEVER mixed across providers. A model is FREE only when it comes
// from a free ENDPOINT (NVIDIA's free dev tier, Madav Starter house key, or a Local model). Everything
// served on the user's own billed key (OpenAI, Anthropic, OpenRouter, …) is PAID. App.jsx stamps this onto
// each model (item.free) at load time via providerFreeTier; the picker just reads the flag.

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

// THE free/paid decision: the per-provider flag stamped on the item at load (item.free), or — if not
// stamped — computed straight from the provider. No price, no catalog, no cross-provider mixing.
export function isModelFree(item = {}) {
  if (typeof item.free === "boolean") return item.free;
  return providerFreeTier({ name: item.prov, baseUrl: item.baseUrl, kind: item.kind, id: profileIdOf(item) });
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
