// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// harness.js — browser-safe MIRROR of electron/harness.cjs (the agent discipline layer).
// Same algorithms, ESM exports, no Node APIs. If you change one file, change both.
// Web scope: JSON repair, head+tail truncation, stale-result squash, loop breaker.
// (Plan tool, compaction calls, tiers, scouts and reviewer run desktop-side today.)

const CTRL_RE = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(8) +
  String.fromCharCode(11) + String.fromCharCode(12) +
  String.fromCharCode(14) + "-" + String.fromCharCode(31) +
  String.fromCharCode(127) + "]", "g");

// Wave 1.1 — tolerant JSON repair ladder (weak models emit sloppy arguments).
export function tolerantParse(raw) {
  const s0 = String(raw == null ? "" : raw).trim();
  if (!s0) return { ok: true, value: {}, repaired: false };
  try { return { ok: true, value: JSON.parse(s0), repaired: false }; } catch {}
  let s = s0;
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, inner) => '"' + inner.replace(/"/g, '\\"') + '"');
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  s = s.replace(/,\s*([}\]])/g, "$1");
  s = s.replace(CTRL_RE, "");
  try { return { ok: true, value: JSON.parse(s), repaired: true }; } catch {}
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

// Wave 1.5 — head+tail truncation: keep the start AND the end (verdicts live at the end).
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

// Wave 4.2 — squash stale tool results so old logs stop hogging the window.
export function squashStale(history, { keepRecent = 14, cap = 180 } = {}) {
  const cut = history.length - keepRecent;
  for (let i = 1; i < cut; i++) {
    const m = history[i];
    if (m.role !== "tool" || typeof m.content !== "string") continue;
    if (m.content.length <= cap || m._squashed) continue;
    const first = m.content.split("\n", 1)[0].slice(0, cap);
    m.content = first + " … (older result compressed)";
    m._squashed = true;
  }
  return history;
}

// Wave 1.4 — identical-call loop breaker + per-target failure streaks.
export class CallGuard {
  constructor() { this.lastKey = ""; this.lastKeyCount = 0; this.streaks = new Map(); this.reasks = 0; }
  _key(name, args) { let a = ""; try { a = JSON.stringify(args); } catch {} return name + "|" + a.slice(0, 400); }
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
