// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
const { app, BrowserWindow, ipcMain, dialog, shell, powerSaveBlocker, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const { execFileSync, execFile } = require("child_process");
const pExecFile = require("util").promisify(execFile);

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== ONE-TIME DATA MIGRATION: legacy app name → Madav ============================
// The app was renamed; the userData folder moves with the package/product name, which
// would silently orphan every setting, project and conversation. On first launch with
// the new name, adopt the legacy folder wholesale (rename = instant; copy fallback).
// MUST run before ANY store touches userData. The legacy literal is built by
// concatenation so brand-rename sweeps can never clobber this migration.
(() => {
  try {
    const LEGACY_NAME = "brain" + "edge";
    const newDir = app.getPath("userData");
    const legacyDir = path.join(path.dirname(newDir), LEGACY_NAME);
    if (!fs.existsSync(legacyDir)) return; // nothing to migrate
    const hasData = (d) => { try { return fs.readdirSync(d).some((f) => f.endsWith(".json") || f === "sessions-data" || f === "projects-data"); } catch { return false; } };
    if (fs.existsSync(newDir) && hasData(newDir)) return; // new home already in use — never overwrite
    try { if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true }); fs.renameSync(legacyDir, newDir); }
    catch { try { fs.cpSync(legacyDir, newDir, { recursive: true, force: false, errorOnExist: false }); } catch {} } // cross-device/locked: copy, keep legacy as backup
    console.log("[migrate] adopted legacy data folder:", legacyDir, "→", newDir);
  } catch (e) { console.warn("[migrate] legacy-data adoption skipped:", String((e && e.message) || e)); }
})();

const settings = require("./settings.cjs");
const { SessionManager } = require("./session-manager.cjs");
const { listModels, ping } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");
const store = require("./projects-store.cjs");
const taskStore = require("./task-store.cjs");
const runner = require("./task-runner.cjs");
const usage = require("./usage-store.cjs");
const features = require("./features.cjs");

// Excludable modules are PHYSICALLY ABSENT in public builds AND gated by builtIn().
// Lazy guarded getters so a missing file (or a disabled gate) never crashes the app.
const NOT_IN_BUILD = { error: "This feature isn't included in this build." };
let _tgbot;
const tgbot = () => {
  if (_tgbot === undefined) { try { _tgbot = require("./telegram-bot.cjs"); } catch { _tgbot = null; } }
  return _tgbot;
};
let _voice;
const voiceMod = () => {
  if (_voice === undefined) { try { _voice = require("./voice.cjs"); } catch { _voice = null; } }
  return _voice;
};
let _terminal;
const terminalMod = () => {
  if (_terminal === undefined) { try { _terminal = require("./terminal.cjs"); } catch { _terminal = null; } }
  return _terminal;
};

// Corporate-proxy support: route ALL outbound HTTP(S) — provider/LLM calls, MCP,
// Telegram — through the proxy named in HTTPS_PROXY/HTTP_PROXY, honoring NO_PROXY.
// This is the supported way to work behind a gateway (not an evasion). Local model
// endpoints (Ollama/LM Studio) bypass the proxy by default so they keep working.
(function setupProxy() {
  let cfg = {};
  try { cfg = settings.load(); } catch {}
  let px = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || cfg.proxyUrl;
  if (!px) return;
  // Mirror into env so EnvHttpProxyAgent and any spawned child (Agent SDK binary) see it.
  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || px;
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || px;
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = cfg.noProxy || "localhost,127.0.0.1,::1,0.0.0.0";
  try {
    const undici = require("undici");
    undici.setGlobalDispatcher(undici.EnvHttpProxyAgent ? new undici.EnvHttpProxyAgent() : new undici.ProxyAgent(px));
    console.log(`[madav] proxy enabled → ${px} (NO_PROXY=${process.env.NO_PROXY})`);
  } catch (e) {
    console.log("[madav] proxy requested but undici not available — run `npm install undici`. Direct connection. " + (e && e.message));
  }
})();

async function reconcileMessaging() {
  if (!features.builtIn("viamobile")) { console.log("[messaging] Via Mobile (Telegram) not included in this build — skipping."); return; }
  const bot = tgbot();
  if (!bot) { console.log("[messaging] telegram-bot module absent — skipping."); return; }
  const m = settings.load().messaging || {};
  if (m.enabled && m.platform === "telegram" && m.telegramToken) {
    await bot.start({ token: m.telegramToken, allowed: m.telegramAllowedUserIds, target: m.target, folder: m.folder });
  } else {
    bot.stop();
  }
}

const isDev = process.env.NODE_ENV === "development";
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0e0f11",
    titleBarStyle: "hiddenInset",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Navigation hardening (main window only — agent-browser.cjs manages its own windows
  // on the "persist:agent-browser" partition): new windows open in the OS browser, and
  // the renderer may only navigate to our dev server or our packaged files.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) require("electron").shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    const ok = url.startsWith("http://localhost:5174") || url.startsWith("http://127.0.0.1:5174") || url.startsWith("file://");
    if (!ok) e.preventDefault();
  });

  applyPermissionPolicy();
  applyCSP();
  if (isDev) {
    win.loadURL("http://localhost:5174");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// Web permission policy. The main window (defaultSession) only ever needs the mic
// (push-to-talk) and clipboard; the Agent Browser partition browses arbitrary sites
// and should never grant camera/geolocation/etc — deny everything there.
let _permDone = false;
function applyPermissionPolicy() {
  if (_permDone) return; _permDone = true;
  const ALLOWED = new Set(["media", "clipboard-read", "clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(ALLOWED.has(permission));
  });
  try {
    session.fromPartition("persist:agent-browser").setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  } catch {}
}

// Strict Content-Security-Policy on the renderer. Locks script execution to our own
// bundle (blocks injected/inline XSS); allows inline styles, data/https images, and
// https/connect to providers. The dev server needs eval + ws for HMR.
let _cspDone = false;
function applyCSP() {
  if (_cspDone) return; _cspDone = true;
  const script = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'";
  const connect = isDev ? "'self' https: ws://localhost:5174 http://localhost:5174" : "'self' https:";
  const csp = [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] } });
  });
}

// One SessionManager; it pushes UiEvents to the focused renderer.
const sm = new SessionManager((uiEvent) => {
  if (win && !win.isDestroyed()) win.webContents.send("madav:event", uiEvent);
});

// ---- IPC: commands (renderer → main) ----
ipcMain.handle("madav:start", (_e, req) => sm.start(req));
ipcMain.handle("madav:sendInput", (_e, { sessionId, text, images }) => sm.sendInput(sessionId, text, images));
ipcMain.handle("madav:interrupt", (_e, { sessionId }) => sm.interrupt(sessionId));
ipcMain.handle("madav:setPermissionMode", (_e, { sessionId, mode }) => sm.setPermissionMode(sessionId, mode));
ipcMain.on("madav:resolvePermission", (_e, { requestId, result }) => sm.resolvePermission(requestId, result));

