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
const authHeaders = (extra) => { const h = { ...(extra || {}) }; const t = getToken(); if (t) h.Authorization = "Bearer " + t; return h; };

// ---- localStorage JSON helpers ----
const LS = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} return val; },
};
const rid = (p) => p + Math.random().toString(36).slice(2, 8);

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
function systemPrompt(s, projectId) {
  const parts = [];
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
async function callModel(prof, messages, signal) {
  try { return await streamChat(prof, messages, { onDelta: () => {}, signal }); }
  catch (e) {
    if (isNetworkErr(e) && getToken()) return await streamChat(prof, messages, { onDelta: () => {}, signal, proxy: proxyCfg() });
    throw e;
  }
}

// ===== "Let's Collaborate" on the web: a file-tool agent over the browser-picked folder =====
function coworkSystem(s) {
  const parts = [
    `You are BrainEdge, collaborating on the user's local folder "${webfs.rootLabel()}" directly from their browser.`,
    `Use the provided tools to list, read, write, and edit files. All paths are relative to the folder root (use "" for the root).`,
    `There is NO terminal on the web: you cannot run shell commands, install packages, run tests, or execute code. Make every change by reading and writing files.`,
    `Inspect with list_dir/read_file before editing. When done, give a short summary of what you changed.`,
  ];
  if (s.responseLanguage && s.responseLanguage !== "model") parts.push(`Always respond in ${s.responseLanguage}.`);
  if (s.globalInstructions) parts.push(s.globalInstructions);
  return parts.join("\n");
}
const COWORK_TOOLS = [
  { type: "function", function: { name: "list_dir", description: "List files and folders at a path relative to the project root. Use \"\" for the root.", parameters: { type: "object", properties: { path: { type: "string" } } } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 text file's full contents.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file with the given content.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first occurrence of `find` with `replace` in a file.", parameters: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } } },
];
async function executeTool(name, args) {
  switch (name) {
    case "list_dir": return JSON.stringify(await webfs.listDir(args.path || ""));
    case "read_file": { const t = await webfs.readFile(args.path); return t.length > 60000 ? t.slice(0, 60000) + "\n…(truncated)" : t; }
    case "write_file": await webfs.writeFile(args.path, args.content ?? ""); return "wrote " + args.path;
    case "edit_file": await webfs.editFile(args.path, args.find, args.replace); return "edited " + args.path;
    default: return "That tool isn't available on the web app (no terminal). Use list_dir/read_file/write_file/edit_file only.";
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
        let out; try { out = await executeTool(c.name, args); } catch (e) { out = "Error: " + String((e && e.message) || e); }
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
    // Match desktop: buffer, strip reasoning, emit the clean text once.
    const { text: reply } = await callModel(prof, sess.messages, sess.ac.signal);
    if (reply) emit(sess.id, "assistant_delta", { text: reply });
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
  const all = LS.get(HISTORY_KEY, {});
  all[sess.id] = { id: sess.id, mode: sess.mode || "code", title: sess.title || "Untitled", updatedAt: Date.now(),
    messages: sess.messages, projectId: sess.projectId || null, convId: sess.convId || null };
  LS.set(HISTORY_KEY, all);
}

// ================= the bridge =================
export const webBridge = {
  // ---- chat / agent ----
  async start(req) {
    const s = loadSettings();
    const agentic = webfs.hasRoot() && (!!req.cwd || req.mode === "cowork"); // a real folder is selected → file-agent mode
    const hist = LS.get(HISTORY_KEY, {});
    let id, messages, title;
    if (req.conversationId && hist[req.conversationId]) {
      // Continuing an opened chat — resume its full message history so context carries over.
      id = req.conversationId; messages = (hist[id].messages || []).slice(); title = hist[id].title || "";
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
    const all = Object.values(LS.get(HISTORY_KEY, {}));
    return all.filter((x) => !mode || x.mode === mode).sort((a, b) => b.updatedAt - a.updatedAt).map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, mode: x.mode }));
  },
  async getSession(id) {
    const rec = LS.get(HISTORY_KEY, {})[id]; if (!rec) return null;
    const asText = (c) => (typeof c === "string" ? c : (Array.isArray(c) ? (c.find((p) => p.type === "text")?.text || "") : ""));
    // The renderer maps conv.messages -> bubbles; strip system and flatten content to text.
    const messages = (rec.messages || []).filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: asText(m.content) }));
    return { id: rec.id, mode: rec.mode, title: rec.title, messages };
  },
  async deleteSession(id) { const all = LS.get(HISTORY_KEY, {}); delete all[id]; LS.set(HISTORY_KEY, all); return true; },

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
  async getUsage() {
    const sess = Object.values(LS.get(HISTORY_KEY, {}));
    let messages = 0; const models = {};
    for (const x of sess) for (const m of x.messages || []) { if (m.role === "user" || m.role === "assistant") messages++; }
    return { messages, tokens: 0, sessions: sess.length, activeDays: 0, currentStreak: 0, longestStreak: 0, peakHour: "—", favoriteModel: "—", models: Object.values(models), byDay: {} };
  },

  // ---- speed check: cloud tests can run in the browser; uses the provider directly ----
  async runSpeedTest() { return { at: Date.now(), prompt: "", results: [], note: "Run the full speed check from the desktop app." }; },
  async cancelSpeedTest() { return true; },
  async getSpeedTestLast() { return null; },
  async getSpeedTestStatus() { return { running: false, startedAt: 0 }; },
  async getOpenRouterCatalog() {
    try { const r = await fetch("https://openrouter.ai/api/v1/models"); if (!r.ok) return {}; const j = await r.json(); const out = {}; for (const m of j.data || []) out[m.id] = m; return out; } catch { return {}; }
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
  async testConnector() { return { ok: false, error: "MCP connectors run in the desktop app." }; },
  async listConnectorDirectory() { return { items: [], stale: false, source: "web" }; },
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
