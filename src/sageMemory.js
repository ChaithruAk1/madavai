// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// sageMemory.js — Sage/Sara's growing mind. The helper learns from every question
// asked, every screen visited, and every action it observes, distilling durable
// insights about THIS user over time — the path from friendly guide to architect,
// solution expert and consultant of Madav.
// PRIVACY: everything lives in localStorage on this device. Nothing is sent
// anywhere except inside Sage's own system prompt to the user's chosen model.
const KEY = "be.sage.memory";
const MAX_NOTES = 18;     // distilled long-term insights (one line each)
const MAX_QLOG = 30;      // raw recent questions kept for the next distillation
const DISTILL_EVERY = 10; // run one cheap distillation call every N questions

function load() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    return {
      notes: Array.isArray(m.notes) ? m.notes.slice(0, MAX_NOTES) : [],
      qlog: Array.isArray(m.qlog) ? m.qlog.slice(-MAX_QLOG) : [],
      screens: m.screens && typeof m.screens === "object" ? m.screens : {},
      events: Array.isArray(m.events) ? m.events.slice(-20) : [],
      qcount: Number(m.qcount) || 0,
      lastDistill: Number(m.lastDistill) || 0,
    };
  } catch { return { notes: [], qlog: [], screens: {}, events: [], qcount: 0, lastDistill: 0 }; }
}
function save(m) { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {} }

// ---- observation hooks (cheap, synchronous, no model calls) ----
export function recordScreen(mode) {
  if (!mode) return;
  const m = load();
  m.screens[mode] = (m.screens[mode] || 0) + 1;
  save(m);
}
export function recordQuestion(text) {
  const t = String(text || "").trim().slice(0, 140);
  if (!t) return;
  const m = load();
  m.qlog.push({ at: Date.now(), q: t });
  if (m.qlog.length > MAX_QLOG) m.qlog = m.qlog.slice(-MAX_QLOG);
  m.qcount += 1;
  save(m);
}
export function recordEvent(kind, detail) {
  const m = load();
  m.events.push({ at: Date.now(), kind: String(kind || ""), d: String(detail || "").slice(0, 80) });
  if (m.events.length > 20) m.events = m.events.slice(-20);
  save(m);
}
export function clearMemory() { try { localStorage.removeItem(KEY); } catch {} }

// ---- what Sage knows, rendered for the system prompt ----
export function memoryBlock() {
  const m = load();
  const top = Object.entries(m.screens).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => `${k} (${v}×)`).join(", ");
  const recent = m.qlog.slice(-6).map((x) => "- " + x.q).join("\n");
  const notes = m.notes.map((n) => "- " + n).join("\n");
  if (!top && !recent && !notes) return "";
  return `

WHAT YOU HAVE LEARNED ABOUT THIS USER (from past questions and watching how they use the app — use it to give sharper, more personal help; never recite this list back):
${notes ? "Insights:\n" + notes + "\n" : ""}${top ? "Screens they use most: " + top + "\n" : ""}${recent ? "Their recent questions:\n" + recent : ""}`;
}

// ---- distillation: every N questions, one cheap call turns the raw log into
// durable insights (skill level, goals, recurring confusions, preferences). ----
export async function maybeDistill(completeOnce) {
  const m = load();
  if (!completeOnce || m.qcount - m.lastDistill < DISTILL_EVERY) return;
  m.lastDistill = m.qcount; save(m); // claim the slot first — never double-run
  try {
    const r = await completeOnce([
      { role: "system", content: "You maintain a tiny long-term memory about one software user. From their recent questions and existing notes, output an UPDATED list of at most " + MAX_NOTES + " one-line insights (skill level, what they build, recurring confusions, preferences, goals). Merge, revise and drop stale lines. Output ONLY the lines, one per line, no bullets, no commentary." },
      { role: "user", content: "Existing notes:\n" + (m.notes.join("\n") || "(none)") + "\n\nRecent questions:\n" + m.qlog.map((x) => x.q).join("\n") + "\n\nScreens used: " + Object.entries(m.screens).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}(${v})`).join(", ") },
    ]);
    const text = (r && (r.text || r.error)) || "";
    if (!r || r.error || !text.trim()) return;
    const notes = text.split("\n").map((l) => l.replace(/^[-•*\d.\s]+/, "").trim()).filter((l) => l && l.length > 8).slice(0, MAX_NOTES);
    if (notes.length) { const cur = load(); cur.notes = notes; save(cur); }
  } catch {} // distillation is best-effort; never disturb the user
}
