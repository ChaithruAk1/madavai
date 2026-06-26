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
import { runWebChatTurnViaCore } from "./chatCoreWeb.js"; // ADR-0001 / M2d.3 — shared-core chat path (flag-guarded)
import { categoryFor as mrCategoryFor } from "../../core/model-router.js"; // SINGLE SOURCE model routing — same module desktop uses
import * as webTrace from "./webTrace.js";
import { listBundled as _listBundled, readBundled, mergeSkills, userSkills, skillPrefs } from "../webSkills.js"; // + user-authored skills (SK)
// Bundled packs honor the same Extras gate as the desktop engine (today: EdgeTrader).
const FEAT_EDGETRADER = import.meta.env.VITE_FEAT_EDGETRADER !== "0";
const bundledOn = () => { try { return FEAT_EDGETRADER && ((loadSettings().extras) || {}).edgetrader !== false; } catch { return FEAT_EDGETRADER; } };
const listBundled = () => (bundledOn() ? _listBundled() : []);
const allSkills = () => mergeSkills(listBundled(), userSkills(), skillPrefs()); // gated bundled + user, enabled applied
const skillByName = (name) => allSkills().find((s) => s.enabled !== false && s.name === name) || null;
const bundledIndex = () => {
  const sk = allSkills().filter((s) => s.enabled !== false);
  return sk.length ? "You have these SKILLS. When the user\u0027s request matches one, call the load_skill tool with its exact name to get the full instructions, then follow them:\n" + sk.map((s) => `- ${s.name}: ${s.description}`).join("\n") : "";
};
import * as webfs from "./webfs.js";
import { runPython } from "./pyodideRunner.js";
// The agent discipline layer (mirror of the desktop harness): JSON repair,
// head+tail truncation, stale-result squash, identical-call loop breaker.
import { tolerantParse, headTail, squashStale, CallGuard } from "../../core/turn-helpers.js"; // ADR-0001 / M2d — single source (was ../shared/harness.js, now retired)
// In-chat office files: the rule that teaches models the ```officedoc spec.
import { officeRule, ARTIFACT_RULE } from "../office.js";
import { dataToolsRule, SEARCH_ANSWER_RULE } from "../../core/agent-rules.js"; // ADR-0001 core: ESM single source (web imports natively)

// ---- where the API lives. Same origin in production (the auth server serves this app); on the
// Vite dev port (5180) the API is the separate auth server on 8787. Overridable via a global. ----
import { mcpServersFromSettings, mcpToolName, mcpResultText } from "./mcpNames.js"; // Phase 3 MCP (opt-in)
import { toolsUnsupportedErr } from "./toolSupport.js"; // only cache "no tools" on a definitive signal
import { runDeepResearch } from "./deepResearch.js"; // Phase 2: client-orchestrated multi-search research
import { resolveProviderOnline } from "./providerPing.js"; // online/offline chip: proxy fallback
import { buildKnowledgeContext } from "./ragLite.js"; // Phase 2: RAG-lite project knowledge
import { agentMemoryBlock, addAgentNote, recordAgentRun, getAgentMem, getAgentHistory, getAgentStats } from "./agentMemory.js"; // Phase 2 + Agent Ops (A1)
const AUTH_BASE = (() => {
  if (typeof window !== "undefined" && window.__MADAV_AUTH_BASE__) return String(window.__MADAV_AUTH_BASE__).replace(/\/+$/, "");
  if (typeof location !== "undefined" && location.port === "5180") return "http://127.0.0.1:8787";
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
// ---- Project (Workroom) records sync (Phase 2; mirrors the workspace blob above) — Workrooms follow the account ----
const pjHash = (d) => { const str = JSON.stringify(d || {}); let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return String(h) + ":" + str.length; };
let _pjLast = "", _pjTimer = null;
async function pjPull() {
  try {
    const s = loadSettings();
    if (s.projectsSync === false || !getToken()) return;
    const r = await fetch(api("/projects"), { headers: authHeaders() }).then((x) => x.json()).catch(() => null);
    if (!r || r.error) return;
    const local = LS.get("be.projects", {});
    if (!r.data) { if (Object.keys(local).length) { _pjLast = ""; pjMaybePush(); } else _pjLast = pjHash(local); return; }
    if ((r.updatedAt || 0) <= (s.projectsSyncedAt || 0)) { _pjLast = pjHash(local); return; }
    LS.set("be.projects", r.data);
    LS.set(SETTINGS_KEY, { ...loadSettings(), projectsSyncedAt: r.updatedAt });
    _pjLast = pjHash(r.data);
  } catch {}
}
function pjMaybePush() {
  try {
    const s = loadSettings();
    if (s.projectsSync === false || !getToken()) return;
    if (pjHash(LS.get("be.projects", {})) === _pjLast) return;
    clearTimeout(_pjTimer);
    _pjTimer = setTimeout(async () => {
      try {
        const data = LS.get("be.projects", {});
        const h2 = pjHash(data);
        if (h2 === _pjLast) return;
        const r = await fetch(api("/projects"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ data }) }).then((x) => x.json()).catch(() => null);
        if (r && r.ok) { _pjLast = h2; LS.set(SETTINGS_KEY, { ...loadSettings(), projectsSyncedAt: r.updatedAt }); }
      } catch {}
    }, 4000);
  } catch {}
}
// be.projects writer that also schedules a sync push — used by every Workroom mutation.
const wrSaveProjects = (all) => { LS.set("be.projects", all); pjMaybePush(); return all; };
// ---- Chat sync (mirror of electron/chat-sync.cjs) — conversations follow the account across devices ----
let _chatLast = "", _chatTimer = null;
const CHAT_MAX_CONVS = 100, CHAT_MAX_MSGS = 300;
const chatHash = (items, tomb) => items.map((c) => c.id + ":" + (c.updatedAt || 0)).join("|") + "#" + (tomb || []).map((t) => t.id + ":" + (t.deletedAt || 0)).join("|");
function getChatTombstones() { const a = LS.get("be.chatTomb", []); return Array.isArray(a) ? a : []; }
function recordChatTombstone(id) { if (!id) return; const t = getChatTombstones().filter((x) => x && x.id !== id); t.push({ id, deletedAt: Date.now() }); LS.set("be.chatTomb", t.slice(-1000)); }
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
    const remoteTomb = Array.isArray(r.data.tombstones) ? r.data.tombstones : [];
    const tmap = new Map();
    for (const t of [...getChatTombstones(), ...remoteTomb]) { if (!t || !t.id) continue; const p = tmap.get(t.id); if (!p || (t.deletedAt || 0) > (p.deletedAt || 0)) tmap.set(t.id, { id: t.id, deletedAt: t.deletedAt || 0 }); }
    let merged = 0;
    for (const it of r.data.items) {
      if (!it || !it.id || !Array.isArray(it.messages)) continue;
      const tb = tmap.get(it.id); if (tb && (tb.deletedAt || 0) >= (it.updatedAt || 0)) continue; // suppressed by a newer deletion
      const local = await idbGet(it.id);
      if (!local || (it.updatedAt || 0) > (local.updatedAt || 0)) { try { await idbPut(it); merged++; } catch {} }
    }
    let purged = 0;
    for (const [id, t] of [...tmap]) { const local = await idbGet(id); if (local && (t.deletedAt || 0) >= (local.updatedAt || 0)) { try { await idbDel(id); purged++; } catch {} } else if (local && (local.updatedAt || 0) > (t.deletedAt || 0)) { tmap.delete(id); } }
    LS.set("be.chatTomb", [...tmap.values()].slice(-1000));
    _chatLast = chatHash(await chatItems(), getChatTombstones());
    if (merged || purged) { try { window.dispatchEvent(new CustomEvent("madav:historychanged")); } catch {} }
  } catch {}
}
function chatMaybePush() {
  clearTimeout(_chatTimer);
  _chatTimer = setTimeout(async () => {
    try {
      const s = loadSettings();
      if (s.chatSync === false || !getToken()) return;
      const items = await chatItems(); const tombstones = getChatTombstones(); const h = chatHash(items, tombstones);
      if (h === _chatLast) return;
      const r = await fetch(api("/conversations"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ items, tombstones }) }).then((x) => x.json()).catch(() => null);
      if (r && r.ok) _chatLast = h;
    } catch {}
  }, 4000);
}
async function chatPushNow() {
  try {
    const s = loadSettings();
    if (s.chatSync === false || !getToken()) return;
    const items = await chatItems(); const tombstones = getChatTombstones(); const h = chatHash(items, tombstones);
    const r = await fetch(api("/conversations"), { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ items, tombstones }) }).then((x) => x.json()).catch(() => null);
    if (r && r.ok) _chatLast = h;
  } catch {}
}
async function chatLaunchSync() { await chatPull(); await chatPushNow(); } // download remote, then upload our local (old) chats
setTimeout(wsPull, 1500);
setTimeout(pjPull, 1500); // P2: account Workrooms -> this browser // account workspace → this browser, shortly after load
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
  "You are Madav, a warm and helpful AI assistant built by the Madav team. You are NOT any other AI assistant or model; if anyone asks who you are or who made you, you are Madav. Reply naturally and conversationally, the way a thoughtful person would. " +
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
const AMEM_KEY = "be.agentMemory"; // per-agent memory + track record (Phase 2)
function amGet() { try { const m = JSON.parse(localStorage.getItem(AMEM_KEY) || "{}"); return (m && typeof m === "object") ? m : {}; } catch { return {}; } }
function amSave(m) { try { localStorage.setItem(AMEM_KEY, JSON.stringify(m || {})); } catch {} return m; }
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

