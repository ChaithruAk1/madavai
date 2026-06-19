// src/modelCost.js — SINGLE SOURCE for whether a model costs the user money (free vs paid).
// Cost comes from the PROVIDER: real per-model pricing when the provider reports it (e.g. OpenRouter),
// otherwise the provider's known tier (Madav Starter / Local / NVIDIA dev tier = free; the user's billed
// keys = paid). It is NEVER inferred from the model-name text (":free" etc.) — that was the old bug.

const num = (x) => (x == null ? null : Number(x));

// Provider profiles that are free to the user when no real per-model price is available. Matched against
// the profile's name + kind + baseUrl + profile-id. OpenRouter is intentionally absent — it is priced
// per model, so its models are decided by their catalog price, not this table.
const FREE_TIER = /(madav\s*starter|p_starter|\bstarter\b|\blocal\b|p_local|lm[\s-]?studio|ollama|llama\.?cpp|127\.0\.0\.1|localhost|nvidia|\bnim\b|build\.nvidia|integrate\.api\.nvidia)/i;

// Is an entire provider PROFILE free to the user? (Used only when the provider gives no per-model price.)
// Pass profile-shaped fields ONLY — never a model id (a model named "nvidia/…" must not flip OpenRouter).
export function providerFreeTier(profile = {}) {
  const hay = [profile.name, profile.kind, profile.baseUrl, profile.id].filter(Boolean).join(" ");
  return FREE_TIER.test(hay);
}

// Map a picker item ("profileId::modelId" or a bare id/name) to the catalog key (the real model id).
function catalogKey(item) {
  const v = (item && (item.id || item.name)) || "";
  return v.includes("::") ? v.slice(v.indexOf("::") + 2) : v;
}
// Just the profile-id part (before "::"), so the model-maker text never leaks into the provider check.
function profileIdOf(item) {
  const v = String((item && item.id) || "");
  return v.includes("::") ? v.slice(0, v.indexOf("::")) : "";
}

// THE cost decision for one model. Priority:
//   1) real pricing from the provider's catalog  -> free iff price is $0
//   2) a tier the group-builder stamped on the item (item.free)
//   3) the provider tier table (from item.prov / baseUrl / kind / profile-id)
// Returns true = free, false = paid. Never reads the model-name text.
export function isModelFree(item = {}, { catalog } = {}) {
  const cat = catalog && catalog[catalogKey(item)];
  if (cat) {
    if (cat.priceIn != null || cat.priceOut != null) return num(cat.priceIn) === 0 && num(cat.priceOut) === 0;
    if (typeof cat.free === "boolean") return cat.free;
  }
  if (typeof item.free === "boolean") return item.free;
  return providerFreeTier({ name: item.prov, baseUrl: item.baseUrl, kind: item.kind, id: profileIdOf(item) });
}
