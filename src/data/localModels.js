// Curated capability registry for LOCAL models (Ollama / LM Studio / llama.cpp).
//
// Local providers expose no catalog metadata, so capability detection (coding /
// reasoning / vision / tools a.k.a. agentic) comes up empty and local models look
// weaker than they are. This is a CONSERVATIVE, FAMILY-LEVEL table built from
// public model-card knowledge: a capability is only claimed when the whole family
// reliably has it. Matching is lowercase-substring on the model id; FIRST match
// wins, so more specific entries must come before generic ones (e.g.
// "qwen2.5-coder" before "qwen2.5"). Extend freely — add a { match, caps } entry.
//
// Optional `minB`: { cap: sizeInB } — drop a capability for variants known to be
// below that parameter size (e.g. llama-3.2 1b/3b don't tool-call reliably).
// If the size can't be parsed from the id, the family default is kept.

const FAMILIES = [
  // Llama (specific variants before the generic family)
  { match: ["llama-3.2-vision", "llama3.2-vision"], caps: { vision: true, tools: true } },
  { match: ["llama-4", "llama4"], caps: { tools: true, vision: true } },
  { match: ["llama-3", "llama3"], caps: { tools: true }, minB: { tools: 8 } },
  // Qwen
  { match: ["qwen2.5-coder", "qwen-2.5-coder", "qwen2.5coder"], caps: { coding: true, tools: true } },
  { match: ["qwen2.5", "qwen-2.5"], caps: { tools: true } },
  { match: ["qwen3", "qwen-3"], caps: { tools: true, reasoning: true } },
  { match: ["qwq"], caps: { reasoning: true } },
  // DeepSeek
  { match: ["deepseek-r1", "r1-distill", "deepseek-r"], caps: { reasoning: true } },
  { match: ["deepseek-coder-v2"], caps: { coding: true, tools: true } },
  { match: ["deepseek-coder"], caps: { coding: true } },
  { match: ["deepseek-v3", "deepseek-v2", "deepseek-chat"], caps: { tools: true } },
  // Mistral family
  { match: ["mistral-nemo"], caps: { tools: true } },
  { match: ["mixtral"], caps: { tools: true } },
  { match: ["codestral"], caps: { coding: true, tools: true } },
  { match: ["devstral"], caps: { coding: true, tools: true } }, // agentic coding model — tools maps to the Agentic pill
  { match: ["mistral"], caps: { tools: true } },
  // Google
  { match: ["gemma3", "gemma-3"], caps: { tools: true, vision: true }, minB: { vision: 4 } },
  { match: ["gemma2", "gemma-2", "gemma"], caps: {} }, // no native tool calling
  // Microsoft
  { match: ["phi-4", "phi4"], caps: { reasoning: true } },
  { match: ["phi-3", "phi3"], caps: {} }, // no native tool calling
  // Vision-only families
  { match: ["llava"], caps: { vision: true } },
  { match: ["moondream"], caps: { vision: true } },
  { match: ["yi-vl"], caps: { vision: true } },
  // Misc
  { match: ["smollm"], caps: {} },
  { match: ["command-r"], caps: { tools: true } },
  { match: ["openhermes"], caps: {} }, // older generation — no reliable tool calling
  { match: ["hermes"], caps: { tools: true } },
  { match: ["starcoder", "stablecode", "stable-code"], caps: { coding: true } },
  { match: ["nemotron"], caps: { tools: true, reasoning: true } },
  { match: ["granite"], caps: { tools: true, coding: true } },
  { match: ["internlm"], caps: {} }, // registered family — no conservative capability claims yet
  { match: ["yi"], caps: {} },
];

// Parse a parameter size like "8b" / "3.8B" out of a model id; null if absent.
const sizeB = (s) => { const m = s.match(/(\d+(?:\.\d+)?)\s*b\b/); return m ? parseFloat(m[1]) : null; };

// localCaps("llama3.1:8b-instruct-q4") → { coding, reasoning, vision, tools } booleans,
// or null when no curated family matches the id.
export function localCaps(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (!id) return null;
  for (const f of FAMILIES) {
    if (!f.match.some((sub) => id.includes(sub))) continue;
    const caps = { coding: false, reasoning: false, vision: false, tools: false, ...f.caps };
    if (f.minB) {
      const b = sizeB(id);
      if (b != null) for (const [cap, min] of Object.entries(f.minB)) { if (b < min) caps[cap] = false; }
    }
    return caps;
  }
  return null;
}

