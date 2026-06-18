// core/turn-helpers.js — ESM SINGLE SOURCE for the pure, cross-surface turn-loop helpers
// (ADR-0001 / M2a). Extracted VERBATIM from the desktop reference electron/harness.cjs; the only
// change is the `export` keyword. Web's src/shared/harness.js mirror converges onto these when it
// adopts the core (M2d). Pure helpers — no Node/browser/Electron APIs, no model calls, no I/O.
// Imported by: web/renderer + server natively; desktop (electron/*.cjs) via cached dynamic import().
// Drift is LOCKED by tests/parity/turn-helpers.test.js: core.fn.toString() === harness.cjs fn.toString().
// SECURITY: parseTextToolCalls must ONLY run on ASSISTANT text, never on tool results or page content
// — otherwise a hostile page could inject tool calls (see the electron/harness.cjs header).


// Control characters built programmatically so the source stays pure printable ASCII
// (literal control bytes corrupt in transit). Private dependency of tolerantParse.
const CTRL_RE = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
  String.fromCharCode(11) + String.fromCharCode(12) +
  String.fromCharCode(14) + "-" + String.fromCharCode(31) +
  String.fromCharCode(127) + "]", "g");

// ---------- tolerant JSON repair ladder (Wave 1.1) ----------
export function tolerantParse(raw) {
  const s0 = String(raw == null ? "" : raw).trim();
  if (!s0) return { ok: true, value: {}, repaired: false };
  try { return { ok: true, value: JSON.parse(s0), repaired: false }; } catch {}
  let s = s0;
  // strip a wrapping code fence
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
  // smart quotes → straight
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  // single-quoted keys/values → double (best effort)
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, inner) => '"' + inner.replace(/"/g, '\\"') + '"');
  // unquoted keys → quoted
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  // trailing commas
  s = s.replace(/,\s*([}\]])/g, "$1");
  // raw control characters (except \n and \t, which the walker below escapes)
  s = s.replace(CTRL_RE, "");
  try { return { ok: true, value: JSON.parse(s), repaired: true }; } catch {}
  // escape bare newlines/tabs that sit inside string literals
  try {
    let out = "", inStr = false, esc = false;
    for (const ch of s) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr && ch === "\n") { out += "\\n"; continue; }
      if (inStr && ch === "\t") { out += "\\t"; continue; }
      out += ch;
    }
    return { ok: true, value: JSON.parse(out), repaired: true };
  } catch {}
  // last resort: extract the largest balanced {...} block
  const start = s.indexOf("{");
  if (start >= 0) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === "{") depth++;
      else if (!inStr && ch === "}") {
        depth--;
        if (depth === 0) {
          try { return { ok: true, value: JSON.parse(s.slice(start, i + 1)), repaired: true }; } catch {}
          break;
        }
      }
    }
  }
  return { ok: false, value: {}, repaired: false, error: "arguments were not valid JSON" };
}

// ---------- head+tail truncation (Wave 1.5) ----------
export function headTail(text, { headLines = 80, tailLines = 40, maxChars = 8000 } = {}) {
  const t = String(text == null ? "" : text);
  if (t.length <= maxChars) {
    const lines = t.split("\n");
    if (lines.length <= headLines + tailLines) return t;
    const omitted = lines.length - headLines - tailLines;
    return lines.slice(0, headLines).join("\n") + `\n… (${omitted} lines omitted) …\n` + lines.slice(-tailLines).join("\n");
  }
  const head = t.slice(0, Math.floor(maxChars * 0.65));
  const tail = t.slice(-Math.floor(maxChars * 0.3));
  return head + `\n… (${t.length - head.length - tail.length} characters omitted) …\n` + tail;
}

// ---------- stale tool-result compression (Wave 4.2) ----------
export function squashStale(history, { keepRecent = 14, cap = 180 } = {}) {
  const cut = history.length - keepRecent;
  for (let i = 1; i < cut; i++) {
    const m = history[i];
    if (typeof m.content !== "string") continue;
    // Native tool results are role "tool"; text-mode results are user-role messages
    // whose content starts with the "[result of " prefix (see agent-openai pushToolResult).
    const isTextModeResult = m.role === "user" && m.content.startsWith("[result of ");
    if (m.role !== "tool" && !isTextModeResult) continue;
    if (m.content.length <= cap || m._squashed) continue;
    const first = m.content.split("\n", 1)[0].slice(0, cap);
    m.content = first + " … (older result compressed)";
    m._squashed = true;
  }
  return history;
}

