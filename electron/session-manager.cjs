// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// SessionManager (main process).
//  - chat mode  → direct streaming transport (providers.cjs)
//  - cowork/code → agent transport (agent-transport.cjs)
// Both emit normalized UiEvents via emit().
const { streamChat } = require("./providers.cjs");
const { runAgentTurn } = require("./agent-transport.cjs");
const { runOpenAIAgentTurn, runScriptInFolder } = require("./agent-openai.cjs");
const settings = require("./settings.cjs");
const store = require("./projects-store.cjs");
const sstore = require("./sessions-store.cjs");
const usage = require("./usage-store.cjs");
const agentPrompt = require("./agent-prompt.cjs");
const agentMemory = require("./agent-memory.cjs");
const agentHistory = require("./agent-history.cjs");
const missionStore = require("./mission-store.cjs");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const newId = (prefix) => prefix + crypto.randomBytes(8).toString("hex"); // crypto-strength, unpredictable
let _plP = null; const _pl = () => (_plP ||= import("../core/project-lanes.js")); // SINGLE SOURCE lane decision (A=engine / B=recipe / C=caged loop)
let _recP = null; const _rec = () => (_recP ||= import("../core/recipes.js")); // SINGLE SOURCE recipes — learn once, replay
let _pjP = null; const _pj = () => (_pjP ||= import("../core/project-job.js")); // SINGLE SOURCE job engine
let _prP = null; const _pr = () => (_prP ||= import("../core/project-runner.js")); // SINGLE SOURCE orchestrator

// Surface office files the agent produced as Open/Download cards in the chat. Works for ANY model
// (Claude SDK + the OpenAI loop both covered). Robust by DIFF: snapshot the folder before the run,
// compare after — so it never depends on a fragile mtime/clock comparison. Recurses ONE level so a
// file written into an "output/" subfolder is still caught.
const OFFICE_RE = /\.(xlsx|xlsm|xls|docx|pptx|pdf|csv)$/i;
function scanOffice(folder) {
  const out = new Map(); // absolutePath -> mtimeMs
  const path = require("path");
  const walk = (dir, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (depth > 0 && !/^(node_modules|\.git)$/i.test(ent.name)) walk(p, depth - 1); continue; }
      if (!OFFICE_RE.test(ent.name)) continue;
      try { out.set(p, fs.statSync(p).mtimeMs); } catch {}
    }
  };
  walk(folder, 1);
  return out;
}
// Stage 3 — snapshot the .py scripts in a folder (one level deep) so a successful run's NEW scripts can
// be captured as a reusable recipe. Mirrors scanOffice; returns a Set of absolute paths.
function scanScripts(folder) {
  const out = new Set();
  const path = require("path");
  const walk = (dir, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (depth > 0 && !/^(node_modules|\.git)$/i.test(ent.name)) walk(p, depth - 1); continue; }
      if (/\.py$/i.test(ent.name)) out.add(p);
    }
  };
  walk(folder, 1);
  return out;
}
// Keep DATA project folders pristine: move stray working scripts (.py) out of the root into a hidden
// .madav-scratch subfolder, so they never clutter the folder or confuse the next run. The CALLER gates on
// the folder being a DATA folder (has office files); code/repo folders — where .py ARE the work — are never touched.
function tidyScratchPy(folder) {
  const path = require("path");
  let ents = []; try { ents = fs.readdirSync(folder, { withFileTypes: true }); } catch { return; }
  const stray = ents.filter((e) => e.isFile() && /\.py$/i.test(e.name)).map((e) => e.name);
  if (!stray.length) return;
  const scratch = path.join(folder, ".madav-scratch");
  try { fs.mkdirSync(scratch, { recursive: true }); } catch {}
  for (const nm of stray) { const dest = path.join(scratch, nm); try { fs.unlinkSync(dest); } catch {} try { fs.renameSync(path.join(folder, nm), dest); } catch {} }
}
function emitNewOutputs(emit, folder, before) {
  const out = [];
  try {
    const path = require("path");
    const after = scanOffice(folder);
    for (const [p, mt] of after) {
      const prev = before && before.get(p);
      if (prev === undefined || mt > prev) {
        const name = path.basename(p);
        // Attach the file's bytes (base64, small files only) so a SAVED file gets the SAME in-app preview a
        // web b64 file does — one preview path, desktop + web. The path stays for Open / Folder.
        let b64 = ""; try { const st = fs.statSync(p); if (st.size <= 2 * 1024 * 1024) b64 = fs.readFileSync(p).toString("base64"); } catch {}
        emit({ kind: "file_output", data: { path: p, name, b64 } });
        out.push({ path: p, name, b64 });
      }
    }
    console.log("[madav] emitNewOutputs folder=%s scanned=%d new=%d", folder, after.size, out.length);
  } catch (e) { console.log("[madav] emitNewOutputs error", (e && e.message) || e); }
  return out;
}

// Detect a usable Python (+ pandas/openpyxl) ONCE so room runs can lean on code execution for
// spreadsheet/data work (the reliable, weak-model-friendly path, like free-claude-code) and the
// prompt can tell the model exactly what is available. Cached; failures resolve to "not available".
let _pyEnvCache = null;
async function pyEnv() {
  if (_pyEnvCache) return _pyEnvCache;
  const { exec } = require("child_process");
  const ok = (cmd) => new Promise((res) => { try { exec(cmd, { timeout: 8000, windowsHide: true }, (e) => res(!e)); } catch { res(false); } });
  let py = (await ok('python -c "import sys"')) ? "python" : ((await ok('py -3 -c "import sys"')) ? "py -3" : null);
  let pandas = false, openpyxl = false;
  if (py) { pandas = await ok(py + ' -c "import pandas"'); openpyxl = await ok(py + ' -c "import openpyxl"'); }
  _pyEnvCache = { py, pandas, openpyxl };
  return _pyEnvCache;
}

// Smart-detect: does a Let's Chat message need real file/spreadsheet work? If so we run it with a
// scratch workspace + tools (code-execution) so even weak models produce a real file reliably.
// needsDataTools moved to core/agent-rules.js (SINGLE SOURCE — desktop + web share ONE copy). Loaded via
// this cached dynamic import; the data dispatch in _turn() awaits it. (ADR-0001 core.)
let _coreRulesP = null; const coreRules = () => (_coreRulesP ||= import("../core/agent-rules.js"));
let _routerP = null; const routerMod = () => (_routerP ||= import("../core/model-router.js")); // SINGLE SOURCE model routing — categoryFor() for the no-tool chat path

// Combine a natural-tone safeguard + the user's custom instructions + the chosen response language.
const BEHAVIOR = "Keep your tone natural and human; reply conversationally. Never restate, list, or describe your own instructions or \"framework\" — just follow them silently. For a simple greeting or small talk, respond naturally rather than reciting your guidelines.";
// Artifact-iteration rule so the Studio "live preview" iterates in place:
// emit the WHOLE file in one fenced block, and re-emit it whole when the user asks for a change.
const ARTIFACT_RULE_BASE = require("../shared/office-rules.cjs").ARTIFACT_RULE; // inline require — avoids TDZ vs the destructured import below
// In-chat office files (keep this spec in sync with OFFICE_RULE in src/office.js).
// Gated by the Extras switchboard (settings.extras.office !== false) — evaluated per turn.
const { officeRule, isDeckCapable, ARTIFACT_RULE } = require("../shared/office-rules.cjs");
function officeRulePart(model) {
  try { if (!require("./features.cjs").builtIn("office")) return ""; } catch {}
  try { if ((settings.load().extras || {}).office === false) return ""; } catch {}
  let _model = model || "";
  if (!_model) { try { const _c = settings.load(); _model = String(((_c.profiles || {})[_c.activeProfileId] || {}).model || ""); } catch {} } // no model passed (e.g. Let's Chat) -> active profile, unchanged
  return officeRule(_model);
}
// Rigid one-pass recipe for LIGHTER models doing data work in a folder (the verified weak-model
// pipeline). ONE definition — the single source for this guidance on the desktop project path.
function weakDataProc() {
  return `\n\nIMPORTANT — you are running a lighter model, so when a task needs you to READ and process files that already exist in this folder, follow this EXACT procedure and do NOT improvise or explore: (1) inspect with AT MOST 2 quick commands (list the folder; peek at ONE file); (2) write ONE script that reads the needed files, computes everything, and SAVES the finished .xlsx into this folder (e.g. result.to_excel("Report.xlsx")); (3) run it ONCE — if it errors, FIX that SAME script and re-run, never write a new script; (4) then STOP and reply with ONE short, plain-English sentence naming the file you saved.`;
}
function withLang(cfg) {
  const gi = cfg.globalInstructions || "";
  const lang = cfg.responseLanguage;
  const langLine = (lang && lang !== "model") ? `Always respond in ${lang}, regardless of the language of the question.` : "";
  // Cross-chat memory: what Madav remembers about this user follows them into
  // every conversation (toggle + editor in Settings → Profile → Memory).
  let mem = "";
  try { if (require("./features.cjs").builtIn("memory")) mem = require("./user-memory.cjs").block(cfg); } catch {}
  return [BEHAVIOR, langLine, gi].filter(Boolean).join("\n\n") + mem;
}
const path = require("path");
const errorExplainer = require("./error-explainer.cjs");

let seq = 0;
const AGENT_MODES = new Set(["cowork", "code"]);
// Errors that already carry a clear, human message — don't spend a model call on them.
const FRIENDLY_CODES = new Set(["no_vision", "no_key", "no_profile", "no_folder", "no_project", "auth", "rate_limit", "cancelled", "interrupted"]);

