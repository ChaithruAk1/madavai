// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Run tracing — a passive, append-only record of every agent run (turns, tool calls,
// durations, tokens, cost, errors). Fed by a single try/catch'd tee in session-manager._send,
// so it can NEVER affect a live run. Local-only (no telemetry). Mirrors usage-store's
// jsonl + rotation pattern. Cost/latency dashboard and failure alerts both read from here.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
let settings = null; try { settings = require("./settings.cjs"); } catch {}

const file = () => path.join(app.getPath("userData"), "traces.jsonl");
const MAX_BYTES = 8 * 1024 * 1024, KEEP_LINES = 5000;

const open = new Map(); // sessionId -> live run being assembled (in-memory only until finalized)
// Friendly source category, derived from the run mode (used by the Activity filter chips).
const CATEGORY = { chat: "Let's Chat", cowork: "Let's Collaborate", code: "Let's Build", project: "Projects", team: "Agents" };
const categoryFor = (mode) => CATEGORY[mode] || (mode ? mode[0].toUpperCase() + mode.slice(1) : "Other");

function appendLine(obj) {
  try {
    const f = file();
    fs.appendFileSync(f, JSON.stringify(obj) + "\n");
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

const trunc = (v, n = 300) => { try { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; } catch { return ""; } };
const rid = () => "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const tok = (chars) => Math.round((chars || 0) / 4); // ~4 chars/token, matching usage-store

// Pricing in $ per 1M tokens, {in,out}. User-overridable via settings.pricing[modelSubstr].
function priceFor(model) {
  const m = String(model || "").toLowerCase();
  let table = {};
  try { table = (settings && settings.load().pricing) || {}; } catch {}
  for (const key of Object.keys(table)) if (key && m.includes(key.toLowerCase())) return table[key];
  const D = [
    ["claude-opus", { in: 15, out: 75 }], ["claude-sonnet", { in: 3, out: 15 }], ["claude-haiku", { in: 0.8, out: 4 }],
    ["gpt-4o-mini", { in: 0.15, out: 0.6 }], ["gpt-4o", { in: 2.5, out: 10 }], ["gpt-4.1", { in: 2, out: 8 }],
    ["o3", { in: 2, out: 8 }], ["deepseek", { in: 0.27, out: 1.1 }], ["qwen", { in: 0.4, out: 1.2 }],
    ["llama", { in: 0.2, out: 0.6 }], ["gemini", { in: 1.25, out: 5 }], ["mistral", { in: 0.4, out: 2 }],
  ];
  for (const [k, v] of D) if (m.includes(k)) return v;
  return null; // unknown → treated as $0 (covers local models)
}
function costUSD(model, inTok, outTok, isLocal) {
  if (isLocal) return 0;
  const p = priceFor(model);
  if (!p) return 0;
  return +(((inTok / 1e6) * (p.in || 0)) + ((outTok / 1e6) * (p.out || 0))).toFixed(6);
}

// Tee point — called from session-manager._send for EVERY UiEvent. `turn` = live turn stats
// (model/provider/promptChars/replyChars), may be undefined for some paths. Fully tolerant.
function onEvent(sessionId, kind, data, turn) {
  try {
    if (!sessionId) return;
    if (settings) { try { if (settings.load().tracing && settings.load().tracing.enabled === false) return; } catch {} }
    let run = open.get(sessionId);
    const now = Date.now();
    if (kind === "init") {
      if (run && !run._done) finalize(sessionId, "incomplete", null, null);
      run = { id: rid(), sessionId, mode: (data && data.mode) || (turn && turn.mode) || "chat",
        model: (data && data.model) || (turn && turn.model) || "",
        provider: (data && data.provider) || (turn && turn.provider) || "",
        startedAt: now, steps: [], status: "running" };
      open.set(sessionId, run);
      return;
    }
    if (!run) { // no init seen (e.g. team path) — lazily open so the run is still captured
      run = { id: rid(), sessionId, mode: (turn && turn.mode) || "chat", model: (turn && turn.model) || "",
        provider: (turn && turn.provider) || "", startedAt: now, steps: [], status: "running" };
      open.set(sessionId, run);
    }
    if (kind === "tool_use") {
      run.steps.push({ id: (data && data.id) || ("s" + run.steps.length), name: (data && data.name) || "tool",
        input: trunc(data && data.input), startedAt: now, auto: !!(data && data.auto) });
    } else if (kind === "tool_result") {
      const id = data && data.id;
      const step = [...run.steps].reverse().find((x) => (id ? x.id === id : !x.endedAt));
      if (step) {
        step.endedAt = now; step.durationMs = now - step.startedAt;
        const out = (data && (data.output != null ? data.output : data.text)) || "";
        step.ok = !/^error/i.test(String(out)); step.output = trunc(out);
      }
    } else if (kind === "result") {
      finalize(sessionId, (data && data.subtype === "interrupted") ? "interrupted" : "ok", turn, data);
    } else if (kind === "error") {
      finalize(sessionId, "error", turn, data);
    }
  } catch {}
}

function finalize(sessionId, status, turn, data) {
  const run = open.get(sessionId);
  if (!run || run._done) return;
  open.delete(sessionId);
  run._done = true;
  run.status = status;
  run.endedAt = Date.now();
  run.durationMs = run.endedAt - run.startedAt;
  const model = (turn && turn.model) || run.model || "";
  const inTok = tok(turn && turn.promptChars), outTok = tok(turn && turn.replyChars);
  run.model = model || run.model;
  run.provider = (turn && turn.provider) || run.provider || "";
  run.tokensIn = inTok; run.tokensOut = outTok; run.tokens = inTok + outTok;
  const isLocal = /localhost|127\.0\.0\.1/i.test(run.provider) || /(ollama|lm ?studio|local)/i.test(run.provider);
  run.local = isLocal;
  run.category = categoryFor(run.mode);
  run.costUSD = costUSD(model, inTok, outTok, isLocal);
  run.error = status === "error" ? trunc(data && (data.message || data.code), 400) : null;
  for (const st of run.steps) if (!st.endedAt) { st.endedAt = run.endedAt; st.durationMs = st.endedAt - st.startedAt; }
  delete run._done;
  appendLine(run);
  try { require("./alerts.cjs").onRunFinalized(run); } catch {}
}

function list(limit = 200) { return readAll().slice(-limit).reverse(); }
function get(id) { return readAll().find((r) => r.id === id) || null; }
function clear() { try { fs.writeFileSync(file(), ""); } catch {} }

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

function summary(days = 30) {
  const since = days ? Date.now() - days * 86400000 : 0;
  const runs = readAll().filter((r) => (r.endedAt || r.startedAt || 0) >= since);
  const byDay = {}, byModel = {}, byProvider = {};
  const lat = []; let cost = 0, errors = 0, tokens = 0, saved = 0;
  for (const r of runs) {
    cost += r.costUSD || 0; tokens += r.tokens || 0;
    if (r.status === "error") errors++;
    if (r.durationMs) lat.push(r.durationMs);
    if (r.local) saved += costUSD(r.model, r.tokensIn || 0, r.tokensOut || 0, false); // what local saved vs cloud price
    const dk = new Date(r.endedAt || r.startedAt).toISOString().slice(0, 10);
    byDay[dk] = byDay[dk] || { cost: 0, tokens: 0, runs: 0 }; byDay[dk].cost += r.costUSD || 0; byDay[dk].tokens += r.tokens || 0; byDay[dk].runs++;
    const m = r.model || "unknown"; byModel[m] = byModel[m] || { runs: 0, cost: 0, tokens: 0, lat: [] };
    byModel[m].runs++; byModel[m].cost += r.costUSD || 0; byModel[m].tokens += r.tokens || 0; if (r.durationMs) byModel[m].lat.push(r.durationMs);
    const p = r.provider || "unknown"; byProvider[p] = byProvider[p] || { runs: 0, cost: 0 }; byProvider[p].runs++; byProvider[p].cost += r.costUSD || 0;
  }
  const models = Object.entries(byModel).map(([model, v]) => ({ model, runs: v.runs, cost: +v.cost.toFixed(4), tokens: v.tokens, p50: pct(v.lat, 50), p99: pct(v.lat, 99) })).sort((a, b) => b.cost - a.cost);
  return {
    runs: runs.length, errors, errorRate: runs.length ? +(errors / runs.length).toFixed(3) : 0,
    costUSD: +cost.toFixed(4), tokens, localSavedUSD: +saved.toFixed(4),
    latencyP50: pct(lat, 50), latencyP99: pct(lat, 99),
    byDay, models,
    providers: Object.entries(byProvider).map(([provider, v]) => ({ provider, runs: v.runs, cost: +v.cost.toFixed(4) })).sort((a, b) => b.cost - a.cost),
  };
}

module.exports = { onEvent, list, get, clear, summary, priceFor, costUSD };
