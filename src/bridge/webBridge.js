// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// WEB bridge — the browser implementation of the same contract the Electron preload exposes.
// Parity strategy:
//   • Account/billing/analytics  -> the auth server (same one the desktop app uses).
//   • Settings/history/projects/saved/tasks -> localStorage (stays on the user's device, so their
//     API keys and chats never touch our servers — same privacy model as desktop).
//   • Chat + model listing -> stream directly from the browser to the user's provider.
//   • Local-machine features (folders, installing skills, MCP connector processes, Telegram,
//     local models) can't run in a browser -> they return a clear "desktop app" result.
import { streamChat, streamChatTools, listModels as provListModels, ping as provPing, apiBase } from "../shared/providers.js";
import * as webTrace from "./webTrace.js";
import { listBundled as _listBundled, readBundled, bundledByName, bundledIndex as _bundledIndex } from "../webSkills.js";
// Bundled packs honor the same Extras gate as the desktop engine (today: EdgeTrader).
const FEAT_EDGETRADER = import.meta.env.VITE_FEAT_EDGETRADER !== "0";
const bundledOn = () => { try { return FEAT_EDGETRADER && ((loadSettings().extras) || {}).edgetrader !== false; } catch { return FEAT_EDGETRADER; } };
const listBundled = () => (bundledOn() ? _listBundled() : []);
const bundledIndex = () => (bundledOn() ? _bundledIndex() : "");
import * as webfs from "./webfs.js";
// The agent discipline layer (mirror of the desktop harness): JSON repair,
// head+tail truncation, stale-result squash, identical-call loop breaker.
import { tolerantParse, headTail, squashStale, CallGuard } from "../shared/harness.js";
// In-chat office files: the rule that teaches models the ```officedoc spec.
import { officeRule, ARTIFACT_RULE } from "../office.js";

// ---- where the API lives. Same origin in production (the auth server serves this app); on the
// Vite dev port (5174) the API is the separate auth server on 8787. Overridable via a global. ----
const AUTH_BASE = (() => {
  if (typeof window !== "undefined" && window.__MADAV_AUTH_BASE__) return String(window.__MADAV_AUTH_BASE__).replace(/\/+$/, "");
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
// Crypto-strength ids (unpredictable; falls back to Math.random only if the browser lacks crypto).
const rid = (p) => {
  try { const a = new Uint8Array(8); crypto.getRandomValues(a); return p + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join(""); }
  catch { return p + Math.random().toString(36).slice(2, 10); }
};

// Workrooms identity — deterministic {color, glyph} per room. KEEP IN SYNC with
// electron/projects-store.cjs and autoIdentity in src/components/Agents.jsx.
const WR_COLORS = ["#13c2d6", "#8b7cf6", "#f4a261", "#e76f81", "#5fb573", "#d6a313", "#5e9bf2", "#c77dba"];
const WR_GLYPHS = ["🜁", "✦", "◆", "⌘", "♟", "✺", "☄", "❖", "⚙", "🜃", "♜", "✤"];
const wrHash = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const wrAutoIdentity = (seed) => ({ color: WR_COLORS[wrHash(seed) % WR_COLORS.length], glyph: WR_GLYPHS[wrHash(seed + "g") % WR_GLYPHS.length] });
const wrNormalizeProject = (p) => {
  if (!p) return p;
  if (!p.identity || !p.identity.color) p.identity = wrAutoIdentity(p.id || p.name || "room");
  if (!Array.isArray(p.agentIds)) p.agentIds = [];
  if (!Array.isArray(p.teamIds)) p.teamIds = [];
  return p;
};

// ---- IndexedDB for chat history (large capacity, so it can't crowd out settings/keys in localStorage) ----
const IDB_NAME = "madav", IDB_STORE = "sessions";
const LEGACY_IDB_NAME = "brain" + "edge"; // pre-rename DB; best-effort one-time copy below.
let _dbPromise = null;
function idb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "id" }); };
      req.onsuccess = async () => {
        const db = req.result;
        try { await migrateLegacyIdb(db); } catch {}
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
  return _dbPromise;
}
// One-time best-effort migration from the legacy ("brain"+"edge") DB into the new one.
// Only runs when the new DB has no records. Never deletes the old DB. Fully guarded.
async function migrateLegacyIdb(db) {
  try {
    const count = await new Promise((res) => {
      try { const tx = db.transaction(IDB_STORE, "readonly"); const r = tx.objectStore(IDB_STORE).count(); r.onsuccess = () => res(r.result || 0); r.onerror = () => res(-1); }
      catch { res(-1); }
    });
    if (count !== 0) return; // already has data (or couldn't tell) — leave alone
    const legacyRecs = await new Promise((res) => {
      try {
        const lreq = indexedDB.open(LEGACY_IDB_NAME);
        lreq.onsuccess = () => {
          const ldb = lreq.result;
          try {
            if (!ldb.objectStoreNames.contains(IDB_STORE)) { ldb.close(); return res([]); }
            const tx = ldb.transaction(IDB_STORE, "readonly");
            const r = tx.objectStore(IDB_STORE).getAll();
            r.onsuccess = () => { const out = r.result || []; ldb.close(); res(out); };
            r.onerror = () => { ldb.close(); res([]); };
          } catch { try { ldb.close(); } catch {} res([]); }
        };
        lreq.onerror = () => res([]);
        lreq.onupgradeneeded = () => { try { lreq.transaction.abort(); } catch {} res([]); }; // legacy DB didn't exist
      } catch { res([]); }
    });
    for (const rec of legacyRecs) {
      try { await new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(rec); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); } catch {}
    }
  } catch {}
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
    activeProfileId: "p_starter",
    profiles: {
      // Madav Starter — zero-setup free models through the server's house key. The
      // bearer is the user's session token, injected at resolve time (resolveProfile);
      // same-origin "/starter" baseUrl works in prod, AUTH_BASE covers the dev server.
      p_starter: { id: "p_starter", name: "Madav Starter (free)", kind: "openai", baseUrl: (AUTH_BASE || "") + "/starter", apiKey: "", model: "nvidia/nemotron-3-nano-30b-a3b:free", cachedModels: [] },
      p_openrouter: { id: "p_openrouter", name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "", cachedModels: [] },
    },
    theme: "dark", accent: "#13c2d6", officeAccent: "1F3864", globalInstructions: "", responseLanguage: "model", defaultModel: "", authBaseUrl: AUTH_BASE || "",
    account: { name: "", email: "", avatar: "" }, messaging: { autoContinue: true },
  };
}
const loadSettings = () => {
  const s = LS.get(SETTINGS_KEY, null) || LS.set(SETTINGS_KEY, defaultSettings());
  // Existing installs predate the Starter profile — seed it once (never overwrite user edits).
  if (s.profiles && !s.profiles.p_starter) { s.profiles = { p_starter: defaultSettings().profiles.p_starter, ...s.profiles }; LS.set(SETTINGS_KEY, s); }
  return s;
};

