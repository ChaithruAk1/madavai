// Curated model reference for the Models Overview.
// NOTE: approximate, hand-maintained. VRAM is a rough ~Q4 estimate; context is the
// practical max (some via YaRN). Provider availability & pricing TIERS change often —
// treat as a guide, verify before relying. tier: "free" | "freemium" (free tier + paid) | "paid".
// thinking: "toggle" (hybrid/optional) | true (always reasons) | false

// Domain categories only — "Local/Cloud" is the Host filter, "Vision" is a capability filter.
export const CATEGORIES = ["Coding", "Reasoning", "General", "Small"];

// reusable provider entries
const OLLAMA = { name: "Ollama", type: "local", tier: "free" };
const LMS = { name: "LM Studio", type: "local", tier: "free" };
const LCPP = { name: "llama.cpp", type: "local", tier: "free" };
const OR_FREE = { name: "OpenRouter", type: "cloud", tier: "freemium" };
const OR_PAID = { name: "OpenRouter", type: "cloud", tier: "paid" };
const NIM = { name: "NVIDIA NIM", type: "cloud", tier: "free" };
const GROQ = { name: "Groq", type: "cloud", tier: "freemium" };
const MISTRAL = { name: "Mistral API", type: "cloud", tier: "freemium" };
const GOOGLE = { name: "Google AI Studio", type: "cloud", tier: "freemium" };
const DEEPSEEK = { name: "DeepSeek API", type: "cloud", tier: "paid" };
const ANTHROPIC = { name: "Anthropic", type: "cloud", tier: "paid" };
const OPENAI = { name: "OpenAI", type: "cloud", tier: "paid" };
const COHERE = { name: "Cohere", type: "cloud", tier: "freemium" };
const XAI = { name: "xAI", type: "cloud", tier: "paid" };
const TOGETHER = { name: "Together AI", type: "cloud", tier: "paid" };
const FIREWORKS = { name: "Fireworks AI", type: "cloud", tier: "paid" };
const PERPLEXITY = { name: "Perplexity", type: "cloud", tier: "paid" };
const CEREBRAS = { name: "Cerebras", type: "cloud", tier: "freemium" };
const DEEPINFRA = { name: "DeepInfra", type: "cloud", tier: "paid" };
const HYPERBOLIC = { name: "Hyperbolic", type: "cloud", tier: "paid" };