// ---- IPC: model speed check (cloud) ----
const speedtest = require("./speedtest.cjs");
const speedFile = () => path.join(app.getPath("userData"), "speedtest-last.json");
const DEFAULT_SPEED_PROMPT = "In about 150 words, explain what makes a good API design.";
let speedAborts = []; // AbortControllers for the in-flight run (for Stop)
let speedRunning = false; // true while a run is in flight (survives renderer navigation)
let speedStartedAt = 0;
// The run lives entirely in the main process, so leaving/returning to the view (or
// even closing the window) does not stop it; the result is persisted on completion.
ipcMain.handle("madav:runSpeedTest", async (_e, { tests, prompt, maxTokens, quiz }) => {
  const cfg = settings.load();
  const usePrompt = (prompt || "").trim() || DEFAULT_SPEED_PROMPT;
  const quizList = Array.isArray(quiz) ? quiz.filter((q) => q && q.id && q.prompt) : [];
  // retryable = quota/balance/auth/model-not-found → try the model on a fallback provider.
  const RETRY = /\b(401|402|404|429)\b|quota|balance|insufficient|not found|no endpoints/i;
  speedAborts = [];
  speedRunning = true; speedStartedAt = Date.now();
  _speedSnap = { pid: cfg.activeProfileId, model: (cfg.profiles[cfg.activeProfileId] || {}).model || "" };
  try {
    const results = await Promise.all((tests || []).map(async (t) => {
      const chain = [{ profileId: t.profileId, modelId: t.modelId }, ...((t.fallbacks) || [])];
      let last = null;
      for (let i = 0; i < chain.length; i++) {
        const p = cfg.profiles[chain[i].profileId];
        if (!p) { last = { label: t.label, model: chain[i].modelId, ok: false, error: "provider not configured" }; continue; }
        const ac = new AbortController(); speedAborts.push(ac);
        const r = await speedtest.runTest(p, chain[i].modelId, usePrompt, maxTokens || 256, ac.signal);
        if (r.ok) {
          // Optional scored quiz: ask each short question, capture the answer text (scoring is done in the UI).
          let quizAnswers = null;
          if (quizList.length) {
            quizAnswers = {};
            for (const q of quizList) {
              const ac2 = new AbortController(); speedAborts.push(ac2);
              try { const qr = await speedtest.runTest(p, chain[i].modelId, q.prompt, 64, ac2.signal); quizAnswers[q.id] = qr.ok ? (qr.text || "") : ""; }
              catch { quizAnswers[q.id] = ""; }
            }
          }
          return { label: t.label, model: chain[i].modelId, provider: p.name, fellback: i > 0, ...r, quizAnswers };
        }
        last = { label: t.label, model: chain[i].modelId, provider: p.name, ...r };
        if (r.error === "cancelled" || !RETRY.test(r.error || "")) break; // stop on cancel or non-retryable
      }
      return last || { label: t.label, ok: false, error: "no provider" };
    }));
    const payload = { at: Date.now(), prompt: usePrompt, results };
    try { fs.writeFileSync(speedFile(), JSON.stringify(payload, null, 2)); } catch {}
    return payload;
  } finally {
    speedAborts = []; speedRunning = false;
    // GUARD against "model selector stranding": if ANYTHING changed the active selection
    // while the test ran, put it back exactly as the user had it. The test must never
    // repoint what chat runs on. (Logged so the true culprit shows itself if it recurs.)
    try {
      const after = settings.load();
      if (after.activeProfileId !== _speedSnap.pid || ((after.profiles[_speedSnap.pid] || {}).model !== _speedSnap.model)) {
        console.warn(`[madav] speed test changed the active selection (${_speedSnap.pid}/${_speedSnap.model} → ${after.activeProfileId}/${(after.profiles[after.activeProfileId] || {}).model}) — restoring.`);
        const fixed = { ...after, activeProfileId: _speedSnap.pid };
        if (fixed.profiles[_speedSnap.pid]) fixed.profiles[_speedSnap.pid] = { ...fixed.profiles[_speedSnap.pid], model: _speedSnap.model };
        settings.save(fixed);
      }
    } catch {}
  }
});
// Snapshot of the user's active selection, taken when a speed run starts (see guard above).
let _speedSnap = { pid: null, model: null };
ipcMain.handle("madav:cancelSpeedTest", () => { speedAborts.forEach((a) => { try { a.abort(); } catch {} }); speedAborts = []; speedRunning = false; return true; });
ipcMain.handle("madav:getSpeedTestLast", () => { try { return JSON.parse(fs.readFileSync(speedFile(), "utf8")); } catch { return null; } });
ipcMain.handle("madav:getSpeedTestStatus", () => ({ running: speedRunning, startedAt: speedStartedAt }));

// ---- IPC: OpenRouter model metadata (enriches Models Overview) ----
const orCatalog = require("./openrouter-catalog.cjs");
ipcMain.handle("madav:getOpenRouterCatalog", (_e, opts) => orCatalog.getCatalog(opts || {}));

// ---- IPC: cross-chat user memory (view / edit / clear from Settings → Profile) ----
const userMemory = require("./user-memory.cjs");
ipcMain.handle("madav:getUserMemory", () => userMemory.get());
ipcMain.handle("madav:setUserMemory", (_e, notes) => userMemory.setNotes(notes));
ipcMain.handle("madav:clearUserMemory", () => userMemory.clear());

// ---- IPC: measured per-model harness stats (tool discipline; PLAN-AGENT-PARITY 3.1) ----
ipcMain.handle("madav:getModelStats", () => {
  try {
    const ms = require("./model-stats.cjs");
    const all = ms.all();
    const out = {};
    for (const id of Object.keys(all)) out[id] = { ...all[id], score: ms.score(id) };
    return out;
  } catch { return {}; }
});

// ---- IPC: persisted chat history (Let's Talk / Collaborate / Build) ----
const sstore = require("./sessions-store.cjs");
ipcMain.handle("madav:listSessions", (_e, mode, agentScope) => sstore.listSessions(mode, agentScope));
ipcMain.handle("madav:getSession", (_e, id) => sstore.getSession(id));
ipcMain.handle("madav:deleteSession", (_e, id) => sstore.deleteSession(id));
ipcMain.handle("madav:searchSessions", (_e, { q, mode }) => sstore.searchSessions(q, mode));
// Update check: compares this build against a version JSON served by the auth server (or any URL).
ipcMain.handle("madav:getAppVersion", () => { try { return app.getVersion(); } catch { return "0.0.0"; } });

// ---- QA Test Center (admin) — Madav tests Madav ----
// DEV/ADMIN-ONLY TOOLING: these files are EXCLUDED from packaged installers
// (see build.files "!electron/qa-*" in package.json). End users who download the
// setup never receive the test engine or the Repair Bay. The guarded require
// below makes a packaged app simply report "not in this build" instead of crashing.
let qa = null, qaFixer = null;
try { qa = require("./qa-runner.cjs"); qaFixer = require("./qa-fixer.cjs"); } catch { /* packaged build — QA not shipped */ }
const QA_MISSING = { error: "Testing tools aren't included in this build of Madav.", available: false };
ipcMain.handle("madav:qaStart", () => qa ? qa.runCycle((e) => { try { win.webContents.send("madav:qa", e); } catch {} }) : QA_MISSING);
ipcMain.handle("madav:qaStatus", () => qa ? { available: true, ...qa.status() } : QA_MISSING);
ipcMain.handle("madav:qaHistory", () => qa ? qa.history() : []);
// Repair Bay: AI diagnosis is automatic; APPLYING a fix always requires the admin's explicit approval click.
ipcMain.handle("madav:qaDiagnose", async (_e, test) => { if (!qaFixer) return QA_MISSING; try { return await qaFixer.diagnose(test); } catch (err) { return { error: String(err.message || err) }; } });
ipcMain.handle("madav:qaApplyFix", (_e, fix) => { if (!qaFixer) return QA_MISSING; try { return qaFixer.applyFix(fix); } catch (err) { return { error: String(err.message || err) }; } });
ipcMain.handle("madav:qaRollback", (_e, args) => { if (!qaFixer) return QA_MISSING; try { return qaFixer.rollback(args); } catch (err) { return { error: String(err.message || err) }; } });