// ---- Workspace sync (mirror of electron/workspace-sync.cjs — keep policies in sync) ----
// Agents/teams/folders/instructions follow the ACCOUNT; keys stay in this browser.
const WS_KEYS = ["agents", "teams", "agentGroups", "globalInstructions"];
const wsSubset = (s) => ({ agents: s.agents || [], teams: s.teams || [], agentGroups: s.agentGroups || [], globalInstructions: s.globalInstructions || "" });
const wsHash = (d) => { const str = JSON.stringify(d); let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return String(h) + ":" + str.length; };
let _wsLast = "", _wsTimer = null;
async function wsPull() {
  try {
    const s = loadSettings();
    if (s.workspaceSync === false || !getToken()) return;
    const r = await fetch(api("/workspace"), { headers: authHeaders() }).then((x) => x.json()).catch(() => null);
    if (!r || r.error) return;
    if (!r.data) {
      // Account has no workspace yet — this device seeds it (if it has anything to offer).
      const local = wsSubset(s);
      if ((local.agents.length || local.teams.length) > 0) { _wsLast = ""; wsMaybePush(); }
      else _wsLast = wsHash(local);
      return;
    }
    if ((r.updatedAt || 0) <= (s.workspaceSyncedAt || 0)) { _wsLast = wsHash(wsSubset(s)); return; }
    const next = { ...loadSettings() };
    for (const k of WS_KEYS) if (k in r.data) next[k] = r.data[k];
    next.workspaceSyncedAt = r.updatedAt;
    _wsLast = wsHash(wsSubset(next));
    LS.set(SETTINGS_KEY, next);
  } catch {}
}
function wsMaybePush() {
  try {
    const s = loadSettings();
    if (s.workspaceSync === false || !getToken()) return;
    const h = wsHash(wsSubset(s));
    if (h === _wsLast) return;
    clearTimeout(_wsTimer);
    _wsTimer = setTimeout(async () => {
      try {
        const s2 = loadSettings();
        const data = wsSubset(s2);
        const h2 = wsHash(data);
        if (h2 === _wsLast) return;
        const r = await fetch(api("/workspace"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(data) }).then((x) => x.json()).catch(() => null);
        if (r && r.ok) { _wsLast = h2; LS.set(SETTINGS_KEY, { ...loadSettings(), workspaceSyncedAt: r.updatedAt }); }
      } catch {}
    }, 4000);
  } catch {}
}
// ---- Chat sync (mirror of electron/chat-sync.cjs) — conversations follow the account across devices ----
let _chatLast = "", _chatTimer = null;
const CHAT_MAX_CONVS = 100, CHAT_MAX_MSGS = 300;
const chatHash = (items) => items.map((c) => c.id + ":" + (c.updatedAt || 0)).join("|");
async function chatItems() {
  const all = await idbAll();
  return (all || [])
    .filter((r) => r && r.id && Array.isArray(r.messages) && r.messages.length)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, CHAT_MAX_CONVS)
    .map((r) => ({ id: r.id, mode: r.mode || "chat", title: r.title || "Conversation", projectId: r.projectId || null, convId: r.convId || null, model: r.model || null, provider: r.provider || null, agent: r.agent || null, team: r.team || null, createdAt: r.createdAt || 0, updatedAt: r.updatedAt || 0, messages: r.messages.slice(-CHAT_MAX_MSGS) }));
}
async function chatPull() {
  try {
    const s = loadSettings();
    if (s.chatSync === false || !getToken()) return;
    const r = await fetch(api("/conversations"), { headers: authHeaders() }).then((x) => x.json()).catch(() => null);
    if (!r || !r.data || !Array.isArray(r.data.items)) return;
    let merged = 0;
    for (const it of r.data.items) {
      if (!it || !it.id || !Array.isArray(it.messages)) continue;
      const local = await idbGet(it.id);
      if (!local || (it.updatedAt || 0) > (local.updatedAt || 0)) { try { await idbPut(it); merged++; } catch {} }
    }
    _chatLast = chatHash(await chatItems());
    if (merged) { try { window.dispatchEvent(new CustomEvent("madav:historychanged")); } catch {} }
  } catch {}
}
function chatMaybePush() {
  clearTimeout(_chatTimer);
  _chatTimer = setTimeout(async () => {
    try {
      const s = loadSettings();
      if (s.chatSync === false || !getToken()) return;
      const items = await chatItems(); const h = chatHash(items);
      if (h === _chatLast) return;
      const r = await fetch(api("/conversations"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ items }) }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) _chatLast = h;
    } catch {}
  }, 4000);
}
async function chatPushNow() {
  try {
    const s = loadSettings();
    if (s.chatSync === false || !getToken()) return;
    const items = await chatItems(); const h = chatHash(items);
    const r = await fetch(api("/conversations"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ items }) }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) _chatLast = h;
  } catch {}
}
async function chatLaunchSync() { await chatPull(); await chatPushNow(); } // download remote, then upload our local (old) chats
setTimeout(wsPull, 1500); // account workspace → this browser, shortly after load
setTimeout(chatLaunchSync, 1800); // pull synced conversations, then upload local (old) chats
// Starter profiles authenticate with the user's SESSION TOKEN as the bearer (the server
// swaps in the house key upstream). Injected here so it's always current, never persisted.
const resolveProfile = (p) => (p && !p.apiKey && /\/starter\b/.test(p.baseUrl || "") ? { ...p, apiKey: getToken() || "" } : p);
const activeProfile = (s) => resolveProfile((s.profiles && s.profiles[s.activeProfileId]) || Object.values(s.profiles || {})[0] || null);