// ── Friendly display name ────────────────────────────────────────────────────
// Turn a runtime model id ("qwen2.5-coder:32b", "x/flux2-klein:9b", "hf.co/org/Repo-GGUF") into a human label
// ("Qwen2.5 Coder 32B"). This is pure FORMATTING of the real id — it invents nothing, so the raw id can (and
// should) still be shown beside it. A small token map only fixes the casing of well-known names.
const NAME_TOKENS = {
  qwen: "Qwen", qwq: "QwQ", deepseek: "DeepSeek", llama: "Llama", gemma: "Gemma", phi: "Phi", yi: "Yi",
  mistral: "Mistral", mixtral: "Mixtral", codestral: "Codestral", devstral: "Devstral", nemo: "Nemo",
  gpt: "GPT", oss: "OSS", vl: "VL", vision: "Vision", coder: "Coder", instruct: "Instruct", base: "Base",
  chat: "Chat", mini: "Mini", small: "Small", medium: "Medium", large: "Large", moe: "MoE", granite: "Granite",
  flux: "Flux", klein: "Klein", command: "Command", starcoder: "StarCoder", falcon: "Falcon", olmo: "OLMo",
  r1: "R1", k2: "K2", v2: "V2", v3: "V3", uncensored: "Uncensored", distill: "Distill", tools: "Tools",
};
function titleToken(t) {
  if (!t) return t;
  const low = t.toLowerCase();
  if (NAME_TOKENS[low]) return NAME_TOKENS[low];
  if (/^\d+(?:\.\d+)?b$/i.test(t)) return t.toUpperCase();   // 32b -> 32B, 1.5b -> 1.5B
  if (/^[a-z]\d+$/i.test(t)) return t.toUpperCase();          // q4 -> Q4, a3b handled above
  return t.charAt(0).toUpperCase() + t.slice(1);              // qwen2.5 -> Qwen2.5
}

export function prettyLocalName(id) {
  if (!id) return id || "";
  let s = String(id).replace(/^hf\.co\//i, "").replace(/^https?:\/\/huggingface\.co\//i, "");
  if (s.includes("/")) s = s.split("/").pop();                // drop an org/user prefix
  const [base, tag] = s.split(":");
  const name = (base || "").split(/[-_]/).filter(Boolean).map(titleToken).join(" ");
  const ver = tag && tag.toLowerCase() !== "latest" ? " " + tag.split(/[-_]/).filter(Boolean).map(titleToken).join(" ") : "";
  return (name + ver).trim() || s;
}

// ── "Fits your machine" + goal matching ──────────────────────────────────────
// Conservative verdict from a model's footprint vs. total system RAM (a model needs roughly its own size
// plus headroom for the OS and context). 'good' = comfortable, 'tight' = will be slow/swappy, 'over' = too big.
export function fitForRam(sizeGB, totalRamGB) {
  if (!sizeGB || !totalRamGB) return "unknown";
  const ratio = sizeGB / totalRamGB;
  if (ratio <= 0.55) return "good";
  if (ratio <= 0.85) return "tight";
  return "over";
}

// Does a catalog/feed entry fit a browse goal? Curated entries carry explicit useCases; live feeds (HuggingFace
// /LM Studio) don't, so we infer from the model id via localCaps, and treat "tiny" as a size threshold.
export function goalMatches(entry, goal) {
  if (!goal || goal === "all") return true;
  if (entry && Array.isArray(entry.useCases) && entry.useCases.length) return entry.useCases.includes(goal);
  const caps = localCaps((entry && (entry.name || entry.pullName)) || "") || {};
  if (goal === "coding") return !!caps.coding;
  if (goal === "reasoning") return !!caps.reasoning;
  if (goal === "vision") return !!caps.vision;
  if (goal === "tiny") return ((entry && entry.sizeGB) || 99) <= 3;
  return true; // "general"
}

// ── Chat-model gate ──────────────────────────────────────────────────────────
// The GGUF hub lists EVERY kind of model — video (Wan, Hunyuan, LTX), image (Stable Diffusion, FLUX, Kolors),
// audio (Whisper, Bark, TTS), and embeddings/rerankers. None of those belong in the CHAT model selector. This
// is a conservative DENY list of well-known non-text families; anything else is treated as a chat/text model so
// recall for real LLMs stays high. Used by the browse gallery, search results, and the model-selector sync.
const NON_CHAT_RE = /(^|[/\-_.])(wan2|wan-?2|hunyuan-?video|ltx-?video|ltxv|mochi|cogvideo|animatediff|svd\b|stable-?video|opensora|easyanimate|videocrafter|veo\b|stable-?diffusion|sd-?xl|sd-?turbo|sd3|sd-?3|sd35|flux\.?[0-9]|flux\b|kolors|pixart|playground-v|hidream|lumina|sana\b|auraflow|wuerstchen|kandinsky|qwen-?image|deepfloyd|controlnet|\bvae\b|clip-vit|siglip|whisper|parler-?tts|\bbark\b|\btts\b|xtts|musicgen|stable-?audio|encodec|outetts|nomic-?embed|bge-|gte-|e5-|jina-?embed|\bembed(ding)?\b|reranker|rerank|all-?minilm)/i;

export function isChatModel(name) {
  return !NON_CHAT_RE.test(String(name || "").toLowerCase());
}

// ── Modality of a local model (for Let's Create) ─────────────────────────────
// Which capability a model serves, by family/name. Drives the Image/Voice/Video model pickers in Let's Create.
export function localModality(name) {
  const n = String(name || "").toLowerCase();
  if (/(text-?to-?video|\bvideo\b|\bwan\b|hunyuan|\bltx\b|cogvideo|mochi|\bsvd\b|stable-?video|opensora|easyanimate)/.test(n)) return "video";
  if (/(\btts\b|text-?to-?speech|\bvoice\b|\bspeech\b|bark|piper|xtts|whisper|transcrib|\bstt\b|\basr\b|musicgen|stable-?audio|parler|outetts)/.test(n)) return "voice";
  if (/(text-?to-?image|stable-?diffusion|sd-?xl|\bsd[0-9]|\bflux\b|diffus|kandinsky|pixart|lumina|playground|dreamshaper|realvis|\bimage\b)/.test(n)) return "image";
  return "text";
}