// ---- IPC: Desktop Flow Recorder (UIA-event recording of native-app workflows) ----
ipcMain.handle("madav:recordDesktopStart", () => { try { return require("./desktop-recorder.cjs").start(); } catch (e) { return { error: String((e && e.message) || e) }; } });
ipcMain.handle("madav:recordDesktopStop", async () => { try { return await require("./desktop-recorder.cjs").stop(); } catch (e) { return { error: String((e && e.message) || e) }; } });
ipcMain.handle("madav:recordDesktopStatus", () => { try { return require("./desktop-recorder.cjs").status(); } catch { return { recording: false }; } });

// ---- IPC: Sage Librarian (knowledge drift sweep — dev machines with the source tree only) ----
// Same Repair-Bay contract as QA: scanning + generating proposals is automatic;
// WRITING a knowledge file always requires the admin's explicit approval click.
let librarian = null;
try { librarian = require("./librarian.cjs"); } catch { /* packaged build — Librarian not shipped */ }
const LIB_MISSING = { error: "The Sage Librarian isn't included in this build of Madav.", available: false };
ipcMain.handle("madav:librarianStatus", async () => librarian ? await librarian.status() : LIB_MISSING);
ipcMain.handle("madav:librarianScan", async () => librarian ? await librarian.scan() : LIB_MISSING);
ipcMain.handle("madav:librarianGenerate", async (_e, areaFile) => librarian ? await librarian.generate(String(areaFile || "")) : LIB_MISSING);
ipcMain.handle("madav:librarianProposals", () => librarian ? librarian.proposals() : []);
ipcMain.handle("madav:librarianApply", async (_e, areaFile) => librarian ? await librarian.apply(String(areaFile || "")) : LIB_MISSING);
ipcMain.handle("madav:librarianDiscard", (_e, areaFile) => librarian ? librarian.discard(String(areaFile || "")) : LIB_MISSING);
ipcMain.handle("madav:librarianRollback", (_e, args) => librarian ? librarian.rollback(String((args || {}).file || ""), String((args || {}).backup || "")) : LIB_MISSING);

// ---- IPC: Skill Forge (learned skill drafts — approve/discard; approval is mandatory) ----
ipcMain.handle("madav:forgeList", () => { try { return require("./instincts.cjs").list(); } catch { return []; } });
ipcMain.handle("madav:forgeApprove", (_e, name) => { try { return require("./instincts.cjs").approve(String(name || "")); } catch (e) { return { error: String((e && e.message) || e) }; } });
ipcMain.handle("madav:forgeDiscard", (_e, name) => { try { return require("./instincts.cjs").discard(String(name || "")); } catch (e) { return { error: String((e && e.message) || e) }; } });
// Flow Recorder — record a hand-demonstrated browser workflow into a skill draft.
ipcMain.handle("madav:recordFlowStart", () => { try { return require("./flow-recorder.cjs").start(); } catch (e) { return { error: String((e && e.message) || e) }; } });
ipcMain.handle("madav:recordFlowStop", () => { try { return require("./flow-recorder.cjs").stop(); } catch (e) { return { error: String((e && e.message) || e) }; } });
ipcMain.handle("madav:recordFlowStatus", () => { try { return require("./flow-recorder.cjs").status(); } catch { return { recording: false }; } });

// ---- IPC: Saved library (bookmarked responses) ----
// Each save is written to a local JSON store AND mirrored into an auto-created
// "Saved History" project as a knowledge entry, so saved answers become reusable
// (you can open the project and even chat against your saved knowledge).
const savedStore = require("./saved-store.cjs");
const SAVED_PROJECT = "Saved History";
function ensureSavedProject() {
  const found = store.listProjects().find((p) => p.name === SAVED_PROJECT);
  if (found) return found.id;
  const p = store.createProject(SAVED_PROJECT);
  try { store.updateProject(p.id, { instructions: "Answers you saved from chats are collected here as knowledge. Ask questions in this project to recall or build on them." }); } catch {}
  return p.id;
}
ipcMain.handle("madav:listSaved", () => savedStore.listSaved());
ipcMain.handle("madav:saveResponse", (_e, item) => {
  const rec = savedStore.addSaved(item || {});
  try {
    const pid = ensureSavedProject();
    const title = (rec.question || "Saved answer").replace(/\s+/g, " ").slice(0, 60);
    const stamp = rec.meta ? `\n\n— ${(rec.meta.provider || rec.meta.kind || "")}${rec.meta.model ? " · " + rec.meta.model : ""}` : "";
    const body = (rec.question ? `Q: ${rec.question}\n\n` : "") + `A: ${rec.text}` + stamp;
    const proj = store.addKnowledge(pid, { name: title, type: "text", content: body });
    const kn = proj && proj.knowledge ? proj.knowledge[proj.knowledge.length - 1] : null;
    if (kn) { savedStore.updateSaved(rec.id, { projectId: pid, knId: kn.id }); rec.projectId = pid; rec.knId = kn.id; }
  } catch {}
  return rec;
});
ipcMain.handle("madav:updateSaved", (_e, { id, patch }) => savedStore.updateSaved(id, patch || {}));
ipcMain.handle("madav:removeSaved", (_e, id) => {
  const rec = savedStore.listSaved().find((x) => x.id === id);
  if (rec && rec.projectId && rec.knId) { try { store.removeKnowledge(rec.projectId, rec.knId); } catch {} }
  return savedStore.removeSaved(id);
});

// ---- IPC: settings + models ----
ipcMain.handle("madav:getSettings", () => settings.load());
ipcMain.handle("madav:saveSettings", (_e, next) => {
  const saved = settings.save(next);
  try { require("./workspace-sync.cjs").maybePush(); } catch {} // agents/teams/folders follow the account
  return saved;
});
ipcMain.handle("madav:listModels", async (_e, profileId) => {
  const s = settings.load();
  const p = settings.resolveProfile(profileId ? s.profiles[profileId] : settings.activeProfile(s)); // Starter gets the session token
  try { return await listModels(p); } catch { return []; }
});
ipcMain.handle("madav:pingProvider", async (_e, profileId) => {
  const s = settings.load();
  const p = settings.resolveProfile(profileId ? s.profiles[profileId] : settings.activeProfile(s));
  try { return await ping(p); } catch { return false; }
});

// ---- IPC: folder picker (for Cowork/Code working directory) ----
ipcMain.handle("madav:chooseFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("madav:openExternal", (_e, url) => { try { if (/^(https?:\/\/|mailto:)/i.test(String(url || ""))) { shell.openExternal(String(url)); return true; } return false; } catch { return false; } });

// ---- IPC: shallow directory listing (for @-mention file picker) ----
const DIR_SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache"]);
ipcMain.handle("madav:listDir", (_e, dir) => {
  if (!dir) return [];
  try {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") || DIR_SKIP.has(ent.name)) continue;
      out.push({ name: ent.name, isDir: ent.isDirectory() });
      if (out.length >= 500) break;
    }
    // folders first, then files, alphabetical
    out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return out;
  } catch { return []; }
});

// ---- IPC: connectors (MCP) ----
ipcMain.handle("madav:testConnector", (_e, server) => mcp.testServer(server));
ipcMain.handle("madav:connectorSignIn", (_e, server) => require("./mcp-oauth.cjs").signIn(server, (u) => shell.openExternal(u)));
ipcMain.handle("madav:connectorAuthStatus", (_e, serverId) => require("./mcp-oauth.cjs").authStatus(serverId));
ipcMain.handle("madav:connectorSignOut", (_e, serverId) => require("./mcp-oauth.cjs").signOut(serverId));
const connectorRegistry = require("./connector-registry.cjs");
ipcMain.handle("madav:listConnectorDirectory", (_e, opts) => connectorRegistry.listDirectory(opts || {}));