export const MODELS = [
  // ---------- Local: coding ----------
  { name: "Qwen2.5-Coder 32B", maker: "Alibaba", year: 2024, cat: "Coding", bestFor: "Best local coder", size: "32B", ctx: 128, host: "local", vram: 20, run: "qwen2.5-coder:32b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE, NIM] },
  { name: "Qwen2.5-Coder 7B", maker: "Alibaba", year: 2024, cat: "Coding", bestFor: "Fast FIM autocomplete", size: "7B", ctx: 128, host: "local", vram: 5, run: "qwen2.5-coder:7b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, LCPP, OR_FREE] },
  { name: "DeepSeek-Coder-V2 16B", maker: "DeepSeek", year: 2024, cat: "Coding", bestFor: "Python / JS", size: "16B MoE", ctx: 128, host: "local", vram: 11, run: "deepseek-coder-v2:16b", thinking: false, tools: true, vision: false, license: "DeepSeek License", providers: [OLLAMA, LMS, OR_FREE] },
  { name: "Codestral 22B", maker: "Mistral", year: 2024, cat: "Coding", bestFor: "80+ languages", size: "22B", ctx: 32, host: "local", vram: 14, run: "codestral:22b", thinking: false, tools: true, vision: false, license: "MNPL (non-prod)", providers: [OLLAMA, LMS, MISTRAL, OR_PAID] },

  // ---------- Local: reasoning ----------
  { name: "DeepSeek-R1 32B", maker: "DeepSeek", year: 2025, cat: "Reasoning", bestFor: "Local reasoning", size: "32B distill", ctx: 128, host: "local", vram: 20, run: "deepseek-r1:32b", thinking: true, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS, OR_FREE] },
  { name: "DeepSeek-R1 8B", maker: "DeepSeek", year: 2025, cat: "Reasoning", bestFor: "Light reasoning", size: "8B distill", ctx: 128, host: "local", vram: 6, run: "deepseek-r1:8b", thinking: true, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS, LCPP] },
  { name: "QwQ 32B", maker: "Alibaba", year: 2025, cat: "Reasoning", bestFor: "Math + logic", size: "32B", ctx: 128, host: "local", vram: 20, run: "qwq:32b", thinking: true, tools: false, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE] },

  // ---------- Local: general ----------
  { name: "Qwen3 32B", maker: "Alibaba", year: 2025, cat: "General", bestFor: "Coding + chat", size: "32B", ctx: 128, host: "local", vram: 20, run: "qwen3:32b", thinking: "toggle", tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE, NIM] },
  { name: "Qwen3 14B", maker: "Alibaba", year: 2025, cat: "General", bestFor: "Fast mid-range", size: "14B", ctx: 128, host: "local", vram: 10, run: "qwen3:14b", thinking: "toggle", tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE, NIM] },
  { name: "Llama 3.3 70B", maker: "Meta", year: 2024, cat: "General", bestFor: "Strong generalist", size: "70B", ctx: 128, host: "local", vram: 42, run: "llama3.3:70b", thinking: false, tools: true, vision: false, license: "Llama 3.3 Community", providers: [OLLAMA, LMS, OR_FREE, NIM, GROQ] },
  { name: "Mistral Small 24B", maker: "Mistral", year: 2025, cat: "General", bestFor: "Apache generalist", size: "24B", ctx: 32, host: "local", vram: 15, run: "mistral-small:24b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, MISTRAL, OR_FREE] },
  { name: "Gemma 2 27B", maker: "Google", year: 2024, cat: "General", bestFor: "Balanced chat", size: "27B", ctx: 8, host: "local", vram: 17, run: "gemma2:27b", thinking: false, tools: false, vision: false, license: "Gemma", providers: [OLLAMA, LMS, GOOGLE, OR_FREE] },

  // ---------- Local: small / edge ----------
  { name: "Qwen3 8B", maker: "Alibaba", year: 2025, cat: "Small", bestFor: "Light local all-round", size: "8B", ctx: 128, host: "local", vram: 6, run: "qwen3:8b", thinking: "toggle", tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, LCPP, OR_FREE] },
  { name: "Llama 3.1 8B", maker: "Meta", year: 2024, cat: "Small", bestFor: "Everyday local", size: "8B", ctx: 128, host: "local", vram: 5, run: "llama3.1:8b", thinking: false, tools: true, vision: false, license: "Llama 3.1 Community", providers: [OLLAMA, LMS, LCPP, GROQ, OR_FREE] },
  { name: "Phi-4 14B", maker: "Microsoft", year: 2024, cat: "Small", bestFor: "Reasoning-dense small", size: "14B", ctx: 16, host: "local", vram: 9, run: "phi4:14b", thinking: false, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS, NIM] },
  { name: "Gemma 2 9B", maker: "Google", year: 2024, cat: "Small", bestFor: "Compact chat", size: "9B", ctx: 8, host: "local", vram: 6, run: "gemma2:9b", thinking: false, tools: false, vision: false, license: "Gemma", providers: [OLLAMA, LMS, GOOGLE, GROQ] },

  // ---------- Local: vision ----------
  { name: "Llama 3.2 Vision 11B", maker: "Meta", year: 2024, cat: "Vision", bestFor: "Local image understanding", size: "11B", ctx: 128, host: "local", vram: 8, run: "llama3.2-vision:11b", thinking: false, tools: false, vision: true, license: "Llama 3.2 Community", providers: [OLLAMA, GROQ, OR_FREE] },
  { name: "Qwen2.5-VL 7B", maker: "Alibaba", year: 2025, cat: "Vision", bestFor: "Image + doc VQA", size: "7B", ctx: 128, host: "local", vram: 6, run: "qwen2.5vl:7b", thinking: false, tools: true, vision: true, license: "Apache 2.0", providers: [OLLAMA, OR_FREE, NIM] },

  // ---------- Cloud: frontier ----------
  { name: "Claude Sonnet", maker: "Anthropic", year: 2025, cat: "Cloud", bestFor: "Top all-rounder", size: "—", ctx: 200, host: "Anthropic", vram: null, run: "claude-sonnet", thinking: "toggle", tools: true, vision: true, license: "Proprietary", providers: [ANTHROPIC, OR_PAID] },
  { name: "Claude Opus", maker: "Anthropic", year: 2025, cat: "Cloud", bestFor: "Hardest tasks", size: "—", ctx: 200, host: "Anthropic", vram: null, run: "claude-opus", thinking: "toggle", tools: true, vision: true, license: "Proprietary", providers: [ANTHROPIC, OR_PAID] },
  { name: "Claude Haiku", maker: "Anthropic", year: 2025, cat: "Cloud", bestFor: "Fast + cheap", size: "—", ctx: 200, host: "Anthropic", vram: null, run: "claude-haiku", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [ANTHROPIC, OR_PAID] },
  { name: "GPT-4o", maker: "OpenAI", year: 2024, cat: "Cloud", bestFor: "Multimodal flagship", size: "—", ctx: 128, host: "OpenAI", vram: null, run: "gpt-4o", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [OPENAI, OR_PAID] },
  { name: "GPT-4o mini", maker: "OpenAI", year: 2024, cat: "Cloud", bestFor: "Cheap workhorse", size: "—", ctx: 128, host: "OpenAI", vram: null, run: "gpt-4o-mini", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [OPENAI, OR_PAID] },
  { name: "Gemini 2.0 Flash", maker: "Google", year: 2025, cat: "Cloud", bestFor: "Huge context, fast", size: "—", ctx: 1000, host: "Google", vram: null, run: "gemini-2.0-flash", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [GOOGLE, OR_PAID] },
  { name: "Gemini 1.5 Pro", maker: "Google", year: 2024, cat: "Cloud", bestFor: "1M+ context", size: "—", ctx: 2000, host: "Google", vram: null, run: "gemini-1.5-pro", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [GOOGLE, OR_PAID] },
  { name: "DeepSeek-V3", maker: "DeepSeek", year: 2025, cat: "Cloud", bestFor: "Cheap strong chat", size: "671B MoE", ctx: 64, host: "DeepSeek", vram: null, run: "deepseek-chat", thinking: false, tools: true, vision: false, license: "DeepSeek License", providers: [DEEPSEEK, OR_FREE, NIM] },
  { name: "DeepSeek-R1", maker: "DeepSeek", year: 2025, cat: "Cloud", bestFor: "Open reasoning", size: "671B MoE", ctx: 64, host: "DeepSeek", vram: null, run: "deepseek-reasoner", thinking: true, tools: false, vision: false, license: "MIT", providers: [DEEPSEEK, OR_FREE, NIM] },

  // ---------- More local: coding ----------
  { name: "Qwen2.5-Coder 14B", maker: "Alibaba", year: 2024, cat: "Coding", bestFor: "Mid-size coder", size: "14B", ctx: 128, host: "local", vram: 10, run: "qwen2.5-coder:14b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE] },
  { name: "StarCoder2 15B", maker: "BigCode", year: 2024, cat: "Coding", bestFor: "Code completion", size: "15B", ctx: 16, host: "local", vram: 10, run: "starcoder2:15b", thinking: false, tools: false, vision: false, license: "BigCode OpenRAIL-M", providers: [OLLAMA, LMS] },

  // ---------- More local: reasoning ----------
  { name: "DeepSeek-R1 70B", maker: "DeepSeek", year: 2025, cat: "Reasoning", bestFor: "Large local reasoning", size: "70B distill", ctx: 128, host: "local", vram: 42, run: "deepseek-r1:70b", thinking: true, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS, OR_FREE] },
  { name: "DeepSeek-R1 14B", maker: "DeepSeek", year: 2025, cat: "Reasoning", bestFor: "Mid reasoning", size: "14B distill", ctx: 128, host: "local", vram: 10, run: "deepseek-r1:14b", thinking: true, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS] },

  // ---------- More local: general / large ----------
  { name: "Llama 3.1 70B", maker: "Meta", year: 2024, cat: "General", bestFor: "Proven generalist", size: "70B", ctx: 128, host: "local", vram: 42, run: "llama3.1:70b", thinking: false, tools: true, vision: false, license: "Llama 3.1 Community", providers: [OLLAMA, LMS, OR_FREE, GROQ, NIM] },
  { name: "Llama 3.1 405B", maker: "Meta", year: 2024, cat: "General", bestFor: "Open frontier (huge)", size: "405B", ctx: 128, host: "local", vram: 230, run: "llama3.1:405b", thinking: false, tools: true, vision: false, license: "Llama 3.1 Community", providers: [OR_FREE, NIM, GROQ, OLLAMA] },
  { name: "Mixtral 8x7B", maker: "Mistral", year: 2023, cat: "General", bestFor: "MoE throughput", size: "47B MoE", ctx: 32, host: "local", vram: 26, run: "mixtral:8x7b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, MISTRAL, OR_FREE] },
  { name: "Mixtral 8x22B", maker: "Mistral", year: 2024, cat: "General", bestFor: "Large open MoE", size: "141B MoE", ctx: 64, host: "local", vram: 80, run: "mixtral:8x22b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, MISTRAL, OR_FREE] },
  { name: "Command R 35B", maker: "Cohere", year: 2024, cat: "General", bestFor: "RAG + tool use", size: "35B", ctx: 128, host: "local", vram: 22, run: "command-r:35b", thinking: false, tools: true, vision: false, license: "CC-BY-NC (non-comm)", providers: [OLLAMA, LMS, COHERE, OR_PAID] },
  { name: "Command R+ 104B", maker: "Cohere", year: 2024, cat: "General", bestFor: "RAG flagship", size: "104B", ctx: 128, host: "local", vram: 64, run: "command-r-plus:104b", thinking: false, tools: true, vision: false, license: "CC-BY-NC (non-comm)", providers: [OLLAMA, COHERE, OR_PAID] },
  { name: "Nemotron 70B", maker: "NVIDIA", year: 2024, cat: "General", bestFor: "Tuned Llama 70B", size: "70B", ctx: 128, host: "local", vram: 42, run: "nemotron:70b", thinking: false, tools: true, vision: false, license: "Llama 3.1 Community", providers: [OLLAMA, NIM, OR_FREE] },
  { name: "Yi 1.5 34B", maker: "01.AI", year: 2024, cat: "General", bestFor: "Bilingual EN/ZH", size: "34B", ctx: 32, host: "local", vram: 21, run: "yi:34b", thinking: false, tools: false, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE] },

  // ---------- More local: small / edge ----------
  { name: "Qwen2.5 7B", maker: "Alibaba", year: 2024, cat: "Small", bestFor: "Balanced small", size: "7B", ctx: 128, host: "local", vram: 5, run: "qwen2.5:7b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS, OR_FREE] },
  { name: "Granite 3 8B", maker: "IBM", year: 2024, cat: "Small", bestFor: "Enterprise small", size: "8B", ctx: 128, host: "local", vram: 6, run: "granite3-dense:8b", thinking: false, tools: true, vision: false, license: "Apache 2.0", providers: [OLLAMA, LMS] },
  { name: "Llama 3.2 3B", maker: "Meta", year: 2024, cat: "Small", bestFor: "Edge chat", size: "3B", ctx: 128, host: "local", vram: 3, run: "llama3.2:3b", thinking: false, tools: true, vision: false, license: "Llama 3.2 Community", providers: [OLLAMA, LMS, GROQ] },
  { name: "Llama 3.2 1B", maker: "Meta", year: 2024, cat: "Small", bestFor: "Ultra-light", size: "1B", ctx: 128, host: "local", vram: 2, run: "llama3.2:1b", thinking: false, tools: false, vision: false, license: "Llama 3.2 Community", providers: [OLLAMA, LMS] },
  { name: "Phi-3.5 mini", maker: "Microsoft", year: 2024, cat: "Small", bestFor: "Tiny reasoning", size: "3.8B", ctx: 128, host: "local", vram: 3, run: "phi3.5:3.8b", thinking: false, tools: false, vision: false, license: "MIT", providers: [OLLAMA, LMS] },
  { name: "Gemma 2 2B", maker: "Google", year: 2024, cat: "Small", bestFor: "Tiny edge chat", size: "2B", ctx: 8, host: "local", vram: 2, run: "gemma2:2b", thinking: false, tools: false, vision: false, license: "Gemma", providers: [OLLAMA, LMS] },
  { name: "SmolLM2 1.7B", maker: "Hugging Face", year: 2024, cat: "Small", bestFor: "On-device tiny", size: "1.7B", ctx: 8, host: "local", vram: 2, run: "smollm2:1.7b", thinking: false, tools: false, vision: false, license: "Apache 2.0", providers: [OLLAMA] },

  // ---------- More cloud ----------
  { name: "o1", maker: "OpenAI", year: 2024, cat: "Reasoning", bestFor: "Deep reasoning", size: "—", ctx: 200, host: "OpenAI", vram: null, run: "o1", thinking: true, tools: false, vision: true, license: "Proprietary", providers: [OPENAI, OR_PAID] },
  { name: "o3-mini", maker: "OpenAI", year: 2025, cat: "Reasoning", bestFor: "Fast reasoning", size: "—", ctx: 200, host: "OpenAI", vram: null, run: "o3-mini", thinking: true, tools: true, vision: false, license: "Proprietary", providers: [OPENAI, OR_PAID] },
  { name: "Mistral Large 2", maker: "Mistral", year: 2024, cat: "General", bestFor: "Mistral flagship", size: "123B", ctx: 128, host: "Mistral", vram: null, run: "mistral-large-latest", thinking: false, tools: true, vision: false, license: "MRL (non-prod)", providers: [MISTRAL, OR_PAID] },
  { name: "Command R+ (API)", maker: "Cohere", year: 2024, cat: "General", bestFor: "RAG + citations", size: "104B", ctx: 128, host: "Cohere", vram: null, run: "command-r-plus", thinking: false, tools: true, vision: false, license: "Proprietary (API)", providers: [COHERE, OR_PAID] },
  { name: "Grok 2", maker: "xAI", year: 2024, cat: "General", bestFor: "X-integrated chat", size: "—", ctx: 128, host: "xAI", vram: null, run: "grok-2", thinking: false, tools: true, vision: true, license: "Proprietary", providers: [XAI, OR_PAID] },
];

// Aggregator inference hosts (Together / Fireworks / DeepInfra / Hyperbolic / Cerebras) serve the
// same OPEN-weight models. Attach them automatically to any open model that's offered on OpenRouter,
// so their "Available on" list reflects reality without hand-editing every row.
for (const m of MODELS) {
  if (/proprietary/i.test(m.license)) continue;
  if (!(m.providers || []).some((p) => p.name === "OpenRouter")) continue;
  m.providers.push(TOGETHER, FIREWORKS, DEEPINFRA, HYPERBOLIC);
  if (/llama|qwen|deepseek/i.test(m.name + " " + (m.run || ""))) m.providers.push(CEREBRAS); // Cerebras hosts a fast, select set
}

// Approximate community/industry standing (0-5). SUBJECTIVE reputation guide — NOT a
// benchmark score. Reflects general real-world regard as of early 2026; verify for decisions.
const RATING = {
  "Qwen2.5-Coder 32B": 4.5, "Qwen2.5-Coder 7B": 4.0, "DeepSeek-Coder-V2 16B": 4.0, "Codestral 22B": 4.0,
  "DeepSeek-R1 32B": 4.5, "DeepSeek-R1 8B": 3.5, "QwQ 32B": 4.0,
  "Qwen3 32B": 4.5, "Qwen3 14B": 4.0, "Llama 3.3 70B": 4.5, "Mistral Small 24B": 4.0, "Gemma 2 27B": 3.5,
  "Qwen3 8B": 4.0, "Llama 3.1 8B": 4.0, "Phi-4 14B": 4.0, "Gemma 2 9B": 3.5,
  "Llama 3.2 Vision 11B": 3.5, "Qwen2.5-VL 7B": 4.0,
  "Claude Sonnet": 5.0, "Claude Opus": 4.5, "Claude Haiku": 4.0, "GPT-4o": 4.5, "GPT-4o mini": 4.0,
  "Gemini 2.0 Flash": 4.5, "Gemini 1.5 Pro": 4.0, "DeepSeek-V3": 4.5, "DeepSeek-R1": 4.5,
  "Qwen2.5-Coder 14B": 4.0, "StarCoder2 15B": 3.5, "DeepSeek-R1 70B": 4.5, "DeepSeek-R1 14B": 4.0,
  "Llama 3.1 70B": 4.0, "Llama 3.1 405B": 4.5, "Mixtral 8x7B": 3.5, "Mixtral 8x22B": 4.0,
  "Command R 35B": 4.0, "Command R+ 104B": 4.0, "Nemotron 70B": 4.0, "Yi 1.5 34B": 3.5,
  "Qwen2.5 7B": 4.0, "Granite 3 8B": 3.5, "Llama 3.2 3B": 3.5, "Llama 3.2 1B": 3.0,
  "Phi-3.5 mini": 3.5, "Gemma 2 2B": 3.0, "SmolLM2 1.7B": 3.0,
  "o1": 4.5, "o3-mini": 4.5, "Mistral Large 2": 4.0, "Command R+ (API)": 4.0, "Grok 2": 4.0,
};
MODELS.forEach((m) => { m.rating = RATING[m.name] ?? 3.5; });

// Reclassify into domain categories (the old "Cloud"/"Vision" cats were host/capability,
// now handled by dedicated filters). Vision models keep vision:true so the Vision toggle finds them.
const RECAT = {
  "Claude Sonnet": "General", "Claude Opus": "Reasoning", "Claude Haiku": "General",
  "GPT-4o": "General", "GPT-4o mini": "General", "Gemini 2.0 Flash": "General", "Gemini 1.5 Pro": "General",
  "DeepSeek-V3": "General", "DeepSeek-R1": "Reasoning",
  "Llama 3.2 Vision 11B": "General", "Qwen2.5-VL 7B": "General",
};
MODELS.forEach((m) => { if (RECAT[m.name]) m.cat = RECAT[m.name]; });

// "Best for agentic" — reliable native tool-calling that holds up in multi-step agent
// loops (Cowork/Code). Reasoning-only models without tool calling are intentionally excluded.
const AGENTIC = new Set([
  "Qwen2.5-Coder 32B", "DeepSeek-Coder-V2 16B", "Qwen3 32B", "Qwen3 14B", "Llama 3.3 70B", "Mistral Small 24B",
  "Claude Sonnet", "Claude Opus", "Claude Haiku", "GPT-4o", "GPT-4o mini", "Gemini 2.0 Flash", "Gemini 1.5 Pro", "DeepSeek-V3",
  "Qwen2.5-Coder 14B", "Qwen2.5 7B", "Llama 3.1 70B", "Llama 3.1 405B", "Mixtral 8x22B", "Nemotron 70B",
  "Command R 35B", "Command R+ 104B", "Command R+ (API)", "Mistral Large 2", "Grok 2", "o3-mini",
]);
MODELS.forEach((m) => { m.agentic = AGENTIC.has(m.name); });

// Does this model have any free way to run it? (local always counts.)
export function freeInfo(m) {
  const free = (m.providers || []).filter((p) => p.type === "local" || p.tier === "free" || p.tier === "freemium");
  const has = free.length > 0;
  const cost = m.host === "local" ? "Free (local)" : (m.providers || []).some((p) => p.tier === "free" || p.tier === "freemium") ? "Free tier" : "Paid";
  return { has, cost, free };
}
