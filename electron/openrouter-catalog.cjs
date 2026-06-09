// Rich model metadata from OpenRouter (context, description, pricing, modality,
// reasoning) keyed by model id. The provider /v1/models endpoint only returns ids,
// so this fills in the Models Overview details for OpenRouter-sourced models.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "brainedge-openrouter-models.json");
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
    const free = (String(pr.prompt) === "0" && String(pr.completion || "0") === "0") || /:free$/.test(m.id || "");
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

module.exports = { getCatalog };
