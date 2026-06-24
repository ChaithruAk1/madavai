// @madav/core/models — capability gate by model id (provider layer; model names are functional here).
// Weak models get the reliable template path; clearly-capable models get the bespoke path; unknown -> template.
export function isDeckCapable(model: string | undefined): boolean {
  const m = String(model || '').toLowerCase();
  const moe = m.match(/a(\d+(?:\.\d+)?)b\b/);
  if (moe && parseFloat(moe[1]) < 20) return false; // MoE judged by active params
  if (/(nano|mini|small|flash|haiku|lite|tiny|phi-|gpt-oss|gemma-2-2b|\b[1-9]b\b|3b\b|7b\b|8b\b|9b\b)/.test(m)) return false;
  return /(opus|sonnet|gpt-?5|gpt-?4|4o|\bo1\b|\bo3\b|gemini-(?:1\.5-pro|2|exp|pro)|deepseek|grok|3[0-9]b|[4-9][0-9]b|[1-9][0-9]{2}b|mistral-large|command-r-plus|qwen2?\.5-(?:32|72))/.test(m);
}
