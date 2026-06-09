// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// WEB bridge — the browser implementation of the same contract the Electron preload exposes.
// Parity strategy:
//   • Account/billing/analytics  -> the auth server (same one the desktop app uses).
//   • Settings/history/projects/saved/tasks -> localStorage (stays on the user's device, so their
//     API keys and chats never touch our servers — same privacy model as desktop).
//   • Chat + model listing -> stream directly from the browser to the user's provider.
//   • Local-machine features (folders, installing skills, MCP connector processes, Telegram,
//     local models) can't run in a browser -> they return a clear "desktop app" result.
import { streamChat, streamChatTools, listModels as provListModels, ping as provPing } from "../shared/providers.js";
import * as webfs from "./webfs.js";

// ---- where the API lives. Same origin in production (the auth server serves this app); on the
// Vite dev port (5174) the API is the separate auth server on 8787. Overridable via a global. ----
const AUTH_BASE = (() => {
  if (typeof window !== "undefined" && window.__BRAINEDGE_AUTH_BASE__) return String(window.__BRAINEDGE_AUTH_BASE__).replace(/\/+$/, "");
  if (typeof location !== "undefined" && location.port === "5174") return "http://127.0.0.1:8787";
  return ""; // same-origin
})();
const api = (path) => (AUTH_BASE ? AUTH_BASE : "") + path;

// ---- session token (web OAuth returns ?token=...; we also accept it once and clean the URL) ----
const TOKEN_KEY = "be.token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };
(function captureTokenFromUrl() {
  try {
    const u = new URL(location.href);
    const t = u.searchParams.get("token");
    if (t) { setToken(t); u.searchParams.delete("token"); history.replaceState({}, "", u.pathname + (u.search || "") + u.hash); }
  } catch {}
})();
// Log an anonymous website visit (for admin visitor analytics). One stable id per browser.
(function trackVisit() {
  try {
    let v = localStorage.getItem("be.visitor");
    if (!v) { v = "v" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("be.visitor", v); }
    fetch(api("/visit"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorId: v }) }).catch(() => {});
  } catch {}
})();
const authHeaders = (extra) => { const h = { ...(extra || {}) }; const t = getToken(); if (t) h.Authorization = "Bearer " + t; return h; };

// ---- localStorage JSON helpers ----
const LS = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, val) {
    const s = JSON.stringify(val);
    try { localStorage.setItem(key, s); }
    catch {
      // Storage full (chat history can grow large): free space by dropping history, then retry once,
      // so important data like settings/API keys still saves.
      try { if (key !== "be.sessions") localStorage.removeItem("be.sessions"); localStorage.setItem(key, s); } catch {}
    }
    return val;
  },
};
const rid = (p) => p + Math.random().toString(36).slice(2, 8);

// ---- IndexedDB for chat history (large capacity, so it can't crowd out settings/keys in localStorage) ----
const IDB_NAME = "brainedge", IDB_STORE = "sessions";
let _dbPromise = null;
function idb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return _dbPromise;
}
async function idbPut(rec) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(rec); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(id) { try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction(IDB_STORE, "readonly"); const r = tx.objectStore(IDB_STORE).get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; } }
async function idbAll() { try { const db = await idb(); return await new Promise((res) => { const tx = db.transaction(IDB_STORE, "readonly"); const r = tx.objectStore(IDB_STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); } catch { return []; } }
async function idbDel(id) { try { const db = await idb(); await new Promise((res) => { const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).delete(id); tx.oncomplete = () => res(); tx.onerror = () => res(); }); } catch {} }
// One-time migration: move any history that's still in localStorage into IndexedDB, then free localStorage.
(async function migrateHistory() {
  try {
    const old = localStorage.getItem("be.sessions");
    if (!old) return;
    const map = JSON.parse(old) || {};
    for (const id in map) { try { await idbPut(map[id]); } catch {} }
    localStorage.removeItem("be.sessions");
  } catch {}
})();

// ---- default settings (mirrors the desktop shape the renderer expects) ----
const SETTINGS_KEY = "be.settings";
function defaultSettings() {
  return {
    activeProfileId: "p_openrouter",
    profiles: {
      p_openrouter: { id: "p_openrouter", name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "", cachedModels: [] },
    },
    theme: "dark", accent: "#13c2d6", globalInstructions: "", responseLanguage: "model", defaultModel: "", authBaseUrl: AUTH_BASE || "",
    account: { name: "", email: "", avatar: "" }, messaging: { autoContinue: true },
  };
}
const loadSettings = () => LS.get(SETTINGS_KEY, null) || LS.set(SETTINGS_KEY, defaultSettings());
const activeProfile = (s) => (s.profiles && s.profiles[s.activeProfileId]) || Object.values(s.profiles || {})[0] || null;

// ================= event bus (chat streaming) =================
let seq = 0;
const listeners = new Set();
const emit = (sessionId, kind, data) => { const e = { sessionId, seq: seq++, kind, data }; listeners.forEach((cb) => cb(e)); };
const sessions = new Map(); // sessionId -> { profile, messages, ac, mode, convId, title }

// Build the system prompt from global instructions (+ project context when present).
// Always-on base behavior: keep replies human and natural, and never let the model parrot its own
// instructions back. The user's own instructions (below) still govern the substance of answers.
const BASE_BEHAVIOR =
  "You are BrainEdge, a warm and helpful assistant. Reply naturally and conversationally, the way a thoughtful person would. " +
  "Never restate, list, summarize, or describe your own instructions, rules, role, or \"operating framework\" — just follow them silently. " +
  "If the user only greets you or makes small talk, reply naturally in kind; do not recite your guidelines. " +
  "Apply the guidance below to the substance and depth of your answers, but always keep the delivery human and direct.";

function systemPrompt(s, projectId) {
  const parts = [BASE_BEHAVIOR];
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}, regardless of the language of the question.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  if (projectId) {
    const p = LS.get("be.projects", {})[projectId];
    if (p) {
      if (p.instructions) parts.push(p.instructions);
      for (const k of p.knowledge || []) if (k.type === "text" && k.content) parts.push(`# ${k.name}\n${k.content}`);
    }
  }
  return parts.join("\n\n").trim();
}