// ================= event bus (chat streaming) =================
let seq = 0;
const listeners = new Set();
const emit = (sessionId, kind, data) => { try { webTrace.onEvent(sessionId, kind, data, sessions.get(sessionId)); } catch {} const e = { sessionId, seq: seq++, kind, data }; listeners.forEach((cb) => cb(e)); };
const sessions = new Map(); // sessionId -> { profile, messages, ac, mode, convId, title }

// Build the system prompt from global instructions (+ project context when present).
// Always-on base behavior: keep replies human and natural, and never let the model parrot its own
// instructions back. The user's own instructions (below) still govern the substance of answers.
const BASE_BEHAVIOR =
  "You are Madav, a warm and helpful assistant. Reply naturally and conversationally, the way a thoughtful person would. " +
  "Never restate, list, summarize, or describe your own instructions, rules, role, or \"operating framework\" — just follow them silently. " +
  "If the user only greets you or makes small talk, reply naturally in kind; do not recite your guidelines. " +
  "Apply the guidance below to the substance and depth of your answers, but always keep the delivery human and direct.";
// Two-channel build flags (public web builds fold these to false and the code drops out).
const FEAT_OFFICE = import.meta.env.VITE_FEAT_OFFICE !== "0";
const FEAT_IMAGEGEN = import.meta.env.VITE_FEAT_IMAGEGEN !== "0";
const FEAT_MEMORY = import.meta.env.VITE_FEAT_MEMORY !== "0";
// Office-file rule is appended per call in systemPrompt() — gated by the build channel
// AND the Extras switchboard (settings.extras.office !== false), in sync with desktop.
const officeRulePart = (s) => { if (!FEAT_OFFICE || ((s && s.extras) || {}).office === false) return ""; const p = activeProfile(s); return officeRule((p && p.model) || ""); };
// Artifact + webpage-design rule — kept in sync with electron/agent-openai.cjs ARTIFACT_RULE_BASE so
// the WEB build gets the same live-preview behaviour and the same "design it like a shipped product"
// bar for HTML pages. The renderer detects fenced blocks and previews them in the side panel.
// ARTIFACT_RULE now comes from the shared single source (imported above).
// Deliver the answer, not the play-by-play — mirror of electron/agent-openai.cjs ANSWER_DIRECT_RULE.
// Stops "let me search…", "I'm executing now!", "web search isn't returning results", and similar
// process/tool/limitation narration that users see as noise.
const ANSWER_DIRECT_RULE =
  " Answer the request directly and naturally. NEVER narrate your internal process, tools, searches, or limitations — do not say things like \"let me search\", \"I'm executing the request now\", \"let me get current data first\", or \"web search isn't returning results\". If a tool or lookup helps, use it silently and present only the result; if it fails, just answer with what you know without announcing the failure. Skip theatrical enthusiasm and preambles — lead with the deliverable.";


// ---- Cross-chat memory (web mirror of electron/user-memory.cjs) ----
// Durable facts about the user, learned from conversations, injected everywhere.
// localStorage-only: never leaves the device except inside the user's own prompts.
const UMEM_KEY = "be.userMemory";
let _umLastLearn = 0;
function umGet() { try { const m = JSON.parse(localStorage.getItem(UMEM_KEY) || "{}"); return { notes: Array.isArray(m.notes) ? m.notes : [] }; } catch { return { notes: [] }; } }
function umSave(m) { try { localStorage.setItem(UMEM_KEY, JSON.stringify(m)); } catch {} return m; }
function umBlock(s) {
  if (!FEAT_MEMORY) return "";
  if (s && s.userMemory && s.userMemory.enabled === false) return "";
  const m = umGet();
  if (!m.notes.length) return "";
  return ("What you remember about this user from previous conversations (apply naturally; never recite this list):\n" + m.notes.slice(-28).map((n) => "- " + n.text).join("\n")).slice(0, 7000);
}
async function umLearn(prof, s, userText, replyText) {
  try {
    if (!FEAT_MEMORY) return;
    if (s && s.userMemory && s.userMemory.enabled === false) return;
    if (!prof || !prof.baseUrl || Date.now() - _umLastLearn < 4 * 60 * 1000) return;
    if (!(userText || "").trim() || String(userText).length < 40 || !(replyText || "").trim()) return;
    _umLastLearn = Date.now();
    const { text } = await streamChat(prof, [
      { role: "system", content: "You maintain a person's long-term memory for their AI assistant. From this conversation turn, extract ONLY durable facts worth remembering in FUTURE conversations: stated preferences, stable personal/professional facts they volunteered, corrections. NEVER store one-off content, the answer itself, anything sensitive, or anything time-bound. Reply with ONLY a JSON array of 0-2 short strings (<160 chars each). [] is the most common correct answer." },
      { role: "user", content: `USER SAID:\n${String(userText).slice(0, 4000)}\n\nASSISTANT REPLIED:\n${String(replyText).slice(0, 3000)}` },
    ], { onDelta: () => {} });
    const i = text.indexOf("["), j = text.lastIndexOf("]");
    if (i < 0 || j <= i) return;
    const arr = JSON.parse(text.slice(i, j + 1));
    if (!Array.isArray(arr) || !arr.length) return;
    const m = umGet();
    for (const t of arr.slice(0, 2)) {
      const txt = String(t || "").trim().slice(0, 400);
      if (txt.length >= 8 && !m.notes.some((n) => n.text.toLowerCase() === txt.toLowerCase())) m.notes.push({ at: Date.now(), text: txt });
    }
    m.notes = m.notes.slice(-48);
    umSave(m);
  } catch {}
}