// ---- IPC: skills ----
ipcMain.handle("madav:listSkills", () => {
  const cfg = settings.load();
  const disabled = new Set(cfg.disabledSkills || []);
  return skillsMgr.discover(cfg.skillsDirs).map((s) => ({ ...s, enabled: !disabled.has(s.dir) }));
});
ipcMain.handle("madav:readSkill", (_e, dir) => skillsMgr.readSkill(dir));
ipcMain.handle("madav:setSkillEnabled", (_e, { dir, enabled }) => {
  const cfg = settings.load();
  const set = new Set(cfg.disabledSkills || []);
  if (enabled) set.delete(dir); else set.add(dir);
  settings.save({ ...cfg, disabledSkills: [...set] });
  return true;
});
ipcMain.handle("madav:deleteSkill", (_e, dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    const cfg = settings.load();
    settings.save({ ...cfg, disabledSkills: (cfg.disabledSkills || []).filter((d) => d !== dir) });
    return { ok: true };
  } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle("madav:createSkill", (_e, name) => {
  const dir = (settings.load().skillsDirs || [])[0];
  if (!dir) return { error: "Add a skills folder first." };
  try { return skillsMgr.createStarter(dir, name); } catch (e) { return { error: String(e.message || e) }; }
});

// ---- PLAYBOOK: pinned plays (signature moves / room playbooks), usage stats, sharing ----
ipcMain.handle("madav:setPinnedSkills", (_e, { context, contextId, skillNames }) => {
  const names = Array.isArray(skillNames) ? skillNames.filter(Boolean).slice(0, 24) : [];
  if (context === "agent") {
    const cfg = settings.load();
    const a = (cfg.agents || []).find((x) => x.id === contextId);
    if (!a) return { error: "Agent not found." };
    a.pinnedSkills = names; settings.save(cfg); return { ok: true, pinnedSkills: names };
  }
  if (context === "project") { store.updateProject(contextId, { pinnedSkills: names }); return { ok: true, pinnedSkills: names }; }
  return { error: "Unknown pin context." };
});
ipcMain.handle("madav:getPlayStats", () => { try { return require("./play-usage.cjs").stats(); } catch { return {}; } });
// Play chains (settings.playChains) + needs (settings.playMeta): set per play.
ipcMain.handle("madav:setPlayChain", (_e, { name, chain }) => {
  const cfg = settings.load(); cfg.playChains = cfg.playChains || {};
  if (Array.isArray(chain) && chain.length) cfg.playChains[name] = chain.filter(Boolean).slice(0, 8);
  else delete cfg.playChains[name];
  settings.save(cfg); return { ok: true };
});
ipcMain.handle("madav:setPlayNeeds", (_e, { name, connectors, folder }) => {
  const cfg = settings.load(); cfg.playMeta = cfg.playMeta || {};
  const m = { connectors: Array.isArray(connectors) ? connectors.filter(Boolean) : [], folder: folder || "" };
  if (m.connectors.length || m.folder) cfg.playMeta[name] = m; else delete cfg.playMeta[name];
  settings.save(cfg); return { ok: true };
});
ipcMain.handle("madav:getPlayConfig", () => { const cfg = settings.load(); return { chains: cfg.playChains || {}, meta: cfg.playMeta || {} }; });
// Pin a play to a TEAM (settings.teams[].pinnedSkills) — a team playbook.
ipcMain.handle("madav:setTeamPinnedSkills", (_e, { teamId, skillNames }) => {
  const cfg = settings.load();
  const t = (cfg.teams || []).find((x) => x.id === teamId);
  if (!t) return { error: "Team not found." };
  t.pinnedSkills = Array.isArray(skillNames) ? skillNames.filter(Boolean).slice(0, 24) : [];
  settings.save(cfg); return { ok: true, pinnedSkills: t.pinnedSkills };
});
// AUTO-PIN SUGGESTIONS — agents that loaded a play >= N times (via load_skill) but
// haven't pinned it. Returns [{ agentId, agentName, play, uses }] for the Playbook strip.
ipcMain.handle("madav:getPinSuggestions", () => {
  try {
    const pu = require("./play-usage.cjs");
    const ev = pu.events ? pu.events() : [];
    const cfg = settings.load();
    const counts = {}; // agentName::play -> count (live load_skill only)
    for (const e of ev) {
      if (e.source !== "load_skill" || !e.ok || !e.by) continue;
      const k = e.by + "\u0000" + e.name; counts[k] = (counts[k] || 0) + 1;
    }
    const out = [];
    for (const k of Object.keys(counts)) {
      if (counts[k] < 5) continue;
      const [by, play] = k.split("\u0000");
      const a = (cfg.agents || []).find((x) => x.name === by);
      if (!a) continue;
      if (Array.isArray(a.pinnedSkills) && a.pinnedSkills.includes(play)) continue;
      out.push({ agentId: a.id, agentName: a.name, play, uses: counts[k] });
    }
    return out.sort((x, y) => y.uses - x.uses).slice(0, 8);
  } catch { return []; }
});
ipcMain.handle("madav:exportPlay", async (_e, skillName) => {
  try {
    const cfg = settings.load();
    const sk = skillsMgr.discover(cfg.skillsDirs || []).find((x) => x.name === skillName || path.basename(x.dir) === skillName);
    if (!sk) return { error: "Play not found." };
    const r = skillsMgr.readSkill(sk.dir);
    const master = (cfg.agents || []).find((a) => Array.isArray(a.pinnedSkills) && a.pinnedSkills.includes(skillName)) || null;
    const payload = {
      app: "madav", kind: "play", version: 1, exportedAt: Date.now(),
      play: { name: skillName, folder: path.basename(sk.dir), body: r ? r.body : "", meta: r ? r.meta : {} },
      agent: master ? { ...master } : null,
    };
    const save = await dialog.showSaveDialog(win, { title: "Export play", defaultPath: skillName.replace(/[^\w.-]+/g, "-") + ".madavplay.json", filters: [{ name: "Madav play", extensions: ["madavplay.json", "json"] }] });
    if (save.canceled) return { canceled: true };
    fs.writeFileSync(save.filePath, JSON.stringify(payload, null, 2));
    return { ok: true, withAgent: master ? master.name : null };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 200) }; }
});
ipcMain.handle("madav:importPlay", async () => {
  try {
    const dest = (settings.load().skillsDirs || [])[0];
    if (!dest) return { error: "Add a skills folder first (Playbook \u2192 Folders)." };
    const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Madav play", extensions: ["madavplay.json", "json"] }] });
    if (r.canceled) return { canceled: true };
    const j = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
    if (!j || j.app !== "madav" || j.kind !== "play" || !j.play) return { error: "Not a Madav play file (.madavplay.json)." };
    const folder = String(j.play.folder || j.play.name || "play").replace(/[^\w.-]+/g, "-").toLowerCase();
    const d = path.join(dest, folder);
    if (fs.existsSync(path.join(d, "SKILL.md"))) return { error: `A play folder "${folder}" already exists \u2014 rename or remove it first.` };
    fs.mkdirSync(d, { recursive: true });
    const meta = j.play.meta || {};
    const front = `---\nname: ${meta.name || j.play.name}\ndescription: ${meta.description || "Imported play."}\n---\n\n`;
    fs.writeFileSync(path.join(d, "SKILL.md"), front + (j.play.body || ""));
    let agentName = null;
    if (j.agent && j.agent.name) {
      const cfg = settings.load(); const roster = (cfg.agents || []).slice();
      if (!roster.some((a) => a.id === j.agent.id && a.name === j.agent.name)) {
        const nid = (!j.agent.id || roster.some((a) => a.id === j.agent.id)) ? "agent_" + crypto.randomBytes(6).toString("hex") : j.agent.id;
        const clean = { ...j.agent, id: nid, model: "" }; delete clean.autonomy;
        roster.push(clean); settings.save({ ...cfg, agents: roster }); agentName = clean.name;
      }
    }
    return { ok: true, play: meta.name || j.play.name, agent: agentName };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 200) }; }
});

