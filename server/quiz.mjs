// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Speed-check quiz ANSWER KEY + grading. This is intentionally server-side only: the client sends a
// model's raw answers, the server grades them and returns category scores — so the answer key and the
// scoring methodology never ship to the browser/desktop bundle. Runs once per test (no perf impact).

const hasNum = (t, n) => new RegExp("(^|[^0-9])" + n + "([^0-9]|$)").test(String(t || ""));

const QUIZ = [
  { id: "math", cat: "reasoning", check: (t) => hasNum(t, 391) },
  { id: "reason", cat: "reasoning", check: (t) => hasNum(t, 60) },
  { id: "reason_machines", cat: "reasoning", check: (t) => hasNum(t, 3) },
  { id: "reason_batball", cat: "reasoning", check: (t) => hasNum(t, 5) },
  { id: "capital", cat: "knowledge", check: (t) => /tokyo/i.test(String(t || "")) },
  { id: "format", cat: "instruction", check: (t) => String(t || "").replace(/[^A-Za-z]/g, "") === "BANANA" },
  { id: "inst_jsononly", cat: "instruction", check: (t) => { try { const s = String(t || "").trim(); return /^\{[\s\S]*\}$/.test(s) && JSON.parse(s).status === "ok"; } catch { return false; } } },
  { id: "extract_person", cat: "extract", check: (t) => { try { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return false; const o = JSON.parse(m[0]); return /maya rodriguez/i.test(o.name || "") && Number(o.age) === 34; } catch { return false; } } },
  { id: "extract_total", cat: "extract", check: (t) => { try { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return false; return Number(JSON.parse(m[0]).total) === 10; } catch { return false; } } },
  { id: "honesty_country", cat: "honesty", check: (t) => { const s = String(t || "").trim(); return /\bunknown\b/i.test(s) && s.length < 40; } },
  { id: "honesty_premise", cat: "honesty", check: (t) => { const s = String(t || "").trim(); return /\bnone\b/i.test(s) && s.length < 40; } },
  { id: "code_fib", cat: "coding", check: (t) => hasNum(t, 55) },
  { id: "code_count", cat: "coding", check: (t) => hasNum(t, 23) },
  { id: "code_str", cat: "coding", check: (t) => String(t || "").replace(/[^A-Za-z]/g, "").toUpperCase().includes("BONONO") },
  { id: "code_digits", cat: "coding", check: (t) => hasNum(t, 7) },
  { id: "agent_tool", cat: "agentic", check: (t) => { try { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return false; const o = JSON.parse(m[0]); return o.tool === "get_weather" && o.args && /paris/i.test(o.args.city || ""); } catch { return false; } } },
  { id: "agent_steps", cat: "agentic", check: (t) => hasNum(t, 11) },
  { id: "agent_json", cat: "agentic", check: (t) => { try { const m = String(t || "").match(/\{[\s\S]*\}/); if (!m) return false; const o = JSON.parse(m[0]); return Array.isArray(o.evens) && o.evens.length === 2 && Number(o.evens[0]) === 4 && Number(o.evens[1]) === 8; } catch { return false; } } },
  { id: "agent_fmt", cat: "agentic", check: (t) => String(t || "").trim().replace(/\s+/g, " ") === "RED GREEN BLUE" },
];
const QCATS = ["coding", "reasoning", "agentic", "instruction", "extract", "honesty", "knowledge"];

export function scoreQuiz(answers) {
  if (!answers) return null;
  const tally = {}; QCATS.forEach((c) => (tally[c] = { c: 0, t: 0 }));
  let okAll = 0;
  for (const q of QUIZ) { const good = q.check(answers[q.id]); if (good) okAll++; if (tally[q.cat]) { tally[q.cat].t++; if (good) tally[q.cat].c++; } }
  const pct = (o) => (o && o.t ? Math.round((o.c / o.t) * 100) : null);
  const nN = {}; QCATS.forEach((c) => (nN[c] = tally[c].t ? `${tally[c].c}/${tally[c].t}` : null));
  return { overall: Math.round((okAll / QUIZ.length) * 100), coding: pct(tally.coding), reasoning: pct(tally.reasoning), agentic: pct(tally.agentic), instruction: pct(tally.instruction), extract: pct(tally.extract), honesty: pct(tally.honesty), knowledge: pct(tally.knowledge), counts: nN };
}

// Grade a batch keyed by an arbitrary label -> answers map. Returns label -> scores.
export function scoreBatch(batch) {
  const out = {};
  for (const label in (batch || {})) out[label] = scoreQuiz(batch[label]);
  return out;
}