async function systemPrompt(s, projectId, query = "") {
  // dataToolsRule is added UNCONDITIONALLY here — the SAME single-source recipe the folder/Project path
  // uses (compute the values in a script, build the real .xlsx). Same logic, every chat surface.
  const parts = [BASE_BEHAVIOR + ARTIFACT_RULE + ANSWER_DIRECT_RULE + officeRulePart(s) + dataToolsRule({ shell: false })];
  // Web-search answer guidance — the SAME shared rule desktop uses (core/agent-rules.js SEARCH_ANSWER_RULE),
  // so web's chat answers match desktop's depth. One source, both surfaces. Added when web search is available.
  if (getToken()) parts.push(SEARCH_ANSWER_RULE);
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}, regardless of the language of the question.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  if (!projectId) { const um = umBlock(s); if (um) parts.push(um); } // projects stay scoped — no cross-chat memory (it can carry OTHER projects' paths/facts)
  if (projectId) {
    const p = LS.get("be.projects", {})[projectId];
    if (p) {
      if (p.instructions) parts.push(p.instructions);
      const kdocs = (p.knowledge || []).filter((k) => k.type === "text" && k.content).map((k) => ({ name: k.name, content: k.content }));
      // RAG: flag-guarded single-source upgrade to the shared @madav/knowledge engine (hybrid + local embedder),
      // matching desktop. MADAV_KNOWLEDGE!=="1" -> the legacy keyword RAG-lite, unchanged. Any failure falls back.
      let kctx = "";
      try { if (localStorage.getItem("MADAV_KNOWLEDGE") === "1") { const { buildProjectContextWeb } = await import("./knowledgeContextWeb.js"); kctx = await buildProjectContextWeb(query, kdocs); } } catch {}
      if (!kctx) kctx = buildKnowledgeContext(query, kdocs); // RAG-lite: whole docs when small; ranked excerpts when large
      if (kctx) parts.push(kctx);
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
    agentKnowledgeBlock(a) + agentMemoryBlock(amGet(), a.id);
}

// ===== Agent teams on the web (multi-agent: relay + manager) =====
// Members run instruction-level here (browser can't spawn MCP/terminal — desktop runs them
// with full tools). Same UiEvent shapes as desktop so the chat timeline renders identically.
function memberSys(m) {
  return `You are "${m.name}", one agent on a team inside Madav. You are Madav — not any other AI assistant or model; if asked who you are or who made you, you are Madav.` +
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
  try { if (mcpServersFromSettings(loadSettings()).length) await ensureMcpForSession(sess); } catch {}
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
          { role: "system", content: `You are Madav's team coordinator (not any other AI assistant or model). Team roster:\n${roster}\n\nSplit the user's mission into one focused sub-task per useful member (skip members that add nothing). Reply with ONLY a JSON array, no prose: [{"member":"<exact member name>","task":"<specific, self-contained sub-task>"}]` },
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
        return runMemberWithTools(step.member, profFor(step.member), task, sess)
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
        try { out = await runMemberWithTools(step.member, profFor(step.member), task, sess); }
        catch (e) { if (e && e.name === "AbortError") throw e; out = "(member failed: " + String((e && e.message) || e) + ")"; }
        outputs.push({ name: step.member.name, text: out || "(no output)" });
        emit(sess.id, "tool_result", { id: stepId, output: (out || "(no output)").slice(0, 4000) });
      }
    }
    let finalText = "";
    if (team.mode === "manager" && outputs.length > 1) {
      const body = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
      const { text: ft } = await callModel(prof, [
        { role: "system", content: "You are Madav's team coordinator (not any other AI assistant or model). Synthesize your team's work into ONE clear, complete answer to the user's mission. Credit no one; just deliver the result. Do not mention the team mechanics." },
        { role: "user", content: `Mission:\n${text}\n\nTeam output:\n${body}` },
      ], sess.ac.signal, (d) => emit(sess.id, "assistant_delta", { text: d }));
      finalText = ft;
    } else {
      finalText = (outputs[outputs.length - 1] || {}).text || "(the team produced no output)";
      emit(sess.id, "assistant_delta", { text: finalText });
    }
    sess.messages.push({ role: "user", content: text });
    sess.messages.push({ role: "assistant", content: finalText, model: prof.model, provider: prof.name });
    emit(sess.id, "assistant_message", { stop_reason: "end_turn" });
    maybeAutoTitle(sess, text, finalText);
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
// Model Routing (web): build THIS turn's routing context — category (from surface + image) + the configured
// profiles + the user's per-category chains — so the SHARED router can walk the fallback chain. Browser
// settings live on-device, so web passes them in opts (desktop reads its settings file instead).
function routingCtx(sess, modeHint) {
  let cfg = {}; try { cfg = loadSettings() || {}; } catch {}
  const msgs = (sess && sess.messages) || [];
  const hasImage = msgs.some((m) => Array.isArray(m.images) && m.images.length > 0);
  const mode = modeHint || (sess && sess.mode) || "chat";
  let category = "general"; try { category = mrCategoryFor({ mode, hasImage, needsData: false }); } catch {}
  return { category, profiles: cfg.profiles || {}, routing: cfg.modelRouting || {} };
}
// Wrap a stream fn so every call carries this turn's routing context (category + the chains to walk).
const withRoute = (fn, ctx, hasTools) => hasTools
  ? (p, m, t, o = {}) => fn(p, m, t, { ...o, ...ctx })
  : (p, m, o = {}) => fn(p, m, { ...o, ...ctx });