// Import a skill by copying a folder into the first skills folder.
//  - if the folder itself has SKILL.md → import it as one skill
//  - if it's a parent of several skill subfolders → import each
//  - guards against copying a folder into itself / one already in the skills path
ipcMain.handle("madav:importSkillFolder", async () => {
  const dest = (settings.load().skillsDirs || [])[0];
  if (!dest) return { error: "Add a skills folder first." };
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Select a skill folder (or a folder of skills)" });
  if (r.canceled) return { canceled: true };

  const src = path.resolve(r.filePaths[0]);
  const destN = path.resolve(dest);
  const inside = (parent, child) => { const rel = path.relative(parent, child); return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)); };
  const hasSkill = (d) => { try { return fs.existsSync(path.join(d, "SKILL.md")); } catch { return false; } };

  if (src === destN) return { error: "That IS your primary skills folder — its sub-skills are already loaded. Click Reload. (Each skill should be its own subfolder with a SKILL.md.)" };
  if (inside(destN, src)) return { error: "That folder is already inside your skills folder — it's already available. Click Reload." };
  if (inside(src, destN)) return { error: "Can't import a folder that contains your skills folder. Pick a single skill's folder instead." };

  try {
    let sources = [];
    if (hasSkill(src)) sources = [src];
    else {
      for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        if (e.isDirectory() && hasSkill(path.join(src, e.name))) sources.push(path.join(src, e.name));
      }
    }
    if (!sources.length) return { error: "No SKILL.md found in that folder or its immediate subfolders." };
    const imported = [];
    for (const s of sources) {
      const target = path.join(destN, path.basename(s));
      if (path.resolve(target) === s) continue; // already there
      fs.cpSync(s, target, { recursive: true });
      imported.push(path.basename(s));
    }
    return { dir: destN, imported, count: imported.length };
  } catch (e) { return { error: String(e.message || e) }; }
});

// Import a skill from a .zip or .skill archive (extract into the first skills folder).
ipcMain.handle("madav:importSkillZip", async () => {
  const dest = (settings.load().skillsDirs || [])[0];
  if (!dest) return { error: "Add a skills folder first." };
  const r = await dialog.showOpenDialog(win, { properties: ["openFile"], filters: [{ name: "Skill archive", extensions: ["zip", "skill"] }] });
  if (r.canceled) return { canceled: true };
  const src = r.filePaths[0];
  try {
    let zip = src;
    if (!src.toLowerCase().endsWith(".zip")) {
      zip = path.join(os.tmpdir(), "chai_skill_" + Date.now() + ".zip");
      fs.copyFileSync(src, zip);
    }
    const target = path.join(dest, path.basename(src).replace(/\.(zip|skill)$/i, ""));
    if (process.platform === "win32") {
      // Injection-safe extraction: tar.exe (built into Win10+) takes real argv — no shell string to escape.
      fs.mkdirSync(target, { recursive: true });
      try {
        execFileSync("tar", ["-xf", zip, "-C", target]);
      } catch {
        // Fallback: PowerShell with single quotes escaped ('' is the PS escape) so a crafted filename can't break out.
        const q = (s) => String(s).replace(/'/g, "''");
        execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${q(zip)}' -DestinationPath '${q(target)}'`]);
      }
    } else {
      execFileSync("unzip", ["-o", zip, "-d", target]);
    }
    return { dir: target };
  } catch (e) { return { error: String(e.message || e) }; }
});

// ---- IPC: projects + conversations ----
ipcMain.handle("madav:listProjects", () => store.listProjects());
ipcMain.handle("madav:getProject", (_e, id) => store.getProject(id));
ipcMain.handle("madav:createProject", (_e, name) => store.createProject(name));
ipcMain.handle("madav:updateProject", (_e, { id, patch }) => store.updateProject(id, patch));
ipcMain.handle("madav:deleteProject", (_e, id) => store.deleteProject(id));
// Workrooms crew: assign/unassign agents to a room (project.agentIds[]).
ipcMain.handle("madav:assignProjectAgent", (_e, { projectId, agentId }) => store.assignAgent(projectId, agentId));
ipcMain.handle("madav:unassignProjectAgent", (_e, { projectId, agentId }) => store.unassignAgent(projectId, agentId));
ipcMain.handle("madav:assignProjectTeam", (_e, { projectId, teamId }) => store.assignTeam(projectId, teamId));
ipcMain.handle("madav:unassignProjectTeam", (_e, { projectId, teamId }) => store.unassignTeam(projectId, teamId));
// Workrooms guide (Project Simulation): drop three small sample marketing files into a
// user-chosen folder so the file-agent test has something real to read. Never overwrites.
ipcMain.handle("madav:seedSampleFiles", (_e, dir) => {
  try {
    if (!dir || !fs.existsSync(dir)) return { error: "Folder not found." };
    const files = {
      "launch-plan.md": "# Launch Plan (sample)\n\nTagline: Built to think with you.\n\n## Phases\n1. Private beta\n2. Early-bird — pricing announced at launch\n3. Public launch\n\n## Audience\nIndie builders and small teams.\n",
      "tweet-drafts.txt": "Tweet drafts (sample):\n1) Madav is live. One workspace where you chat, collaborate on files, and put agents to work. Built to think with you.\n2) Stop juggling tabs. Chat, file work, agent teams, schedules — one app.\n",
      "faq-snippets.md": "# FAQ (sample)\n\n**What does it cost?** Early-bird pricing is announced at launch.\n\n**What are Workrooms?** Rooms with a brief, knowledge, and an agent crew.\n",
    };
    let added = 0;
    for (const [name, content] of Object.entries(files)) {
      const fp = path.join(dir, name);
      if (!fs.existsSync(fp)) { fs.writeFileSync(fp, content); added++; }
    }
    return { added };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 200) }; }
});
// Per-room agent track record: agent-history events filtered by projectId.
ipcMain.handle("madav:getProjectAgentHistory", (_e, projectId) => require("./agent-history.cjs").listForProject(projectId, 100));