// ---------- loop breaker + failure streaks (Wave 1.4) ----------
export class CallGuard {
  constructor() { this.lastKey = ""; this.lastKeyCount = 0; this.streaks = new Map(); this.reasks = 0; }
  _key(name, args) { let a = ""; try { a = JSON.stringify(args); } catch {} return name + "|" + a.slice(0, 400); }
  // true when this exact call is being repeated for the 3rd time in a row
  repeatBlocked(name, args) {
    const k = this._key(name, args);
    if (k === this.lastKey) { this.lastKeyCount++; } else { this.lastKey = k; this.lastKeyCount = 1; }
    return this.lastKeyCount >= 3;
  }
  noteResult(name, target, ok) {
    const k = name + "|" + String(target || "");
    if (ok) this.streaks.delete(k);
    else this.streaks.set(k, (this.streaks.get(k) || 0) + 1);
  }
  failStreak(name, target) { return this.streaks.get(name + "|" + String(target || "")) || 0; }
}

// ---------- context-window heuristic (Wave 1.3) ----------
export function ctxWindowFor(model, exact) {
  // A real catalog value beats every guess — but only trust sane numbers.
  if (typeof exact === "number" && Number.isFinite(exact) && exact >= 4096) return exact;
  const m = String(model || "").toLowerCase();
  const tag = /(\d{2,4})k/.exec(m); // explicit "...-32k", "...-128k"
  if (tag) return Number(tag[1]) * 1000;
  if (/claude|gemini-(1\.5|2|3)|grok-(3|4)/.test(m)) return 200000;
  if (/gpt-4o|gpt-4\.1|gpt-5|o[134]|llama-?3|llama-?4|qwen(2\.5|3)|deepseek|mistral-large|nemotron|kimi|glm/.test(m)) return 128000;
  if (/mixtral|mistral|phi-3/.test(m)) return 32000;
  return 32000;
}

// ---------- text-mode tool protocol (textMode bits) ----------
export const TEXT_PROTOCOL = (toolList) => `
You do not have native function calling here. To use a tool, output a fenced block EXACTLY like:
\`\`\`tool
{"name": "<tool name>", "args": { ... }}
\`\`\`
Rules: at most 2 tool blocks per reply; the args object must be valid JSON; after the block(s), STOP and wait for the results — do not invent them. When you are completely done, reply with your final answer and NO tool block.
Available tools:
${toolList}`;

// Parse ```tool blocks from ASSISTANT text only (see SECURITY note at top).
export function parseTextToolCalls(content) {
  const calls = [];
  const re = /```tool\s*\n([\s\S]*?)```/g;
  let m, i = 0;
  while ((m = re.exec(String(content || ""))) && calls.length < 2) {
    const p = tolerantParse(m[1]);
    if (p.ok && p.value && p.value.name) {
      calls.push({ id: "txt_" + Date.now().toString(36) + "_" + i++, name: String(p.value.name), arguments: JSON.stringify(p.value.args || p.value.arguments || {}) });
    }
  }
  const stripped = String(content || "").replace(/```tool\s*\n[\s\S]*?```/g, "").trim();
  return { calls, stripped };
}

// ---------- chain-of-thought stripper (final-answer normalizer) ----------
// VERBATIM from electron/providers.cjs stripReasoning (also duplicated in extension/sidepanel.js).
// coreChatTurn applies it to the FINAL answer so the core loop matches the desktop engine (line 661).
export function stripReasoning(str) {
  if (!str) return str || "";
  let s = String(str).replace(/<think>[\s\S]*?<\/think>/gi, "");
  const i = s.lastIndexOf("</think>");
  if (i !== -1) s = s.slice(i + "</think>".length);
  s = s.replace(/<think>[\s\S]*$/i, "");
  return s.replace(/^\s+/, "");
}