const cleanImgs = (images) => (Array.isArray(images) ? images.filter((im) => im && im.dataUrl) : []);
const parseDataUrl = (u) => { const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(u || ""); return m ? { mime: m[1], b64: m[2] } : null; };

// Inline multimodal content for the no-tool chat completion path (single request, no Read tool).
function inlineContent(userText, images, kind) {
  const imgs = cleanImgs(images);
  if (!imgs.length) return userText;
  const textPart = userText ? [{ type: "text", text: userText }] : [];
  if (kind === "anthropic") {
    return [...textPart, ...imgs.map((im) => { const p = parseDataUrl(im.dataUrl); return p ? { type: "image", source: { type: "base64", media_type: p.mime, data: p.b64 } } : null; }).filter(Boolean)];
  }
  return [...textPart, ...imgs.map((im) => ({ type: "image_url", image_url: { url: im.dataUrl } }))];
}

// For agent/SDK paths that take a plain-text prompt but have a file-reading tool:
// write the pasted images to temp files and point the agent at them.
function materializeImages(images) {
  const imgs = cleanImgs(images);
  if (!imgs.length) return "";
  const dir = path.join(os.tmpdir(), "madav-images");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const paths = [];
  imgs.forEach((im, i) => {
    const p = parseDataUrl(im.dataUrl);
    if (!p) return;
    const ext = (p.mime.split("/")[1] || "png").replace("+xml", "");
    const file = path.join(dir, `paste-${Date.now()}-${i}.${ext}`);
    try { fs.writeFileSync(file, Buffer.from(p.b64, "base64")); paths.push(file); } catch {}
  });
  if (!paths.length) return "";
  return `\n\n[The user attached ${paths.length} image(s). Use your Read tool to view them at:\n${paths.map((p) => `- ${p}`).join("\n")}]`;
}

class SessionManager {
  constructor(emit) {
    this.rawEmit = emit;                 // (uiEvent) => void
    this.sessions = new Map();           // sessionId -> { mode, cwd, history, controller, sdkSessionId }
    this.permissions = new Map();        // requestId -> resolve(PermissionResult)
    this.holds = new Map();              // sessionId -> SDK Query (for interrupt)
    this._turns = new Map();             // sessionId -> live turn stats (per-session: overlapping turns can't corrupt each other)
  }

  _send(sessionId, kind, data) {
    // Passive run-tracing tee — fully isolated; a tracing error must never affect the turn.
    try { require("./trace-store.cjs").onEvent(sessionId, kind, data, this._turns.get(sessionId)); } catch {}
    const t = this._turns.get(sessionId);
    if (t) {
      if (kind === "assistant_delta") { t.replyChars += ((data && data.text) || "").length; t.replyText += (data && data.text) || ""; }
      else if (kind === "result") {
        usage.append({ ...t, at: Date.now() }); this._recordAgentRun(sessionId, t, data, true); this._persistTurn(sessionId);
        if (t && (t.mode === "chat" || t.mode === "cowork" || t.mode === "code")) this._autoTitle(sessionId, t.userText, t.replyText); // smart title from the first exchange (async, fail-open)
        // Cross-chat memory: fire-and-forget extraction of durable user facts from
        // this completed turn (throttled inside user-memory; never blocks the UI).
        try { if (require("./features.cjs").builtIn("memory")) { const cfg = settings.load(); require("./user-memory.cjs").learnFromTurn(settings.activeProfile(cfg), cfg, t.userText, t.replyText); } } catch {}
        // Skill Forge: observe recurring agent-mode tasks; occasionally draft a skill for
        // user approval (instincts.cjs — throttled, fail-open, Extras "forge" gate).
        try {
          const cfg2 = settings.load();
          if ((cfg2.extras || {}).forge !== false && (t.mode === "cowork" || t.mode === "code" || t.mode === "chat")) {
            const inst = require("./instincts.cjs");
            inst.observe(t.mode, t.userText);
            inst.maybeForge(); // async, self-throttled to 1/hour
          }
        } catch {}
        this._turns.delete(sessionId);
      }
      else if (kind === "error") { this._recordAgentRun(sessionId, t, data, false); this._persistTurn(sessionId); this._turns.delete(sessionId); }
    }
    this.rawEmit({ sessionId, seq: seq++, kind, data });
  }

