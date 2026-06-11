// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Per-agent run history — every mission an agent runs (chat, team, schedule, webhook,
// handoff, swarm) appends one event. Powers the agent cards' track record
// ("12 missions · 92% clean") and the Blueprint's run list. Append-only JSONL with
// rotation, same pattern as usage-store.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const file = () => path.join(app.getPath("userData"), "agent-history.jsonl");
const MAX_BYTES = 4 * 1024 * 1024, KEEP_LINES = 20000;

function record(ev) {
  if (!ev || !ev.agentId) return;
  try {
    const f = file();
    fs.appendFileSync(f, JSON.stringify({ at: Date.now(), ...ev }) + "\n");
    const st = fs.statSync(f);
    if (st.size > MAX_BYTES) {
      const lines = fs.readFileSync(f, "utf8").trim().split("\n");
      fs.writeFileSync(f, lines.slice(-KEEP_LINES).join("\n") + "\n");
    }
  } catch {}
}

function readAll() {
  try {
    return fs.readFileSync(file(), "utf8").trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// Newest-first run list for one agent.
function list(agentId, limit = 50) {
  return readAll().filter((e) => e.agentId === agentId).slice(-limit).reverse();
}

// One stats object per agent: { missions, clean, cleanPct, tokens, ms, lastAt }.
function stats() {
  const out = {};
  for (const e of readAll()) {
    const s = out[e.agentId] || (out[e.agentId] = { missions: 0, clean: 0, tokens: 0, ms: 0, lastAt: 0 });
    s.missions++;
    if (e.ok) s.clean++;
    s.tokens += e.tokens || 0;
    s.ms += e.ms || 0;
    if ((e.at || 0) > s.lastAt) s.lastAt = e.at;
  }
  for (const id of Object.keys(out)) {
    const s = out[id];
    s.cleanPct = s.missions ? Math.round((s.clean / s.missions) * 100) : 0;
  }
  return out;
}

module.exports = { record, list, stats };