async function callModel(prof, messages, signal, onDelta, ctx = {}) {
  const od = onDelta || (() => {});
  try { return await streamChat(prof, messages, { onDelta: od, signal, ...ctx }); }
  catch (e) {
    if (isNetworkErr(e) && getToken()) return await streamChat(prof, messages, { onDelta: od, signal, proxy: proxyCfg(), ...ctx });
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
    `You are Madav, collaborating on the user's local folder "${webfs.rootLabel()}" directly from their browser. You are NOT any other AI assistant or model; if anyone asks who you are or who made you, you are Madav.`,
    `Use the provided tools to list, read, write, and edit files. All paths are relative to the folder root (use "" for the root).`,
    dataToolsRule({ shell: false }),
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
import { WEB_SEARCH_SCHEMA, WEB_FETCH_SCHEMA, CREATE_IMAGE_SCHEMA, DEEP_RESEARCH_SCHEMA } from "../../core/chat-tools.js"; // single source for shared chat tool schemas
const COWORK_TOOLS = [
  { type: "function", function: { name: "list_dir", description: "List files and folders at a path relative to the project root. Use \"\" for the root.", parameters: { type: "object", properties: { path: { type: "string" } } } } },
  { type: "function", function: { name: "list_files", description: "List ALL file paths in the project recursively (skips node_modules/.git).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 text file's full contents.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "search", description: "Search for text across all files. Returns matching paths with line numbers.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file with the given content.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first occurrence of `find` with `replace` in a file.", parameters: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } } },
  { type: "function", function: { name: "delete_file", description: "Delete a file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  WEB_FETCH_SCHEMA,
  WEB_SEARCH_SCHEMA,
  DEEP_RESEARCH_SCHEMA,
  { type: "function", function: { name: "spawn_subagent", description: "Delegate a focused sub-task to a helper agent that works on the same project and returns a summary. Use for independent chunks of work (e.g. 'write tests for X').", parameters: { type: "object", properties: { task: { type: "string", description: "Clear, self-contained instructions for the sub-agent." } }, required: ["task"] } } },
  CREATE_IMAGE_SCHEMA,
  { type: "function", function: { name: "run_python", description: "Run a Python script IN THE BROWSER (pandas + openpyxl available) — the web equivalent of a terminal, for DATA work. The project's files are mounted in the working directory, so read them by name (e.g. pandas.read_excel(\"Backlog.xlsx\")). Any file the script writes (e.g. an .xlsx report) is saved back into the project folder. Use this to join/aggregate spreadsheets and build .xlsx/.csv outputs instead of computing by hand.", parameters: { type: "object", properties: { code: { type: "string", description: "Python source to run." } }, required: ["code"] } } },
  { type: "function", function: { name: "remember", description: "Save a durable learning to your long-term agent memory so you recall it on FUTURE runs (a user preference, a fact about their setup, a lesson from this task). Use sparingly for things worth remembering beyond this conversation; never store secrets or one-off content.", parameters: { type: "object", properties: { note: { type: "string" } }, required: ["note"] } } },
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
    const _ss = loadSettings(); // bring-your-own search key (Search Engine Settings) overrides the house key on the server
    const r = await fetch(api("/proxy/fetch"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url, query, searchProvider: _ss.searchProvider || "auto", searchKey: _ss.searchKey || "" }) });
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
  if (name && name.startsWith("mcp__")) {
    const entry = (sess && sess.mcpRegistry && sess.mcpRegistry[name]) || null;
    if (!entry) return "Unknown MCP tool: " + name;
    return await mcpCallTool(entry.server, entry.realName, args || {});
  }
  switch (name) {
    case "list_dir": return JSON.stringify(await webfs.listDir(args.path || ""));
    case "list_files": { const f = await webfs.walk(); return f.length ? f.join("\n") : "(empty)"; }
    case "read_file": { const t = await webfs.readFile(args.path); return t.length > 60000 ? t.slice(0, 60000) + "\n…(truncated)" : t; }
    case "run_python": {
      const files = [];
      try {
        for (const e of await webfs.listDir("")) {
          if (e.type === "dir") continue;
          try {
            if (/\.(xlsx|xlsm|xls|png|jpe?g|gif|pdf|zip|parquet|bin)$/i.test(e.name)) files.push({ name: e.name, encoding: "base64", content: await webfs.readBinaryB64(e.name) });
            else { const t = await webfs.readFile(e.name); if (t.length < 2000000) files.push({ name: e.name, encoding: "utf8", content: t }); }
          } catch {}
        }
      } catch {}
      const r = await runPython(args.code || "", files);
      const written = [];
      for (const fl of (r.files || [])) { try { await webfs.writeBinaryB64(fl.name, fl.base64); written.push(fl.name); if (sess) { recordCheckpoint(sess, "create", fl.name, "", "(binary file)"); sess.outputs = sess.outputs || []; sess.outputs.push({ name: fl.name, b64: fl.base64 }); emit(sess.id, "file_output", { name: fl.name, b64: fl.base64 }); } } catch {} }
      let msg = (r.stdout || "").trim();
      if (!r.ok && r.stderr) msg += (msg ? "\n" : "") + "ERROR:\n" + r.stderr.trim();
      if (written.length) msg += (msg ? "\n\n" : "") + "Saved to the folder: " + written.join(", ");
      return msg || (r.ok ? "(ran — no output)" : "(failed)");
    }
    case "search": { const r = await webfs.search(args.query || ""); return r.length ? r.map((x) => `${x.path}:${x.line}: ${x.text}`).join("\n") : "No matches."; }
    case "write_file": { let old = ""; try { old = await webfs.readFile(args.path); } catch {} await webfs.writeFile(args.path, args.content ?? ""); recordCheckpoint(sess, old ? "edit" : "create", args.path, old, args.content ?? ""); return makeDiff(args.path, old, args.content ?? ""); }
    case "edit_file": { const before = await webfs.readFile(args.path); await webfs.editFile(args.path, args.find, args.replace); const after = await webfs.readFile(args.path); recordCheckpoint(sess, "edit", args.path, before, after); return makeDiff(args.path, before, after); }
    case "delete_file": { let before = ""; try { before = await webfs.readFile(args.path); } catch {} await webfs.deleteFile(args.path); recordCheckpoint(sess, "delete", args.path, before, null); return "deleted " + args.path; }
    case "web_fetch": return await webFetch({ url: args.url });
    case "web_search": return await webFetch({ query: args.query });
    case "deep_research": return await runDeepResearch({ query: args.query, queries: args.queries }, (term) => webFetch({ query: term }));
    case "remember": { const ag = ctx && ctx.sess && ctx.sess.agent; if (!ag || !ag.id) return "(Memory is kept only for custom agents.)"; amSave(addAgentNote(amGet(), ag.id, args.note || args.text || "")); return "Saved to your agent memory."; }
    case "load_skill": { const sk = skillByName(String(args.name || "").trim()); return sk ? sk.body : `No skill named "${args.name}". Available: ${allSkills().map((x) => x.name).join(", ") || "(none)"}`; }
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
async function runAgentTurn(sess, text, images, prof) {
  sess.messages.push({ role: "user", content: userContent(text, images) });
  if (!sess.title) sess.title = text.slice(0, 60);
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind, cwd: sess.cwd });
  // ADR-0001 / M2d — folder-agentic chat runs through the SHARED core loop (single source, desktop + web).
  // The legacy in-bridge tool loop + the MADAV_CORE_CHAT flag guard were RETIRED here once the core path
  // was validated (flag-on Render shakeout). netFb retries once via the server proxy on a network error.
  // See docs/adr/0001-M2d-WEB-CUTOVER-PLAN.md.
  try { if (mcpServersFromSettings(loadSettings()).length) await ensureMcpForSession(sess); } catch {}
  const netFb = (fn) => async (...a) => { const o = a[a.length - 1] || {}; try { return await fn(...a); } catch (e) { if (isNetworkErr(e) && getToken()) { a[a.length - 1] = { ...o, proxy: proxyCfg() }; return await fn(...a); } throw e; } };
  try {
    const rc = routingCtx(sess, "cowork");
    await runWebChatTurnViaCore({
      streamChatTools: withRoute(netFb(streamChatTools), rc, true), streamChat: withRoute(netFb(streamChat), rc, false),
      executeTool, webGenImage, emit, sessId: sess.id, sess,
      // Folder-agentic path: the core loop gets the FULL tool set (file tools, run_python, …).
      tools: [...activeTools(), ...(sess.mcpTools || [])],
      history: sess.messages, profile: prof, signal: sess.ac.signal,
    });
    persistSession(sess);
  } catch (e) {
    if (e && e.name === "AbortError") { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
}

// ===== Web "Let's Chat" tool loop: web_search / web_fetch / create_image (no folder, no file tools) =====
// Mirrors desktop's lightweight chat-agent path. Engaged only for OpenAI-style models on a plain
// (non-project, non-team, non-folder) chat. Falls back to a normal streamed reply if the model can't
// tool-call (and remembers that model so it won't retry-and-fail on every message).
const CHAT_TOOLS = COWORK_TOOLS.filter((t) => ["web_fetch", "web_search", "create_image", "deep_research", "remember"].includes(t.function.name));
// UNIFY (owner: same logic on every chat surface): Let's Chat gets the SAME in-browser Python tool the
// folder/Project path already has, so a spreadsheet/data ask runs the reliable compute-the-values script
// here too. The only difference vs a Project stays the working area (scratch + Download vs a folder).
const RUN_PYTHON_TOOL = COWORK_TOOLS.find((t) => t.function.name === "run_python");
const modelKey = (prof) => (prof && (prof.baseUrl || "") + "::" + (prof.model || "")) || "";
// Models that DEFINITIVELY rejected tool-calling -> use plain chat. TTL'd, and recorded ONLY on a
// clear "tools unsupported" error (never a transient network/rate error) so a single hiccup can't
// silently disable tools (and MCP) for the whole session.
const noToolModels = new Map(); // key -> expiresAt (ms)
const NO_TOOL_TTL = 60 * 60 * 1000; // 1 hour, then re-try tools
const noToolUntil = (prof) => { const t = noToolModels.get(modelKey(prof)); return !!(t && t > Date.now()); };
const markNoTools = (prof) => noToolModels.set(modelKey(prof), Date.now() + NO_TOOL_TTL);
function activeChatTools() {
  let on = true;
  try { on = FEAT_IMAGEGEN && ((loadSettings().extras) || {}).imagegen !== false; } catch {}
  return on ? CHAT_TOOLS : CHAT_TOOLS.filter((t) => t.function.name !== "create_image");
}
// ---- Phase 3: MCP connector tools on web (opt-in via settings.mcpServers; default off) -----------
// Lists/calls a remote MCP server's tools THROUGH the server broker (/mcp/*), which enforces auth +
// SSRF. Loaded once per session, fail-open. With no server configured, none of this runs.
async function mcpListTools(server) {
  const r = await fetch(api("/mcp/tools"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ id: server.id, transport: server.transport, url: server.url, headers: server.headers }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || ("mcp/tools " + r.status));
  return Array.isArray(j.tools) ? j.tools : [];
}
async function mcpCallTool(server, name, args) {
  const r = await fetch(api("/mcp/call"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ id: server.id, transport: server.transport, url: server.url, headers: server.headers, name, args: args || {} }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return "MCP error: " + (j.error || r.status) + (j.detail ? " - " + j.detail : "");
  return mcpResultText(j.result);
}
// ---- Web connector OAuth (P3.4.5 R3): drive the realigned /connectors/* routes. The server brokers the
// SAME MCP-SDK OAuth desktop runs (electron/mcp-oauth.cjs); tokens stay server-side in the vault, never here.
// Sign-in opens provider consent in a popup, then polls status until the server callback has sealed tokens.
const connServer = (s) => ({ id: s.id, url: s.url, transport: s.transport || "http", headers: s.headers || s.env });
async function connectorStatusReq(serverId) {
  if (!getToken()) return { connected: false, registered: false };
  try {
    const r = await fetch(api("/connectors/status?id=" + encodeURIComponent(serverId || "")), { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    return { connected: !!j.connected, registered: !!j.registered };
  } catch { return { connected: false, registered: false }; }
}
async function connectorSignOutReq(serverId) {
  if (!getToken()) return { ok: true };
  try { await fetch(api("/connectors/signout"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ id: serverId }) }); } catch {}
  return { ok: true };
}
async function testConnectorWeb(server) {
  if (!getToken()) return { ok: false, error: "Sign in to Madav first." };
  if (!server || !server.url) return { ok: false, error: "Testing is for remote (URL) connectors; local commands run in the desktop app." };
  try { const tools = await mcpListTools(connServer(server)); return { ok: true, tools: tools.map((t) => t.name) }; }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}
async function connectorSignInWeb(server) {
  if (!getToken()) return { ok: false, error: "Sign in to Madav first." };
  if (!server || !server.url) return { ok: false, error: "Sign-in is only for remote (URL) connectors." };
  let j;
  try {
    const r = await fetch(api("/connectors/signin"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ server: connServer(server) }) });
    j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || ("signin " + r.status) };
  } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  if (j.alreadyConnected) { let tools = []; try { tools = (await mcpListTools(connServer(server))).map((t) => t.name); } catch {} return { ok: true, tools }; }
  if (!j.authorizeUrl) return { ok: false, error: j.error || "This connector didn't start an OAuth sign-in." };
  let popup = null; try { popup = window.open(j.authorizeUrl, "madav_oauth", "width=520,height=680"); } catch {}
  if (!popup) return { ok: false, error: "Pop-up blocked — allow pop-ups for this site, then try again." };
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await new Promise((res) => setTimeout(res, 1500));
    let st = { connected: false }; try { st = await connectorStatusReq(server.id); } catch {}
    if (st.connected) { try { popup.close(); } catch {} let tools = []; try { tools = (await mcpListTools(connServer(server))).map((t) => t.name); } catch {} return { ok: true, tools }; }
    try { if (popup.closed) return { ok: false, error: "Sign-in window was closed before completing." }; } catch {}
  }
  try { popup.close(); } catch {}
  return { ok: false, error: "Sign-in timed out — please try again." };
}
async function ensureMcpForSession(sess) {
  if (sess.mcpLoaded) return;
  sess.mcpLoaded = true; sess.mcpTools = []; sess.mcpRegistry = {};
  for (const server of mcpServersFromSettings(loadSettings())) {
    let tools = [];
    try { tools = await mcpListTools(server); } catch { tools = []; }
    for (const t of tools) {
      if (!t || !t.name) continue;
      const pname = mcpToolName(server.id, t.name);
      sess.mcpRegistry[pname] = { server, realName: t.name };
      sess.mcpTools.push({ type: "function", function: { name: pname, description: ("[" + server.id + "] " + (t.description || "")).slice(0, 1024), parameters: t.inputSchema || { type: "object", properties: {} } } });
    }
  }
}
async function callChatTools(prof, messages, onDelta, signal, extraTools) {
  const tools = activeChatTools().concat(extraTools || []);
  try { return await streamChatTools(prof, messages, tools, { onDelta, signal }); }
  catch (e) { if (isNetworkErr(e) && getToken()) return await streamChatTools(prof, messages, tools, { onDelta, signal, proxy: proxyCfg() }); throw e; }
}
// Today's plain streamed reply — the safe fallback when tool-calling isn't supported. Assumes the
// user message is already on sess.messages.
async function plainReply(sess, text, prof, started) {
  let streamed = false;
  let usedModel = prof.model, usedProvider = prof.name; // Stage 4: the model that ACTUALLY answered (differs after a reroute)
  const { text: reply } = await callModel(prof, sess.messages, sess.ac.signal, (chunk) => { if (chunk) { streamed = true; emit(sess.id, "assistant_delta", { text: chunk }); } }, { ...routingCtx(sess), onFallback: (m) => { usedModel = m.model; usedProvider = m.name || usedProvider; try { emit(sess.id, "init", { model: usedModel, provider: usedProvider, kind: prof.kind, rerouted: true }); } catch {} } });
  if (!streamed && reply) emit(sess.id, "assistant_delta", { text: reply });
  sess.messages.push({ role: "assistant", content: reply || "", model: usedModel, provider: usedProvider });
  emit(sess.id, "assistant_message", { stop_reason: "end_turn" });
  emit(sess.id, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
  persistSession(sess);
  maybeAutoTitle(sess, text, reply);
  umLearn(prof, loadSettings(), text, reply);
}
async function runChatAgentTurn(sess, text, images, prof) {
  sess.messages.push({ role: "user", content: userContent(text, images) });
  if (!sess.title) sess.title = text.slice(0, 60);
  sess.ac = new AbortController();
  emit(sess.id, "init", { model: prof.model, provider: prof.name, kind: prof.kind });
  const started = Date.now();
  try { if (mcpServersFromSettings(loadSettings()).length) await ensureMcpForSession(sess); } catch {}
  // ADR-0001 — plain "Let's Chat" now runs on the SHARED core engine (same as desktop chat + Let's
  // Collaborate), with the lightweight chat tool set. This ends the web↔desktop divergence and brings
  // the nudge, compaction and loop-breaker to web chat. A hard tool-calling failure degrades to a plain reply.
  const netFb = (fn) => async (...a) => { const o = a[a.length - 1] || {}; try { return await fn(...a); } catch (e) { if (isNetworkErr(e) && getToken()) { a[a.length - 1] = { ...o, proxy: proxyCfg() }; return await fn(...a); } throw e; } };
  try {
    const rc = routingCtx(sess);
    const res = await runWebChatTurnViaCore({
      streamChatTools: withRoute(netFb(streamChatTools), rc, true), streamChat: withRoute(netFb(streamChat), rc, false),
      executeTool, webGenImage, emit, sessId: sess.id, sess,
      tools: [...activeChatTools(), ...(RUN_PYTHON_TOOL ? [RUN_PYTHON_TOOL] : []), ...(sess.mcpTools || [])],
      history: sess.messages, profile: prof, signal: sess.ac.signal,
    });
    maybeAutoTitle(sess, text, (res && res.text) || "");
    umLearn(prof, loadSettings(), text, (res && res.text) || "");
    persistSession(sess);
  } catch (e) {
    if (e && e.name === "AbortError") { emit(sess.id, "result", { subtype: "interrupted" }); return; }
    if (toolsUnsupportedErr(e)) { markNoTools(prof); return await plainReply(sess, text, prof, started); }
    emit(sess.id, "error", { message: String((e && e.message) || e) });
    emit(sess.id, "result", { subtype: "error" });
  }
}

// Team members on the web get the same lightweight tools as chat (web_search/web_fetch/create_image)
// so they can research + make images instead of being text-only. Bounded loop; tool steps are tagged
// with the member name. Falls back to a plain reply if the model can't tool-call.
async function runMemberWithTools(member, prof, task, sess) {
  const msgs = [{ role: "system", content: memberSys(member) }, { role: "user", content: task }];
  const sig = sess && sess.ac ? sess.ac.signal : undefined;
  const tools = activeChatTools().concat((sess && sess.mcpTools) || []);
  const plain = async () => { const r = await callModel(prof, msgs, sig); return (r && r.text) || ""; };
  let usedTools = false;
  for (let step = 0; step < 6; step++) {
    let res;
    try {
      res = await streamChatTools(prof, msgs, tools, { onDelta: () => {}, signal: sig });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      if (isNetworkErr(e) && getToken()) {
        try { res = await streamChatTools(prof, msgs, tools, { onDelta: () => {}, signal: sig, proxy: proxyCfg() }); }
        catch (e2) { if (e2 && e2.name === "AbortError") throw e2; if (!usedTools) return await plain(); throw e2; }
      } else if (!usedTools) { return await plain(); }
      else throw e;
    }
    const { content, toolCalls } = res;
    if (!toolCalls || !toolCalls.length) return content || "";
    usedTools = true;
    msgs.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
    for (const c of toolCalls) {
      const args = (tolerantParse(c.arguments || "{}").value) || {};
      const label = "↳ " + member.name + ": " + c.name;
      if (sess) emit(sess.id, "tool_use", { id: c.id, name: label, input: args, auto: true });
      let out, image = null;
      if (c.name === "create_image") {
        try { image = await webGenImage(prof, args.prompt); out = "Image generated and shown to the user."; }
        catch (e) { out = "ERROR: " + String((e && e.message) || e); }
      } else {
        try { out = await executeTool(c.name, args, { sess }); }
        catch (e) { out = "Error: " + String((e && e.message) || e); }
      }
      if (sess) emit(sess.id, "tool_result", { id: c.id, name: label, ok: true, output: String(out).slice(0, 2000), image });
      msgs.push({ role: "tool", tool_call_id: c.id, content: headTail(String(out), { maxChars: 12000, headLines: 200, tailLines: 100 }) });
    }
  }
  return await plain();
}

// Claude-style: title a chat from its FIRST exchange. Fire-and-forget, fail-open (a failure or empty
// result keeps the provisional first-message title). Never blocks the reply.
async function maybeAutoTitle(sess, userText, replyText) {
  try {
    if (!sess || sess.autoTitled) return;
    sess.autoTitled = true; // set immediately so a later turn can never double-fire
    if ((sess.messages || []).filter((m) => m.role === "user").length > 1) return; // first exchange only
    const u = String(userText || "").slice(0, 500); if (!u) return;
    const prof = sess.profile || activeProfile(loadSettings());
    if (!prof || !prof.baseUrl || !prof.model) return;
    const { text: t } = await streamChat(prof, [
      { role: "system", content: "Generate a short, specific chat title of 3 to 6 words for the user's request. Reply with ONLY the title \u2014 no quotes, no trailing punctuation, no preamble or reasoning." },
      { role: "user", content: `First message:\n${u}\n\nReply (start):\n${String(replyText || "").slice(0, 400)}\n\nTitle:` },
    ], { onDelta: () => {} });
    let title = String(t || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    title = (title.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || "");
    title = title.replace(/^["\'`*\s]+|["\'`*\s]+$/g, "").replace(/[.]+$/, "").slice(0, 60).trim();
    if (!title) return;
    sess.title = title;
    persistSession(sess);
    emit(sess.id, "convtitle", { conversationId: sess.id, title });
  } catch {}
}

// WEB project report engine (flag-gated; default OFF). Runs the SAME core engine desktop uses, in the
// browser via Pyodide, when a project task wants a data FILE and a folder is selected. Turn on in the
function projInstructions(id) {
  try { const ps = LS.get("be.projects", {}); const p = Array.isArray(ps) ? ps.find((x) => x && x.id === id) : (ps && ps[id]); return (p && p.instructions) || ""; } catch { return ""; }
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
  // Plain "Let's Chat" on web gets a lightweight tool loop (web_search/web_fetch/create_image) for
  // OpenAI-style models, when no images, not a Project, and a tool is actually useful (signed in or
  // image-gen on). Anthropic + tool-incapable models fall through to the normal reply below.
  {
    const imagegenOn = FEAT_IMAGEGEN && ((s.extras) || {}).imagegen !== false;
    const mcpOn = mcpServersFromSettings(s).length > 0;
    if (prof.kind !== "anthropic" && !sess.projectId && !(images && images.length)
        && !noToolUntil(prof) && (!!getToken() || imagegenOn || mcpOn)) {
      return runChatAgentTurn(sess, text, images, prof);
    }
  }
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
    sess.messages.push({ role: "assistant", content: reply || "", model: prof.model, provider: prof.name });
    emit(sess.id, "assistant_message", { stop_reason: "end_turn" });
    emit(sess.id, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
    persistSession(sess);
    // Step 4/5 — capture: a project reply that produced an officedoc deliverable becomes a reusable recipe.
    maybeAutoTitle(sess, text, reply); // Claude-style smart title from the first exchange (async, fail-open)
    if (!sess.projectId) umLearn(prof, loadSettings(), text, reply); // cross-chat memory — NOT from project runs, so a project's facts never leak into other chats
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
  // Stamp a time on any message lacking one so web chats show timestamps like desktop (the core loop + the
  // officedoc path push messages without `at`). New turns get ~now; only pre-existing untimed messages are
  // approximated. Cheap; runs after every turn.
  try { const now = Date.now(); for (const m of (sess.messages || [])) { if (m && m.role && !m.at) m.at = now; } } catch {}
  const rec = { id: sess.id, mode: sess.mode || "code", title: sess.title || "Untitled", updatedAt: Date.now(),
    messages: sess.messages, projectId: sess.projectId || null, convId: sess.convId || null,
    model: (sess.profile && sess.profile.model) || null, provider: (sess.profile && sess.profile.name) || null,
    agent: sess.agent || null, team: sess.team ? { name: sess.team.name, mode: sess.team.mode, members: sess.team.members, identity: sess.team.identity } : null,
    outputs: sess.outputs || [] }; // file cards (Pyodide-produced .xlsx etc. with b64) so they survive reopen — parity with desktop
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
// Honest note injected into WEB Projects turns: the web has no linked local folder and no file tools
// (those are desktop-only), so the assistant sets expectations instead of silently degrading (P0-1).
const WEB_PROJECT_NOTE = "NOTE ON THIS ENVIRONMENT: You are in Madav Web Projects. You have this project's text knowledge, but there is NO linked local folder here, so you cannot read or compute over the user's own local data files and cannot save a file into a folder; that needs the Madav desktop app, or 'Let's Collaborate' with a folder the user picks. You CAN still create real, downloadable files (spreadsheets, Word docs, PDFs, slide decks) with your normal office capability when asked - they download in the browser. So make files normally; only point the user to the desktop app or Let's Collaborate when they need work over their EXISTING local folder data.";

// ---- Phase 3 S4: scheduled-task adapter — the SHARED Scheduler.jsx UI <-> server /tasks routes.
// Maps the rich desktop task shape to the minimal server record and back; runs go through the managed
// runner (server). Desktop-only helpers (keep-awake, webhooks, adaptive setup) no-op gracefully here.
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };
const toUiTask = (t) => t && ({
  id: t.id, name: t.name || t.title || "", description: t.description || "", prompt: t.prompt || "",
  model: t.model || "", schedule: t.schedule || { mode: "off" }, target: t.target || { type: "chat" },
  permission: t.permission || "ask", group: t.group || "", lastRun: t.lastRunAt || 0,
});
const mapRun = (r) => ({ status: r && r.ok ? "success" : "error", output: (r && (r.output || r.error)) || "", at: (r && (r.startedAt || r.finishedAt)) || 0 });
async function tasksApi(path, opts) {
  if (!getToken()) return null; // task features require sign-in (same posture as workspace/projects sync)
  try {
    const r = await fetch(api(path), { ...(opts || {}), headers: authHeaders({ "Content-Type": "application/json", ...((opts && opts.headers) || {}) }) });
    return await r.json().catch(() => ({}));
  } catch { return null; }
}

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
      let sys = agentic ? coworkSystem(s) : await systemPrompt(s, req.projectId, req.prompt || "");
      // WEB Projects have no linked local folder / no file tools (desktop-only). Be honest rather than
      // silently giving a tool-less reply (WEB-VS-DESKTOP P0-1). Discussion + text knowledge still work.
      if (!agentic && req.projectId) sys = sys ? `${sys}\n\n${WEB_PROJECT_NOTE}` : WEB_PROJECT_NOTE;
      const ab = agentBlock(agent);
      if (ab) sys = sys ? `${ab}\n\n${sys}` : ab; // agent identity leads; base behavior/tool guidance follows
      if (sys) messages.push({ role: "system", content: sys }); title = "";
    }
    const sess = { id, profile: activeProfile(s), messages, mode: req.mode || "code", projectId: req.projectId || null, intent: req.intent || null, convId: id, title, agentic, cwd: req.cwd || null, agent,
      team: (req.team && Array.isArray(req.team.members) && req.team.members.length) ? req.team : null };
    sessions.set(id, sess);
    if (!prior && sess.agent && sess.agent.id) { try { amSave(recordAgentRun(amGet(), sess.agent.id)); } catch {} } // track record
    // Claude-like: title the chat from the FIRST message NOW (before the turn) so the sidebar —
    // refreshed on the init event — shows the real title the instant the turn starts. New chats only.
    if (!prior && req.prompt && !sess.title) {
      sess.title = String(req.prompt).slice(0, 60);
      try { persistSession(sess); } catch {}
    }
    // Fire-and-forget; streams events. ALWAYS save the outcome (success, error, OR interrupt) so a
    // chat backgrounded by "New chat"/navigation is never left blank/abandoned in history.
    runTurn(sess, req.prompt || "", req.images).catch(() => {}).finally(() => { try { persistSession(sess); } catch {} });
    return { sessionId: id, conversationId: id };
  },
  async sendInput(sessionId, text, images) {
    const sess = sessions.get(sessionId);
    if (!sess) return;
    runTurn(sess, text, images).catch(() => {}).finally(() => { try { persistSession(sess); } catch {} }); // always save the outcome
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
  // Local models run on the user's own machine via the desktop app (process spawn + localhost runtimes);
  // the browser can't reach them, so the web build returns a friendly "desktop only" shape that matches
  // the desktop API exactly, letting the Local Models page render identically and just show the notice.
  localModels: {
    providers: async () => [],
    detect: async () => ({ available: false, note: "Local models run in the Madav desktop app. Open the desktop app to install and run Ollama, HuggingFace, or LM Studio models on your own machine." }),
    search: async () => ({ error: "Local models are available in the Madav desktop app." }),
    list: async () => [],
    running: async () => [],
    pull: async () => ({ ok: false, error: "Local models are available in the Madav desktop app." }),
    remove: async () => ({ ok: false, error: "Local models are available in the Madav desktop app." }),
    stop: async () => ({ ok: false, error: "Local models are available in the Madav desktop app." }),
    browse: async () => [],
    system: async () => ({ totalRamGB: 0, unknown: true }),
    dockerStatus: async () => ({ installed: false, running: false, note: "Local media generation is a desktop feature." }),
    localaiStatus: async () => ({ api: false, container: "absent" }),
    localaiStop: async () => ({ ok: false, error: "Desktop only." }),
    install: async () => ({ ok: false, error: "Local models are available in the Madav desktop app." }),
    onPullProgress: () => () => {},
    onInstallProgress: () => () => {},
  },
  media: { image: async () => ({ error: "Image generation runs in the Madav desktop app." }), speech: async () => ({ error: "Voice runs in the Madav desktop app." }), transcribe: async () => ({ error: "Voice runs in the Madav desktop app." }) },
  async mcpTestServer(url, headers) {
    try {
      const r = await fetch(api("/mcp/tools"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url, headers: headers || {} }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: j.error || ("HTTP " + r.status), detail: j.detail };
      return { ok: true, count: Array.isArray(j.tools) ? j.tools.length : 0, tools: (j.tools || []).map((t) => t.name) };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  },
  async saveSettings(next) { const saved = LS.set(SETTINGS_KEY, next); wsMaybePush(); return saved; },

  // ---- Scheduled tasks (web): the shared Scheduler UI drives the managed runner via /tasks ----
  async listTasks() { const j = await tasksApi("/tasks"); return ((j && j.tasks) || []).map(toUiTask); },
  async createTask() {
    const j = await tasksApi("/tasks", { method: "POST", body: JSON.stringify({ tz: browserTz() }) });
    return (j && j.task) ? toUiTask(j.task)
      : { id: "tsk_local_" + Math.random().toString(36).slice(2, 8), name: "", description: "", prompt: "", model: "", schedule: { mode: "off" }, target: { type: "chat" }, permission: "ask", group: "", lastRun: 0 };
  },
  async updateTask(id, patch) { const j = await tasksApi("/tasks/" + id, { method: "PUT", body: JSON.stringify({ ...(patch || {}), tz: browserTz() }) }); return (j && j.task) ? toUiTask(j.task) : null; },
  async deleteTask(id) { await tasksApi("/tasks/" + id, { method: "DELETE" }); return true; },
  async getRuns(id) { const j = await tasksApi("/tasks/" + id + "/runs"); return ((j && j.runs) || []).map(mapRun).sort((a, b) => (b.at || 0) - (a.at || 0)); },
  async runTaskNow(id) {
    const j = await tasksApi("/tasks/" + id + "/run", { method: "POST" });
    if (j && j.run) return mapRun(j.run);
    if (j && j.skipped) return { status: "error", output: "Run skipped (" + j.skipped + ").", at: Date.now() };
    return { status: "error", output: (j && j.error) || "Couldn't run this task. Are you signed in?", at: Date.now() };
  },
  // Webhook triggers are a desktop-only feature the shared Scheduler references — graceful no-ops on web.
  async webhookStatus() { return { running: false, port: 0, error: "Webhook triggers run in the desktop app." }; },
  async applyWebhooks() { return { ok: false, error: "Webhook triggers run in the desktop app." }; },
  async newWebhookToken() { return { token: "" }; },
  async listModels(profileId) {
    const s = loadSettings(); const p = resolveProfile(profileId ? s.profiles[profileId] : activeProfile(s)); // Starter gets the session token
    let out = await provListModels(p);
    // If the browser blocked the provider's /models (CORS) and we're signed in, try via the proxy.
    if ((!out || !out.length) && p && p.baseUrl && getToken()) { try { out = await provListModels(p, { proxy: proxyCfg() }); } catch {} }
    return out;
  },
  async pingProvider(profileId) {
    const s = loadSettings();
    const p = resolveProfile(profileId ? s.profiles[profileId] : activeProfile(s));
    // Direct browser ping can CORS-fail while chat works via the proxy; confirm reachability server-side.
    return resolveProviderOnline({
      directPing: () => provPing(p),
      hasToken: () => !!getToken(),
      proxyModels: async () => {
        const r = await fetch(api("/proxy/models"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ kind: p.kind, baseUrl: p.baseUrl, apiKey: p.apiKey }) });
        if (!r.ok) throw new Error("proxy/models " + r.status);
        return await r.json();
      },
    });
  },
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
  async adminSearchUsage(adminKey) { return adminGet("search-usage", adminKey); },
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
    return { id: rec.id, mode: rec.mode, title: rec.title, messages, projectId: rec.projectId || null, cwd: rec.cwd || null, outputs: rec.outputs || [] };
  },
  async deleteSession(id) { await idbDel(id); try { recordChatTombstone(id); chatMaybePush(); } catch {} return true; },
  async renameSession(id, title) { try { const rec = await idbGet(id); if (rec) { const t = String(title || "").slice(0, 200); if (t) { rec.title = t; rec.updatedAt = Date.now(); await idbPut(rec); try { chatMaybePush(); } catch {} } } } catch {} return true; },
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
  async createProject(name) { const all = LS.get("be.projects", {}); const id = rid("prj_"); const p = { id, name: name || "Untitled", instructions: "", knowledge: [], agentIds: [], identity: wrAutoIdentity(id), createdAt: Date.now() }; all[p.id] = p; wrSaveProjects(all); return p; },
  async assignProjectAgent(projectId, agentId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p || !agentId) return null; if (!p.agentIds.includes(agentId)) p.agentIds.push(agentId); p.updatedAt = Date.now(); all[projectId] = p; wrSaveProjects(all); return p; },
  async unassignProjectAgent(projectId, agentId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p) return null; p.agentIds = p.agentIds.filter((x) => x !== agentId); p.updatedAt = Date.now(); all[projectId] = p; wrSaveProjects(all); return p; },
  async getProjectAgentHistory() { return []; }, // web: agent runs aren't recorded per-room (desktop feature)
  async seedSampleFiles() { return { error: "Creating sample files needs the desktop app." }; },
  async assignProjectTeam(projectId, teamId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p || !teamId) return null; if (!p.teamIds.includes(teamId)) p.teamIds.push(teamId); p.updatedAt = Date.now(); all[projectId] = p; wrSaveProjects(all); return p; },
  async unassignProjectTeam(projectId, teamId) { const all = LS.get("be.projects", {}); const p = wrNormalizeProject(all[projectId]); if (!p) return null; p.teamIds = p.teamIds.filter((x) => x !== teamId); p.updatedAt = Date.now(); all[projectId] = p; wrSaveProjects(all); return p; },
  async updateProject(id, patch) { const all = LS.get("be.projects", {}); all[id] = { ...all[id], ...patch }; wrSaveProjects(all); return all[id]; },
  async getRecipes(projectId) { return LS.get("be.recipes", {})[projectId] || []; },
  async saveRecipes(projectId, list) { const all = LS.get("be.recipes", {}); all[projectId] = Array.isArray(list) ? list : []; LS.set("be.recipes", all); return all[projectId]; },
  async deleteProject(id) { const all = LS.get("be.projects", {}); delete all[id]; wrSaveProjects(all); return true; },
  async addKnowledgeText(projectId, name, content) { const all = LS.get("be.projects", {}); const p = all[projectId]; p.knowledge = p.knowledge || []; p.knowledge.push({ id: rid("kn_"), name, type: "text", content }); wrSaveProjects(all); return p; },
  async addKnowledgeFile() { return { error: "Uploading files into a project is available in the desktop app." }; },
  async removeKnowledge(projectId, knId) { const all = LS.get("be.projects", {}); const p = all[projectId]; p.knowledge = (p.knowledge || []).filter((k) => k.id !== knId); wrSaveProjects(all); return p; },
  async linkProjectFolder() { return { error: "Linking a local folder is available in the desktop app." }; },
  async linkGithub() { return { error: "Available in the desktop app." }; },
  async cloneRepo() { return { error: "Cloning a GitHub repo needs the desktop app. On the web: open the repo on GitHub → Code → Download ZIP, unzip it, then use Choose folder." }; },
  async pullGithub() { return { error: "Available in the desktop app." }; },
  async unlinkProjectSource(projectId) { return LS.get("be.projects", {})[projectId] || null; },
  async listConversations(projectId) { return Object.values(LS.get("be.convs", {})).filter((c) => c.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt); },
  async getConversation(id) { return LS.get("be.convs", {})[id] || null; },
  async createConversation(projectId) { const all = LS.get("be.convs", {}); const c = { id: rid("cnv_"), projectId, title: "New conversation", messages: [], updatedAt: Date.now() }; all[c.id] = c; LS.set("be.convs", all); return c; },
  async deleteConversation(id) { const all = LS.get("be.convs", {}); delete all[id]; LS.set("be.convs", all); return true; },
  async renameConversation(id, title) { const all = LS.get("be.convs", {}); if (all[id]) { const t = String(title == null ? "" : title).trim().slice(0, 200); if (t) all[id].title = t; all[id].updatedAt = Date.now(); LS.set("be.convs", all); } return all[id] || null; },

  // ---- scheduled tasks: implemented by the Phase 3 S4 server-backed adapter above (managed runner) ----

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
  // ---- Agent Ops (web): memory mgmt / track record / versioning / portability. Client-side (localStorage),
  // wired to agentMemory.js + settings.agents + be.agentVersions. Mirrors the desktop bridge shapes. ----
  async getAgentMemory(agentId) { const r = getAgentMem(amGet(), agentId); return { notes: (r.notes || []).map((n) => ({ at: n.ts || n.at || 0, text: n.text })) }; },
  async setAgentMemory(agentId, notes) {
    if (!agentId) return { notes: [] };
    const store = amGet(); const r = getAgentMem(store, agentId);
    const list = (Array.isArray(notes) ? notes : [])
      .map((n) => (typeof n === "string" ? n : (n && n.text) || ""))
      .map((t) => String(t).replace(/\s+/g, " ").trim().slice(0, 280)).filter(Boolean)
      .map((text) => ({ text, ts: Date.now() })).slice(-40);
    amSave({ ...store, [agentId]: { ...r, notes: list } });
    return { notes: list.map((n) => ({ at: n.ts, text: n.text })) };
  },
  async clearAgentMemory(agentId) {
    if (!agentId) return { notes: [] };
    const store = amGet(); const r = getAgentMem(store, agentId);
    amSave({ ...store, [agentId]: { ...r, notes: [] } });
    return { notes: [] };
  },
  async getAgentHistory(agentId) { return getAgentHistory(amGet(), agentId).map((h) => ({ at: h.at, ok: h.ok, status: h.ok ? "success" : "error", output: h.note || "" })); },
  async getAgentStats() { return getAgentStats(amGet()); },
  async listAgentVersions(agentId) { const all = LS.get("be.agentVersions", {}); return (all[agentId] || []).slice().reverse(); },
  async snapshotAgentVersion(agent) {
    if (!agent || !agent.id) return { ok: false, skipped: true };
    const all = LS.get("be.agentVersions", {}); const list = all[agent.id] || [];
    list.push({ at: Date.now(), agent }); all[agent.id] = list.slice(-10); LS.set("be.agentVersions", all);
    return { ok: true };
  },
  async exportAgent(agent) {
    try {
      const blob = new Blob([JSON.stringify({ madavAgent: 1, agent }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = ((agent && (agent.name || agent.id)) || "agent") + ".agent.json";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  },
  async importAgent() {
    return new Promise((resolve) => {
      try {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,.agent,application/json";
        inp.onchange = async () => {
          try {
            const f = inp.files && inp.files[0]; if (!f) return resolve({ error: "No file selected." });
            const parsed = JSON.parse(await f.text()); const src = parsed && parsed.agent ? parsed.agent : parsed;
            if (!src || typeof src !== "object") return resolve({ error: "That isn't a valid agent file." });
            const agent = { ...src, id: "ag_" + Math.random().toString(36).slice(2, 10) }; delete agent.model;
            resolve({ agent });
          } catch (e) { resolve({ error: "Couldn't read that file: " + String((e && e.message) || e) }); }
        };
        inp.click();
      } catch (e) { resolve({ error: String((e && e.message) || e) }); }
    });
  },
  async runSwarm() { return { error: "Swarms run in the desktop app." }; },
  async cancelSwarm() { return true; },
  onSwarmEvent() { return () => {}; },
  async getMission() { return null; },
  async transcribe({ b64, mime } = {}) {
    if (!getToken()) return { error: "Sign in to Madav to use voice input." };
    if (!b64) return { error: "No audio captured." };
    const s = loadSettings();
    // Mirror desktop sttProfile: explicit voiceStt override, else first OpenAI/Groq profile with a key.
    const STT = [{ re: /api\.openai\.com/i, model: "whisper-1", path: "/v1/audio/transcriptions" },
                 { re: /api\.groq\.com/i, model: "whisper-large-v3-turbo", path: "/openai/v1/audio/transcriptions" }];
    const ov = s.voiceStt || {}; let prof = null, model = "whisper-1", path = "/v1/audio/transcriptions";
    if (ov.profileId && s.profiles && s.profiles[ov.profileId] && s.profiles[ov.profileId].apiKey) { prof = s.profiles[ov.profileId]; model = ov.model || model; path = ov.path || path; }
    else { for (const pr of Object.values(s.profiles || {})) { if (!pr || !pr.apiKey) continue; const hit = STT.find((h) => h.re.test(pr.baseUrl || "")); if (hit) { prof = pr; model = hit.model; path = hit.path; break; } } }
    if (!prof) return { error: "Voice input needs a Whisper-capable key — add an OpenAI or Groq API key in Settings \u2192 Models, then try again." };
    try {
      const r = await fetch(api("/proxy/transcribe"), { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ baseUrl: prof.baseUrl, apiKey: prof.apiKey, model, path, b64, mime }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { error: j.error || ("transcription " + r.status) };
      return j.text ? { text: j.text } : { error: j.error || "Nothing was transcribed." };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  },
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
          free: (String(pr.prompt) === "0" && String(pr.completion || "0") === "0"), // cost from REAL pricing, not the name
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
  async testConnector(server) { return testConnectorWeb(server); },
  async connectorSignIn(server) { return connectorSignInWeb(server); },
  async connectorAuthStatus(serverId) { return connectorStatusReq(serverId); },
  async connectorSignOut(serverId) { return connectorSignOutReq(serverId); },
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
  async listSkills() { return allSkills().map(({ body, ...s }) => s); }, // bundled (gated) + user-authored
  async createSkill(name) {
    const nm = String(name || "").trim(); if (!nm) return { error: "Name required." };
    const all = LS.get("be.skills", {}); if (Object.keys(all).length >= 25) return { error: "Skill limit reached (25)." };
    const slug = nm.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || ("skill-" + Date.now().toString(36));
    let dir = "user/" + slug, i = 2; while (all[dir]) dir = "user/" + slug + "-" + (i++);
    const now = Date.now();
    all[dir] = { dir, name: nm, description: "", body: `---\nname: ${nm}\ndescription: \n---\n\n# ${nm}\n\nDescribe what this skill does and the exact steps to follow.\n`, user: true, createdAt: now, updatedAt: now };
    LS.set("be.skills", all); return { ok: true, dir };
  },
  async saveSkill(dir, patch) {
    const all = LS.get("be.skills", {}); const cur = all[dir];
    if (!cur) return { error: "Built-in skills can\u0027t be edited \u2014 duplicate or create a new one." };
    const x = patch || {};
    all[dir] = { ...cur, name: x.name != null ? String(x.name).slice(0, 80) : cur.name, description: x.description != null ? String(x.description).slice(0, 300) : cur.description, body: x.body != null ? String(x.body).slice(0, 20000) : cur.body, updatedAt: Date.now() };
    LS.set("be.skills", all); return { ok: true };
  },
  async setPinnedSkills() { return { error: "Pinning plays needs the desktop app." }; },
  async getPlayStats() { return {}; },
  async exportPlay(name) {
    const sk = allSkills().find((x) => x.name === name); if (!sk) return { error: "Not found." };
    try {
      const blob = new Blob([JSON.stringify({ madavPlay: 1, skill: { name: sk.name, description: sk.description, body: sk.body } }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = (sk.name || "play") + ".play.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  },
  async importPlay() {
    return new Promise((resolve) => { try {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,.play,application/json";
      inp.onchange = async () => { try {
        const f = inp.files && inp.files[0]; if (!f) return resolve({ canceled: true });
        const parsed = JSON.parse(await f.text()); const sk = parsed && parsed.skill ? parsed.skill : parsed;
        if (!sk || !sk.name) return resolve({ error: "Not a valid play file." });
        const all = LS.get("be.skills", {}); const slug = String(sk.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || ("play-" + Date.now().toString(36));
        let dir = "user/" + slug, i = 2; while (all[dir]) dir = "user/" + slug + "-" + (i++);
        all[dir] = { dir, name: String(sk.name).slice(0, 80), description: String(sk.description || "").slice(0, 300), body: String(sk.body || "").slice(0, 20000), user: true, createdAt: Date.now(), updatedAt: Date.now() };
        LS.set("be.skills", all); resolve({ play: sk.name });
      } catch (e) { resolve({ error: String((e && e.message) || e) }); } };
      inp.click();
    } catch (e) { resolve({ error: String((e && e.message) || e) }); } });
  },
  async setPlayChain() { return { error: "Desktop only." }; },
  async setPlayNeeds() { return { error: "Desktop only." }; },
  async getPlayConfig() { return { chains: {}, meta: {} }; },
  async setTeamPinnedSkills() { return { error: "Desktop only." }; },
  async getPinSuggestions() { return []; },
  async importSkillFolder() { return { error: "Available in the desktop app." }; },
  async importSkillZip() {
    return new Promise((resolve) => { try {
      const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".zip,.md,application/zip,text/markdown";
      inp.onchange = async () => { try {
        const f = inp.files && inp.files[0]; if (!f) return resolve({ canceled: true });
        let body = "";
        if (/\.zip$/i.test(f.name)) {
          const JSZip = (await import("jszip")).default; const zip = await JSZip.loadAsync(await f.arrayBuffer());
          const entry = Object.keys(zip.files).find((n) => /SKILL\.md$/i.test(n)); if (!entry) return resolve({ error: "No SKILL.md in the zip." });
          body = await zip.files[entry].async("string");
        } else { body = await f.text(); }
        let name = "", description = ""; const fm = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
        if (fm) fm[1].split(/\r?\n/).forEach((l) => { const k = l.indexOf(":"); if (k > 0) { const key = l.slice(0, k).trim(), val = l.slice(k + 1).trim().replace(/^["\u0027]|["\u0027]$/g, ""); if (key === "name") name = val; if (key === "description") description = val; } });
        name = name || f.name.replace(/\.(zip|md)$/i, "");
        const all = LS.get("be.skills", {}); const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || ("skill-" + Date.now().toString(36));
        let dir = "user/" + slug, i = 2; while (all[dir]) dir = "user/" + slug + "-" + (i++);
        all[dir] = { dir, name, description, body, user: true, createdAt: Date.now(), updatedAt: Date.now() };
        LS.set("be.skills", all); resolve({ ok: true, count: 1 });
      } catch (e) { resolve({ error: String((e && e.message) || e) }); } };
      inp.click();
    } catch (e) { resolve({ error: String((e && e.message) || e) }); } });
  },
  async readSkill(dir) { const s = allSkills().find((x) => x.dir === dir) || readBundled(dir); return s ? { dir: s.dir, file: s.file || "", meta: { name: s.name, description: s.description }, body: s.body || "", updated: s.updatedAt || 0 } : null; },
  async setSkillEnabled(dir, enabled) { if (!dir) return true; const prefs = LS.get("be.skillPrefs", {}); if (enabled) delete prefs[dir]; else prefs[dir] = { enabled: false }; LS.set("be.skillPrefs", prefs); return true; },
  async deleteSkill(dir) { const all = LS.get("be.skills", {}); if (!all[dir]) return { error: "Built-in skills can\u0027t be deleted \u2014 you can bench it instead." }; delete all[dir]; LS.set("be.skills", all); const prefs = LS.get("be.skillPrefs", {}); if (prefs[dir]) { delete prefs[dir]; LS.set("be.skillPrefs", prefs); } return { ok: true }; },
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