  // Track record + memory for SOLO custom agents: after every interactive turn,
  // append a run event (agent cards show "12 missions · 92% clean") and let the
  // agent extract durable learnings from the exchange (fire-and-forget).
  _recordAgentRun(sessionId, t, data, ok) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.agent || !s.agent.id || s.team) return;
    try {
      agentHistory.record({
        agentId: s.agent.id, name: s.agent.name, ok,
        ms: (data && data.duration_ms) || 0,
        tokens: Math.round(((t.promptChars || 0) + (t.replyChars || 0)) / 4),
        source: "chat",
        projectId: s.projectId || undefined, // Workrooms: per-room track record
        summary: (ok ? (t.replyText || "") : ("error: " + ((data && data.message) || ""))).slice(0, 200),
      });
    } catch {}
    if (ok && (t.replyText || "").length > 80) {
      try { agentMemory.learnFromMission(settings.activeProfile(), s.agent, t.userText || "", t.replyText || ""); } catch {}
    }
  }

  // Auto-title a chat from its FIRST exchange (Claude-style). Fire-and-forget, fail-open: any failure
  // or empty result keeps the provisional first-message title. Never blocks or delays the reply.
  async _autoTitle(sessionId, userText, replyText) {
    try {
      const s = this.sessions.get(sessionId);
      if (!s || !s.chatConvId) return;
      const conv = sstore.getSession(s.chatConvId);
      if (!conv || conv.autoTitled) return;
      if ((conv.messages || []).filter((m) => m.role === "user").length > 1) return; // first exchange only
      const u = String(userText || "").slice(0, 500); if (!u) return;
      const profile = settings.activeProfile(settings.load());
      if (!profile) return;
      const { text } = await streamChat(profile, [
        { role: "system", content: "Generate a short, specific chat title of 3 to 6 words for the user's request. Reply with ONLY the title \u2014 no quotes, no trailing punctuation, no preamble or reasoning." },
        { role: "user", content: `First message:\n${u}\n\nReply (start):\n${String(replyText || "").slice(0, 400)}\n\nTitle:` },
      ], { onDelta: () => {} });
      let title = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      title = (title.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)[0] || "");
      title = title.replace(/^["\'`*\s]+|["\'`*\s]+$/g, "").replace(/[.]+$/, "").slice(0, 60).trim();
      if (!title) return;
      const fresh = sstore.getSession(s.chatConvId); if (!fresh) return;
      fresh.title = title; fresh.autoTitled = true;
      try { sstore.saveSession(fresh); } catch {}
      this._send(sessionId, "convtitle", { conversationId: fresh.id, title });
    } catch {}
  }

  // Persist one completed turn (user + assistant text) to the chat-history store.
  // Project mode persists separately (projects-store), so it has no chatConvId here.
  _persistTurn(sessionId) {
    const s = this.sessions.get(sessionId);
    const t = this._turns.get(sessionId);
    if (!s || !s.chatConvId || !t) return;
    const conv = sstore.getSession(s.chatConvId);
    if (!conv) return;
    const u = (t.userText || "").trim();
    const a = (t.replyText || "").trim();
    if (u) conv.messages.push({ role: "user", content: u, at: Date.now() });
    if (a) conv.messages.push({ role: "assistant", content: a, model: t.model, provider: t.provider, at: Date.now() });
    if ((!conv.title || conv.title === "New task") && u) conv.title = u.slice(0, 60);
    conv.cwd = s.cwd || conv.cwd;
    // Remember who ran this conversation so reopening it re-attaches the agent/team.
    if (s.agent) conv.agent = s.agent;
    if (s.team) conv.team = { name: s.team.name, mode: s.team.mode, members: s.team.members, identity: s.team.identity };
    try { sstore.saveSession(conv); } catch {}
  }

  async start(req) {
    const sessionId = newId("sess_");
    const s = { mode: req.mode, cwd: req.cwd, history: [], controller: null, sdkSessionId: null, permMode: req.permissionMode || "default" };
    if (req.agent && req.agent.instructions) s.agent = req.agent; // custom agent: { name, description, instructions, tools }
    if (req.team && Array.isArray(req.team.members) && req.team.members.length) s.team = req.team; // agent team: { name, mode: "relay"|"manager", members: [agent objects] }
    if (req.resumeMission) s.resumeMission = true; // durable missions: reuse checkpointed member outputs
    if (req.mode === "project") {
      s.projectId = req.projectId;
      s.conversationId = req.conversationId;
      const conv = store.getConversation(req.conversationId);
      s.history = [{ role: "system", content: "" }, ...((conv && conv.messages) || [])]; // index 0 reserved for project system
    } else {
      // Persisted chat history for Let's Talk / Collaborate / Build.
      let conv = req.conversationId ? sstore.getSession(req.conversationId) : null;
      if (!conv) conv = sstore.createSession(req.mode, req.cwd, req.projectId);
      s.chatConvId = conv.id;
      if (req.projectId) s.projectId = req.projectId; // Collaborate task scoped to a project
      // Older record reopened with a project scope: tag it so it lists under the project.
      if (req.projectId && !conv.projectId) { conv.projectId = req.projectId; try { sstore.saveSession(conv); } catch {} }
      // Seed the model context from saved messages so reopened chats continue coherently.
      // Cap at the newest 200 messages — a giant history would balloon RAM and every request.
      if (conv.messages && conv.messages.length) s.history = conv.messages.slice(-200).map((m) => ({ role: m.role, content: m.content }));
      // Claude-like: title the chat from the FIRST message NOW (before the model runs) so the
      // sidebar — refreshed on the init event — shows the real title the instant the turn starts.
      if (req.prompt && (!conv.title || conv.title === "New task")) {
        conv.title = String(req.prompt).slice(0, 60);
        try { sstore.saveSession(conv); } catch {}
      }
    }
    this.sessions.set(sessionId, s);
    await this._turn(sessionId, req.prompt, req.images);
    return { sessionId, conversationId: s.chatConvId || s.conversationId || null };
  }

  async sendInput(sessionId, text, images) {
    if (this.sessions.get(sessionId)) await this._turn(sessionId, text, images);
  }

  // ---- custom agents (Agents builder) ----
  // System prompt for a session bound to a user-built agent. Knowledge passages are
  // retrieved per task (RAG-lite) and the agent's memory of past missions is injected.
  _agentSys(s, taskText) {
    if (!s.agent) return null;
    return agentPrompt.agentSystem(s.agent, { taskText: taskText || "" });
  }

  // Per-agent AUTONOMY — set once when the agent is created, so the user isn't
  // prompted constantly: "act" = full autonomy (no permission prompts, like bypass);
  // "skip" = never interrupt — risky actions are auto-declined instantly and the
  // agent adapts/works around them; "ask" (default) = the normal permission flow.
  _permsFor(agentLike, fallbackMode) {
    const a = agentLike && agentLike.autonomy;
    if (a === "act") return { permMode: "bypassPermissions", permissions: this.permissions };
    if (a === "skip") {
      // Map-compatible AUTO-DENY shim: askPermission/askUserQuestion in agent-openai call
      // permissions.set(requestId, cb) then emit the request — a bare function here crashed
      // with "permissions.set is not a function". Invoking cb on a microtask resolves the
      // prompt as an instant decline (UI clears the card on the permission_denied that follows);
      // ask_user resolves to its built-in "proceed with your best judgment" fallback.
      const autoDeny = {
        set: (_id, cb) => { try { Promise.resolve().then(() => cb({ behavior: "deny" })); } catch {} },
        get: () => undefined, has: () => false, delete: () => false,
      };
      return { permMode: fallbackMode || "default", permissions: autoDeny };
    }
    return { permMode: fallbackMode || "default", permissions: this.permissions };
  }

  // Workrooms: a room may pin specific connectors (project.connectorNames). Runs
  // tagged with that room then see ONLY those; an empty/missing list = all enabled
  // (back-compat). Agent-bound runs keep the agent's own connector gate.
  _roomConnectors(cfg, projectId, surface) {
    // Per-PROCESS connector enablement: a connector must be master-enabled (Connectors page →
    // c.enabled) AND on for THIS surface. c.surfaces[surface] is the per-process override; the
    // default is on in every process EXCEPT plain chat (kept conversation-clean unless the user
    // turns it on for chat from the chat composer's + menu).
    const su = surface || "chat";
    const on = (c) => {
      if (!c || c.enabled === false) return false;
      const sf = c.surfaces || {};
      return (su in sf) ? sf[su] !== false : su !== "chat";
    };
    const all = (cfg.connectors || []).filter(on);
    if (!projectId) return all;
    try {
      const p = store.getProject(projectId);
      if (p && Array.isArray(p.connectorNames) && p.connectorNames.length) return all.filter((c) => p.connectorNames.includes(c.name));
    } catch {}
    return all;
  }
  // Connectors for a session, scoped to its process/surface (chat / cowork / code / project).
  _connectorsFor(s, cfg) {
    const surface = s.projectId ? "project" : (s.mode || "chat");
    return this._roomConnectors(cfg, s.projectId, surface);
  }

  // Agent Browser binding: only for agents with the Browser capability on, bound
  // to that agent's site allowlist. Desktop only (Electron window).
  _browserFor(agentLike) {
    if (!agentLike || !agentLike.tools || !agentLike.tools.browser) return null;
    if (!require("./features.cjs").builtIn("browser")) return null; // not in this build
    try {
      const ab = require("./agent-browser.cjs"); // may be physically absent in public builds
      if (!ab.isEnabled()) return null; // admin master switch is off
      // Per-agent identity → per-agent window, so parallel agents browse independently.
      return ab.forAllowlist(agentLike.browserAllow || "", { id: agentLike.id, name: agentLike.name });
    } catch { return null; }
  }

  // Desktop Driver binding: agents with the Desktop capability operate native Windows
  // apps (UI Automation), confined to their app allowlist. Mirrors _browserFor.
  _desktopFor(agentLike) {
    if (!agentLike || !agentLike.tools || !agentLike.tools.desktop) return null;
    if (!require("./features.cjs").builtIn("desktop")) return null; // not in this build
    try {
      const dd = require("./desktop-driver.cjs"); // may be physically absent in public builds
      if (!dd.isEnabled()) return null; // admin master switch is off
      const allow = String(agentLike.desktopAllow || "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      return { allow };
    } catch { return null; }
  }

  // Agent-as-tool handoffs for interactive sessions: a roster agent runs as a
  // "member" so its tool calls and permission prompts surface in THIS session's UI
  // (no silent bypass). One level deep — a called agent can't call further agents.
  _rosterFor(s, cfg) {
    return (cfg.agents || []).filter((a) => a && a.instructions && (!s.agent || a.id !== s.agent.id));
  }
  _makeCallAgent(s, profile, cfg, emit, signal) {
    return async (name, task) => {
      const cfg2 = settings.load();
      const target = this._rosterFor(s, cfg2).find((a) =>
        (a.name || "").toLowerCase() === String(name || "").toLowerCase()) ||
        this._rosterFor(s, cfg2).find((a) => String(name || "").toLowerCase().includes((a.name || "§").toLowerCase()));
      if (!target) return `(no agent named "${name}" on the roster)`;
      const started = Date.now();
      let text = "", ok = true;
      try { text = await this._runMember(target, String(task || ""), profile, cfg2, emit, signal, s); }
      catch (e) { if (e.name === "AbortError") throw e; ok = false; text = "(handoff failed: " + String(e.message || e) + ")"; }
      try { agentHistory.record({ agentId: target.id, name: target.name, ok: ok && !!text, ms: Date.now() - started, tokens: Math.round((String(task || "").length + text.length) / 4), source: "handoff", summary: text.slice(0, 200) }); } catch {}
      return text || "(no output)";
    };
  }
  // Connectors/skills config filtered by the agent's enabled tools.
  _agentExtras(s, cfg) {
    const t = (s.agent && s.agent.tools) || {};
    return {
      connectors: t.connectors ? (cfg.connectors || []) : [],
      skillsDir: t.skills ? (cfg.skillsDirs || []) : [],
      disabledSkills: cfg.disabledSkills || [],
    };
  }

  async _turn(sessionId, userText, images) {
    const s = this.sessions.get(sessionId);
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) {
      this._send(sessionId, "error", { code: "no_profile", message: "No provider configured. Open Settings." });
      return;
    }

    // Diagnostic: shows in the [ELECTRON] terminal exactly which profile is active.
    // (The Anthropic subscription/OAuth path was removed pre-launch — API keys only.)
    const keyLen = (profile.apiKey || "").length;
    console.log(`[madav] turn → provider="${profile.name}" kind=${profile.kind} model="${profile.model}" baseUrl=${profile.baseUrl} keyLen=${keyLen}`);

    // Clear guard instead of a cryptic upstream 401.
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(profile.baseUrl || "");
    // Anthropic "use my Claude subscription" (admin/creator) needs no key — the Agent SDK
    // uses the logged-in `claude login` session instead.
    const subAuth = profile.kind === "anthropic" && profile.useSubscription;
    if (!isLocal && keyLen === 0 && !subAuth) {
      this._send(sessionId, "error", {
        code: "no_key",
        message: `No API key on the ACTIVE provider "${profile.name}". Open Settings, click "${profile.name}", paste its key, and make sure it's the one selected in the top-bar model picker.`,
      });
      return;
    }

    this._turns.set(sessionId, { sessionId, model: profile.model, provider: profile.name, mode: s.mode, promptChars: (userText || "").length, replyChars: 0, replyText: "", userText: userText || "" });
    // Floor visibility: stamp the conversation as active at turn START (saveSession bumps
    // updatedAt), so the live workforce view shows "working now" while the agent works —
    // not only after the turn completes.
    if (s.chatConvId) { try { const c0 = sstore.getSession(s.chatConvId); if (c0) sstore.saveSession(c0); } catch {} }

    // Workrooms: a run launched from a room (crew agent chat, room-scoped TEAM, plain
    // room chat) carries the room's projectId — inject the room's instructions +
    // knowledge once, up front. Cowork keeps its own flag-guarded copy in _agentTurn;
    // "project" mode has its own dedicated path below.
    if (s.projectId && !s._projInjected && s.mode !== "project" && !AGENT_MODES.has(s.mode)) {
      const roomProject = store.getProject(s.projectId);
      if (roomProject) userText = `${store.projectSystem(roomProject)}\n\n----- TASK -----\n${userText}`;
      s._projInjected = true;
    }

    if (s.team) return this._teamTurn(sessionId, userText, profile);
    if (s.mode === "project") return this._projectTurn(sessionId, userText, profile, images);
    if (AGENT_MODES.has(s.mode)) return this._agentTurn(sessionId, userText, profile, images);

    // Chat: if skills/connectors are configured and the model speaks OpenAI tools,
    // run the lightweight tool loop (skills + connectors, no file/shell). Else plain chat.
    // Exception: when the turn carries images, take the plain inline-vision path so a
    // vision-capable model (e.g. a NIM VLM) receives real pixels rather than a Read-file note.
    const cfg = settings.load();
    const agentExtras = s.agent && s.agent.tools && (s.agent.tools.connectors || s.agent.tools.skills || s.agent.tools.browser);
    const hasExtras = agentExtras || (cfg.skillsDirs || []).length > 0 || (cfg.connectors || []).some((c) => c.enabled);
    // Let's Chat = pure GENERATION (prompt -> output): EVERY model (weak + strong) builds office files through
    // the in-browser officedoc engine via _chatTurn below. The engine is now robust for weak models, so the old
    // "weak model -> Python file-save script" detour is removed — it only ever wasted a failing attempt before
    // falling back here anyway. Tasks that must READ a user-provided template/data file live in the folder
    // surfaces (projects / collaborate / agents), where the script path can open and process real files.
    if (profile.kind !== "anthropic" && hasExtras && cleanImgs(images).length === 0) {
      return this._chatAgentTurn(sessionId, userText, profile, cfg, images);
    }
    return this._chatTurn(sessionId, userText, profile, images);
  }

  // Smart data chat: a Let's Chat turn that needs file/spreadsheet work runs the full tool loop in a
  // scratch temp workspace (cowork-grade) so even weak models compute with a script and return a
  // download card — no folder to link. Auto-approved since the workspace is a throwaway temp dir.
  async _chatDataTurn(sessionId, userText, profile, cfg, images) {
    const s = this.sessions.get(sessionId);
    if (!s.cwd) { try { const d = require("path").join(os.tmpdir(), "madav-chat-" + sessionId); fs.mkdirSync(d, { recursive: true }); s.cwd = d; } catch {} }
    const histLen = Array.isArray(s.history) ? s.history.length : 0; // snapshot — roll back to here if we fall back to the no-code path
    const beforeFiles = s.cwd ? scanOffice(s.cwd) : null;
    let sawText = false;
    const emit = (e) => { if (e && e.kind === "assistant_delta" && e.data && String(e.data.text || "").trim()) sawText = true; this._send(sessionId, e.kind, e.data); };
    const text = (userText || "") + materializeImages(images);
    const controller = new AbortController(); s.controller = controller;
    let err = null;
    try {
      if (profile.kind === "anthropic") {
        s.sdkSessionId = await runAgentTurn({ sessionId, prompt: text, mode: "cowork", cwd: s.cwd, profile, permMode: "bypassPermissions", resume: s.sdkSessionId, emit, permissions: this.permissions, holds: this.holds });
      } else {
        await runOpenAIAgentTurn({ prompt: text, mode: "chat", dataTools: true, cwd: s.cwd, profile, permMode: "bypassPermissions", history: s.history, emit, permissions: this.permissions, signal: controller.signal, connectors: this._connectorsFor(s, cfg), skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: withLang(cfg), allowAskUser: true });
      }
    } catch (e) { err = e; }
    s.controller = null;
    if (err && err.name === "AbortError") { emit({ kind: "result", data: { subtype: "interrupted" } }); if (s.cwd) emitNewOutputs(emit, s.cwd, beforeFiles); return; }
    const produced = s.cwd ? emitNewOutputs(emit, s.cwd, beforeFiles) : [];
    // Persist produced files to the conversation so the download card SURVIVES navigating away + back
    // (mirrors _projectTurn). Without this a Let's Chat file shows live but vanishes on reopen.
    if (produced.length && s.chatConvId) { try { const conv = sstore.getSession(s.chatConvId); if (conv) { const seen = new Set((conv.outputs || []).map((o) => o.path)); conv.outputs = [...(conv.outputs || []), ...produced.filter((o) => !seen.has(o.path))]; sstore.saveSession(conv); } } catch {} }
    if (produced.length || sawText) { if (err) emit({ kind: "result", data: { subtype: "success" } }); return; } // a file and/or a written reply was shown
    // Nothing produced. NEVER dead-end or exit silently. A transient/credits/auth error keeps its specific
    // message (retry/switch won't change those). Otherwise the model couldn't drive the compute-in-a-script
    // path (a tools-rejection 400, or an empty agentic finish) → roll back any partial turn it appended and
    // ATTEMPT THE NO-CODE PATH (officedoc: the model writes the finished numbers, Madav builds the file),
    // which weak models can manage for a simple sheet. _chatTurn always replies (file, answer, or honest error).
    if (err && (err.code === "rate_limit" || err.code === "auth" || err.code === "credits")) {
      emit({ kind: "error", data: await this._friendlyError(err) });
      return;
    }
    if (err) console.error("[madav] _chatDataTurn script path failed → no-code fallback:", (err && err.message) || err);
    try { if (Array.isArray(s.history) && s.history.length > histLen) s.history.length = histLen; } catch {}
    return this._chatTurn(sessionId, userText, profile, images);
  }

  // Chat enriched with skills + connectors (OpenAI-compatible providers).
  async _chatAgentTurn(sessionId, userText, profile, cfg, images) {
    const s = this.sessions.get(sessionId);
    const controller = new AbortController();
    s.controller = controller;
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    userText = (userText || "") + materializeImages(images);
    const ex = s.agent ? this._agentExtras(s, cfg) : { connectors: this._connectorsFor(s, cfg), skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [] };
    try {
      const ap = this._permsFor(s.agent, "default");
      await runOpenAIAgentTurn({
        prompt: userText, mode: "chat", cwd: null, profile, permMode: ap.permMode,
        history: s.history, emit, permissions: ap.permissions, signal: controller.signal,
        agentName: (s.agent && s.agent.name) || "",
        connectors: ex.connectors, skillsDir: ex.skillsDir, disabledSkills: ex.disabledSkills, globalInstructions: withLang(cfg),
        systemOverride: this._agentSys(s, userText) || null,
        allowAskUser: true,
        roster: this._rosterFor(s, cfg),
        callAgent: this._makeCallAgent(s, profile, cfg, emit, controller.signal),
        browser: this._browserFor(s.agent), // chat-mode agents can browse too
        desktop: this._desktopFor(s.agent), // …and operate native Windows apps
        agentOpts: this._harnessFor(s.agent, profile),
      });
    } finally {
      s.controller = null;
    }
  }

  // ---- agent teams (multi-agent: relay pipelines + manager orchestration) ----
  // A member can pin its own model ("pid::model") — resolve it, else use the session profile.
  _memberProfile(member, fallback) {
    if (member.model && member.model.includes("::")) {
      const i = member.model.indexOf("::");
      const p = settings.load().profiles[member.model.slice(0, i)];
      if (p) return settings.resolveProfile({ ...p, model: member.model.slice(i + 2) }); // Starter pins get the session token
    }
    return fallback;
  }

  // Harness options (PLAN-AGENT-PARITY waves) — per-agent quality/cost toggles.
  // thorough = one self-review pass before the final answer ships;
  // reviewer  = a cheap-model "approve | flag: reason" verdict after each file change;
  // economyModel = "profileId::modelId" (same shape as a member model pin) that runs
  //   the scouts + reviewer so grunt work happens on a cheap model;
  // textTools = force the JSON-in-text protocol (models with no native tool calling).
  _harnessFor(agentLike, profile) {
    const a = agentLike || {};
    const eco = a.economyModel ? this._memberProfile({ model: a.economyModel }, null) : null;
    return {
      thorough: !!a.thorough,
      reviewerProfile: a.reviewer ? (eco || profile) : null,
      economyProfile: eco || null,
      textTools: !!a.textTools,
    };
  }

  _memberSys(member, taskText, team) {
    let sys = agentPrompt.memberSystem(member, taskText || "");
    // TEAM PLAYBOOK — plays pinned to the whole team apply to every member.
    const names = (team && team.pinnedSkills) || [];
    if (names.length) {
      try {
        const dirs = settings.load().skillsDirs || [];
        sys += require("./skills-manager.cjs").pinnedBlock(dirs, names, { record: true, by: (team && team.name) || "team", context: "team" });
      } catch {}
    }
    return sys;
  }

  // Run one member to completion, capturing its final text. Member tool calls and
  // permission prompts are forwarded to the UI; its prose is captured, not streamed.
  async _runMember(member, task, profile, cfg, emit, signal, s, depth = 1) {
    const prof = this._memberProfile(member, profile);
    const t = member.tools || {};
    let buf = "";
    if (prof.kind === "anthropic") {
      const { text } = await streamChat(prof, [{ role: "system", content: this._memberSys(member, task, s.team) }, { role: "user", content: task }], { signal, onDelta: () => {} });
      return text || "";
    }
    // Full multi-agent ecosystem: a delegated agent may itself delegate, capped at MAX_DEPTH so a
    // loop can't run away. At the cap no roster is offered, so delegation stops cleanly.
    const MAX_DEPTH = 3;
    const memberRoster = depth < MAX_DEPTH ? this._rosterFor({ ...s, agent: member }, cfg) : [];
    const memberCallAgent = (depth < MAX_DEPTH && memberRoster.length) ? async (name, subtask) => {
      const target = memberRoster.find((a) => (a.name || "").toLowerCase() === String(name || "").toLowerCase())
        || memberRoster.find((a) => String(name || "").toLowerCase().includes((a.name || "§").toLowerCase()));
      if (!target) return `(no agent named "${name}" on the roster)`;
      try { return await this._runMember(target, String(subtask || ""), profile, cfg, emit, signal, s, depth + 1); }
      catch (e) { if (e.name === "AbortError") throw e; return "(handoff failed: " + String((e && e.message) || e) + ")"; }
    } : null;
    const innerEmit = (e) => {
      if (e.kind === "assistant_delta") { buf += (e.data && e.data.text) || ""; return; }
      if (e.kind === "assistant_message" || e.kind === "result" || e.kind === "init") return; // member lifecycle stays internal
      emit(e); // tool_use / tool_result / permission_request / user_question / error → visible
    };
    await runOpenAIAgentTurn({
      prompt: task,
      agentName: (member && member.name) || "",
      mode: (t.files || t.shell) && s.cwd ? "cowork" : "chat",
      cwd: (t.files || t.shell) ? (s.cwd || null) : null,
      profile: prof, permMode: this._permsFor(member, s.permMode || "default").permMode,
      history: [], emit: innerEmit, permissions: this._permsFor(member, s.permMode || "default").permissions, signal,
      connectors: t.connectors ? (cfg.connectors || []) : [],
      skillsDir: t.skills ? (cfg.skillsDirs || []) : [],
      disabledSkills: cfg.disabledSkills || [],
      roster: memberRoster, callAgent: memberCallAgent, // full multi-agent — members may delegate onward (depth-capped)
      systemOverride: this._memberSys(member, task, s.team),
      allowAskUser: true, // members can pause the mission with a question for the user
      browser: this._browserFor(member),
      desktop: this._desktopFor(member),
      noShell: !t.shell, // Shell capability off → run_bash neither offered nor executable
      agentOpts: this._harnessFor(member, prof),
    });
    return buf.trim();
  }

  async _teamTurn(sessionId, userText, profile) {
    const s = this.sessions.get(sessionId);
    const team = s.team;
    const cfg = settings.load();
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    const controller = new AbortController();
    s.controller = controller;
    const signal = controller.signal;
    emit({ kind: "init", data: { model: profile.model, provider: profile.name, kind: profile.kind, mode: "team" } });
    const started = Date.now();
    const members = team.members.slice(0, 6); // hard cap — cost discipline
    const rid = () => newId("team_");
    const convId = s.chatConvId || null;

    // Cost guardrail — per-mission token budget (team setting, else global; 0 = off).
    // Tokens are estimated from characters (~4 chars/token), same basis as Consumption.
    const budget = Number(team.budgetTokens) || Number(cfg.missionTokenBudget) || 0;
    let usedTokens = 0;
    const addUsage = (...texts) => {
      usedTokens += Math.round(texts.reduce((n, x) => n + String(x || "").length, 0) / 4);
      if (budget) emit({ kind: "budget", data: { used: usedTokens, max: budget } });
    };
    const overBudget = () => budget > 0 && usedTokens >= budget;
    let budgetNote = "";

    // Durable missions — when resuming, restore checkpointed member outputs so only
    // the remaining stations run.
    let restored = [];
    let savedPlan = null;
    if (s.resumeMission && convId) {
      const prev = missionStore.get(convId);
      if (prev && !prev.finished && prev.userText === userText && Array.isArray(prev.outputs)) {
        restored = prev.outputs.filter((o) => o && o.name && o.text);
        savedPlan = Array.isArray(prev.plan) && prev.plan.length ? prev.plan : null;
      }
      s.resumeMission = false;
    }
    const checkpoint = (plan, outputs, finished) => {
      if (!convId) return;
      try {
        missionStore.save(convId, {
          teamName: team.name || "", mode: team.mode, userText,
          plan: (plan || []).map((p) => ({ member: p.member.name, task: p.task })),
          outputs, finished: !!finished,
        });
      } catch {}
    };

    // Run one member, fully instrumented: tool cards for Mission Control, per-agent
    // run history (track record), memory learning, and budget accounting.
    const runStep = async (member, task, label) => {
      const stepId = rid();
      emit({ kind: "tool_use", data: { id: stepId, name: `${member.name} (teammate)`, input: { task: label || "sub-task" }, auto: true } });
      const t0 = Date.now();
      let text = "", ok = true;
      try { text = await this._runMember(member, task, profile, cfg, emit, signal, s); }
      catch (e) { if (e.name === "AbortError") throw e; ok = false; text = "(member failed: " + String(e.message || e) + ")"; }
      if (!text) { text = "(no output)"; ok = false; }
      emit({ kind: "tool_result", data: { id: stepId, output: text.slice(0, 4000) } });
      addUsage(task, text);
      try { agentHistory.record({ agentId: member.id, name: member.name, ok, ms: Date.now() - t0, tokens: Math.round((task.length + text.length) / 4), source: "team", summary: text.slice(0, 200) }); } catch {}
      if (ok && text.length > 200) { try { agentMemory.learnFromMission(this._memberProfile(member, profile), member, task, text); } catch {} }
      return { name: member.name, text };
    };

    let plan = members.map((m) => ({ member: m, task: "" }));
    try {
      // 1) Plan. Relay = everyone in order, work flows down the line.
      //    Manager = a coordinator assigns each member a specific sub-task first.
      if (team.mode === "manager" && savedPlan) {
        // Resuming: reuse the original plan so completed steps line up with stations.
        const mapped = savedPlan.map((p) => ({ member: members.find((m) => m.name === p.member), task: p.task || "" })).filter((p) => p.member);
        if (mapped.length) plan = mapped;
      } else if (team.mode === "manager") {
        const roster = members.map((m) => `- ${m.name}: ${m.description || m.instructions.slice(0, 120)}`).join("\n");
        const planId = rid();
        emit({ kind: "tool_use", data: { id: planId, name: `Team plan — ${team.name || "your team"}`, input: { mission: userText }, auto: true } });
        try {
          const { text } = await streamChat(profile, [
            { role: "system", content: `You are the coordinator of an agent team. Team roster:\n${roster}\n\nSplit the user's mission into one focused sub-task per useful member (skip members that add nothing). Reply with ONLY a JSON array, no prose: [{"member":"<exact member name>","task":"<specific, self-contained sub-task>"}]` },
            { role: "user", content: userText },
          ], { signal, onDelta: () => {} });
          const i = text.indexOf("["); const j = text.lastIndexOf("]");
          const arr = i >= 0 && j > i ? JSON.parse(text.slice(i, j + 1)) : null;
          if (Array.isArray(arr) && arr.length) {
            plan = arr.slice(0, 6)
              .map((p) => ({ member: members.find((m) => m.name === p.member) || members.find((m) => (p.member || "").toLowerCase().includes(m.name.toLowerCase())), task: String(p.task || "") }))
              .filter((p) => p.member);
            if (!plan.length) plan = members.map((m) => ({ member: m, task: "" }));
          }
          emit({ kind: "tool_result", data: { id: planId, output: plan.map((p, i2) => `${i2 + 1}. ${p.member.name} — ${p.task || "full mission"}`).join("\n") } });
        } catch (e) {
          emit({ kind: "tool_result", data: { id: planId, output: "(planning failed — falling back to relay order: " + String(e.message || e) + ")" } });
        }
        addUsage(userText);
      }

      // Mission Control: stamp restored stations as done without re-running them.
      const doneNames = new Set(restored.map((o) => o.name));
      for (const o of restored) {
        const restId = rid();
        emit({ kind: "tool_use", data: { id: restId, name: `${o.name} (teammate)`, input: { task: "resumed from checkpoint" }, auto: true } });
        emit({ kind: "tool_result", data: { id: restId, output: String(o.text).slice(0, 4000) } });
      }

      // 2) Execute. Managed → PARALLEL FAN-OUT: sub-tasks are independent, so every member
      //    works at the same time and the coordinator merges. Relay → strictly in order,
      //    each member receiving all prior teammates' work (that chaining is the point).
      const outputs = [...restored];
      checkpoint(plan, outputs, false);
      if (team.mode === "manager") {
        const todo = plan.filter((step) => !doneNames.has(step.member.name));
        await Promise.all(todo.map((step) => {
          const task = `MISSION (from the user):\n${userText}` + (step.task ? `\n\nYOUR ASSIGNED SUB-TASK (do only this part):\n${step.task}` : "");
          return runStep(step.member, task, step.task || "full mission")
            .then((o) => { outputs.push(o); return o; }); // checkpoint ONCE after the join (avoid O(N²) re-serialize)
        }));
        checkpoint(plan, outputs, false); // single post-wave checkpoint contains all member outputs for resume
        if (signal.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" }); // don't synthesize after a mid-flight stop

        // 2b) Conditional flows v1 — the coordinator REVIEWS the results and can launch
        // follow-up waves ("if Scout found nothing, send Radar; else proceed"), and may
        // recruit from the user's full agent roster, not just the fixed line-up.
        const bench = (cfg.agents || []).filter((a) => a && a.instructions && !members.some((m) => m.id === a.id));
        const findByName = (nm) => members.find((m) => m.name === nm) || bench.find((a) => a.name === nm) ||
          members.find((m) => String(nm || "").toLowerCase().includes((m.name || "§").toLowerCase())) || null;
        for (let wave = 0; wave < 2 && !signal.aborted; wave++) {
          if (overBudget()) { budgetNote = `Token budget reached (~${usedTokens.toLocaleString()} of ${budget.toLocaleString()} est. tokens) — stopped before follow-up waves. Raise the team's budget to let the coordinator keep going.`; break; }
          const reviewId = rid();
          emit({ kind: "tool_use", data: { id: reviewId, name: "Coordinator review", input: { round: wave + 1 }, auto: true } });
          let decision = null;
          try {
            const rosterTxt = members.map((m) => `- ${m.name} (on the team): ${m.description || ""}`)
              .concat(bench.slice(0, 10).map((a) => `- ${a.name} (bench — can be recruited): ${a.description || ""}`)).join("\n");
            const body = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 6000)}`).join("\n\n");
            const { text } = await streamChat(profile, [
              { role: "system", content: `You are the coordinator of an agent team reviewing mission progress. Available agents:\n${rosterTxt}\n\nDecide whether follow-up work is needed (a member found nothing, results conflict, a clear gap remains) or the mission is complete. Reply with ONLY JSON, no prose: {"done":true,"reason":"<short>"} OR {"done":false,"steps":[{"member":"<exact agent name>","task":"<specific follow-up sub-task>"}]} — max 3 steps, and only steps that materially improve the deliverable. Be decisive; "done" is the common correct answer.` },
              { role: "user", content: `Mission:\n${userText}\n\nResults so far:\n${body}` },
            ], { signal, onDelta: () => {} });
            const i = text.indexOf("{"); const j = text.lastIndexOf("}");
            decision = i >= 0 && j > i ? JSON.parse(text.slice(i, j + 1)) : null;
          } catch {}
          addUsage(userText);
          const steps = decision && decision.done === false && Array.isArray(decision.steps)
            ? decision.steps.map((p) => ({ member: findByName(p.member), task: String(p.task || "") })).filter((p) => p.member && p.task).slice(0, 3)
            : [];
          if (!steps.length) {
            emit({ kind: "tool_result", data: { id: reviewId, output: decision && decision.reason ? `Mission complete — ${decision.reason}` : "Mission complete — no follow-up needed." } });
            break;
          }
          emit({ kind: "tool_result", data: { id: reviewId, output: "Follow-up wave: " + steps.map((p) => `${p.member.name} — ${p.task}`).join("; ") } });
          const ctx = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 6000)}`).join("\n\n");
          await Promise.all(steps.map((step) =>
            runStep(step.member, `MISSION (from the user):\n${userText}\n\nWORK SO FAR:\n${ctx}\n\nYOUR FOLLOW-UP SUB-TASK (do only this part):\n${step.task}`, step.task)
              .then((o) => { outputs.push(o); return o; }))); // checkpoint ONCE after the join (avoid O(N²) re-serialize)
          checkpoint(plan, outputs, false); // single post-wave checkpoint contains all outputs for resume
        }
        if (signal.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
      } else {
        for (const step of plan) {
          if (signal.aborted) throw Object.assign(new Error("interrupted"), { name: "AbortError" });
          if (doneNames.has(step.member.name)) continue; // restored from checkpoint
          if (overBudget()) { budgetNote = `Token budget reached (~${usedTokens.toLocaleString()} of ${budget.toLocaleString()} est. tokens) — remaining stations were skipped. Raise the team's budget and resume to finish.`; break; }
          // Trim each teammate's contribution so the hand-off context can't balloon past limits.
          const prior = outputs.map((o) => `=== Work from ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
          const task = `MISSION (from the user):\n${userText}` +
            (prior ? `\n\nWORK FROM YOUR TEAMMATES SO FAR:\n${prior}` : "");
          outputs.push(await runStep(step.member, task, "mission + teammates' work"));
          checkpoint(plan, outputs, false);
        }
      }

      // 3) Deliver. Relay → the last member's work IS the deliverable.
      //    Manager → the coordinator synthesizes everything into one answer (streamed).
      let finalText = "";
      if (team.mode === "manager" && outputs.length > 1) {
        const body = outputs.map((o) => `=== ${o.name} ===\n${String(o.text).slice(0, 12000)}`).join("\n\n");
        const { text } = await streamChat(profile, [
          { role: "system", content: "You are the coordinator of an agent team. Synthesize your team's work into ONE clear, complete answer to the user's mission. Credit no one; just deliver the result. Do not mention the team mechanics." },
          { role: "user", content: `Mission:\n${userText}\n\nTeam output:\n${body}` },
        ], { signal, onDelta: (d) => emit({ kind: "assistant_delta", data: { text: d } }) });
        finalText = text;
        addUsage(finalText);
      } else {
        finalText = (outputs[outputs.length - 1] || {}).text || "(the team produced no output)";
        emit({ kind: "assistant_delta", data: { text: finalText } });
      }
      if (budgetNote) {
        const note = `\n\n> ⚠ ${budgetNote}`;
        finalText += note;
        emit({ kind: "assistant_delta", data: { text: note } });
      }
      s.history.push({ role: "user", content: userText });
      s.history.push({ role: "assistant", content: finalText });
      checkpoint(plan, outputs, true); // mission complete — clears the resume banner
      emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
      emit({ kind: "result", data: { subtype: "success", num_turns: plan.length + 1, duration_ms: Date.now() - started } });
    } catch (err) {
      if (err.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted", duration_ms: Date.now() - started } });
      else emit({ kind: "error", data: await this._friendlyError(err) });
    } finally {
      s.controller = null;
    }
  }

  // ---- chat transport ----
  // Build an {code, message} error payload, upgrading unknown raw errors to a
  // friendly sentence via the cached explainer (keeps the raw text in `detail`).
  async _friendlyError(err) {
    const code = (err && err.code) || "error";
    const raw = String((err && err.message) || err || "Error");
    if (FRIENDLY_CODES.has(code)) return { code, message: raw };
    try {
      const friendly = await errorExplainer.explain(raw, { timeoutMs: 4000 });
      if (friendly) return { code, message: friendly, detail: raw };
    } catch {}
    return { code, message: raw };
  }

  async _chatTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    // Agent image knowledge: on the FIRST turn of a session with a custom agent, inline
    // the agent's knowledge images so vision-capable models see them up front. They ride
    // the normal image path (image_url / base64). NOTE: models without vision will error
    // or ignore image blocks — acceptable for v1; text knowledge is unaffected.
    let turnText = userText, turnImages = images;
    if (s.agent && s.history.length === 0) {
      const knImgs = agentPrompt.knowledgeImages(s.agent);
      if (knImgs.length) {
        turnImages = [...(images || []), ...knImgs];
        turnText = userText + knImgs.map((im) => `\n[Agent knowledge image: ${im.name}]`).join("");
      }
    }
    // Vision: inline image blocks (OpenAI image_url / Anthropic base64) on this no-tool path.
    s.history.push({ role: "user", content: inlineContent(turnText, turnImages, profile.kind) });
    const controller = new AbortController();
    s.controller = controller;
    this._send(sessionId, "init", { model: profile.model, provider: profile.name, kind: profile.kind, mode: s.mode });
    const gi = settings.load().globalInstructions;
    const now = new Date();
    const dateLine = `The current date is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Use this whenever a date is needed; never say you don't know it.`;
    const sysChat = (this._agentSys(s, userText) || ("You are Madav, a helpful AI assistant built by the Madav team. You are NOT Claude, ChatGPT, Gemini, or any other assistant; if anyone asks who you are or who made you, you are Madav. " + dateLine +
      " Reply directly with the final answer only. Do NOT show your reasoning, inner monologue, or <think> notes. Keep greetings to one short sentence.")) + ARTIFACT_RULE_BASE + officeRulePart() +
      (gi ? `\n\nUser's custom instructions (always follow):\n${gi}` : "");
    const messages = [{ role: "system", content: sysChat }, ...s.history];
    const started = Date.now();
    let category = "general";
    try { const { categoryFor } = await routerMod(); category = categoryFor({ mode: s.mode, hasImage: (turnImages || []).length > 0, needsData: false }); } catch {}
    let usedModel = profile.model, usedProvider = profile.name; // Stage 4: the model that ACTUALLY answered (may differ after a reroute)
    try {
      const { text } = await streamChat(profile, messages, {
        signal: controller.signal, category,
        onDelta: (d) => this._send(sessionId, "assistant_delta", { text: d }),
        onFallback: (m) => { try { usedModel = m.model; usedProvider = m.name || usedProvider; this._send(sessionId, "init", { model: usedModel, provider: usedProvider, kind: profile.kind, mode: s.mode, rerouted: true }); } catch {} },
      });
      s.history.push({ role: "assistant", content: text }); // keep history clean (sent to the API next turn); model shown via events below
      this._send(sessionId, "assistant_message", { stop_reason: "end_turn", model: usedModel, provider: usedProvider });
      this._send(sessionId, "result", { subtype: "success", num_turns: 1, duration_ms: Date.now() - started, total_cost_usd: 0 });
    } catch (err) {
      if (err.name === "AbortError") this._send(sessionId, "result", { subtype: "interrupted", duration_ms: Date.now() - started });
      else this._send(sessionId, "error", await this._friendlyError(err));
    } finally {
      s.controller = null;
    }
  }

  // ---- project conversations (persisted, knowledge-grounded chat) ----
  // Deterministic project engine (single source: core/project-runner.js). For a folder-linked DATA
  // task: inspect the files ourselves, then either REPLAY the saved job or AUTHOR one script (bounded
  // repair), validate the output, and save the job. Returns true if it handled the turn; false/throw
  // -> caller falls open to the caged agent loop. Web uses the SAME core orchestrator with its adapters.
  async _tryProjectJob({ s, project, profile, userText, beforeFiles, pe, emit, controller }) {
    if (!(project.folder && beforeFiles && beforeFiles.size > 0)) return false;
    s.history.push({ role: "user", content: userText }); // persist the prompt into THIS chat's history
    emit({ kind: "init", data: { model: profile.model, mode: "project", provider: profile.name } }); // bind chat<->session so leaving + returning re-attaches the live run (not a new window)
    const PJ = await _pj(), PR = await _pr();
    const path2 = require("path");
    const pybin = (pe && pe.py) || "python";
    const withHeartbeat = async (label, fn) => { const t0 = Date.now(); const hb = setInterval(() => { if (!controller.signal.aborted) emit({ kind: "assistant_delta", data: { text: "\n  …still " + label + " (" + Math.round((Date.now() - t0) / 1000) + "s)" } }); }, 30000); try { return await fn(); } finally { clearInterval(hb); } };
    const adapters = {
      model: profile.model, provider: profile.name,
      emit: (kind, data) => {
        if (kind !== "status") return;
        const p = data && data.phase; let t = "";
        if (p === "inspect") t = "Taking a look at your files…";
        else if (p === "inspected") t = "Got your data — " + (data.count || 0) + " file(s)" + (data.files && data.files.length ? " (" + data.files.join(", ") + ")" : "") + ".";
        else if (p === "author") t = "Building your report…";
        else if (p === "running") t = "Crunching the numbers…";
        else if (p === "replay") t = "Reusing the steps from last time — this should be quick…";
        else if (p === "repair") t = "That didn't come out right — adjusting and trying again…";
        else t = (data && data.reason) || "";
        if (t) emit({ kind: "assistant_delta", data: { text: "\n• " + t } });
      },
      inspect: async (folder) => { const r = await runScriptInFolder(PR.INSPECT_PY, folder, { bin: pybin }); try { return JSON.parse(r.output); } catch { return []; } },
      loadJobs: async () => store.getJobs(s.projectId),
      saveJobs: async (list) => store.saveJobs(s.projectId, list),
      author: async ({ task, instructions, schema, fixError, prevScript }) => {
        if (controller.signal.aborted) return { script: "", outputs: [] };
        const prompt = PJ.authoringPrompt({ task, instructions, schema, fixError, prevScript });
        try {
          const out = await withHeartbeat("building your report", () => streamChat(profile, [{ role: "system", content: "You write ONE complete Python script. Output only a single python code block, no prose." }, { role: "user", content: prompt }], { signal: controller.signal }));
          return { script: PJ.extractScript(out && out.text), outputs: [] };
        } catch (e) { return { script: "", outputs: [] }; }
      },
      run: async (script, folder) => {
        if (controller.signal.aborted) return { ok: false, error: "stopped", produced: [] };
        const before = scanOffice(folder);
        const _res = await withHeartbeat("crunching the numbers", () => runScriptInFolder(script, folder, { bin: pybin }));
        const after = scanOffice(folder);
        const produced = [...after].filter(([p, m]) => before.get(p) !== m).map(([p]) => path2.basename(p));
        const _err = produced.length ? "" : (_res && _res.output ? String(_res.output).slice(-2000) : "the script produced no output file");
        return { ok: produced.length > 0, error: _err, produced };
      },
    };
    let _hardStop, _timedOut = false;
    _hardStop = setTimeout(() => { _timedOut = true; try { controller.abort(); } catch {} }, 8 * 60 * 1000);
    let result;
    try { result = await PR.runProjectJob({ task: userText, instructions: project.instructions || "", folder: project.folder }, adapters, { signal: controller.signal, maxRepair: 3 }); }
    finally { clearTimeout(_hardStop); }
    if (_timedOut || (result && result.aborted)) {
      const tm = "This one took longer than expected, so I stopped it rather than let it hang. Often a second run gets it; if it keeps taking too long, try simplifying the report a little.";
      s.history.push({ role: "assistant", content: tm });
      emit({ kind: "assistant_delta", data: { text: "\n\n" + tm } });
      emit({ kind: "assistant_message", data: { stop_reason: "guard" } });
      emit({ kind: "result", data: { subtype: "guard_time" } });
      return true;
    }
    const note = result.ok
      ? (result.mode === "replay" ? "All done — I reused the steps from last time on your current data, so this was quick." : "All done — your report is ready below. Take a look; I've saved these steps, so next time runs instantly. If anything looks off, tweak the project instructions and run it again.")
      : ("I wasn't able to finish this one — it kept running into: " + (result.error ? String(result.error).split("\n").filter(Boolean).pop().slice(0, 200) : "an unexpected problem") + ". Want me to take a look, or try simplifying the report a little?");
    s.history.push({ role: "assistant", content: note });
    emit({ kind: "assistant_delta", data: { text: "\n\n" + note } });
    emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
    emit({ kind: "result", data: { subtype: result.ok ? "success" : "failed" } });
    return true;
  }

  async _projectTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    const project = store.getProject(s.projectId);
    if (!project) { this._send(sessionId, "error", { code: "no_project", message: "Project not found." }); return; }
    const useFolder = !!project.folder;
    const t0 = Date.now();
    const beforeFiles = useFolder ? scanOffice(project.folder) : null;
    const pe = useFolder ? await pyEnv().catch(() => ({})) : null;
    let pyNote = "";
    if (useFolder) {
      if (pe && pe.py) { pyNote = 'Python is available as "' + pe.py + '" (pandas: ' + (pe.pandas ? "yes" : "no") + ", openpyxl: " + (pe.openpyxl ? "yes" : "no") + ")."; if (!pe.pandas || !pe.openpyxl) pyNote += " Install the missing libraries first: " + pe.py + " -m pip install --user pandas openpyxl."; }
      else { pyNote = "No Python was detected on this machine — install Python 3 with pandas + openpyxl, or compute the result inline without scripts."; }
    }
    if (useFolder && beforeFiles && beforeFiles.size > 0) tidyScratchPy(project.folder); // keep the data folder pristine — stash stray scripts BEFORE the run so the model never trips over old ones
    const beforeScripts = useFolder ? scanScripts(project.folder) : null;
    let recipeBlock = "", laneUsed = "C"; // Stage 3 — recipe priming + the lane actually used (captured in finally)
    try { const R = await _rec(); const recs = store.getRecipes(s.projectId); const clean = recs.filter((r) => R.recipeInScope(r, project.folder)); if (clean.length !== recs.length) store.saveRecipes(s.projectId, clean); const rcp = R.matchRecipe(clean, userText); if (rcp) recipeBlock = R.recipePromptBlock(rcp); } catch {}
    const gi = settings.load().globalInstructions;
    const weakProc = (useFolder && !isDeckCapable((profile && profile.model) || "")) ? weakDataProc() : ""; // weak model + folder -> restore the rigid one-pass recipe
    const sys = store.projectSystem(project) + ARTIFACT_RULE_BASE + officeRulePart((profile && profile.model) || "") +
      (useFolder ? `\n\nThis room is linked to a folder at: ${project.folder}. DEFAULT \u2014 to GENERATE a report / spreadsheet / deck / document from a description, emit ONE officedoc block (per the office rules above) and nothing else for that deliverable: Madav builds the polished file with its engine and saves it directly INTO this folder, so do NOT write a script for pure generation. Use your file / script tools ONLY when the task needs you to READ and process files that ALREADY EXIST in this folder (e.g. summarise a provided CSV, or fill a template the user placed here) \u2014 then read them, compute, and SAVE the finished file into this folder by name (e.g. result.to_excel("Summary.xlsx")). ${pyNote} Either way the deliverable ends up in this folder; then reply with ONE short, plain-English sentence naming it.` : "") +
      " After you have produced and saved the deliverable, write the user a short, friendly 1-2 sentence summary in plain everyday English of what you made and where it is. (Keep all the real numbers and detail INSIDE the spreadsheet/document/deck — only the chat message itself should be brief. This rule never reduces what goes into the file.)" +
      (gi ? `\n\nUser's custom instructions (always follow):\n${gi}` : "") + weakProc;
    const cfg = settings.load();
    const emit = (e) => this._send(sessionId, e.kind, e.data);
    const controller = new AbortController();
    s.controller = controller;

    // index 0 is the project system message; keep it current each turn
    if (!s.history.length) s.history.push({ role: "system", content: sys });
    else if (s.history[0].role === "system") s.history[0].content = sys;
    else s.history.unshift({ role: "system", content: sys });
    if (recipeBlock && s.history[0] && s.history[0].role === "system") s.history[0].content += recipeBlock; // Stage 3 — prime with the proven recipe

    try {
      if (profile.kind === "anthropic" && useFolder) {
        // Folder-linked room with Claude: use the Agent SDK so it gets real file tools
        // (read_file/list_dir/run_bash) over the room's folder — not a tool-less Q&A.
        s.history.push({ role: "user", content: userText });
        let acc = "";
        const emitAcc = (ev) => { if (ev.kind === "assistant_delta") acc += (ev.data && ev.data.text) || ""; emit(ev); };
        s.sdkSessionId = await runAgentTurn({
          sessionId, prompt: `${sys}\n\n----- TASK -----\n${userText}`, mode: "cowork", cwd: project.folder, profile,
          permMode: project.autoApprove ? "bypassPermissions" : (s.permMode || "default"),
          resume: s.sdkSessionId, emit: emitAcc, permissions: this.permissions, holds: this.holds,
        });
        if (acc) s.history.push({ role: "assistant", content: acc });
      } else if (profile.kind === "anthropic") {
        s.history.push({ role: "user", content: inlineContent(userText, images, "anthropic") });
        emit({ kind: "init", data: { model: profile.model, mode: "project", provider: profile.name } });
        const started = Date.now();
        const { text } = await streamChat(profile, s.history, {
          signal: controller.signal,
          onDelta: (d) => emit({ kind: "assistant_delta", data: { text: d } }),
        });
        s.history.push({ role: "assistant", content: text });
        emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
        emit({ kind: "result", data: { subtype: "success", duration_ms: Date.now() - started } });
      } else {
        // Stage 2 — lane routing (single source: core/project-lanes.js). A "produce a document" task with
        // NO data files to read is forced down the deterministic engine path: mode "chat" = no script tools,
        // so the model MUST emit ONE officedoc block, which Madav's engine renders into the folder. Data work
        // and everything else keep the caged agent loop ("cowork" — the protected weak-model data pipeline,
        // unchanged). decideLane only picks DOCUMENT when there are no data files, so nothing is fabricated.
        // Fail-open: any error -> lane "C" -> exactly today's behavior.
        let lane = "C";
        try { const { decideLane } = await _pl(); lane = decideLane({ recipe: recipeBlock ? {} : null, hasDataFiles: !!(beforeFiles && beforeFiles.size), task: userText }); } catch {}
        laneUsed = lane;
        const laneMode = lane === "A" ? "chat" : (useFolder ? "cowork" : "chat");
        let handled = false;
        if (useFolder && lane !== "A") { try { handled = await this._tryProjectJob({ s, project, profile, userText, beforeFiles, pe, emit, controller }); } catch (oe) { handled = false; try { if (s.history.length && s.history[s.history.length - 1].role === "user") s.history.pop(); } catch {} } }
        if (!handled) await runOpenAIAgentTurn({
          prompt: userText + materializeImages(images), mode: laneMode, cwd: project.folder || null, profile, permMode: project.autoApprove ? "bypassPermissions" : "default",
          history: s.history, emit, permissions: this.permissions, signal: controller.signal,
          connectors: this._connectorsFor(s, cfg), skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [], globalInstructions: withLang(cfg),
          systemOverride: sys,
        });
      }
    } catch (e) {
      if (e.name === "AbortError") emit({ kind: "result", data: { subtype: "interrupted" } });
      else emit({ kind: "error", data: await this._friendlyError(e) });
    } finally {
      s.controller = null;
      const newOuts = (useFolder && project.folder) ? emitNewOutputs(emit, project.folder, beforeFiles) : [];
      // False-success guard: if the model CLAIMED it made a file but none appeared, tell the user — never let a false "done" stand.
      try {
        if (useFolder && newOuts.length === 0) {
          const lastA = [...s.history].reverse().find((m) => m && m.role === "assistant" && typeof m.content === "string");
          const rt = (lastA && lastA.content) || "";
          if (/\b(created|saved|generated|wrote|exported|produced)\b[\s\S]{0,90}\.(xlsx|xlsm|docx|pptx|pdf|csv)\b/i.test(rt) || /\.(xlsx|xlsm|docx|pptx|pdf|csv)\b[\s\S]{0,50}\b(created|saved|generated|ready)\b/i.test(rt)) {
            const warn = "⚠ Heads up: I reported creating a file, but no new file actually appeared in this folder — the run didn't truly complete (often a weaker model claiming success without it). Please re-run, ideally on a more capable model.";
            s.history.push({ role: "assistant", content: warn });
            emit({ kind: "assistant_delta", data: { text: "\n\n" + warn } });
          }
        }
      } catch {}
      const msgs = s.history.filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length);
      const conv = store.getConversation(s.conversationId) || { id: s.conversationId, projectId: s.projectId, title: "New conversation", createdAt: Date.now() };
      conv.messages = msgs;
      // Persist produced output files so their Open/Download cards survive reopen (the card is otherwise
      // a live-only event). Keyed by path so re-runs that overwrite the same file don't duplicate it.
      if (newOuts.length) {
        const seen = new Set((conv.outputs || []).map((o) => o.path));
        conv.outputs = [...(conv.outputs || []), ...newOuts.filter((o) => !seen.has(o.path))];
      }
      if (conv.title === "New conversation") {
        const fu = msgs.find((m) => m.role === "user");
        if (fu) conv.title = String(fu.content).slice(0, 48);
      }
      if (profile && profile.model) { conv.model = profile.model; conv.provider = profile.name; } // remember the model this chat ran with so re-opening restores it (parity with Let's Chat)
      store.saveConversation(conv);
      // Stage 3 — capture: a run that produced a deliverable becomes a reusable recipe for this task
      // (the NEW .py scripts it wrote + the output names), replayed next time via recipePromptBlock. Fail-open.
      try {
        if (useFolder && project.folder && newOuts.length) {
          const path = require("path");
          const after = scanScripts(project.folder);
          const scripts = [...after].filter((p) => !beforeScripts || !beforeScripts.has(p)).slice(0, 4)
            .map((p) => { let content = ""; try { content = fs.readFileSync(p, "utf8"); } catch {} return { name: path.basename(p), content }; });
          const R = await _rec();
          const recipe = R.makeRecipe({ task: userText, scripts, outputs: newOuts.map((o) => o.name), lane: laneUsed, model: (profile && profile.model) || "" });
          if (R.recipeInScope(recipe, project.folder)) store.saveRecipes(s.projectId, R.upsertRecipe(store.getRecipes(s.projectId), recipe));
        }
      } catch {}
      try { if (useFolder && beforeFiles && beforeFiles.size > 0) tidyScratchPy(project.folder); } catch {} // and clean the script(s) THIS run wrote, so the folder stays pristine
    }
  }

  // ---- agent transport (routed by profile kind) ----
  async _agentTurn(sessionId, userText, profile, images) {
    const s = this.sessions.get(sessionId);
    if (!s.cwd) {
      this._send(sessionId, "error", { code: "no_folder", message: "Pick a working folder first (Choose folder)." });
      return;
    }
    // Cowork task scoped to a project: inject its instructions + knowledge once, up front.
    if (s.projectId && !s._projInjected) {
      const project = store.getProject(s.projectId);
      if (project) { userText = `${store.projectSystem(project)}\n\n----- TASK -----\n${userText}`; }
      s._projInjected = true;
    }
    userText = (userText || "") + materializeImages(images);
    const emit = (e) => this._send(sessionId, e.kind, e.data);

    // Custom agent in a folder session: inject its instructions once, up front (SDK path),
    // and as systemOverride on the self-built loop below.
    if (s.agent && profile.kind === "anthropic" && !s._agentInjected) {
      userText = `${this._agentSys(s, userText)}\n\n----- TASK -----\n${userText}`;
      s._agentInjected = true;
    }

    if (profile.kind === "anthropic") {
      // Anthropic (or a proxy): full Agent SDK.
      s.sdkSessionId = await runAgentTurn({
        sessionId, prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: s.permMode,
        resume: s.sdkSessionId, emit, permissions: this.permissions, holds: this.holds,
      });
    } else {
      // External OpenAI-compatible model (NIM/OpenRouter/local): Madav's own loop.
      const controller = new AbortController();
      s.controller = controller;
      try {
        const cfg = settings.load();
        const ex = s.agent ? this._agentExtras(s, cfg) : { connectors: this._connectorsFor(s, cfg), skillsDir: cfg.skillsDirs || [], disabledSkills: cfg.disabledSkills || [] };
        // A custom agent keeps the mode's file-tool system prompt and appends its own
        // instructions (a full override would lose the tool-usage guidance).
        const agentSys = this._agentSys(s, userText);
        const ap = this._permsFor(s.agent, s.permMode);
        await runOpenAIAgentTurn({
          prompt: userText, mode: s.mode, cwd: s.cwd, profile, permMode: ap.permMode,
          history: s.history, emit, permissions: ap.permissions, signal: controller.signal,
          connectors: ex.connectors, skillsDir: ex.skillsDir, disabledSkills: ex.disabledSkills,
          globalInstructions: agentSys ? `${agentSys}\n\n${withLang(cfg)}` : withLang(cfg),
          allowAskUser: true,
          roster: this._rosterFor(s, cfg),
          callAgent: this._makeCallAgent(s, profile, cfg, emit, controller.signal),
          browser: this._browserFor(s.agent),
          desktop: this._desktopFor(s.agent),
          // A custom agent with Shell off never gets run_bash; plain folder
          // sessions (no agent) keep the full toolset as before.
          noShell: !!(s.agent && s.agent.tools && !s.agent.tools.shell),
          agentOpts: this._harnessFor(s.agent, profile),
        });
      } finally {
        s.controller = null;
      }
    }
  }

  async interrupt(sessionId) {
    const s = this.sessions.get(sessionId);
    const q = this.holds.get(sessionId);
    if (q && typeof q.interrupt === "function") { try { await q.interrupt(); } catch {} }
    if (s && s.controller) s.controller.abort();
  }

  async setPermissionMode(sessionId, mode) {
    const s = this.sessions.get(sessionId);
    if (s) s.permMode = mode;
  }

  resolvePermission(requestId, result) {
    const resolve = this.permissions.get(requestId);
    if (resolve) { this.permissions.delete(requestId); resolve(result || { behavior: "deny" }); }
  }
}

module.exports = { SessionManager };