function systemPrompt(s, projectId) {
  const parts = [BASE_BEHAVIOR + ARTIFACT_RULE + ANSWER_DIRECT_RULE + officeRulePart(s)];
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}, regardless of the language of the question.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  const um = umBlock(s); if (um) parts.push(um);
  if (projectId) {
    const p = LS.get("be.projects", {})[projectId];
    if (p) {
      if (p.instructions) parts.push(p.instructions);
      for (const k of p.knowledge || []) if (k.type === "text" && k.content) parts.push(`# ${k.name}\n${k.content}`);
    }
  }
  return parts.join("\n\n").trim();
}

// Custom agent (Agents builder): identity + instructions + knowledge, for the session system prompt.
function agentKnowledgeBlock(a) {
  const docs = (a && Array.isArray(a.knowledge) ? a.knowledge : []).slice(0, 8);
  if (!docs.length) return "";
  return "\n\nAgent knowledge — reference material this agent always has (cite it when relevant):\n" +
    docs.map((k) => `--- ${k.name || "doc"} ---\n${String(k.content || "").slice(0, 20000)}`).join("\n\n");
}
function agentBlock(a) {
  if (!a || !a.instructions) return "";
  return `You are "${a.name || "a custom agent"}", an agent the user built in Madav.` +
    (a.description ? ` Purpose: ${a.description}` : "") +
    `\n\nAgent instructions (always follow):\n${a.instructions}` +
    agentKnowledgeBlock(a);
}

