// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Web run tracing — the browser-side counterpart to electron/trace-store.cjs, so the Activity
// panel works at parity on the web build. Persists to localStorage (capped) rather than a
// jsonl file, and avoids an IndexedDB schema bump. Tool timelines are thin on web (no MCP/shell);
// cost / latency / error tracking is full. Local-only (no telemetry).
import { costUSD } from "../shared/pricing.js";

const KEY = "madav.traces";
const CAP = 200;
const open = new Map(); // sessionId -> live run
const CATEGORY = { chat: "Let's Chat", cowork: "Let's Collaborate", code: "Let's Build", project: "Projects", team: "Agents" };
const categoryFor = (mode) => CATEGORY[mode] || (mode ? mode[0].toUpperCase() + mode.slice(1) : "Other");

function readAll() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
function writeAll(arr) { try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-CAP))); } catch {} }
function settings() { try { return JSON.parse(localStorage.getItem("be.settings") || "{}"); } catch { return {}; } }

const trunc = (v, n = 300) => { try { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; } catch { return ""; } };
const rid = () => "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const tok = (c) => Math.round((c || 0) / 4);
const strLen = (c) => (typeof c === "string" ? c.length : (Array.isArray(c) ? c.reduce((a, x) => a + ((x && x.text && x.text.length) || 0), 0) : 0));
const lastOf = (msgs, role) => { for (let i = (msgs || []).length - 1; i >= 0; i--) if (msgs[i].role === role) return msgs[i]; return null; };

// Tee point — called from webBridge's emit() for every event. `sess` = the live session.
export function onEvent(sessionId, kind, data, sess) {
  try {
    if (!sessionId) return;
    if (settings().tracing && settings().tracing.enabled === false) return;
    let run = open.get(sessionId);
    const now = Date.now();
    if (kind === "init") {
      if (run && !run._done) finalize(sessionId, "incomplete", sess);
      run = { id: rid(), sessionId, mode: (sess && sess.mode) || (data && data.mode) || "chat",
        model: (data && data.model) || (sess && sess.profile && sess.profile.model) || "",
        provider: (data && data.provider) || (sess && sess.profile && sess.profile.name) || "",
        startedAt: now, steps: [], status: "running" };
      open.set(sessionId, run);
      return;
    }
    if (!run) {
      run = { id: rid(), sessionId, mode: (sess && sess.mode) || "chat", model: (sess && sess.profile && sess.profile.model) || "",
        provider: (sess && sess.profile && sess.profile.name) || "", startedAt: now, steps: [], status: "running" };
      open.set(sessionId, run);
    }
    if (kind === "tool_use") {
      run.steps.push({ id: (data && data.id) || ("s" + run.steps.length), name: (data && data.name) || "tool", input: trunc(data && data.input), startedAt: now });
    } else if (kind === "tool_result") {
      const id = data && data.id;
      const st = [...run.steps].reverse().find((x) => (id ? x.id === id : !x.endedAt));
      if (st) { st.endedAt = now; st.durationMs = now - st.startedAt; st.ok = !(data && data.ok === false); st.output = trunc(data && (data.output != null ? data.output : data.text)); }
    } else if (kind === "error") {
      if (run) run._err = (data && data.message) || "error";
    } else if (kind === "result") {
      const sub = data && data.subtype;
      finalize(sessionId, sub === "interrupted" ? "interrupted" : (sub === "error" || run._err) ? "error" : "ok", sess);
    }
  } catch {}
}

function finalize(sessionId, status, sess) {
  const run = open.get(sessionId);
  if (!run || run._done) return;
  open.delete(sessionId); run._done = true;
  run.status = status; run.endedAt = Date.now(); run.durationMs = run.endedAt - run.startedAt;
  const msgs = (sess && sess.messages) || [];
  const inTok = tok(strLen((lastOf(msgs, "user") || {}).content));
  const outTok = tok(strLen((lastOf(msgs, "assistant") || {}).content));
  run.model = run.model || (sess && sess.profile && sess.profile.model) || "";
  run.provider = run.provider || (sess && sess.profile && sess.profile.name) || "";
  run.tokensIn = inTok; run.tokensOut = outTok; run.tokens = inTok + outTok;
  const baseUrl = (sess && sess.profile && sess.profile.baseUrl) || "";
  const isLocal = /localhost|127\.0\.0\.1/i.test(baseUrl) || /(ollama|lm ?studio|local)/i.test(run.provider);
  run.local = isLocal;
  run.category = categoryFor(run.mode);
  run.costUSD = costUSD(run.model, inTok, outTok, isLocal, settings().pricing || {});
  run.error = status === "error" ? trunc(run._err || "error", 400) : null;
  for (const st of run.steps) if (!st.endedAt) { st.endedAt = run.endedAt; st.durationMs = st.endedAt - st.startedAt; }
  delete run._done; delete run._err;
  const all = readAll(); all.push(run); writeAll(all);
  try { maybeAlert(run); } catch {}
}

export function list(limit = 200) { return readAll().slice(-limit).reverse(); }
export function get(id) { return readAll().find((r) => r.id === id) || null; }
export function clear() { try { localStorage.removeItem(KEY); } catch {} }

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

export function summary(days = 30) {
  const since = days ? Date.now() - days * 86400000 : 0;
  const runs = readAll().filter((r) => (r.endedAt || r.startedAt || 0) >= since);
  const byDay = {}, byModel = {}, byProvider = {};
  const lat = []; let cost = 0, errors = 0, tokens = 0, saved = 0;
  for (const r of runs) {
    cost += r.costUSD || 0; tokens += r.tokens || 0;
    if (r.status === "error") errors++;
    if (r.durationMs) lat.push(r.durationMs);
    if (r.local) saved += costUSD(r.model, r.tokensIn || 0, r.tokensOut || 0, false, settings().pricing || {});
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

// ---- web alerts (Web Notifications API) ----
function alertsConf() { const a = settings().alerts; return a || {}; }
function notify(title, body) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") new Notification(title, { body: String(body || "").slice(0, 300) });
    else if (Notification.permission !== "denied") Notification.requestPermission().then((p) => { if (p === "granted") new Notification(title, { body: String(body || "").slice(0, 300) }); });
  } catch {}
}
function maybeAlert(run) {
  const a = alertsConf();
  if (a.enabled === false) return;
  const reasons = [];
  if (a.onError !== false && run.status === "error") reasons.push("failed: " + (run.error || "error"));
  if (a.costPerRunUSD && run.costUSD && run.costUSD >= a.costPerRunUSD) reasons.push(`cost $${run.costUSD} ≥ $${a.costPerRunUSD}`);
  if (a.latencyMs && run.durationMs && run.durationMs >= a.latencyMs) reasons.push(`took ${Math.round(run.durationMs / 1000)}s`);
  if (reasons.length) notify(`Madav run ${run.status === "error" ? "failed" : "alert"} — ${run.model || run.mode || ""}`.trim(), reasons.join(" · "));
}
export function testAlert() { notify("Madav test alert", "Alerts are working."); return true; }
