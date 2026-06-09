// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Curated, APPROXIMATE benchmark figures for well-known models, matched by model-id substring.
// No provider API publishes these, so they're hand-maintained from public evals (SWE-bench Verified,
// HumanEval) and well-reported agentic/thinking behaviour. Unknown/newer models return null → "—".
// Values are deliberately approximate (~) — treat as a rough guide, not precise leaderboard numbers.
const BENCH = [
  { re: /qwen2\.?5-?coder.*32/i,                 swe: "~31%",  humaneval: "92.7%", agentic: "Good",          thinking: "No" },
  { re: /qwen3.*coder|qwen.*coder/i,             swe: "~40%",  humaneval: "~90%",  agentic: "Good",          thinking: "No" },
  { re: /qwq|qwen3.*(think|reason)/i,            swe: "~40%",  humaneval: "~88%",  agentic: "Partial",       thinking: "Always-on" },
  { re: /deepseek.*r1/i,                          swe: "~49%",  humaneval: "~90%",  agentic: "Partial",       thinking: "Always-on" },
  { re: /deepseek.*(v3|chat|coder)/i,            swe: "~42%",  humaneval: "~89%",  agentic: "Good",          thinking: "No" },
  { re: /devstral/i,                              swe: "~46%",  humaneval: "~82%",  agentic: "Best-in-class", thinking: "No" },
  { re: /codestral/i,                             swe: "~30%",  humaneval: "~81%",  agentic: "Good",          thinking: "No" },
  { re: /claude.*(3\.?5|3-5).*sonnet/i,          swe: "~49%",  humaneval: "~92%",  agentic: "Best-in-class", thinking: "No" },
  { re: /claude.*(3\.?7|sonnet-?4|opus-?4)/i,    swe: "~63%",  humaneval: "~92%",  agentic: "Best-in-class", thinking: "Toggle" },
  { re: /claude.*(haiku)/i,                       swe: "~40%",  humaneval: "~88%",  agentic: "Good",          thinking: "No" },
  { re: /gpt-?4o/i,                               swe: "~33%",  humaneval: "~90%",  agentic: "Good",          thinking: "No" },
  { re: /gpt-?4\.?1/i,                            swe: "~55%",  humaneval: "~92%",  agentic: "Best-in-class", thinking: "No" },
  { re: /(^|\/)o1\b|o1-/i,                        swe: "~41%",  humaneval: "~92%",  agentic: "Partial",       thinking: "Always-on" },
  { re: /(^|\/)o3\b|o3-/i,                        swe: "~49%",  humaneval: "~93%",  agentic: "Partial",       thinking: "Always-on" },
  { re: /llama.*3\.?3.*70/i,                      swe: "~50%",  humaneval: "~88%",  agentic: "Moderate",      thinking: "No" },
  { re: /llama-?4|llama.*(scout|maverick)/i,     swe: "~40%",  humaneval: "~88%",  agentic: "Good",          thinking: "No" },
  { re: /mistral-?large/i,                        swe: "~30%",  humaneval: "~88%",  agentic: "Good",          thinking: "No" },
  { re: /gemini.*(2|1\.?5).*pro/i,               swe: "~38%",  humaneval: "~90%",  agentic: "Good",          thinking: "Toggle" },
  { re: /gemini.*flash/i,                         swe: "~30%",  humaneval: "~88%",  agentic: "Moderate",      thinking: "No" },
  { re: /grok.*(2|3)/i,                           swe: "~35%",  humaneval: "~88%",  agentic: "Good",          thinking: "No" },
  { re: /command-?r/i,                            swe: "~25%",  humaneval: "~81%",  agentic: "Good",          thinking: "No" },
  { re: /nemotron|nvidia.*nemo/i,                swe: "~30%",  humaneval: "~85%",  agentic: "Moderate",      thinking: "Toggle" },
];

export function benchFor(id) { const s = String(id || ""); for (const b of BENCH) if (b.re.test(s)) return b; return null; }

// Rank an agentic label for sorting (higher = more capable).
export const AGENTIC_RANK = { "Best-in-class": 5, "Native": 4, "Good": 3, "Moderate": 2, "Partial": 2, "Yes": 3, "No": 0, "—": -1 };
export const agenticTone = (l) => l === "Best-in-class" || l === "Native" ? "#3ecf8e" : l === "Good" || l === "Yes" ? "#74cf9a" : l === "Partial" || l === "Moderate" ? "#e0b341" : "var(--text-3)";
export const thinkingTone = (l) => l === "Always-on" ? "#3ecf8e" : l === "Toggle" ? "#5aa0ff" : "var(--text-3)";