function userContent(text, images) {
  if (!images || !images.length) return text;
  const content = [{ type: "text", text }];
  for (const img of images) { const url = typeof img === "string" ? img : (img.url || img.dataUrl); if (url) content.push({ type: "image_url", image_url: { url } }); }
  return content;
}

// A browser/CORS failure throws a TypeError with no HTTP status (real API errors throw with a code).
function isNetworkErr(e) { return !!e && (e.name === "TypeError" || /failed to fetch|networkerror|load failed|fetch failed/i.test(String((e && e.message) || e))); }
const proxyCfg = () => ({ base: AUTH_BASE, token: getToken() });

// Stream from the provider. Try direct first (keys stay on the device for CORS-friendly providers);
// if the browser blocks the call, fall back to the server proxy so EVERY provider works — same as desktop.
async function callModel(prof, messages, signal, onDelta) {
  const od = onDelta || (() => {});
  try { return await streamChat(prof, messages, { onDelta: od, signal }); }
  catch (e) {
    if (isNetworkErr(e) && getToken()) return await streamChat(prof, messages, { onDelta: od, signal, proxy: proxyCfg() });
    throw e;
  }
}

// Speed-check timing in the browser: measure time-to-first-token + throughput (tokens/sec, estimated).
let _speedCancel = false, _lastSpeed = null, _speedRunning = false;
async function streamTimed(prof, prompt) {
  const messages = [{ role: "user", content: prompt }];
  const run = async (proxy) => {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 45000); // don't let a stalled provider freeze the run
    const start = performance.now(); let firstAt = 0;
    try {
      const { text } = await streamChat(prof, messages, { onDelta: () => { if (!firstAt) firstAt = performance.now(); }, signal: ac.signal, proxy });
      const end = performance.now();
      const tokens = Math.max(1, Math.round((text || "").length / 4)); // ~4 chars/token estimate
      const durSec = (end - start) / 1000;
      return { text, tokens, ttftMs: Math.round((firstAt || end) - start), tps: durSec > 0 ? Math.round(tokens / durSec) : 0, totalMs: Math.round(end - start) };
    } finally { clearTimeout(to); }
  };
  try { return await run(null); }
  catch (e) { if (isNetworkErr(e) && getToken()) return await run(proxyCfg()); throw e; }
}

