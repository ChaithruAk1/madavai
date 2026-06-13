// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Play (skill) usage log — every time a play is loaded (pinned pre-load OR a live
// load_skill tool call), one event is appended. Powers the Playbook cards' "used 12×
// · last by Pitchwright" line and the dead-play surfacing. Append-only JSONL with
// rotation — same pattern as agent-history.cjs.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const file = () => path.join(app.getPath("userData"), "play-usage.jsonl");
const MAX_BYTES = 2 * 1024 * 1024, KEEP_LINES = 10000;

// ev: { name, by? (agent/room/"you"), context? ("agent"|"room"|"chat"|"schedule"), source? }
function record(ev) {
  if (!ev || !ev.name) return;
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

// One object keyed by play name: { uses, lastAt, lastBy }.
function stats() {
  const out = {};
  for (const e of readAll()) {
    const s = out[e.name] || (out[e.name] = { uses: 0, lastAt: 0, lastBy: "" });
    s.uses++;
    if ((e.at || 0) >= s.lastAt) { s.lastAt = e.at || 0; s.lastBy = e.by || ""; }
  }
  return out;
}

function events() { return readAll(); }
module.exports = { record, stats, events };
