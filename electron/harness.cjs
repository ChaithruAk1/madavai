// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// harness.cjs — the DISCIPLINE LAYER around the agent loop. An agent's quality is
// model × harness; this module is the harness: it repairs sloppy tool calls, keeps
// context inside the model's window, enforces plan→act→verify method, adapts prompts
// per model tier, and compresses stale history. Pure helpers — no model calls, no
// settings access; agent-openai.cjs wires them into the loop.
// WEB MIRROR: src/shared/harness.js mirrors the browser-safe subset. Keep in sync.
// SECURITY: parseTextToolCalls must ONLY ever run on ASSISTANT text, never on tool
// results or page content — otherwise a hostile web page could inject tool calls.

// Control characters (NUL..BS, VT, FF, SO..US, DEL) built programmatically so the
// source file stays pure printable ASCII (literal control bytes corrupt in transit).
const CTRL_RE = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
  String.fromCharCode(11) + String.fromCharCode(12) +
  String.fromCharCode(14) + "-" + String.fromCharCode(31) +
  String.fromCharCode(127) + "]", "g");

// ---------- Wave 1.1: tolerant JSON repair ladder ----------
// Weak models emit trailing commas, single quotes, smart quotes, raw newlines in
// strings, or wrap JSON in a code fence. Repair silently when possible.
function tolerantParse(raw) {
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

// ---------- Wave 1.5: head+tail truncation ----------
// Build logs and test output put the verdict at the END; flat caps cut it off.
function headTail(text, { headLines = 80, tailLines = 40, maxChars = 8000 } = {}) {
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

// ---------- Wave 2.1: working plan ----------
class PlanTracker {
  constructor() { this.steps = []; }
  set(steps) {
    this.steps = (Array.isArray(steps) ? steps : []).slice(0, 12)
      .map((s) => (typeof s === "string" ? { text: s, status: "pending" } : { text: String(s.text || s.step || ""), status: s.status === "done" || s.status === "doing" ? s.status : "pending" }))
      .filter((s) => s.text);
    return this.render();
  }
  update(idx, status) {
    const i = Number(idx);
    if (this.steps[i] && ["pending", "doing", "done"].includes(status)) this.steps[i].status = status;
    return this.render();
  }
  pending() { return this.steps.filter((s) => s.status !== "done"); }
  hasPlan() { return this.steps.length > 0; }
  render() {
    if (!this.steps.length) return "(no plan)";
    const mark = { pending: "[ ]", doing: "[~]", done: "[x]" };
    return this.steps.map((s, i) => `${mark[s.status]} ${i}. ${s.text}`).join("\n");
  }
}

// ---------- Wave 1.4: loop breaker + failure streaks ----------
class CallGuard {
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

// ---------- Wave 1.3: context budget + compaction ----------
const estTokens = (x) => {
  if (x == null) return 0;
  if (typeof x === "string") return Math.ceil(x.length / 4);
  try { return Math.ceil(JSON.stringify(x).length / 4); } catch { return 0; }
};
// Prefer an EXACT window (e.g. from the OpenRouter catalog) when the caller has one;
// otherwise fall back to the heuristic below. Conservative on purpose.
function ctxWindowFor(model, exact) {
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
function buildCompactionMessages(history) {
  const body = history
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role = m.role === "tool" ? "tool-result" : m.role;
      let c = typeof m.content === "string" ? m.content : "";
      if (m.tool_calls) c += "\n[called: " + m.tool_calls.map((t) => t.function && t.function.name).join(", ") + "]";
      return role.toUpperCase() + ": " + c.slice(0, 2000);
    })
    .join("\n---\n").slice(0, 60000);
  return [
    { role: "system", content: "You compress an agent mission's history into working notes. Output ONLY the notes, no preamble." },
    { role: "user", content: "Compress this mission history into concise notes with EXACTLY these sections:\nGOAL: (the user's objective)\nDECISIONS: (choices made and why)\nFILES: (files read/changed + their current relevant state)\nDONE: (what is finished)\nREMAINS: (what is left to do)\n\n" + body },
  ];
}
// Rebuild history IN PLACE (the array is shared with the session) as:
// [system, summary-note, ...last K real turns]
function applyCompaction(history, summary, keepLast = 4) {
  const sys = history[0] && history[0].role === "system" ? history[0] : null;
  const tailEnd = history.length;
  let tailStart = tailEnd, turns = 0;
  for (let i = tailEnd - 1; i > 0 && turns < keepLast; i--) {
    if (history[i].role === "user" || (history[i].role === "assistant" && !history[i].tool_calls)) turns++;
    tailStart = i;
  }
  // never start the tail on a tool message (it would orphan its tool_call_id)
  while (tailStart < tailEnd && history[tailStart].role === "tool") tailStart++;
  const tail = history.slice(tailStart);
  const note = { role: "user", content: "[context notes — earlier history was compacted to stay within the model's memory]\n" + String(summary || "").slice(0, 12000) };
  history.length = 0;
  if (sys) history.push(sys);
  history.push(note, ...tail);
  return history;
}

// ---------- Wave 4.2: stale tool-result compression ----------
// Old tool outputs are the bulkiest, least useful tokens. Keep the newest intact;
// squash anything older than `keepRecent` messages to a one-line digest.
function squashStale(history, { keepRecent = 14, cap = 180 } = {}) {
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

// ---------- Wave 4.1: repo map ----------
// One compressed tree injected once per mission so the agent stops list_dir spelunking.
function formatRepoMap(entries, budgetChars = 3200) {
  if (!entries || !entries.length) return "";
  const byDir = new Map();
  for (const e of entries) {
    const dir = e.rel.includes("/") ? e.rel.slice(0, e.rel.lastIndexOf("/")) : ".";
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(e.rel.slice(e.rel.lastIndexOf("/") + 1) + (e.size > 200000 ? " (big)" : ""));
  }
  let out = "PROJECT MAP (files you can read — paths are relative):\n";
  for (const [dir, files] of [...byDir.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const line = dir + "/: " + files.slice(0, 40).join(", ") + (files.length > 40 ? ` … +${files.length - 40} more` : "");
    if (out.length + line.length > budgetChars) { out += "… (map truncated)\n"; break; }
    out += line + "\n";
  }
  return out.trim();
}

// ---------- Wave 3.2: prompt tiers ----------
// Tier A: strong tool-callers — leave alone. Tier B: erratic — few-shot + periodic
// re-pin. Tier C: no native tool support — JSON-in-text protocol below.
function tierFor(stats) {
  if (stats && stats.nativeBroken) return "C";
  if (!stats || (stats.toolCalls || 0) < 10) return "A"; // unmeasured → trust, measure as we go
  const tc = Math.max(1, stats.toolCalls || 0);
  const repairRate = ((stats.repaired || 0) + (stats.parseFails || 0)) / tc;
  if (repairRate > 0.15 || (stats.reasks || 0) / tc > 0.08) return "B";
  return "A";
}
const FEWSHOT_NOTE = `
TOOL-CALL DISCIPLINE (follow exactly):
- Arguments must be ONE valid JSON object. Example good call: edit_file with {"path":"src/app.js","old_string":"const a = 1;","new_string":"const a = 2;"}
- Never put commentary inside arguments. Never use single quotes. Never leave trailing commas.
- One tool call at a time unless calls are truly independent.`;

const TEXT_PROTOCOL = (toolList) => `
You do not have native function calling here. To use a tool, output a fenced block EXACTLY like:
\`\`\`tool
{"name": "<tool name>", "args": { ... }}
\`\`\`
Rules: at most 2 tool blocks per reply; the args object must be valid JSON; after the block(s), STOP and wait for the results — do not invent them. When you are completely done, reply with your final answer and NO tool block.
Available tools:
${toolList}`;

// Parse ```tool blocks from ASSISTANT text only (see security note at top).
function parseTextToolCalls(content) {
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

// ---------- Wave 2: method prompt snippets ----------
const METHOD_RULES = `

WORK METHOD (non-negotiable):
- PLAN FIRST: for any task needing more than 2 steps, call set_plan with your step list before acting, mark steps doing/done as you go (set_plan with {"update":{"index":N,"status":"done"}}), and never declare the task complete while steps are pending.
- EVIDENCE BEFORE "DONE": if the project has a build/test command you discovered, run it and report the result before your final answer; if you edited files, confirm from the tool results that the changed region contains your change. Never claim success you have not verified.
- ON FAILURE: state in one sentence why it failed, then try a DIFFERENT approach. After 2 consecutive failures of the same tool on the same target, stop and report the blocker honestly.
- READ BEFORE EDIT: never edit or overwrite a file you have not read this mission.`;

const PLAN_TOOL = {
  type: "function",
  function: {
    name: "set_plan",
    description: "Create or update your visible working plan. Pass {\"steps\":[\"…\",\"…\"]} to set a new plan, or {\"update\":{\"index\":0,\"status\":\"doing|done\"}} to advance one step. The user sees this as a live checklist.",
    parameters: { type: "object", properties: {
      steps: { type: "array", items: { type: "string" }, description: "full ordered step list (replaces the plan)" },
      update: { type: "object", properties: { index: { type: "number" }, status: { type: "string" } }, description: "advance one step" },
    } },
  },
};

const SCOUT_TOOL = {
  type: "function",
  function: {
    name: "explore_parallel",
    description: "Fan out up to 3 read-only exploration questions about the project to parallel scouts (cheap+fast); each returns a short findings summary. Use ONCE near the start of a big task instead of many sequential searches. Example: {\"queries\":[\"where is auth handled?\",\"which files define the settings schema?\"]}",
    parameters: { type: "object", properties: { queries: { type: "array", items: { type: "string" } } }, required: ["queries"] },
  },
};

module.exports = {
  tolerantParse, headTail, PlanTracker, CallGuard,
  estTokens, ctxWindowFor, buildCompactionMessages, applyCompaction,
  squashStale, formatRepoMap,
  tierFor, FEWSHOT_NOTE, TEXT_PROTOCOL, parseTextToolCalls,
  METHOD_RULES, PLAN_TOOL, SCOUT_TOOL,
};
