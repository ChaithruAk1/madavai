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
