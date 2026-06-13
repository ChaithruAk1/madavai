// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Shared model pricing ($ per 1M tokens, {in,out}). Used by the web tracer; mirrors the table
// in electron/trace-store.cjs. Pass overrides (settings.pricing: modelSubstring -> {in,out}).
const DEFAULTS = [
  ["claude-opus", { in: 15, out: 75 }], ["claude-sonnet", { in: 3, out: 15 }], ["claude-haiku", { in: 0.8, out: 4 }],
  ["gpt-4o-mini", { in: 0.15, out: 0.6 }], ["gpt-4o", { in: 2.5, out: 10 }], ["gpt-4.1", { in: 2, out: 8 }],
  ["o3", { in: 2, out: 8 }], ["deepseek", { in: 0.27, out: 1.1 }], ["qwen", { in: 0.4, out: 1.2 }],
  ["llama", { in: 0.2, out: 0.6 }], ["gemini", { in: 1.25, out: 5 }], ["mistral", { in: 0.4, out: 2 }],
];

export function priceFor(model, overrides) {
  const m = String(model || "").toLowerCase();
  const ov = overrides || {};
  for (const k of Object.keys(ov)) if (k && m.includes(k.toLowerCase())) return ov[k];
  for (const [k, v] of DEFAULTS) if (m.includes(k)) return v;
  return null; // unknown → $0 (covers local models)
}

export function costUSD(model, inTok, outTok, isLocal, overrides) {
  if (isLocal) return 0;
  const p = priceFor(model, overrides);
  if (!p) return 0;
  return +(((inTok / 1e6) * (p.in || 0)) + ((outTok / 1e6) * (p.out || 0))).toFixed(6);
}
