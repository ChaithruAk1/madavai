// src/bridge/agentMemory.js — per-agent long-term memory + track record (Phase 2): the web mirror of
// desktop's agent-memory.cjs. Pure functions over a plain map { [agentId]: { notes:[{text,ts}], runs,
// lastRunAt, ok, fail } } (the bridge persists it in localStorage `be.agentMemory`). Lets a custom agent
// accumulate durable learnings it references on FUTURE runs, plus a lightweight usage record. Pure -> tested.
const NOTE_CAP = 40;
const HISTORY_CAP = 20;
const rec = (store, id) => (store && store[id]) || { notes: [], runs: 0, lastRunAt: 0, ok: 0, fail: 0, history: [] };
const clamp = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const at = (now) => (typeof now === "function" ? now() : now);

export function getAgentMem(store, agentId) { return rec(store, agentId); }

// Append a durable learning (trimmed, de-duped to the end, capped). Returns a NEW store (immutable).
export function addAgentNote(store, agentId, text, now = Date.now, cap = NOTE_CAP) {
  const t = clamp(text, 280); if (!agentId || !t) return store || {};
  const r = rec(store, agentId);
  const notes = r.notes.filter((n) => n.text !== t);
  notes.push({ text: t, ts: at(now) });
  return { ...(store || {}), [agentId]: { ...r, notes: notes.slice(-cap) } };
}

// Record one run of the agent (track record + bounded per-run history). Returns a NEW store.
export function recordAgentRun(store, agentId, { ok = true, now = Date.now, note = "" } = {}) {
  if (!agentId) return store || {};
  const r = rec(store, agentId);
  const entry = { at: at(now), ok: !!ok };
  const txt = clamp(note, 200); if (txt) entry.note = txt;
  const history = [...(r.history || []), entry].slice(-HISTORY_CAP);
  return { ...(store || {}), [agentId]: { ...r, runs: (r.runs || 0) + 1, lastRunAt: at(now), ok: (r.ok || 0) + (ok ? 1 : 0), fail: (r.fail || 0) + (ok ? 0 : 1), history } };
}

// Per-run track record, most-recent-first. [] if none.
export function getAgentHistory(store, agentId) {
  return [...(rec(store, agentId).history || [])].reverse();
}

// Track-record stats per agent: { [id]: { runs, ok, fail, lastAt, cleanRate } }. Powers presence + "N missions, X% clean".
export function getAgentStats(store) {
  const out = {};
  for (const id of Object.keys(store || {})) {
    const r = rec(store, id);
    const runs = r.runs || 0, ok = r.ok || 0;
    out[id] = { runs, ok, fail: r.fail || 0, lastAt: r.lastRunAt || 0, cleanRate: runs ? Math.round((ok / runs) * 100) : 0 };
  }
  return out;
}

// System-prompt block: recent learnings + a one-line track record. "" if the agent has no history yet.
export function agentMemoryBlock(store, agentId, { max = 20 } = {}) {
  const r = rec(store, agentId);
  const notes = (r.notes || []).slice(-max);
  if (!notes.length && !r.runs) return "";
  const lines = [];
  if (notes.length) lines.push("What you've learned from past runs (apply naturally; never recite this list):\n" + notes.map((n) => "- " + n.text).join("\n"));
  if (r.runs) lines.push(`(Track record: ${r.runs} prior run${r.runs === 1 ? "" : "s"}.)`);
  return ("\n\n" + lines.join("\n\n")).slice(0, 6000);
}
