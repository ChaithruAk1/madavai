// Classify a model/provider error: does it DEFINITIVELY mean the model can't do tool-calling
// (vs a transient network / rate-limit / server error)? Used to decide whether to remember
// "this model has no tools" for a while. Conservative: requires BOTH a tools/function mention AND an
// "unsupported"-style signal, plus the known OpenRouter "no endpoints ... support tool use" message.
// Pure + unit-tested. A transient error must NOT mark a model as tool-incapable (that previously
// disabled tools + MCP for the whole session after a single hiccup).
export function toolsUnsupportedErr(e) {
  const m = String((e && e.message) || e || "").toLowerCase();
  if (!m) return false;
  if (/no endpoints? found that support tool/.test(m)) return true; // OpenRouter's no-tool-support reply
  const mentionsTools = /\btools?\b|function[_\s-]?call|function calling|\bfunctions\b/.test(m);
  const unsupported = /unsupported|not support|doesn'?t support|does not support|do not support|not allowed|no longer|invalid|unknown parameter|unrecognized/.test(m);
  return mentionsTools && unsupported;
}