// ===== "Let's Collaborate" on the web: a file-tool agent over the browser-picked folder =====
function coworkSystem(s) {
  const parts = [
    `You are BrainEdge, collaborating on the user's local folder "${webfs.rootLabel()}" directly from their browser.`,
    `Use the provided tools to list, read, write, and edit files. All paths are relative to the folder root (use "" for the root).`,
    `There is NO terminal on the web: you cannot run shell commands, install packages, run tests, or execute code. Make every change by reading and writing files.`,
    `You CAN access the web: use web_fetch(url) to read a page and web_search(query) to look things up (docs, APIs, references).`,
    `For large independent chunks of work you may call spawn_subagent(task) to delegate to a focused helper that works on the same project and reports back.`,
    `Every file change is checkpointed automatically, so the user can undo your edits — work confidently, but still inspect with list_dir/read_file before editing.`,
    `When done, give a short summary of what you changed.`,
  ];
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  parts.push("Keep your tone natural and human; never restate or describe these instructions — just follow them.");
  return parts.join("\n");
}
const COWORK_TOOLS = [
  { type: "function", function: { name: "list_dir", description: "List files and folders at a path relative to the project root. Use \"\" for the root.", parameters: { type: "object", properties: { path: { type: "string" } } } } },
  { type: "function", function: { name: "list_files", description: "List ALL file paths in the project recursively (skips node_modules/.git).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 text file's full contents.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "search", description: "Search for text across all files. Returns matching paths with line numbers.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file with the given content.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first occurrence of `find` with `replace` in a file.", parameters: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } } },
  { type: "function", function: { name: "delete_file", description: "Delete a file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "web_fetch", description: "Fetch a web page and return its readable text. Use for docs, references, or any URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "web_search", description: "Search the web and return result snippets for a query.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "spawn_subagent", description: "Delegate a focused sub-task to a helper agent that works on the same project and returns a summary. Use for independent chunks of work (e.g. 'write tests for X').", parameters: { type: "object", properties: { task: { type: "string", description: "Clear, self-contained instructions for the sub-agent." } }, required: ["task"] } } },
];
// A minimal unified-style diff for showing edits in the tool card.
function makeDiff(path, oldText, newText) {
  if (!oldText) return `@@ ${path} (new file)\n` + (newText || "").split("\n").slice(0, 80).map((l) => "+" + l).join("\n");
  const a = oldText.split("\n"), b = (newText || "").split("\n");
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const del = a.slice(s, a.length - e), add = b.slice(s, b.length - e);
  if (!del.length && !add.length) return `@@ ${path} (no changes)`;
  const ctx = a.slice(Math.max(0, s - 2), s).map((l) => " " + l);
  return [`@@ ${path}  (line ${s + 1})`, ...ctx, ...del.map((l) => "-" + l), ...add.map((l) => "+" + l)].join("\n");
}
// ---- checkpoints: snapshot a file's prior state before the agent changes it, so any edit can be undone ----
const checkpoints = new Map(); // sessionId -> [{ id, ts, op, path, before, after }]
function recordCheckpoint(sess, op, path, before, after) {
  if (!sess) return;
  const list = checkpoints.get(sess.id) || [];
  const cp = { id: rid("ckpt_"), ts: Date.now(), op, path, before, after };
  list.push(cp); checkpoints.set(sess.id, list);
  emit(sess.id, "checkpoint", { id: cp.id, op, path }); // UI can offer an Undo affordance
}

// ---- web access for the agent: routes through the server proxy (browsers can't fetch arbitrary sites) ----
async function webFetch({ url, query }) {
  if (!getToken()) return "Web access needs sign-in.";
  try {
    const r = await fetch(api("/proxy/fetch"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url, query }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return "Web request failed: " + (j.detail || j.error || r.status);
    return `# ${j.url || query} (${j.status || ""})\n\n${j.text || "(no text)"}`;
  } catch (e) { return "Web request failed: " + String((e && e.message) || e); }
}

// ---- subagent: a focused helper loop over the same project; returns a summary to the main agent ----
const SUB_TOOLS = COWORK_TOOLS.filter((t) => t.function.name !== "spawn_subagent"); // no recursion
async function runSubagent(sess, task, prof) {
  if (!prof) return "(no provider for sub-agent)";
  const sys = `You are a focused sub-agent inside the project folder "${webfs.rootLabel()}". Do ONLY the task below, then reply with a concise summary of what you did and any results. Use the file/web tools as needed.\n\nTASK:\n${task}`;
  const msgs = [{ role: "system", content: sys }, { role: "user", content: task }];
  const sig = sess && sess.ac ? sess.ac.signal : undefined;
  const call = async () => {
    try { return await streamChatTools(prof, msgs, SUB_TOOLS, { onDelta: () => {}, signal: sig }); }
    catch (e) { if (isNetworkErr(e) && getToken()) return await streamChatTools(prof, msgs, SUB_TOOLS, { onDelta: () => {}, signal: sig, proxy: proxyCfg() }); throw e; }
  };
  for (let step = 0; step < 10; step++) {
    const { content, toolCalls } = await call();
    if (!toolCalls || !toolCalls.length) return content || "(sub-agent finished)";
    msgs.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
    for (const c of toolCalls) {
      let a = {}; try { a = JSON.parse(c.arguments || "{}"); } catch {}
      let out; try { out = await executeTool(c.name, a, { sess }); } catch (e) { out = "Error: " + String((e && e.message) || e); }
      if (sess) emit(sess.id, "tool_result", { id: c.id, name: "↳ " + c.name, ok: true, output: String(out).slice(0, 2000) });
      msgs.push({ role: "tool", tool_call_id: c.id, content: String(out).slice(0, 40000) });
    }
  }
  return "(sub-agent reached its step limit)";
}

async function executeTool(name, args, ctx) {
  const sess = ctx && ctx.sess;
  switch (name) {
    case "list_dir": return JSON.stringify(await webfs.listDir(args.path || ""));
    case "list_files": { const f = await webfs.walk(); return f.length ? f.join("\n") : "(empty)"; }
    case "read_file": { const t = await webfs.readFile(args.path); return t.length > 60000 ? t.slice(0, 60000) + "\n…(truncated)" : t; }
    case "search": { const r = await webfs.search(args.query || ""); return r.length ? r.map((x) => `${x.path}:${x.line}: ${x.text}`).join("\n") : "No matches."; }
    case "write_file": { let old = ""; try { old = await webfs.readFile(args.path); } catch {} await webfs.writeFile(args.path, args.content ?? ""); recordCheckpoint(sess, old ? "edit" : "create", args.path, old, args.content ?? ""); return makeDiff(args.path, old, args.content ?? ""); }
    case "edit_file": { const before = await webfs.readFile(args.path); await webfs.editFile(args.path, args.find, args.replace); const after = await webfs.readFile(args.path); recordCheckpoint(sess, "edit", args.path, before, after); return makeDiff(args.path, before, after); }
    case "delete_file": { let before = ""; try { before = await webfs.readFile(args.path); } catch {} await webfs.deleteFile(args.path); recordCheckpoint(sess, "delete", args.path, before, null); return "deleted " + args.path; }
    case "web_fetch": return await webFetch({ url: args.url });
    case "web_search": return await webFetch({ query: args.query });
    case "spawn_subagent": return await runSubagent(sess, args.task || "", sess && sess.profile);
    default: return "That tool isn't available on the web app (no terminal). Use the file/web tools.";
  }
}
async function callTools(prof, messages, onDelta, signal) {
  try { return await streamChatTools(prof, messages, COWORK_TOOLS, { onDelta, signal }); }
  catch (e) { if (isNetworkErr(e) && getToken()) return await streamChatTools(prof, messages, COWORK_TOOLS, { onDelta, signal, proxy: proxyCfg() }); throw e; }
}
async function runAgentTurn(sess, text, images, prof) {
  sess.messages.push({ role: "user", content: userContent(text, images) });
  if (!sess.title) sess.title = text.slice(0, 60);
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind, cwd: sess.cwd });
  const started = Date.now();
  try {
    for (let step = 0; step < 16; step++) {
      const { content, toolCalls } = await callTools(prof, sess.messages, (c) => emit(sess.id, "assistant_delta", { text: c }), sess.ac.signal);
      if (!toolCalls || !toolCalls.length) { sess.messages.push({ role: "assistant", content: content || "" }); emit(sess.id, "assistant_message", { stop_reason: "end_turn" }); break; }
      sess.messages.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
      for (const c of toolCalls) {
        let args = {}; try { args = JSON.parse(c.arguments || "{}"); } catch {}
        emit(sess.id, "tool_use", { id: c.id, name: c.name, input: args, auto: true });
        let out; try { out = await executeTool(c.name, args, { sess }); } catch (e) { out = "Error: " + String((e && e.message) || e); }
        emit(sess.id, "tool_result", { id: c.id, name: c.name, ok: true, output: String(out).slice(0, 8000) });
        sess.messages.push({ role: "tool", tool_call_id: c.id, content: String(out).slice(0, 60000) });
      }
    }
    emit(sess.id, "result", { subtype: "success", duration_ms: Date.now() - started, total_cost_usd: 0 });
    persistSession(sess);
  } catch (e) {
    if (e && e.name === "AbortError") { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
}

async function runTurn(sess, text, images) {
  const s = loadSettings();
  const prof = activeProfile(s);   // re-resolve each turn so switching model in the picker applies
  sess.profile = prof;
  if (!prof || !prof.baseUrl) { emit(sess.id, "error", { message: "No provider configured. Open Settings → add a provider and API key." }); emit(sess.id, "result", { subtype: "error" }); return; }
  if (!prof.model) { emit(sess.id, "error", { message: "No model selected. Pick a model from the model picker." }); emit(sess.id, "result", { subtype: "error" }); return; }
  // Folder selected → run the file-tool agent (collaborate). Tool calling needs an OpenAI-style provider.
  if (sess.agentic && webfs.hasRoot() && prof.kind !== "anthropic") return runAgentTurn(sess, text, images, prof);
  sess.messages.push({ role: "user", content: userContent(text, images) });
  if (!sess.title) sess.title = text.slice(0, 60);
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind });
  const started = Date.now();
  try {
    // Stream tokens live so it feels fast; fall back to the full text if nothing streamed.
    let streamed = false;
    const { text: reply } = await callModel(prof, sess.messages, sess.ac.signal, (chunk) => { if (chunk) { streamed = true; emit(sess.id, "assistant_delta", { text: chunk }); } });
    if (!streamed && reply) emit(sess.id, "assistant_delta", { text: reply });
    sess.messages.push({ role: "assistant", content: reply || "" });
    emit(sess.id, "assistant_message", { stop_reason: "end_turn" });
    emit(sess.id, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
    persistSession(sess);
  } catch (e) {
    if (e && (e.name === "AbortError")) { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
}

// ================= chat history (localStorage) =================
const HISTORY_KEY = "be.sessions";
function persistSession(sess) {
  const rec = { id: sess.id, mode: sess.mode || "code", title: sess.title || "Untitled", updatedAt: Date.now(),
    messages: sess.messages, projectId: sess.projectId || null, convId: sess.convId || null,
    model: (sess.profile && sess.profile.model) || null, provider: (sess.profile && sess.profile.name) || null };
  idbPut(rec).catch(() => {}); // IndexedDB: large capacity, never crowds out settings/keys
}

// Streaks (consecutive active calendar days) + a friendly peak-hour label, from a set of YYYY-MM-DD keys.
function computeStreaks(daySet) {
  if (!daySet.size) return { current: 0, longest: 0 };
  const days = [...daySet].sort();
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((new Date(days[i] + "T00:00:00") - new Date(days[i - 1] + "T00:00:00")) / 864e5);
    run = diff === 1 ? run + 1 : 1; if (run > longest) longest = run;
  }
  const todayK = new Date().toISOString().slice(0, 10);
  let current = 0; const d = new Date(todayK + "T00:00:00");
  if (!daySet.has(todayK)) d.setDate(d.getDate() - 1);
  while (daySet.has(d.toISOString().slice(0, 10))) { current++; d.setDate(d.getDate() - 1); }
  return { current, longest };
}
const fmtHour = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

// ================= the bridge =================
export const webBridge = {
  // ---- chat / agent ----
  async start(req) {
    const s = loadSettings();
    const agentic = webfs.hasRoot() && (!!req.cwd || req.mode === "cowork"); // a real folder is selected → file-agent mode
    const prior = req.conversationId ? await idbGet(req.conversationId) : null;
    let id, messages, title;
    if (prior) {
      // Continuing an opened chat — resume its full message history so context carries over.
      id = req.conversationId; messages = (prior.messages || []).slice(); title = prior.title || "";
    } else {
      id = rid("sess_"); messages = []; const sys = agentic ? coworkSystem(s) : systemPrompt(s, req.projectId); if (sys) messages.push({ role: "system", content: sys }); title = "";
    }
    const sess = { id, profile: activeProfile(s), messages, mode: req.mode || "code", projectId: req.projectId || null, convId: id, title, agentic, cwd: req.cwd || null };
    sessions.set(id, sess);
    runTurn(sess, req.prompt || "", req.images); // fire and forget; streams events
    return { sessionId: id, conversationId: id };
  },
  async sendInput(sessionId, text, images) {
    const sess = sessions.get(sessionId);
    if (!sess) return;
    runTurn(sess, text, images);
  },
  async interrupt(sessionId) { const sess = sessions.get(sessionId); if (sess && sess.ac) try { sess.ac.abort(); } catch {} },

  // ---- checkpoints / undo for agent file edits ----
  async listCheckpoints(sessionId) { return (checkpoints.get(sessionId) || []).map((c) => ({ id: c.id, ts: c.ts, op: c.op, path: c.path })).reverse(); },
  async revertCheckpoint(sessionId, id) {
    const list = checkpoints.get(sessionId) || []; const idx = list.findIndex((c) => c.id === id); if (idx < 0) return { error: "not found" };
    for (let i = list.length - 1; i >= idx; i--) { const c = list[i]; try { if (c.op === "create") await webfs.deleteFile(c.path); else await webfs.writeFile(c.path, c.before || ""); } catch {} }
    const reverted = list.length - idx; checkpoints.set(sessionId, list.slice(0, idx));
    return { ok: true, reverted };
  },
  async undoLast(sessionId) { const list = checkpoints.get(sessionId) || []; if (!list.length) return { error: "nothing to undo" }; return webBridge.revertCheckpoint(sessionId, list[list.length - 1].id); },
  async setPermissionMode() {},
  resolvePermission() {}, // web chat has no tool-permission flow
  onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },

  // ---- settings / models ----
  async getSettings() { return loadSettings(); },
  async saveSettings(next) { return LS.set(SETTINGS_KEY, next); },
  async listModels(profileId) {
    const s = loadSettings(); const p = profileId ? s.profiles[profileId] : activeProfile(s);
    let out = await provListModels(p);
    // If the browser blocked the provider's /models (CORS) and we're signed in, try via the proxy.
    if ((!out || !out.length) && p && p.baseUrl && getToken()) { try { out = await provListModels(p, { proxy: proxyCfg() }); } catch {} }
    return out;
  },
  async pingProvider(profileId) { const s = loadSettings(); const p = profileId ? s.profiles[profileId] : activeProfile(s); return provPing(p); },
  async scoreQuiz(batch) {
    if (!getToken()) return {};
    try { const r = await fetch(api("/score-quiz"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ batch }) }); const j = await r.json().catch(() => ({})); return (j && j.scores) || {}; }
    catch { return {}; }
  },

  // ---- account / sign-in (legacy desktop linking — handled via auth server below) ----
  async saveAccount(account) { const s = loadSettings(); s.account = { ...(s.account || {}), ...account }; LS.set(SETTINGS_KEY, s); return s.account; },
  async signOut() { return webBridge.authSignOut(); },
  async googleSignIn() { return webBridge.authSignIn("google"); },
  async githubSignIn() { return webBridge.authSignIn("github"); },
  async linkAnthropic() { return { error: "Available in the desktop app." }; },

  // ---- auth server: account gate, billing, analytics ----
  async authMe() {
    const t = getToken(); if (!t) return { error: "unauthenticated" };
    try {
      const r = await fetch(api("/me"), { headers: authHeaders() });
      if (r.status === 401) { setToken(""); return { error: "unauthenticated" }; }
      if (r.status === 403) return { error: "suspended" };
      if (!r.ok) return { error: "server", code: r.status };
      return await r.json();
    } catch { return { error: "offline" }; }
  },
  async authSignIn(provider) {
    // Web OAuth: redirect the whole page to the server, which returns to us with ?token=.
    const back = location.origin + location.pathname;
    const p = provider === "github" ? "github" : provider === "dev" ? "dev" : "google";
    location.href = api(`/auth/${p}/start`) + `?redirect=${encodeURIComponent(back)}`;
    return new Promise(() => {}); // navigation in progress
  },
  async authSignOut() {
    const t = getToken();
    if (t) { try { await fetch(api("/auth/logout"), { method: "POST", headers: authHeaders() }); } catch {} }
    setToken(""); return { ok: true };
  },
  async billingCheckout() { return openBilling("checkout"); },
  async billingPortal() { return openBilling("portal"); },
  async track(type, meta) { const t = getToken(); if (!t) return { ok: false }; try { await fetch(api("/events"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ type, meta: meta || null }) }); return { ok: true }; } catch { return { ok: false }; } },
  async adminStats(adminKey) { return adminGet("stats", adminKey); },
  async adminUsers(adminKey) { return adminGet("users", adminKey); },
  async adminAction(id, action, adminKey) {
    try { const r = await fetch(api(`/admin/users/${encodeURIComponent(id)}/${action}`), { method: "POST", headers: authHeaders(adminKey ? { "x-admin-key": adminKey } : {}) });
      if (r.status === 403) return { error: "forbidden" }; const j = await r.json().catch(() => ({})); return r.ok ? (j || { ok: true }) : { error: (j && j.error) || ("server " + r.status) };
    } catch { return { error: "offline" }; }
  },

  // ---- chat history ----
  async listSessions(mode) {
    const all = await idbAll();
    return all.filter((x) => !mode || x.mode === mode).sort((a, b) => b.updatedAt - a.updatedAt).map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, mode: x.mode }));
  },
  async getSession(id) {
    const rec = await idbGet(id); if (!rec) return null;
    const asText = (c) => (typeof c === "string" ? c : (Array.isArray(c) ? (c.find((p) => p.type === "text")?.text || "") : ""));
    // The renderer maps conv.messages -> bubbles; strip system and flatten content to text.
    const messages = (rec.messages || []).filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: asText(m.content) }));
    return { id: rec.id, mode: rec.mode, title: rec.title, messages };
  },
  async deleteSession(id) { await idbDel(id); return true; },

  // ---- saved library (bookmarked responses) ----
  async listSaved() { return Object.values(LS.get("be.saved", {})).sort((a, b) => b.createdAt - a.createdAt); },
  async saveResponse(item) { const all = LS.get("be.saved", {}); const it = { id: rid("sav_"), ...item, createdAt: Date.now() }; all[it.id] = it; LS.set("be.saved", all); return it; },
  async updateSaved(id, patch) { const all = LS.get("be.saved", {}); if (!all[id]) return null; all[id] = { ...all[id], ...patch }; LS.set("be.saved", all); return all[id]; },
  async removeSaved(id) { const all = LS.get("be.saved", {}); delete all[id]; LS.set("be.saved", all); return true; },

  // ---- projects (localStorage) ----
  async listProjects() { return Object.values(LS.get("be.projects", {})).sort((a, b) => b.createdAt - a.createdAt); },
  async getProject(id) { return LS.get("be.projects", {})[id] || null; },
  async createProject(name) { const all = LS.get("be.projects", {}); const p = { id: rid("prj_"), name: name || "Untitled", instructions: "", knowledge: [], createdAt: Date.now() }; all[p.id] = p; LS.set("be.projects", all); return p; },
  async updateProject(id, patch) { const all = LS.get("be.projects", {}); all[id] = { ...all[id], ...patch }; LS.set("be.projects", all); return all[id]; },
  async deleteProject(id) { const all = LS.get("be.projects", {}); delete all[id]; LS.set("be.projects", all); return true; },
  async addKnowledgeText(projectId, name, content) { const all = LS.get("be.projects", {}); const p = all[projectId]; p.knowledge = p.knowledge || []; p.knowledge.push({ id: rid("kn_"), name, type: "text", content }); LS.set("be.projects", all); return p; },
  async addKnowledgeFile() { return { error: "Uploading files into a project is available in the desktop app." }; },
  async removeKnowledge(projectId, knId) { const all = LS.get("be.projects", {}); const p = all[projectId]; p.knowledge = (p.knowledge || []).filter((k) => k.id !== knId); LS.set("be.projects", all); return p; },
  async linkProjectFolder() { return { error: "Linking a local folder is available in the desktop app." }; },
  async linkGithub() { return { error: "Available in the desktop app." }; },
  async cloneRepo() { return { error: "Cloning a GitHub repo needs the desktop app. On the web: open the repo on GitHub → Code → Download ZIP, unzip it, then use Choose folder." }; },
  async pullGithub() { return { error: "Available in the desktop app." }; },
  async unlinkProjectSource(projectId) { return LS.get("be.projects", {})[projectId] || null; },
  async listConversations(projectId) { return Object.values(LS.get("be.convs", {})).filter((c) => c.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt); },
  async getConversation(id) { return LS.get("be.convs", {})[id] || null; },
  async createConversation(projectId) { const all = LS.get("be.convs", {}); const c = { id: rid("cnv_"), projectId, title: "New conversation", messages: [], updatedAt: Date.now() }; all[c.id] = c; LS.set("be.convs", all); return c; },
  async deleteConversation(id) { const all = LS.get("be.convs", {}); delete all[id]; LS.set("be.convs", all); return true; },

  // ---- scheduled tasks (stored; execution is desktop-only since the browser can't run in the background) ----
  async listTasks() { return Object.values(LS.get("be.tasks", {})); },
  async createTask() { const all = LS.get("be.tasks", {}); const t = { id: rid("tsk_"), name: "New task", prompt: "", target: { type: "chat" }, schedule: { mode: "off", everyMinutes: 60, time: "09:00", weekday: 1 }, lastRun: 0 }; all[t.id] = t; LS.set("be.tasks", all); return t; },
  async updateTask(id, patch) { const all = LS.get("be.tasks", {}); all[id] = { ...all[id], ...patch }; LS.set("be.tasks", all); return all[id]; },
  async deleteTask(id) { const all = LS.get("be.tasks", {}); delete all[id]; LS.set("be.tasks", all); return true; },
  async getRuns() { return []; },
  async runTaskNow() { return { status: "error", output: "Scheduled tasks run in the desktop app (it can run in the background). On the web they're saved here." }; },

  // ---- usage (computed from local history) ----
  async getUsage(days) {
    const all = await idbAll();
    const now = Date.now();
    const cutoff = days ? now - days * 864e5 : 0;
    const byDay = {}, byModelTok = {}, byModelMsg = {}, byHour = {};
    let messages = 0, tokens = 0; const daySet = new Set(); let sessions = 0;
    for (const s of all) {
      if (cutoff && (s.updatedAt || 0) < cutoff) continue;
      sessions++;
      const d = new Date(s.updatedAt || now); const dk = d.toISOString().slice(0, 10);
      daySet.add(dk); byHour[d.getHours()] = (byHour[d.getHours()] || 0) + 1;
      let sTok = 0, sMsg = 0;
      for (const m of s.messages || []) {
        if (m.role !== "user" && m.role !== "assistant") continue;
        const len = typeof m.content === "string" ? m.content.length : 0; const tk = Math.ceil(len / 4);
        messages++; tokens += tk; sTok += tk; sMsg++; byDay[dk] = (byDay[dk] || 0) + tk;
      }
      const model = s.model || "—"; byModelTok[model] = (byModelTok[model] || 0) + sTok; byModelMsg[model] = (byModelMsg[model] || 0) + sMsg;
    }
    const models = Object.keys(byModelTok).map((m) => ({ model: m, tokens: byModelTok[m], messages: byModelMsg[m] })).sort((a, b) => b.tokens - a.tokens);
    const { current, longest } = computeStreaks(daySet);
    const peakEntry = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    return { messages, tokens, sessions, activeDays: daySet.size, currentStreak: current, longestStreak: longest,
      peakHour: peakEntry ? fmtHour(Number(peakEntry[0])) : "—", favoriteModel: models[0] ? models[0].model : "—", models, byDay };
  },

  // ---- speed check: runs in the browser (direct to provider, proxy fallback for blocked ones) ----
  async runSpeedTest({ tests, prompt, maxTokens, quiz } = {}) {
    _speedCancel = false; _speedRunning = true;
    const s = loadSettings();
    const results = [];
    const startedAt = Date.now();
    _lastSpeed = { at: startedAt, prompt, results };
    const one = async (t) => {
      if (_speedCancel) return;
      const base = s.profiles[t.profileId];
      let res;
      if (!base || !base.baseUrl) res = { label: t.label, model: t.modelId, provider: t.provider, ok: false, error: "provider not configured" };
      else {
        const prof = { ...base, model: t.modelId };
        try {
          const r = await streamTimed(prof, prompt || "Say hello in one short sentence.");
          let quizAnswers;
          if (quiz && quiz.length) { quizAnswers = {}; for (const q of quiz) { if (_speedCancel) break; try { const qr = await streamTimed(prof, q.prompt); quizAnswers[q.id] = qr.text || ""; } catch { quizAnswers[q.id] = ""; } } }
          res = { label: t.label, model: t.modelId, provider: base.name, ok: true, tps: r.tps, ttftMs: r.ttftMs, tokens: r.tokens, totalMs: r.totalMs, text: r.text, quizAnswers };
        } catch (e) { res = { label: t.label, model: t.modelId, provider: base.name, ok: false, error: String((e && e.message) || e) }; }
      }
      results.push(res);
      _lastSpeed = { at: startedAt, prompt, results: results.slice() }; // partial, polled by the UI
    };
    // Run models concurrently (like desktop) with a small pool so we don't flood the browser/proxy.
    const queue = (tests || []).slice();
    const worker = async () => { while (queue.length && !_speedCancel) await one(queue.shift()); };
    await Promise.all(Array.from({ length: Math.min(6, queue.length || 1) }, worker));
    _speedRunning = false;
    _lastSpeed = { at: startedAt, prompt, results };
    return _lastSpeed;
  },
  async cancelSpeedTest() { _speedCancel = true; _speedRunning = false; return true; },
  async getSpeedTestLast() { return _lastSpeed; },
  async getSpeedTestStatus() { return { running: _speedRunning, startedAt: 0 }; },
  async getOpenRouterCatalog() {
    // Transform to the same shape the desktop catalog returns, so ModelsOverview reads one schema.
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models"); if (!r.ok) return {};
      const j = await r.json(); const out = {};
      for (const m of j.data || []) {
        const arch = m.architecture || {};
        const inMod = Array.isArray(arch.input_modalities) ? arch.input_modalities : String(arch.modality || "").split(/[+,]/);
        const pr = m.pricing || {}; const sp = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
        out[m.id] = {
          name: m.name || m.id,
          ctx: m.context_length ? Math.round(m.context_length / 1000) : 0,
          desc: (m.description || "").trim(),
          image: inMod.includes("image"),
          reasoning: sp.includes("reasoning") || sp.includes("include_reasoning"),
          tools: sp.includes("tools") || sp.includes("tool_choice"),
          created: m.created || null,
          free: (String(pr.prompt) === "0" && String(pr.completion || "0") === "0") || /:free$/.test(m.id || ""),
          priceIn: pr.prompt != null ? +pr.prompt : null,
          priceOut: pr.completion != null ? +pr.completion : null,
        };
      }
      return out;
    } catch { return {}; }
  },

  // ---- desktop-only capabilities: clear, honest fallbacks ----
  async chooseFolder() {
    const r = await webfs.pickDirectory();
    if (r && r.name) return r.name;          // a folder was chosen — its name doubles as the "cwd" label
    if (r && r.error) return { error: r.error };
    return null;                              // cancelled
  },
  async listDir() { return []; },
  async openExternal(url) { try { window.open(url, "_blank", "noopener"); } catch {} return true; },
  async testConnector() { return { ok: false, error: "Connecting an MCP server runs in the desktop app." }; },
  async listConnectorDirectory() {
    // Curated catalog of popular MCP connectors so the gallery isn't empty on web. Actually connecting
    // them (local processes / OAuth) happens in the desktop app — here it's a preview of what's available.
    const npm = (name, title, description, pkg) => ({ name, title, description, kind: "npm", connector: { name: title, command: "npx", args: ["-y", pkg], env: {}, enabled: true }, env: [] });
    const remote = (name, title, description, url) => ({ name, title, description, kind: "remote", connector: { name: title, url, transport: "http", enabled: true }, env: [] });
    const items = [
      remote("notion", "Notion", "Search and update your Notion workspace.", "https://mcp.notion.com/mcp"),
      npm("github", "GitHub", "Issues, PRs, and code search across repos.", "@modelcontextprotocol/server-github"),
      npm("slack", "Slack", "Read and post messages in your channels.", "@modelcontextprotocol/server-slack"),
      npm("gdrive", "Google Drive", "Search and read your Drive files.", "@modelcontextprotocol/server-gdrive"),
      npm("gmail", "Gmail", "Read, search, and draft emails.", "@gongrzhe/server-gmail-autoauth-mcp"),
      npm("gcal", "Google Calendar", "View and create calendar events.", "@modelcontextprotocol/server-google-calendar"),
      npm("filesystem", "Filesystem", "Read and write files in a folder.", "@modelcontextprotocol/server-filesystem"),
      npm("fetch", "Web Fetch", "Fetch and read web pages on demand.", "@modelcontextprotocol/server-fetch"),
      npm("memory", "Memory", "Persistent knowledge-graph memory.", "@modelcontextprotocol/server-memory"),
      npm("postgres", "Postgres", "Query a PostgreSQL database.", "@modelcontextprotocol/server-postgres"),
      npm("sqlite", "SQLite", "Query a local SQLite database.", "@modelcontextprotocol/server-sqlite"),
      npm("puppeteer", "Puppeteer", "Automate a headless browser.", "@modelcontextprotocol/server-puppeteer"),
      npm("brave", "Brave Search", "Web search via the Brave API.", "@modelcontextprotocol/server-brave-search"),
      remote("linear", "Linear", "Issues and projects in Linear.", "https://mcp.linear.app/sse"),
      npm("jira", "Jira & Confluence", "Issues, boards, and pages in Atlassian.", "mcp-atlassian"),
      npm("sentry", "Sentry", "Inspect errors and issues.", "@sentry/mcp-server"),
      remote("stripe", "Stripe", "Payments, customers, and invoices.", "https://mcp.stripe.com"),
      npm("figma", "Figma", "Read designs, frames, and components.", "figma-developer-mcp"),
      npm("obsidian", "Obsidian", "Read and write notes in your vault.", "mcp-obsidian"),
      npm("airtable", "Airtable", "Read and update Airtable bases.", "airtable-mcp-server"),
      npm("todoist", "Todoist", "Manage tasks and projects.", "@abhiz123/todoist-mcp-server"),
      remote("asana", "Asana", "Tasks and projects in Asana.", "https://mcp.asana.com/sse"),
      npm("discord", "Discord", "Read and send Discord messages.", "mcp-discord"),
      npm("time", "Time", "Time zones and current time.", "@modelcontextprotocol/server-time"),
      npm("everything", "Everything", "Reference server (demos all features).", "@modelcontextprotocol/server-everything"),
    ];
    return { items, stale: false, source: "web" };
  },
  async listSkills() { return []; },
  async createSkill() { return { error: "Skills run in the desktop app." }; },
  async importSkillFolder() { return { error: "Available in the desktop app." }; },
  async importSkillZip() { return { error: "Available in the desktop app." }; },
  async readSkill() { return null; },
  async setSkillEnabled() { return true; },
  async deleteSkill() { return { ok: true }; },
  async applyMessaging() { return { running: false, status: "Telegram runs in the desktop app." }; },
  async messagingStatus() { return { running: false, status: "desktop app only" }; },
  async completeOnce(messages) { try { const s = loadSettings(); const { text } = await streamChat(activeProfile(s), messages || [], { onDelta: () => {} }); return { text }; } catch (e) { return { error: String((e && e.message) || e) }; } },
  async listViaMobile() { return []; },
  async removeViaMobile() { return true; },
  async clearViaMobile() { return true; },
  async getMobileLink() { return null; },
  async setMobileLink(link) { return link || null; },
  async clearMobileLink() { return null; },
  async setKeepAwake(on) { return !!on; },
  // Terminal access (CLI) is provisioned by the desktop app (it writes the local config + PATH entry).
  async enableCli() { return { ok: false, error: "Open the BrainEdge desktop app to enable terminal access — the CLI runs on your computer, which a browser can't set up." }; },
  async cliStatus() { return { node: { ok: false }, configured: false, onPath: false, web: true }; },
  async disableCli() { return { ok: true }; },
  // Embedded terminal needs a real shell on the user's machine — desktop only.
  async termCreate() { return { error: "The embedded terminal runs in the desktop app." }; },
  async termInput() { return true; },
  async termResize() { return true; },
  async termKill() { return true; },
  onTermData() { return () => {}; },
  onTermExit() { return () => {}; },
};

async function openBilling(kind) {
  try {
    const r = await fetch(api(`/billing/${kind}`), { method: "POST", headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (j && j.url) { location.href = j.url; return { ok: true }; }
    return { error: (j && j.error) || ("server " + r.status), detail: (j && j.detail) || "" };
  } catch { return { error: "offline" }; }
}
async function adminGet(kind, adminKey) {
  try {
    const r = await fetch(api(`/admin/${kind}`), { headers: authHeaders(adminKey ? { "x-admin-key": adminKey } : {}) });
    if (r.status === 403) return { error: "forbidden" };
    if (!r.ok) return { error: "server " + r.status };
    return await r.json();
  } catch { return { error: "offline" }; }
}

export const isWeb = typeof window !== "undefined" && !window.brainedge;