// ===== Agent teams on the web (multi-agent: relay + manager) =====
// Members run instruction-level here (browser can't spawn MCP/terminal — desktop runs them
// with full tools). Same UiEvent shapes as desktop so the chat timeline renders identically.
function memberSys(m) {
  return `You are "${m.name}", one agent on a team inside Madav.` +
    (m.description ? ` Purpose: ${m.description}` : "") +
    `\n\nAgent instructions (always follow):\n${m.instructions || ""}` +
    agentKnowledgeBlock(m) +
    `\n\nYou receive a task (possibly with work from teammates). Do YOUR part thoroughly and reply with your complete work product as plain text — a teammate or coordinator consumes it next, so be complete and self-contained.`;
}
async function runTeamTurn(sess, text) {
  const s = loadSettings();
  const prof = activeProfile(s);
  if (!prof || !prof.baseUrl || !prof.model) { emit(sess.id, "error", { message: "No provider/model configured — pick one in the model selector." }); emit(sess.id, "result", { subtype: "error" }); return; }
  const team = sess.team;
  const members = (team.members || []).slice(0, 6);
  const rid2 = () => rid("team_");
  const profFor = (m) => {
    if (m.model && m.model.includes("::")) { const i = m.model.indexOf("::"); const p = s.profiles[m.model.slice(0, i)]; if (p) return resolveProfile({ ...p, model: m.model.slice(i + 2) }); }
    return prof;
  };
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind, mode: "team" });
  if (!sess.title) sess.title = text.slice(0, 60);
  const started = Date.now();
  try {
    let plan = members.map((m) => ({ member: m, task: "" }));
    if (team.mode === "manager") {
      const roster = members.map((m) => `- ${m.name}: ${m.description || (m.instructions || "").slice(0, 120)}`).join("\n");
      const planId = rid2();
      emit(sess.id, "tool_use", { id: planId, name: `Team plan — ${team.name || "your team"}`, input: { mission: text }, auto: true });
      try {
        const { text: pt } = await callModel(prof, [
          { role: "system", content: `You are the coordinator of an agent team. Team roster:\n${roster}\n\nSplit the user's mission into one focused sub-task per useful member (skip members that add nothing). Reply with ONLY a JSON array, no prose: [{"member":"<exact member name>","task":"<specific, self-contained sub-task>"}]` },
          { role: "user", content: text },
        ], sess.ac.signal);
        const i = pt.indexOf("["); const j = pt.lastIndexOf("]");
        const arr = i >= 0 && j > i ? JSON.parse(pt.slice(i, j + 1)) : null;
        if (Array.isArray(arr) && arr.length) {
          const mapped = arr.slice(0, 6)
            .map((p) => ({ member: members.find((m) => m.name === p.member) || members.find((m) => (p.member || "").toLowerCase().includes(m.name.toLowerCase())), task: String(p.task || "") }))
            .filter((p) => p.member);
          if (mapped.length) plan = mapped;
        }
        emit(sess.id, "tool_result", { id: planId, output: plan.map((p, k) => `${k + 1}. ${p.member.name} — ${p.task || "full mission"}`).join("\n") });
      } catch (e) {
        emit(sess.id, "tool_result", { id: planId, output: "(planning failed — relay order: " + String((e && e.message) || e) + ")" });
      }
    }
    // Managed → parallel fan-out (independent sub-tasks, all members at once);
    // Relay → strictly in order, each member seeing prior teammates' work.
    let outputs = [];
    if (team.mode === "manager") {
      outputs = await Promise.all(plan.map((step) => {
        const stepId = rid2();
        emit(sess.id, "tool_use", { id: stepId, name: `${step.member.name} (teammate)`, input: { task: step.task || "full mission" }, auto: true });
        const task = `MISSION (from the user):\n${text}` + (step.task ? `\n\nYOUR ASSIGNED SUB-TASK (do only this part):\n${step.task}` : "");
        return callModel(profFor(step.member), [{ role: "system", content: memberSys(step.member) }, { role: "user", content: task }], sess.ac.signal)
          .then((r) => (r && r.text) || "")
          .catch((e) => { if (e && e.name === "AbortError") throw e; return "(member failed: " + String((e && e.message) || e) + ")"; })
          .then((out) => {
            emit(sess.id, "tool_result", { id: stepId, output: (out || "(no output)").slice(0, 4000) });
            return { name: step.member.name, text: out || "(no output)" };
          });
      }));
    } else {
      for (const step of plan) {
        // Trim each teammate's contribution so the hand-off context can't balloon past limits.
        const prior = outputs.map((o) => `=== Work from ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
        const task = `MISSION (from the user):\n${text}` +
          (prior ? `\n\nWORK FROM YOUR TEAMMATES SO FAR:\n${prior}` : "");
        const stepId = rid2();
        emit(sess.id, "tool_use", { id: stepId, name: `${step.member.name} (teammate)`, input: { task: "mission + teammates' work" }, auto: true });
        let out = "";
        try { const r = await callModel(profFor(step.member), [{ role: "system", content: memberSys(step.member) }, { role: "user", content: task }], sess.ac.signal); out = (r && r.text) || ""; }
        catch (e) { if (e && e.name === "AbortError") throw e; out = "(member failed: " + String((e && e.message) || e) + ")"; }
        outputs.push({ name: step.member.name, text: out || "(no output)" });
        emit(sess.id, "tool_result", { id: stepId, output: (out || "(no output)").slice(0, 4000) });
      }
    }
    let finalText = "";
    if (team.mode === "manager" && outputs.length > 1) {
      const body = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
      const { text: ft } = await callModel(prof, [
        { role: "system", content: "You are the coordinator of an agent team. Synthesize your team's work into ONE clear, complete answer to the user's mission. Credit no one; just deliver the result. Do not mention the team mechanics." },
        { role: "user", content: `Mission:\n${text}\n\nTeam output:\n${body}` },
      ], sess.ac.signal, (d) => emit(sess.id, "assistant_delta", { text: d }));
      finalText = ft;
    } else {
      finalText = (outputs[outputs.length - 1] || {}).text || "(the team produced no output)";
      emit(sess.id, "assistant_delta", { text: finalText });
    }
    sess.messages.push({ role: "user", content: text });
    sess.messages.push({ role: "assistant", content: finalText });
    emit(sess.id, "assistant_message", { stop_reason: "end_turn" });
    emit(sess.id, "result", { subtype: "success", duration_ms: Date.now() - started });
    persistSession(sess);
  } catch (e) {
    if (e && e.name === "AbortError") { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
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
    `You are Madav, collaborating on the user's local folder "${webfs.rootLabel()}" directly from their browser.`,
    `Use the provided tools to list, read, write, and edit files. All paths are relative to the folder root (use "" for the root).`,
    `There is NO terminal on the web: you cannot run shell commands, install packages, run tests, or execute code. Make every change by reading and writing files.`,
    `You CAN access the web: use web_fetch(url) to read a page and web_search(query) to look things up (docs, APIs, references).`,
    `For large independent chunks of work you may call spawn_subagent(task) to delegate to a focused helper that works on the same project and reports back.`,
    `Every file change is checkpointed automatically, so the user can undo your edits — work confidently, but still inspect with list_dir/read_file before editing.`,
    `When done, give a short summary of what you changed.`,
  ];
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  { const um = umBlock(s); if (um) parts.push(um); }
  { const si = bundledIndex(); if (si) parts.push(si); } // bundled skill packs (EdgeTrader etc.) work on web too
  parts.push(ARTIFACT_RULE.trim());
  parts.push(ANSWER_DIRECT_RULE.trim());
  { const op = officeRulePart(s); if (op) parts.push(op.trim()); }
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
  { type: "function", function: { name: "create_image", description: "Generate an IMAGE (raster picture) from a text prompt using the user's selected model (must be an image-output model, e.g. google/gemini-2.5-flash-image on OpenRouter). The image is shown to the user automatically. Use ONLY for actual pictures: photos, illustrations, logos, artwork, or a diagram rendered as a picture. NEVER call this for a document, spreadsheet, slide deck, presentation, or PDF — those are produced with a fenced officedoc block, not with create_image. If unsure, do not call it.", parameters: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } } },
  { type: "function", function: { name: "load_skill", description: "Load a skill's full instructions by its exact name (from the SKILLS list in your instructions), then follow them.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
];

// Text→image via the selector's model (mirror of electron/imagegen.cjs):
// OpenAI-compatible chat/completions with modalities ["image","text"].
async function webGenImage(prof, prompt) {
  if (!prof || !prof.baseUrl || prof.kind === "anthropic") throw new Error("Pick an image-output model in the model picker (e.g. google/gemini-2.5-flash-image on OpenRouter).");
  const res = await fetch(apiBase(prof.baseUrl) + "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(prof.apiKey ? { Authorization: `Bearer ${(prof.apiKey || "").trim()}` } : {}) },
    body: JSON.stringify({ model: prof.model, messages: [{ role: "user", content: String(prompt || "").slice(0, 2000) }], modalities: ["image", "text"] }),
  });
  if (!res.ok) throw new Error(`"${prof.model}" couldn't generate an image (${res.status}) — pick an image-output model in the model picker.`);
  const j = await res.json().catch(() => ({}));
  const img = j.choices && j.choices[0] && j.choices[0].message && (j.choices[0].message.images || [])[0];
  const dataUrl = img && img.image_url && img.image_url.url;
  if (!dataUrl || !/^data:image\//.test(dataUrl)) throw new Error(`"${prof.model}" answered with text but no image — it isn't an image-output model.`);
  return dataUrl;
}
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
      const a = tolerantParse(c.arguments || "{}").value || {};
      let out; try { out = await executeTool(c.name, a, { sess }); } catch (e) { out = "Error: " + String((e && e.message) || e); }
      if (sess) emit(sess.id, "tool_result", { id: c.id, name: "↳ " + c.name, ok: true, output: String(out).slice(0, 2000) });
      msgs.push({ role: "tool", tool_call_id: c.id, content: headTail(String(out), { maxChars: 24000, headLines: 400, tailLines: 200 }) });
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
    case "load_skill": { const sk = bundledByName(String(args.name || "").trim()); return sk ? sk.body : `No skill named "${args.name}". Available: ${listBundled().map((x) => x.name).join(", ") || "(none)"}`; }
    case "spawn_subagent": return await runSubagent(sess, args.task || "", sess && sess.profile);
    default: return "That tool isn't available on the web app (no terminal). Use the file/web tools.";
  }
}
// Extras switchboard: create_image is only offered when image generation is on.
function activeTools() {
  let on = true;
  try { on = FEAT_IMAGEGEN && ((loadSettings().extras) || {}).imagegen !== false; } catch {}
  return on ? COWORK_TOOLS : COWORK_TOOLS.filter((t) => t.function.name !== "create_image");
}
async function callTools(prof, messages, onDelta, signal) {
  const tools = activeTools();
  try { return await streamChatTools(prof, messages, tools, { onDelta, signal }); }
  catch (e) { if (isNetworkErr(e) && getToken()) return await streamChatTools(prof, messages, tools, { onDelta, signal, proxy: proxyCfg() }); throw e; }
}
async function runAgentTurn(sess, text, images, prof) {
  sess.messages.push({ role: "user", content: userContent(text, images) });
  if (!sess.title) sess.title = text.slice(0, 60);
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind, cwd: sess.cwd });
  const started = Date.now();
  // Harness (desktop-mirrored): squash stale tool outputs + per-turn call guard.
  squashStale(sess.messages);
  const guard = new CallGuard();
  let reasks = 0;
  try {
    for (let step = 0; step < 16; step++) {
      const { content, toolCalls } = await callTools(prof, sess.messages, (c) => emit(sess.id, "assistant_delta", { text: c }), sess.ac.signal);
      if (!toolCalls || !toolCalls.length) { sess.messages.push({ role: "assistant", content: content || "" }); emit(sess.id, "assistant_message", { stop_reason: "end_turn" }); break; }
      sess.messages.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
      for (const c of toolCalls) {
        // Wave 1.1 — tolerant JSON repair (weak models emit sloppy arguments).
        const parsed = tolerantParse(c.arguments || "{}");
        const args = parsed.value || {};
        if (!parsed.ok) {
          let out;
          if (reasks < 2) { reasks++; out = `Your ${c.name} arguments were not valid JSON. Call ${c.name} again with ONE valid JSON object as arguments — no comments, no single quotes, no trailing commas.`; }
          else out = "(arguments were invalid JSON again — abandon this call and try a different approach)";
          emit(sess.id, "tool_use", { id: c.id, name: c.name, input: { error: "invalid arguments" }, auto: true });
          emit(sess.id, "tool_result", { id: c.id, name: c.name, ok: false, output: out });
          sess.messages.push({ role: "tool", tool_call_id: c.id, content: out });
          continue;
        }
        // Wave 1.4 — identical-call loop breaker (3rd copy of the same call in a row).
        if (guard.repeatBlocked(c.name, args)) {
          const out = "(blocked: this is the 3rd identical call in a row — the result will not change. State why the previous attempts failed and try a DIFFERENT approach.)";
          emit(sess.id, "tool_use", { id: c.id, name: c.name, input: args, auto: true });
          emit(sess.id, "tool_result", { id: c.id, name: c.name, ok: false, output: out });
          sess.messages.push({ role: "tool", tool_call_id: c.id, content: out });
          continue;
        }
        emit(sess.id, "tool_use", { id: c.id, name: c.name, input: args, auto: true });
        // Text→image: show the picture in the tool card; tiny text back to the model.
        if (c.name === "create_image") {
          let out, image = null;
          try { image = await webGenImage(prof, args.prompt); out = "Image generated and shown to the user. Describe it in one short sentence and continue."; }
          catch (e) { out = "ERROR: " + String((e && e.message) || e); }
          emit(sess.id, "tool_result", { id: c.id, name: c.name, ok: !!image, output: out, image });
          sess.messages.push({ role: "tool", tool_call_id: c.id, content: out });
          continue;
        }
        const target = args.path || args.query || args.url || "";
        let out, failed = false;
        try { out = await executeTool(c.name, args, { sess }); guard.noteResult(c.name, target, true); }
        catch (e) {
          failed = true;
          guard.noteResult(c.name, target, false);
          const streak = guard.failStreak(c.name, target);
          out = "Error: " + String((e && e.message) || e) + (streak >= 2
            ? "\n[harness] Second consecutive failure on this target — STOP retrying this approach. Say why it failed, then take a different route or report the blocker."
            : "\nReflect: state in one sentence why this failed, then try a DIFFERENT approach.");
        }
        emit(sess.id, "tool_result", { id: c.id, name: c.name, ok: !failed, output: headTail(String(out), { maxChars: 8000 }) });
        sess.messages.push({ role: "tool", tool_call_id: c.id, content: headTail(String(out), { maxChars: 24000, headLines: 400, tailLines: 200 }) });
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
  // Agent team bound to this session → multi-agent run (relay/manager).
  if (sess.team) return runTeamTurn(sess, text);
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
    umLearn(prof, loadSettings(), text, reply); // cross-chat memory: fire-and-forget, throttled
  } catch (e) {
    if (e && (e.name === "AbortError")) { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
}

// ================= chat history (localStorage) =================
const HISTORY_KEY = "be.sessions";
// Per-session write queue: a slow IndexedDB commit must not be overtaken by the next turn's snapshot,
// or an older messages array could win and lose the latest turn. Each persistSession chains onto the
// previous write for the same session id. Fire-and-forget from the caller's view; one-time fail warning.
const _persistChains = new Map(); // sessionId -> Promise
function persistSession(sess) {
  const rec = { id: sess.id, mode: sess.mode || "code", title: sess.title || "Untitled", updatedAt: Date.now(),
    messages: sess.messages, projectId: sess.projectId || null, convId: sess.convId || null,
    model: (sess.profile && sess.profile.model) || null, provider: (sess.profile && sess.profile.name) || null,
    agent: sess.agent || null, team: sess.team ? { name: sess.team.name, mode: sess.team.mode, members: sess.team.members, identity: sess.team.identity } : null };
  // Surface save failures instead of losing history silently: warn once per session in the
  // chat (as a system-style event) + always in the console, then keep running.
  const prev = _persistChains.get(sess.id) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => idbPut(rec)).catch((e) => {
    console.warn("[madav] chat history save failed:", e);
    if (!persistSession._warned) {
      persistSession._warned = true;
      try { emit(sess.id, "error", { message: "⚠ This browser is blocking history storage (private mode or full disk?). Your chat continues, but it won't be saved." }); } catch {}
    }
  }).finally(() => { if (_persistChains.get(sess.id) === next) _persistChains.delete(sess.id); });
  _persistChains.set(sess.id, next);
  try { chatMaybePush(); } catch {}
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
    const agent = (req.agent && req.agent.instructions) ? req.agent : null; // custom agent (Agents builder)
    // A custom agent only gets file tools when its Files capability is on.
    const wantsFiles = agent ? !!(agent.tools && agent.tools.files) : true;
    const agentic = webfs.hasRoot() && (!!req.cwd || req.mode === "cowork") && wantsFiles; // a real folder is selected → file-agent mode
    const prior = req.conversationId ? await idbGet(req.conversationId) : null;
    let id, messages, title;
    if (prior) {
      // Continuing an opened chat — resume its full message history so context carries over.
      id = req.conversationId; messages = (prior.messages || []).slice(); title = prior.title || "";
    } else {
      id = rid("sess_"); messages = [];
      let sys = agentic ? coworkSystem(s) : systemPrompt(s, req.projectId);
      const ab = agentBlock(agent);
      if (ab) sys = sys ? `${ab}\n\n${sys}` : ab; // agent identity leads; base behavior/tool guidance follows
      if (sys) messages.push({ role: "system", content: sys }); title = "";
    }
    const sess = { id, profile: activeProfile(s), messages, mode: req.mode || "code", projectId: req.projectId || null, convId: id, title, agentic, cwd: req.cwd || null, agent,
      team: (req.team && Array.isArray(req.team.members) && req.team.members.length) ? req.team : null };
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
  async saveSettings(next) { const saved = LS.set(SETTINGS_KEY, next); wsMaybePush(); return saved; },
  async listModels(profileId) {
    const s = loadSettings(); const p = resolveProfile(profileId ? s.profiles[profileId] : activeProfile(s)); // Starter gets the session token
    let out = await provListModels(p);
    // If the browser blocked the provider's /models (CORS) and we're signed in, try via the proxy.
    if ((!out || !out.length) && p && p.baseUrl && getToken()) { try { out = await provListModels(p, { proxy: proxyCfg() }); } catch {} }
    return out;
  },
  async pingProvider(profileId) { const s = loadSettings(); const p = resolveProfile(profileId ? s.profiles[profileId] : activeProfile(s)); return provPing(p); },
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

  // ---- generic authenticated account-server call (community forum, product requests, share links) ----
  async apiCall(method, path, body) {
    try {
      const headers = authHeaders();
      const opts = { method: method || "GET", headers };
      if (body != null && method && method !== "GET") { headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
      const r = await fetch(api(path), opts);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return (j && (j.error || j.message)) ? { error: j.error || j.message, code: r.status, ...j } : { error: "server " + r.status, code: r.status };
      return j;
    } catch { return { error: "offline" }; }
  },

  // ---- chat history ----
  async listSessions(mode) {
    const all = await idbAll();
    return all.filter((x) => !mode || x.mode === mode).sort((a, b) => b.updatedAt - a.updatedAt).map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, mode: x.mode, projectId: x.projectId || null, count: (x.messages || []).length }));
  },
  async getSession(id) {
    const rec = await idbGet(id); if (!rec) return null;
    const asText = (c) => (typeof c === "string" ? c : (Array.isArray(c) ? (c.find((p) => p.type === "text")?.text || "") : ""));
    // The renderer maps conv.messages -> bubbles; strip system and flatten content to text.
    const messages = (rec.messages || []).filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: asText(m.content) }));
    return { id: rec.id, mode: rec.mode, title: rec.title, messages, projectId: rec.projectId || null, cwd: rec.cwd || null };
  },
  async deleteSession(id) { await idbDel(id); return true; },
  // Global search across message CONTENT (parity with desktop).
  async searchSessions(q, mode) {
    const needle = String(q || "").toLowerCase();
    if (needle.length < 2) return [];
    const asText = (c) => (typeof c === "string" ? c : (Array.isArray(c) ? (c.find((p) => p.type === "text")?.text || "") : ""));
    const out = [];
    for (const s of await idbAll()) {
      if (mode && s.mode !== mode) continue;
      let snippet = "";
      if ((s.title || "").toLowerCase().includes(needle)) snippet = s.title;
      else {
        for (const m of s.messages || []) {
          const c = asText(m.content);
          const i = c.toLowerCase().indexOf(needle);
          if (i >= 0) { snippet = c.slice(Math.max(0, i - 32), i + needle.length + 48).replace(/\s+/g, " "); break; }
        }
      }
      if (snippet) out.push({ id: s.id, mode: s.mode, title: s.title, updatedAt: s.updatedAt, snippet });
      if (out.length >= 50) break;
    }
    return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async getAppVersion() { return "web"; },

  // ---- saved library (bookmarked responses) ----
  async listSaved() { return Object.values(LS.get("be.saved", {})).sort((a, b) => b.createdAt - a.createdAt); },
  async saveResponse(item) { const all = LS.get("be.saved", {}); const it = { id: rid("sav_"), ...item, createdAt: Date.now() }; all[it.id] = it; LS.set("be.saved", all); return it; },
  async updateSaved(id, patch) { const all = LS.get("be.saved", {}); if (!all[id]) return null; all[id] = { ...all[id], ...patch }; LS.set("be.saved", all); return all[id]; },
  async removeSaved(id) { const all = LS.get("be.saved", {}); delete all[id]; LS.set("be.saved", all); return true; },

  // ---- projects (localStorage) ----
  // Workrooms: identity {color,glyph} + agentIds[] crew — KEEP IN SYNC with
  // electron/projects-store.cjs (normalize + autoIdentity, same palette as Agents.jsx).
  async listProjects() {
    const convs = Object.values(LS.get("be.convs", {}));
    return Object.values(LS.get("be.projects", {})).map(wrNormalizeProject).map((p) => {
      const mine = convs.filter((c) => c.projectId === p.id);
      return { ...p,
        knowledgeCount: (p.knowledge || []).length,
        knowledgeBytes: (p.knowledge || []).reduce((n, k) => n + String(k.content || "").length, 0),
        convCount: mine.length, lastConvAt: mine.reduce((m, c) => Math.max(m, c.updatedAt || 0), 0),
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  },
  async getProject(id) { return wrNormalizeProject(LS.get("be.projects", {})[id] || null); },
  async createProject(name) { const all = LS.get("be.projects", {}); const id = rid("prj_"); const p = { id, name: name || "Untitled", instructions: "", knowledge: [], agentIds: [], identity: wrAutoIdentity(id), createdAt: Date.now() }; all[p.id] = p; LS.set("be.projects", all); return p; },
  async assignProjectAgent(projectId, agentId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p || !agentId) return null; if (!p.agentIds.includes(agentId)) p.agentIds.push(agentId); p.updatedAt = Date.now(); all[projectId] = p; LS.set("be.projects", all); return p; },
  async unassignProjectAgent(projectId, agentId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p) return null; p.agentIds = p.agentIds.filter((x) => x !== agentId); p.updatedAt = Date.now(); all[projectId] = p; LS.set("be.projects", all); return p; },
  async getProjectAgentHistory() { return []; }, // web: agent runs aren't recorded per-room (desktop feature)
  async seedSampleFiles() { return { error: "Creating sample files needs the desktop app." }; },
  async assignProjectTeam(projectId, teamId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p || !teamId) return null; if (!p.teamIds.includes(teamId)) p.teamIds.push(teamId); p.updatedAt = Date.now(); all[projectId] = p; LS.set("be.projects", all); return p; },
  async unassignProjectTeam(projectId, teamId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p) return null; p.teamIds = p.teamIds.filter((x) => x !== teamId); p.updatedAt = Date.now(); all[projectId] = p; LS.set("be.projects", all); return p; },
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

  // ---- run tracing + alerts (observability, web parity with desktop) ----
  async getTraces(limit) { try { return webTrace.list(limit); } catch { return []; } },
  async getTrace(id) { try { return webTrace.get(id); } catch { return null; } },
  async getTraceSummary(days) { try { return webTrace.summary(days); } catch { return null; } },
  async clearTraces() { try { webTrace.clear(); return true; } catch { return false; } },
  async testAlert() { try { return webTrace.testAlert(); } catch { return false; } },

  // ---- speed check: runs in the browser (direct to provider, proxy fallback for blocked ones) ----
  async runSpeedTest({ tests, prompt, maxTokens, quiz } = {}) {
    _speedCancel = false; _speedRunning = true;
    const s = loadSettings();
    const results = [];
    const startedAt = Date.now();
    _lastSpeed = { at: startedAt, prompt, results };
    const one = async (t) => {
      if (_speedCancel) return;
      const base = resolveProfile(s.profiles[t.profileId]); // Starter gets the session token
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
    const snap = { pid: s.activeProfileId, model: (s.profiles[s.activeProfileId] || {}).model || "" }; // guard: tests must never repoint chat
    await Promise.all(Array.from({ length: Math.min(6, queue.length || 1) }, worker));
    _speedRunning = false;
    _lastSpeed = { at: startedAt, prompt, results };
    // Restore the user's active selection if anything moved it during the run (selector-stranding guard).
    try {
      const after = loadSettings();
      if (after.activeProfileId !== snap.pid || ((after.profiles[snap.pid] || {}).model !== snap.model)) {
        console.warn("[madav] speed test changed the active selection — restoring", snap);
        const fixed = { ...after, activeProfileId: snap.pid };
        if (fixed.profiles[snap.pid]) fixed.profiles[snap.pid] = { ...fixed.profiles[snap.pid], model: snap.model };
        LS.set(SETTINGS_KEY, fixed);
      }
    } catch {}
    return _lastSpeed;
  },
  async cancelSpeedTest() { _speedCancel = true; _speedRunning = false; return true; },
  async getSpeedTestLast() { return _lastSpeed; },
  async getSpeedTestStatus() { return { running: _speedRunning, startedAt: 0 }; },
  // Harness stats are measured by the desktop engine (model-stats.cjs); the web
  // agent doesn't record them yet — empty map keeps the contract identical.
  async getModelStats() { return {}; },

  // ---- cross-chat user memory (view / edit / clear) ----
  async getUserMemory() { return umGet(); },
  async setUserMemory(notes) {
    const list = (Array.isArray(notes) ? notes : [])
      .map((n) => (typeof n === "string" ? { at: Date.now(), text: n } : n))
      .filter((n) => n && String(n.text || "").trim())
      .map((n) => ({ at: n.at || Date.now(), text: String(n.text).trim().slice(0, 400) }))
      .slice(-48);
    return umSave({ notes: list });
  },
  async clearUserMemory() { try { localStorage.removeItem(UMEM_KEY); } catch {} return { notes: [] }; },

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
  async connectorSignIn() { return { ok: false, error: "Connector sign-in runs in the desktop app." }; },
  async connectorAuthStatus() { return { connected: false, registered: false }; },
  async connectorSignOut() { return { ok: true }; },
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
  async listSkills() { return listBundled().map(({ body, ...s }) => s); }, // bundled packs ship in the web build (read-only)
  async createSkill() { return { error: "Skills run in the desktop app." }; },
  async setPinnedSkills() { return { error: "Pinning plays needs the desktop app." }; },
  async getPlayStats() { return {}; },
  async exportPlay() { return { error: "Sharing plays needs the desktop app." }; },
  async importPlay() { return { error: "Importing plays needs the desktop app." }; },
  async setPlayChain() { return { error: "Desktop only." }; },
  async setPlayNeeds() { return { error: "Desktop only." }; },
  async getPlayConfig() { return { chains: {}, meta: {} }; },
  async setTeamPinnedSkills() { return { error: "Desktop only." }; },
  async getPinSuggestions() { return []; },
  async importSkillFolder() { return { error: "Available in the desktop app." }; },
  async importSkillZip() { return { error: "Available in the desktop app." }; },
  async readSkill(dir) { const s = readBundled(dir); return s ? { dir: s.dir, file: s.file, meta: { name: s.name, description: s.description }, body: s.body, updated: 0 } : null; },
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
  async enableCli() { return { ok: false, error: "Open the Madav desktop app to enable terminal access — the CLI runs on your computer, which a browser can't set up." }; },
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

export const isWeb = typeof window !== "undefined" && !window.madav;
