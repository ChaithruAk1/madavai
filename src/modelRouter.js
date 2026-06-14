// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Auto model routing. Given a request and the list of models the user has keyed, pick the best one.
// Pure + heuristic-only (no extra model call) so it adds zero latency. Renderer-side: it reuses the
// model catalog the picker already has, then the chosen model is applied via the normal selectModel
// path — the engine's model resolution is never touched, so this can only ever DOWNGRADE to the
// user's default, never break a run. Returns a picker value ("profileId::model") or null = "no clear
// pick, fall back to the default model".

// Lightweight capability sniff from a model id/name (mirrors ModelPicker.classify, kept local to
// avoid importing the whole picker module).
const RE = {
  vision: /vision|multimodal|\bvl\b|llava|pixtral|gpt-4o|gpt-5|gemini|claude-3|claude-4|qwen.*vl/i,
  coding: /cod(er|e)\b|coder|codestral|deepseek-coder|qwen.*coder|devstral/i,
  reasoning: /reason|\br1\b|\bo1\b|\bo3\b|qwq|thinking|think\b|nemotron|deepseek-v3|deepseek-r/i,
  // "strong" = a large / frontier-class model worth using for hard or structured work
  strong: /(opus|sonnet|gpt-?5|gpt-?4|4o|70b|72b|120b|235b|405b|550b|large|ultra|pro\b|r1\b|v3\b|command-r-plus|mistral-large|qwen2?\.5-(?:32|72)|llama-3\.[13]-70)/i,
  // "weak/fast" = small/cheap — great for casual chat, poor at structured output (your ppt problem)
  weak: /(nano|mini|small|flash|haiku|lite|tiny|phi-|gemma-2-2b|\b[1-9]b\b|\b1\.5b\b|3b\b|7b\b|8b\b|9b\b)/i,
};
const isFree = (name, prov) => /:free\b/.test((name || "").toLowerCase()) || /local|ollama|lm ?studio|llama\.cpp/i.test(prov || "");

// Classify the user's request into the capabilities it needs.
function needsOf(prompt, images, mode) {
  const p = String(prompt || "").toLowerCase();
  const vision = (Array.isArray(images) && images.length > 0) || /\b(this image|the photo|screenshot|in the picture|attached image)\b/.test(p);
  const code = mode === "code" || /\b(code|function|bug|refactor|stack ?trace|regex|typescript|javascript|python|react|css|html|sql|api endpoint|compile|unit test)\b/.test(p);
  const office = /\b(deck|slide|slides|presentation|powerpoint|pptx|spreadsheet|excel|xlsx|word document|docx|\.pdf|one[- ]?pager|report|officedoc)\b/.test(p);
  const longCtx = p.length > 8000;
  const reasoning = longCtx || /\b(analy|plan|strategy|compare|prove|architect|design|evaluate|trade-?off|step by step|reason|complex|deep dive|research|critique|root cause)\b/.test(p);
  // wantStrong: anything that benefits from a capable model (structured output, code, hard thinking).
  const wantStrong = office || code || reasoning;
  return { vision, code, office, longCtx, reasoning, wantStrong, simple: !wantStrong && !vision };
}

function scoreModel(item, need) {
  const name = (item.name || "").toLowerCase();
  const prov = item.prov || "";
  const strong = RE.strong.test(name), weak = RE.weak.test(name), free = isFree(name, prov);
  let s = 0;
  if (need.vision) { if (RE.vision.test(name)) s += 120; else s -= 200; } // vision is a hard requirement
  if (need.code && (RE.coding.test(name))) s += 45;
  if (need.wantStrong) { if (strong) s += 40; if (RE.reasoning.test(name)) s += 18; if (weak) s -= 45; if (free && weak) s -= 25; }
  if (need.simple) { if (weak) s += 22; if (free) s += 14; if (strong) s -= 12; } // casual chat → cheap & fast
  return s;
}

// groups: [{ group, items: [{ id:"pid::model", name, prov, badge }] }]  (the picker's own shape)
// Returns the best item's `id` (a picker value), or null to fall back to the user's default model.
export function pickModel({ prompt, images, mode, groups }) {
  try {
    const all = [];
    for (const g of groups || []) for (const it of (g.items || [])) if (it && it.id) all.push(it);
    if (all.length === 0) return null;
    if (all.length === 1) return all[0].id; // nothing to choose between
    const need = needsOf(prompt, images, mode);
    let best = null, bestScore = -1e9;
    for (const it of all) { const sc = scoreModel(it, need); if (sc > bestScore) { bestScore = sc; best = it; } }
    // If nothing scored meaningfully (e.g. casual chat with a uniform pool), don't override — let the
    // user's default stand. A vision request with NO vision model also yields a negative best → fallback.
    if (!best || bestScore <= 0) return null;
    return best.id;
  } catch { return null; }
}

// Short, human reason for the chosen model — shown in the reply so routing is never a black box.
export function routeReason({ prompt, images, mode }) {
  const n = needsOf(prompt, images, mode);
  if (n.vision) return "image input";
  if (n.code) return "coding task";
  if (n.office) return "document/structured output";
  if (n.reasoning) return "complex reasoning";
  return "quick request";
}
