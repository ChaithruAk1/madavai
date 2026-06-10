// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// model-stats.cjs — MEASURED per-model tool discipline (Wave 3.1). Every agent mission
// records how a model actually behaved: tool calls made, how many needed JSON repair,
// re-asks, failures, missions finished vs hitting the step ceiling. The harness score
// turns "agent-ready" from a name heuristic into a measurement, and the prompt tiers
// (harness.tierFor) adapt to it automatically.
// Storage: userData/model-stats.json — counters only, no prompt/content is ever stored.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const file = () => path.join(app.getPath("userData"), "model-stats.json");
let _cache = null;

function _load() {
  if (_cache) return _cache;
  try { _cache = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { _cache = {}; }
  if (!_cache || typeof _cache !== "object") _cache = {};
  return _cache;
}
let _t = null;
function _save() {
  // debounce — missions bump counters in bursts
  if (_t) return;
  _t = setTimeout(() => {
    _t = null;
    try { fs.writeFileSync(file(), JSON.stringify(_cache || {}, null, 0)); } catch {}
  }, 800);
}

const FIELDS = ["missions", "success", "maxSteps", "toolCalls", "repaired", "parseFails", "reasks", "failures", "denied", "textMode", "nativeBroken"];

function bump(model, field, n = 1) {
  if (!model || !FIELDS.includes(field)) return;
  const all = _load();
  const m = (all[model] = all[model] || {});
  m[field] = (m[field] || 0) + n;
  m.at = Date.now();
  _save();
}
function flag(model, field, v = 1) { // absolute set (e.g. nativeBroken)
  if (!model || !FIELDS.includes(field)) return;
  const all = _load();
  const m = (all[model] = all[model] || {});
  m[field] = v;
  m.at = Date.now();
  _save();
}
function summary(model) { return _load()[model] || null; }
function all() { return { ..._load() }; }

// Harness score 0-10. Honest: null until ≥10 measured tool calls.
function score(model) {
  const s = summary(model);
  if (!s || (s.toolCalls || 0) < 10) return null;
  const tc = Math.max(1, s.toolCalls || 0);
  let v = 10;
  v -= 4 * Math.min(1, ((s.repaired || 0) + (s.parseFails || 0)) / tc);   // sloppy JSON
  v -= 3 * Math.min(1, (s.reasks || 0) / tc);                              // needed re-asks
  v -= 2 * Math.min(1, (s.failures || 0) / tc);                            // failing calls
  const runs = Math.max(1, (s.missions || 0));
  v -= 2 * Math.min(1, (s.maxSteps || 0) / runs);                          // ran out of steps
  if (s.nativeBroken) v = Math.min(v, 3);                                  // text-protocol only
  return Math.max(0, Math.round(v * 10) / 10);
}

module.exports = { bump, flag, summary, all, score };
