// @madav/core/models — context-window heuristic by model id (provider layer; model names are functional here).
export function ctxWindowFor(model: string | undefined, exact?: number): number {
  if (typeof exact === 'number' && Number.isFinite(exact) && exact >= 4096) return exact;
  const m = String(model || '').toLowerCase();
  const tag = /(\d{2,4})k/.exec(m);
  if (tag) return Number(tag[1]) * 1000;
  if (/claude|gemini-(1\.5|2|3)|grok-(3|4)/.test(m)) return 200000;
  if (/gpt-4o|gpt-4\.1|gpt-5|o[134]|llama-?3|llama-?4|qwen(2\.5|3)|deepseek|mistral-large|nemotron|kimi|glm/.test(m)) return 128000;
  if (/mixtral|mistral|phi-3/.test(m)) return 32000;
  return 32000;
}
