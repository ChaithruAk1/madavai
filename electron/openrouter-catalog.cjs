// Rich model metadata from OpenRouter (context, description, pricing, modality,
// reasoning) keyed by model id. The provider /v1/models endpoint only returns ids,
// so this fills in the Models Overview details for OpenRouter-sourced models.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

try {
  const legacy = path.join(app.getPath("userData"), ("brain" + "edge") + "-openrouter-models.json");
  const nf = path.join(app.getPath("userData"), "madav-openrouter-models.json");
  if (!fs.existsSync(nf) && fs.existsSync(legacy)) fs.renameSync(legacy, nf);
} catch {}
const FILE = () => path.join(app.getPath("userData"), "madav-openrouter-models.json");
const TTL = 12 * 60 * 60 * 1000;

async function fetchAll() {
  const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("openrouter " + res.status);
  const json = await res.json();
  const out = {};
  for (const m of (json.data || [])) {
    const arch = m.architecture || {};
    const inMod = Array.isArray(arch.input_modalities) ? arch.input_modalities : String(arch.modality || "").split(/[+,]/);
    const pr = m.pricing || {};
    const free = (String(pr.prompt) === "0" && String(pr.completion || "0") === "0"); // cost from REAL pricing, not the name
    const sp = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    out[m.id] = {
      name: m.name || m.id,
      ctx: m.context_length ? Math.round(m.context_length / 1000) : 0, // store in K like the catalog
      desc: (m.description || "").trim(),
      image: inMod.includes("image"),
      reasoning: sp.includes("reasoning") || sp.includes("include_reasoning"),
      tools: sp.includes("tools") || sp.includes("tool_choice"),
      created: m.created || null, // unix seconds — model release date (relevance signal)
      free,
      priceIn: pr.prompt != null ? +pr.prompt : null,       // USD per input token
      priceOut: pr.completion != null ? +pr.completion : null, // USD per output token
    };
  }
  return out;
}

async function getCatalog({ force = false } = {}) {
  if (!force) { try { const c = JSON.parse(fs.readFileSync(FILE(), "utf8")); if (c && Date.now() - c.at < TTL) return c.map; } catch {} }
  try {
    const map = await fetchAll();
    try { fs.writeFileSync(FILE(), JSON.stringify({ at: Date.now(), map })); } catch {}
    return map;
  } catch {
    try { return JSON.parse(fs.readFileSync(FILE(), "utf8")).map || {}; } catch { return {}; }
  }
}

// Exact context window for a model from the CACHED catalog only — never a network call
// (callers use this on hot paths like compaction). The cache stores ctx in thousands
// (see fetchAll), so multiply back to tokens. Returns null when the model isn't cached
// or has no usable context value, so the caller can fall back to its heuristic.
function contextWindowOf(modelId) {
  if (!modelId) return null;
  try {
    const c = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    const map = (c && c.map) || c || {};
    const entry = map[modelId];
    const ctxK = entry && entry.ctx;
    if (typeof ctxK === "number" && ctxK > 0) return ctxK * 1000;
  } catch {}
  return null;
}

module.exports = { getCatalog, contextWindowOf };