ipcMain.handle("madav:addKnowledgeText", (_e, { projectId, name, content }) => store.addKnowledge(projectId, { name, type: "text", content }));
// Knowledge import — now also parses PDF and Word (.docx) into text via lazy-loaded
// parsers (pdf-parse / mammoth). If a parser is missing or a file is image-only,
// the file is skipped with a clear reason instead of importing garbage.
async function knowledgeText(fp) {
  const ext = path.extname(fp).toLowerCase();
  // Size guard (all formats): refuse files over 50 MB before reading/parsing them,
  // surfaced through the same skipped[]/reason mechanism as image-only PDFs.
  try { if (fs.statSync(fp).size > 52428800) throw new Error("file too large (max 50 MB)"); }
  catch (e) { if (/file too large/.test(String(e.message || e))) throw e; }
  if (ext === ".xlsx" || ext === ".xls") {
    // Spreadsheets become CSV per sheet so models can reason over the rows.
    const XLSX = require("xlsx"); // lazy: only loaded when a spreadsheet is imported
    const wb = XLSX.read(fs.readFileSync(fp), { type: "buffer" });
    let out = "";
    for (const sn of (wb.SheetNames || []).slice(0, 12)) {
      out += `--- sheet: ${sn} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sn]).slice(0, 60000) + "\n";
    }
    if (!out.trim()) throw new Error("empty spreadsheet");
    return out;
  }
  if (ext === ".pdf") {
    const pdfParse = require("pdf-parse"); // lazy: only loaded when a PDF is imported
    const data = await pdfParse(fs.readFileSync(fp));
    const text = (data.text || "").trim();
    if (!text) throw new Error("no extractable text (scanned/image-only PDF?)");
    return text;
  }
  if (ext === ".docx") {
    const mammoth = require("mammoth");
    const r = await mammoth.extractRawText({ buffer: fs.readFileSync(fp) });
    const text = (r.value || "").trim();
    if (!text) throw new Error("no extractable text");
    return text;
  }
  return fs.readFileSync(fp, "utf8");
}
ipcMain.handle("madav:addKnowledgeFile", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Documents & data", extensions: ["pdf", "docx", "xlsx", "xls", "csv", "txt", "md", "markdown", "json", "log", "yml", "yaml", "js", "ts", "py", "html", "xml"] },
      { name: "Spreadsheets", extensions: ["xlsx", "xls", "csv"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (r.canceled) return { canceled: true };
  let added = 0; const skipped = [];
  for (const fp of r.filePaths) {
    try {
      const content = await knowledgeText(fp);
      store.addKnowledge(projectId, { name: path.basename(fp), type: "file", content: content.slice(0, 400000) }); // ~100k tokens cap per file
      added++;
    } catch (e) { skipped.push(`${path.basename(fp)}: ${String(e.message || e)}`); }
  }
  return { added, skipped, project: store.getProject(projectId) };
});
ipcMain.handle("madav:removeKnowledge", (_e, { projectId, knId }) => store.removeKnowledge(projectId, knId));

// Link a project to a source folder or a GitHub repo (gives its conversations file access).
ipcMain.handle("madav:linkProjectFolder", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Link a folder to this project" });
  if (r.canceled) return { canceled: true };
  store.updateProject(projectId, { folder: r.filePaths[0], githubUrl: "" });
  return { folder: r.filePaths[0] };
});
// Only http(s) repo URLs are accepted (blocks ext::/ssh tricks), and "--" stops git
// from ever parsing the URL positional as an option (e.g. --upload-pack=...).
const isHttpRepoUrl = (u) => /^https?:\/\//i.test(String(u || "").trim());
ipcMain.handle("madav:linkGithub", async (_e, { projectId, url }) => {
  if (!url) return { error: "Enter a repository URL." };
  if (!isHttpRepoUrl(url)) return { error: "Repository URL must start with https:// (or http://)." };
  const repoName = (url.split("/").pop() || "repo").replace(/\.git$/, "");
  const dest = path.join(app.getPath("userData"), "projects-data", "repos", projectId);
  const target = path.join(dest, repoName);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    await pExecFile("git", ["clone", "--depth", "1", "--", url, target], { timeout: 180000 });
    store.updateProject(projectId, { folder: target, githubUrl: url });
    return { folder: target };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
// Clone a repo to work on directly in Build (not tied to a project) — returns the local folder.
ipcMain.handle("madav:cloneRepo", async (_e, url) => {
  if (!url) return { error: "Enter a repository URL." };
  if (!isHttpRepoUrl(url)) return { error: "Repository URL must start with https:// (or http://)." };
  const repoName = (String(url).split("/").pop() || "repo").replace(/\.git$/, "");
  const dest = path.join(app.getPath("userData"), "build-repos", repoName + "-" + Date.now().toString(36));
  try {
    fs.mkdirSync(dest, { recursive: true });
    await pExecFile("git", ["clone", "--depth", "1", "--", url, dest], { timeout: 180000 });
    return { folder: dest };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("madav:pullGithub", async (_e, projectId) => {
  const p = store.getProject(projectId);
  if (!p || !p.folder) return { error: "No linked repo." };
  try { await pExecFile("git", ["pull"], { cwd: p.folder, timeout: 180000 }); return { ok: true }; }
  catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("madav:unlinkProjectSource", (_e, projectId) => store.updateProject(projectId, { folder: "", githubUrl: "" }));

ipcMain.handle("madav:listConversations", (_e, projectId) => store.listConversations(projectId));
ipcMain.handle("madav:getConversation", (_e, id) => store.getConversation(id));
ipcMain.handle("madav:createConversation", (_e, projectId) => store.createConversation(projectId));
ipcMain.handle("madav:deleteConversation", (_e, id) => store.deleteConversation(id));

// ---- IPC: agent engine (memory · history · missions · versions · share files) ----
const agentMemory = require("./agent-memory.cjs");
const agentHistory = require("./agent-history.cjs");
const missionStore = require("./mission-store.cjs");
const missionRunner = require("./mission-runner.cjs");
const agentFiles = require("./agent-files.cjs");
const webhookServer = require("./webhook-server.cjs");

// Memory — what an agent has learned (view/edit/clear in the Studio Blueprint).
ipcMain.handle("madav:getAgentMemory", (_e, agentId) => agentMemory.get(agentId));
ipcMain.handle("madav:setAgentMemory", (_e, { agentId, notes }) => agentMemory.setNotes(agentId, notes));
ipcMain.handle("madav:clearAgentMemory", (_e, agentId) => agentMemory.clear(agentId));

// Track record — per-agent run history + roster-wide stats for the agent cards.
ipcMain.handle("madav:getAgentHistory", (_e, agentId) => agentHistory.list(agentId, 50));
ipcMain.handle("madav:getAgentStats", () => agentHistory.stats());

// Durable missions — checkpoint lookup for the "Resume mission" banner.
ipcMain.handle("madav:getMission", (_e, convId) => missionStore.get(convId));

// .agent share files + versioning.
ipcMain.handle("madav:exportAgent", (_e, agent) => agentFiles.exportAgent(win, agent));
ipcMain.handle("madav:importAgent", () => agentFiles.importAgent(win));
ipcMain.handle("madav:snapshotAgentVersion", (_e, agent) => agentFiles.snapshot(agent));
ipcMain.handle("madav:listAgentVersions", (_e, agentId) => agentFiles.listVersions(agentId));

// Webhook triggers — local HTTP server; external systems fire agents/teams/tasks.
function reconcileWebhooks() {
  return webhookServer.reconcile({
    settings, taskStore, taskRunner: runner, missionRunner,
    onRun: (kind, id, run) => { try { if (win && !win.isDestroyed()) win.webContents.send("madav:taskRun", { kind, id, run }); } catch {} },
  });
}
ipcMain.handle("madav:applyWebhooks", () => reconcileWebhooks());
ipcMain.handle("madav:webhookStatus", () => webhookServer.status());
ipcMain.handle("madav:newWebhookToken", () => webhookServer.newToken());

// Voice — push-to-talk transcription via the user's own Whisper-capable key.
ipcMain.handle("madav:transcribe", (_e, args) => {
  if (!features.builtIn("voice")) return NOT_IN_BUILD;
  const v = voiceMod();
  if (!v) return NOT_IN_BUILD;
  return v.transcribe(args || {});
});
// Windows-native speech-to-text: OS recognizer, no key, no network (win-speech.cjs).
ipcMain.handle("madav:winSpeech", (_e, args) => {
  if (!features.builtIn("voice")) return NOT_IN_BUILD;
  try {
    const ws = require("./win-speech.cjs");
    return ws.recognizeOnce((args || {}).timeoutSec);
  }
  catch (e) { return { error: String((e && e.message) || e) }; }
});

// Swarms — run one agent over a list with a bounded parallel pool.
const swarmAborts = new Map(); // swarmId -> AbortController
ipcMain.handle("madav:runSwarm", async (_e, { agentId, items, template, concurrency }) => {
  const cfg = settings.load();
  const agent = missionRunner.findAgent(cfg, agentId);
  if (!agent) return { error: "Agent not found." };
  const swarmId = "swarm_" + Math.random().toString(36).slice(2, 9);
  const ac = new AbortController();
  swarmAborts.set(swarmId, ac);
  const progress = (p) => { try { if (win && !win.isDestroyed()) win.webContents.send("madav:swarm", { swarmId, ...p }); } catch {} };
  try {
    const r = await missionRunner.runSwarm({ agent, items, template, concurrency, onProgress: progress, signal: ac.signal });
    return { swarmId, results: r.results, report: r.report };
  } catch (e) {
    return { swarmId, error: String((e && e.message) || e) };
  } finally {
    swarmAborts.delete(swarmId);
  }
});
ipcMain.handle("madav:cancelSwarm", (_e, swarmId) => {
  const ac = swarmAborts.get(swarmId);
  if (ac) { try { ac.abort(); } catch {} swarmAborts.delete(swarmId); return true; }
  // No id (or already gone) → cancel everything in flight.
  if (!swarmId) { for (const a of swarmAborts.values()) { try { a.abort(); } catch {} } swarmAborts.clear(); return true; }
  return false;
});

// ---- IPC: scheduled / background tasks ----
ipcMain.handle("madav:listTasks", () => taskStore.listTasks());
ipcMain.handle("madav:createTask", () => taskStore.createTask());
ipcMain.handle("madav:updateTask", (_e, { id, patch }) => taskStore.updateTask(id, patch));
ipcMain.handle("madav:deleteTask", (_e, id) => taskStore.deleteTask(id));
ipcMain.handle("madav:getRuns", (_e, id) => taskStore.getRuns(id));
ipcMain.handle("madav:getUsage", (_e, days) => usage.summary(days));
// Run tracing + alerts (observability). All guarded so a tracing fault never breaks IPC.
ipcMain.handle("madav:getTraces", (_e, limit) => { try { return require("./trace-store.cjs").list(limit); } catch { return []; } });
ipcMain.handle("madav:getTrace", (_e, id) => { try { return require("./trace-store.cjs").get(id); } catch { return null; } });
ipcMain.handle("madav:getTraceSummary", (_e, days) => { try { return require("./trace-store.cjs").summary(days); } catch { return null; } });
ipcMain.handle("madav:clearTraces", () => { try { require("./trace-store.cjs").clear(); return true; } catch { return false; } });
ipcMain.handle("madav:testAlert", () => { try { require("./alerts.cjs").fire({ title: "Madav test alert", body: "Alerts are working." }); return true; } catch { return false; } });

// ---- IPC: messaging (Telegram) ----
ipcMain.handle("madav:applyMessaging", async () => {
  if (!features.builtIn("viamobile")) return NOT_IN_BUILD;
  const bot = tgbot();
  if (!bot) return NOT_IN_BUILD;
  await reconcileMessaging();
  return bot.getStatus();
});
ipcMain.handle("madav:messagingStatus", () => {
  if (!features.builtIn("viamobile")) return NOT_IN_BUILD;
  const bot = tgbot();
  if (!bot) return NOT_IN_BUILD;
  return bot.getStatus();
});
// One-shot completion (used by the adaptive scheduler wizard for model-driven Q&A).
ipcMain.handle("madav:completeOnce", async (_e, messages) => {
  try {
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) return { error: "No provider configured." };
    const { streamChat } = require("./providers.cjs");
    const { text } = await streamChat(profile, messages || [], { onDelta: () => {} });
    return { text };
  } catch (e) { return { error: String((e && e.message) || e) }; }
});

const viaMobileLog = require("./viamobile-log.cjs");
ipcMain.handle("madav:listViaMobile", () => viaMobileLog.list());
ipcMain.handle("madav:removeViaMobile", (_e, id) => viaMobileLog.remove(id));
ipcMain.handle("madav:clearViaMobile", () => viaMobileLog.clear());

// ---- IPC: account auth + 7-day trial (see AUTH.md). Always-online; gates the whole UI. ----
const auth = require("./auth.cjs");
// Production account server is the default since madav.ai went live (2026-06-12);
// developers point authBaseUrl at http://127.0.0.1:8787 in Settings when testing locally.
const authBase = () => (settings.load().authBaseUrl || "https://madav.ai");
ipcMain.handle("madav:authSignIn", async (_e, provider) => {
  const r = await auth.signIn(provider === "github" ? "github" : provider === "dev" ? "dev" : "google", authBase());
  try { require("./workspace-sync.cjs").pull(); } catch {} // fresh sign-in → fetch the account workspace
  return r;
});
const roster = require("./roster.cjs");
ipcMain.handle("madav:authMe", async () => {
  const r = await auth.me(authBase());
  // LOCAL ROSTER OVERRIDE (admin-roster.cjs on this machine) beats the server. This is the
  // hijack-resistant control: even if someone edits admin-emails.txt on the server, whoever
  // holds the local roster keeps Creator (or Complimentary) here.
  try {
    const email = r && r.user && r.user.email;
    const role = email ? roster.roleFor(email) : null;
    if (role === "creator") {
      r.admin = true;
      r.role = "creator";
      r.status = "active";
      r.daysLeft = null;
      r.subscription = { ...(r.subscription || {}), active: true, plan: "Creator" };
    } else if (role === "complimentary") {
      r.role = "complimentary";
      r.status = "active";          // excluded from subscription — full access, no checkout
      r.daysLeft = null;
      r.subscription = { ...(r.subscription || {}), active: true, plan: "Complimentary" };
    }
  } catch {}
  // Cache the admin flag locally so server-side gates (e.g. the Agent Browser master
  // switch, which admins always bypass) can read it without an async auth call.
  try {
    const cfg = settings.load();
    const isAdmin = !!(r && r.admin);
    if (((cfg.account || {}).admin || false) !== isAdmin) settings.save({ ...cfg, account: { ...(cfg.account || {}), admin: isAdmin } });
  } catch {}
  return r;
});
ipcMain.handle("madav:authSignOut", () => auth.signOut(authBase()));
ipcMain.handle("madav:billingCheckout", () => auth.billing("checkout", authBase()));
ipcMain.handle("madav:billingPortal", () => auth.billing("portal", authBase()));
// Analytics: fire-and-forget product events, and admin-key-gated stats/users/actions.
ipcMain.handle("madav:track", (_e, type, meta) => auth.track(type, meta, authBase()));
ipcMain.handle("madav:adminStats", (_e, adminKey) => auth.adminGet("stats", adminKey, authBase()));
ipcMain.handle("madav:adminUsers", (_e, adminKey) => auth.adminGet("users", adminKey, authBase()));
ipcMain.handle("madav:adminAction", (_e, id, action, adminKey) => auth.adminAction(id, action, adminKey, authBase()));
ipcMain.handle("madav:scoreQuiz", (_e, batch) => auth.scoreQuiz(batch, authBase()));
// Generic authenticated call to the account server (community forum, product requests, share links).
ipcMain.handle("madav:apiCall", (_e, method, path, body) => auth.apiCall(method, path, body, authBase()));

// Terminal access (CLI): one-click provisioning that reuses the user's provider keys + subscription.
const cliInstall = require("./cli-install.cjs");
ipcMain.handle("madav:enableCli", () => cliInstall.enableCli(authBase()));
ipcMain.handle("madav:cliStatus", () => cliInstall.cliStatus());
ipcMain.handle("madav:disableCli", () => cliInstall.disableCli());

// Embedded terminal — a real shell inside the app (streams I/O to an xterm.js view).
ipcMain.handle("madav:termCreate", (e, opts) => {
  if (!features.builtIn("terminal")) return NOT_IN_BUILD;
  const t = terminalMod();
  if (!t) return NOT_IN_BUILD;
  return t.create(e.sender, opts || {});
});
ipcMain.handle("madav:termInput", (_e, { id, data }) => {
  const t = features.builtIn("terminal") ? terminalMod() : null;
  if (!t) return NOT_IN_BUILD;
  return t.input(id, data);
});
ipcMain.handle("madav:termResize", (_e, { id, cols, rows }) => {
  const t = features.builtIn("terminal") ? terminalMod() : null;
  if (!t) return NOT_IN_BUILD;
  return t.resize(id, cols, rows);
});
ipcMain.handle("madav:termKill", (_e, id) => {
  const t = features.builtIn("terminal") ? terminalMod() : null;
  if (!t) return NOT_IN_BUILD;
  return t.kill(id);
});

// Mobile link — continue a Let's Collaborate session from Telegram.
const mobileLink = require("./mobile-link.cjs");
ipcMain.handle("madav:getMobileLink", () => mobileLink.get());
ipcMain.handle("madav:setMobileLink", (_e, link) => mobileLink.set(link));
ipcMain.handle("madav:clearMobileLink", () => mobileLink.clear());

// Keep-awake: prevent the OS from sleeping so scheduled tasks keep firing.
let psbId = null;
ipcMain.handle("madav:setKeepAwake", (_e, on) => {
  try {
    if (on) { if (psbId === null || !powerSaveBlocker.isStarted(psbId)) psbId = powerSaveBlocker.start("prevent-app-suspension"); }
    else if (psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch {}
  return !!on;
});
ipcMain.handle("madav:runTaskNow", async (_e, id) => {
  const t = taskStore.getTask(id);
  if (!t) return { status: "error", output: "Task not found." };
  const run = await runner.runTask(t);
  taskStore.addRun(id, run);
  try { require("./alerts.cjs").onTaskResult(t, run); } catch {}
  return run;
});

// Scheduler — checks every minute whether any task is due.
function isDue(task, now) {
  const sc = task.schedule || {};
  if (!sc.mode || sc.mode === "off") return false;
  const since = now - (task.lastRun || 0);
  if (sc.mode === "interval") return since >= (sc.everyMinutes || 60) * 60000;
  const d = new Date(now);
  const hhmm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if (sc.mode === "daily") return hhmm === (sc.time || "09:00") && since > 23 * 3600 * 1000;
  if (sc.mode === "weekly") return d.getDay() === (sc.weekday ?? 1) && hhmm === (sc.time || "09:00") && since > 6 * 24 * 3600 * 1000;
  return false;
}
async function schedulerTick() {
  const now = Date.now();
  for (const t of taskStore.listTasks()) {
    if (!isDue(t, now)) continue;
    try {
      const run = await runner.runTask(t);
      taskStore.addRun(t.id, run);
      try { require("./alerts.cjs").onTaskResult(t, run); } catch {}
      if (win && !win.isDestroyed()) win.webContents.send("madav:taskRun", { taskId: t.id, run });
    } catch {}
  }
}
if (features.builtIn("scheduler")) setInterval(schedulerTick, 60000);
else console.log("[scheduler] not included in this build — task scheduler disabled.");

// ---- IPC: account / sign-in ----
ipcMain.handle("madav:saveAccount", (_e, account) => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { ...(cfg.account || {}), ...account } });
  return settings.load().account;
});
ipcMain.handle("madav:signOut", () => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { name: "", email: "", avatar: "", googleLinked: false } });
  return true;
});
ipcMain.handle("madav:googleSignIn", async () => {
  const cfg = settings.load();
  const clientId = cfg.googleClientId;
  if (!clientId) return { error: "Add a Google OAuth Client ID (Account settings) first. Create one at console.cloud.google.com → Credentials → OAuth client → Desktop app." };
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return await new Promise((resolve) => {
    let redirectUri = "";
    let done = false;
    const finish = (r) => { if (done) return; done = true; try { server.close(); } catch {} resolve(r); };
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, "http://127.0.0.1");
        const code = u.searchParams.get("code");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body style='font-family:system-ui;background:#0b0d12;color:#eef;display:grid;place-items:center;height:100vh'><h2>Madav — signed in. You can close this window.</h2></body></html>");
        if (!code) return finish({ error: "No authorization code returned." });
        const body = new URLSearchParams({ code, client_id: clientId, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
        if (cfg.googleClientSecret) body.set("client_secret", cfg.googleClientSecret);
        const tk = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const tj = await tk.json();
        if (!tj.access_token) return finish({ error: "Token exchange failed: " + JSON.stringify(tj).slice(0, 220) });
        const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tj.access_token } })).json();
        const account = { name: info.name || "", email: info.email || "", avatar: info.picture || "", googleLinked: true };
        settings.save({ ...settings.load(), account });
        finish({ account });
      } catch (e) { finish({ error: String((e && e.message) || e) }); }
    });
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile",
        code_challenge: challenge, code_challenge_method: "S256", access_type: "offline", prompt: "consent",
      }).toString();
      shell.openExternal(authUrl);
    });
    setTimeout(() => finish({ error: "Sign-in timed out." }), 180000);
  });
});

// GitHub sign-in via device flow (no secret needed; enable Device Flow on your OAuth app).
ipcMain.handle("madav:githubSignIn", async () => {
  const cfg = settings.load();
  const clientId = cfg.githubClientId;
  if (!clientId) return { error: "Add a GitHub OAuth Client ID in Profile first (github.com → Settings → Developer settings → OAuth Apps → enable Device Flow)." };
  try {
    const dc = await (await fetch("https://github.com/login/device/code", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, scope: "read:user user:email" }),
    })).json();
    if (!dc.device_code) return { error: "GitHub device code failed: " + JSON.stringify(dc).slice(0, 200) };
    shell.openExternal(dc.verification_uri);
    dialog.showMessageBox(win, { type: "info", title: "GitHub sign-in", message: `Enter this code on GitHub:\n\n${dc.user_code}`, detail: dc.verification_uri });
    const deadline = Date.now() + (dc.expires_in || 900) * 1000;
    let interval = (dc.interval || 5) * 1000;
    while (Date.now() < deadline) {
      await sleep(interval);
      const tk = await (await fetch("https://github.com/login/oauth/access_token", {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, device_code: dc.device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
      })).json();
      if (tk.access_token) {
        const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tk.access_token, "User-Agent": "Madav", Accept: "application/vnd.github+json" } })).json();
        const account = { ...(cfg.account || {}), name: u.name || u.login || "", email: u.email || "", avatar: u.avatar_url || "", githubLinked: true };
        settings.save({ ...settings.load(), account });
        return { account };
      }
      if (tk.error === "slow_down") interval += 5000;
      else if (tk.error && tk.error !== "authorization_pending") return { error: tk.error };
    }
    return { error: "Sign-in timed out." };
  } catch (e) { return { error: String((e && e.message) || e) }; }
});

app.on("before-quit", () => { mcp.disconnectAll(); try { const t = terminalMod(); if (t) t.killAll(); } catch {} try { webhookServer.stop(); } catch {} });

// Auto-provision terminal access for paying subscribers (silent). No-op if already set up, if no
// provider is configured yet, or if the subscription isn't active (cliToken enforces that server-side).
async function autoEnableCli() {
  try {
    const st = cliInstall.cliStatus();
    if (st.configured && st.onPath) return;
    const r = await cliInstall.enableCli(authBase());
    if (r && r.ok) console.log("[cli] terminal access auto-enabled for subscriber");
  } catch {}
}
app.whenReady().then(() => {
  createWindow();
  reconcileMessaging();
  if (features.builtIn("scheduler")) reconcileWebhooks();
  else console.log("[scheduler] not included in this build — webhook server not started.");
  setTimeout(autoEnableCli, 3000);
  setTimeout(() => { try { require("./workspace-sync.cjs").pull(); } catch {} }, 2500); // account workspace → this device
});
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
