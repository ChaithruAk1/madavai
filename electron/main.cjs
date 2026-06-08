// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
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
const settings = require("./settings.cjs");
const { SessionManager } = require("./session-manager.cjs");
const { listModels, ping } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");
const store = require("./projects-store.cjs");
const taskStore = require("./task-store.cjs");
const runner = require("./task-runner.cjs");
const usage = require("./usage-store.cjs");
const tgbot = require("./telegram-bot.cjs");

// Corporate-proxy support: route ALL outbound HTTP(S) — provider/LLM calls, MCP,
// Telegram — through the proxy named in HTTPS_PROXY/HTTP_PROXY, honoring NO_PROXY.
// This is the supported way to work behind a gateway (not an evasion). Local model
// endpoints (Ollama/LM Studio) bypass the proxy by default so they keep working.
(function setupProxy() {
  let cfg = {};
  try { cfg = settings.load(); } catch {}
  let px = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || cfg.proxyUrl;
  if (!px) return;
  // Mirror into env so EnvHttpProxyAgent and any spawned child (Claude Code binary) see it.
  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || px;
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || px;
  if (!process.env.NO_PROXY && !process.env.no_proxy) process.env.NO_PROXY = cfg.noProxy || "localhost,127.0.0.1,::1,0.0.0.0";
  try {
    const undici = require("undici");
    undici.setGlobalDispatcher(undici.EnvHttpProxyAgent ? new undici.EnvHttpProxyAgent() : new undici.ProxyAgent(px));
    console.log(`[brainedge] proxy enabled → ${px} (NO_PROXY=${process.env.NO_PROXY})`);
  } catch (e) {
    console.log("[brainedge] proxy requested but undici not available — run `npm install undici`. Direct connection. " + (e && e.message));
  }
})();

async function reconcileMessaging() {
  const m = settings.load().messaging || {};
  if (m.enabled && m.platform === "telegram" && m.telegramToken) {
    await tgbot.start({ token: m.telegramToken, allowed: m.telegramAllowedUserIds, target: m.target, folder: m.folder });
  } else {
    tgbot.stop();
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

  applyCSP();
  if (isDev) {
    win.loadURL("http://localhost:5174");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
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
  if (win && !win.isDestroyed()) win.webContents.send("brainedge:event", uiEvent);
});

// ---- IPC: commands (renderer → main) ----
ipcMain.handle("brainedge:start", (_e, req) => sm.start(req));
ipcMain.handle("brainedge:sendInput", (_e, { sessionId, text, images }) => sm.sendInput(sessionId, text, images));
ipcMain.handle("brainedge:interrupt", (_e, { sessionId }) => sm.interrupt(sessionId));
ipcMain.handle("brainedge:setPermissionMode", (_e, { sessionId, mode }) => sm.setPermissionMode(sessionId, mode));
ipcMain.on("brainedge:resolvePermission", (_e, { requestId, result }) => sm.resolvePermission(requestId, result));

// ---- IPC: model speed check (cloud) ----
const speedtest = require("./speedtest.cjs");
const speedFile = () => path.join(app.getPath("userData"), "speedtest-last.json");
const DEFAULT_SPEED_PROMPT = "In about 150 words, explain what makes a good API design.";
let speedAborts = []; // AbortControllers for the in-flight run (for Stop)
let speedRunning = false; // true while a run is in flight (survives renderer navigation)
let speedStartedAt = 0;
// The run lives entirely in the main process, so leaving/returning to the view (or
// even closing the window) does not stop it; the result is persisted on completion.
ipcMain.handle("brainedge:runSpeedTest", async (_e, { tests, prompt, maxTokens, quiz }) => {
  const cfg = settings.load();
  const usePrompt = (prompt || "").trim() || DEFAULT_SPEED_PROMPT;
  const quizList = Array.isArray(quiz) ? quiz.filter((q) => q && q.id && q.prompt) : [];
  // retryable = quota/balance/auth/model-not-found → try the model on a fallback provider.
  const RETRY = /\b(401|402|404|429)\b|quota|balance|insufficient|not found|no endpoints/i;
  speedAborts = [];
  speedRunning = true; speedStartedAt = Date.now();
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
  }
});
ipcMain.handle("brainedge:cancelSpeedTest", () => { speedAborts.forEach((a) => { try { a.abort(); } catch {} }); speedAborts = []; speedRunning = false; return true; });
ipcMain.handle("brainedge:getSpeedTestLast", () => { try { return JSON.parse(fs.readFileSync(speedFile(), "utf8")); } catch { return null; } });
ipcMain.handle("brainedge:getSpeedTestStatus", () => ({ running: speedRunning, startedAt: speedStartedAt }));

// ---- IPC: OpenRouter model metadata (enriches Models Overview) ----
const orCatalog = require("./openrouter-catalog.cjs");
ipcMain.handle("brainedge:getOpenRouterCatalog", (_e, opts) => orCatalog.getCatalog(opts || {}));

// ---- IPC: persisted chat history (Let's Talk / Collaborate / Build) ----
const sstore = require("./sessions-store.cjs");
ipcMain.handle("brainedge:listSessions", (_e, mode) => sstore.listSessions(mode));
ipcMain.handle("brainedge:getSession", (_e, id) => sstore.getSession(id));
ipcMain.handle("brainedge:deleteSession", (_e, id) => sstore.deleteSession(id));

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
ipcMain.handle("brainedge:listSaved", () => savedStore.listSaved());
ipcMain.handle("brainedge:saveResponse", (_e, item) => {
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
ipcMain.handle("brainedge:updateSaved", (_e, { id, patch }) => savedStore.updateSaved(id, patch || {}));
ipcMain.handle("brainedge:removeSaved", (_e, id) => {
  const rec = savedStore.listSaved().find((x) => x.id === id);
  if (rec && rec.projectId && rec.knId) { try { store.removeKnowledge(rec.projectId, rec.knId); } catch {} }
  return savedStore.removeSaved(id);
});

// ---- IPC: settings + models ----
ipcMain.handle("brainedge:getSettings", () => settings.load());
ipcMain.handle("brainedge:saveSettings", (_e, next) => settings.save(next));
ipcMain.handle("brainedge:listModels", async (_e, profileId) => {
  const s = settings.load();
  const p = profileId ? s.profiles[profileId] : settings.activeProfile(s);
  try { return await listModels(p); } catch { return []; }
});
ipcMain.handle("brainedge:pingProvider", async (_e, profileId) => {
  const s = settings.load();
  const p = profileId ? s.profiles[profileId] : settings.activeProfile(s);
  try { return await ping(p); } catch { return false; }
});

// ---- IPC: folder picker (for Cowork/Code working directory) ----
ipcMain.handle("brainedge:chooseFolder", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("brainedge:openExternal", (_e, url) => { try { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return true; } catch { return false; } });

// ---- IPC: shallow directory listing (for @-mention file picker) ----
const DIR_SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".cache"]);
ipcMain.handle("brainedge:listDir", (_e, dir) => {
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
ipcMain.handle("brainedge:testConnector", (_e, server) => mcp.testServer(server));
const connectorRegistry = require("./connector-registry.cjs");
ipcMain.handle("brainedge:listConnectorDirectory", (_e, opts) => connectorRegistry.listDirectory(opts || {}));

// ---- IPC: skills ----
ipcMain.handle("brainedge:listSkills", () => {
  const cfg = settings.load();
  const disabled = new Set(cfg.disabledSkills || []);
  return skillsMgr.discover(cfg.skillsDirs).map((s) => ({ ...s, enabled: !disabled.has(s.dir) }));
});
ipcMain.handle("brainedge:readSkill", (_e, dir) => skillsMgr.readSkill(dir));
ipcMain.handle("brainedge:setSkillEnabled", (_e, { dir, enabled }) => {
  const cfg = settings.load();
  const set = new Set(cfg.disabledSkills || []);
  if (enabled) set.delete(dir); else set.add(dir);
  settings.save({ ...cfg, disabledSkills: [...set] });
  return true;
});
ipcMain.handle("brainedge:deleteSkill", (_e, dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    const cfg = settings.load();
    settings.save({ ...cfg, disabledSkills: (cfg.disabledSkills || []).filter((d) => d !== dir) });
    return { ok: true };
  } catch (e) { return { error: String(e.message || e) }; }
});
ipcMain.handle("brainedge:createSkill", (_e, name) => {
  const dir = (settings.load().skillsDirs || [])[0];
  if (!dir) return { error: "Add a skills folder first." };
  try { return skillsMgr.createStarter(dir, name); } catch (e) { return { error: String(e.message || e) }; }
});

// Import a skill by copying a folder into the first skills folder.
//  - if the folder itself has SKILL.md → import it as one skill
//  - if it's a parent of several skill subfolders → import each
//  - guards against copying a folder into itself / one already in the skills path
ipcMain.handle("brainedge:importSkillFolder", async () => {
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
ipcMain.handle("brainedge:importSkillZip", async () => {
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
      execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${target}'`]);
    } else {
      execFileSync("unzip", ["-o", zip, "-d", target]);
    }
    return { dir: target };
  } catch (e) { return { error: String(e.message || e) }; }
});

// ---- IPC: projects + conversations ----
ipcMain.handle("brainedge:listProjects", () => store.listProjects());
ipcMain.handle("brainedge:getProject", (_e, id) => store.getProject(id));
ipcMain.handle("brainedge:createProject", (_e, name) => store.createProject(name));
ipcMain.handle("brainedge:updateProject", (_e, { id, patch }) => store.updateProject(id, patch));
ipcMain.handle("brainedge:deleteProject", (_e, id) => store.deleteProject(id));

ipcMain.handle("brainedge:addKnowledgeText", (_e, { projectId, name, content }) => store.addKnowledge(projectId, { name, type: "text", content }));
ipcMain.handle("brainedge:addKnowledgeFile", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Text/Docs", extensions: ["txt", "md", "markdown", "json", "csv", "log", "yml", "yaml", "js", "ts", "py", "html", "xml"] }],
  });
  if (r.canceled) return { canceled: true };
  let added = 0;
  for (const fp of r.filePaths) {
    try {
      const content = fs.readFileSync(fp, "utf8");
      store.addKnowledge(projectId, { name: path.basename(fp), type: "file", content });
      added++;
    } catch {}
  }
  return { added, project: store.getProject(projectId) };
});
ipcMain.handle("brainedge:removeKnowledge", (_e, { projectId, knId }) => store.removeKnowledge(projectId, knId));

// Link a project to a source folder or a GitHub repo (gives its conversations file access).
ipcMain.handle("brainedge:linkProjectFolder", async (_e, projectId) => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"], title: "Link a folder to this project" });
  if (r.canceled) return { canceled: true };
  store.updateProject(projectId, { folder: r.filePaths[0], githubUrl: "" });
  return { folder: r.filePaths[0] };
});
ipcMain.handle("brainedge:linkGithub", async (_e, { projectId, url }) => {
  if (!url) return { error: "Enter a repository URL." };
  const repoName = (url.split("/").pop() || "repo").replace(/\.git$/, "");
  const dest = path.join(app.getPath("userData"), "projects-data", "repos", projectId);
  const target = path.join(dest, repoName);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    await pExecFile("git", ["clone", "--depth", "1", url, target], { timeout: 180000 });
    store.updateProject(projectId, { folder: target, githubUrl: url });
    return { folder: target };
  } catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("brainedge:pullGithub", async (_e, projectId) => {
  const p = store.getProject(projectId);
  if (!p || !p.folder) return { error: "No linked repo." };
  try { await pExecFile("git", ["-C", p.folder, "pull"], { timeout: 180000 }); return { ok: true }; }
  catch (e) { return { error: String((e && e.message) || e).slice(0, 400) }; }
});
ipcMain.handle("brainedge:unlinkProjectSource", (_e, projectId) => store.updateProject(projectId, { folder: "", githubUrl: "" }));

ipcMain.handle("brainedge:listConversations", (_e, projectId) => store.listConversations(projectId));
ipcMain.handle("brainedge:getConversation", (_e, id) => store.getConversation(id));
ipcMain.handle("brainedge:createConversation", (_e, projectId) => store.createConversation(projectId));
ipcMain.handle("brainedge:deleteConversation", (_e, id) => store.deleteConversation(id));

// ---- IPC: scheduled / background tasks ----
ipcMain.handle("brainedge:listTasks", () => taskStore.listTasks());
ipcMain.handle("brainedge:createTask", () => taskStore.createTask());
ipcMain.handle("brainedge:updateTask", (_e, { id, patch }) => taskStore.updateTask(id, patch));
ipcMain.handle("brainedge:deleteTask", (_e, id) => taskStore.deleteTask(id));
ipcMain.handle("brainedge:getRuns", (_e, id) => taskStore.getRuns(id));
ipcMain.handle("brainedge:getUsage", (_e, days) => usage.summary(days));

// ---- IPC: messaging (Telegram) ----
ipcMain.handle("brainedge:applyMessaging", async () => { await reconcileMessaging(); return tgbot.getStatus(); });
ipcMain.handle("brainedge:messagingStatus", () => tgbot.getStatus());
// One-shot completion (used by the adaptive scheduler wizard for model-driven Q&A).
ipcMain.handle("brainedge:completeOnce", async (_e, messages) => {
  try {
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl) return { error: "No provider configured." };
    const { streamChat } = require("./providers.cjs");
    const { text } = await streamChat(profile, messages || [], { onDelta: () => {} });
    return { text };
  } catch (e) { return { error: String((e && e.message) || e) }; }
});

const viaMobileLog = require("./viamobile-log.cjs");
ipcMain.handle("brainedge:listViaMobile", () => viaMobileLog.list());
ipcMain.handle("brainedge:removeViaMobile", (_e, id) => viaMobileLog.remove(id));
ipcMain.handle("brainedge:clearViaMobile", () => viaMobileLog.clear());

// ---- IPC: account auth + 7-day trial (see AUTH.md). Always-online; gates the whole UI. ----
const auth = require("./auth.cjs");
const authBase = () => (settings.load().authBaseUrl || "http://127.0.0.1:8787");
ipcMain.handle("brainedge:authSignIn", (_e, provider) => auth.signIn(provider === "github" ? "github" : provider === "dev" ? "dev" : "google", authBase()));
ipcMain.handle("brainedge:authMe", () => auth.me(authBase()));
ipcMain.handle("brainedge:authSignOut", () => auth.signOut(authBase()));
ipcMain.handle("brainedge:billingCheckout", () => auth.billing("checkout", authBase()));
ipcMain.handle("brainedge:billingPortal", () => auth.billing("portal", authBase()));

// Mobile link — continue a Let's Collaborate session from Telegram.
const mobileLink = require("./mobile-link.cjs");
ipcMain.handle("brainedge:getMobileLink", () => mobileLink.get());
ipcMain.handle("brainedge:setMobileLink", (_e, link) => mobileLink.set(link));
ipcMain.handle("brainedge:clearMobileLink", () => mobileLink.clear());

// Keep-awake: prevent the OS from sleeping so scheduled tasks keep firing.
let psbId = null;
ipcMain.handle("brainedge:setKeepAwake", (_e, on) => {
  try {
    if (on) { if (psbId === null || !powerSaveBlocker.isStarted(psbId)) psbId = powerSaveBlocker.start("prevent-app-suspension"); }
    else if (psbId !== null) { powerSaveBlocker.stop(psbId); psbId = null; }
  } catch {}
  return !!on;
});
ipcMain.handle("brainedge:runTaskNow", async (_e, id) => {
  const t = taskStore.getTask(id);
  if (!t) return { status: "error", output: "Task not found." };
  const run = await runner.runTask(t);
  taskStore.addRun(id, run);
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
      if (win && !win.isDestroyed()) win.webContents.send("brainedge:taskRun", { taskId: t.id, run });
    } catch {}
  }
}
setInterval(schedulerTick, 60000);

// ---- IPC: account / sign-in ----
ipcMain.handle("brainedge:saveAccount", (_e, account) => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { ...(cfg.account || {}), ...account } });
  return settings.load().account;
});
ipcMain.handle("brainedge:signOut", () => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { name: "", email: "", avatar: "", googleLinked: false, anthropicLinked: false } });
  return true;
});
ipcMain.handle("brainedge:linkAnthropic", () => {
  const cfg = settings.load();
  settings.save({ ...cfg, account: { ...(cfg.account || {}), anthropicLinked: true } });
  return { ok: true, note: "Run `claude login` once in a terminal to authorize; the SDK path then uses your Claude plan. Testing only — remove before publishing." };
});
ipcMain.handle("brainedge:googleSignIn", async () => {
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
        res.end("<html><body style='font-family:system-ui;background:#0b0d12;color:#eef;display:grid;place-items:center;height:100vh'><h2>BrainEdge — signed in. You can close this window.</h2></body></html>");
        if (!code) return finish({ error: "No authorization code returned." });
        const body = new URLSearchParams({ code, client_id: clientId, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier });
        if (cfg.googleClientSecret) body.set("client_secret", cfg.googleClientSecret);
        const tk = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
        const tj = await tk.json();
        if (!tj.access_token) return finish({ error: "Token exchange failed: " + JSON.stringify(tj).slice(0, 220) });
        const info = await (await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + tj.access_token } })).json();
        const account = { name: info.name || "", email: info.email || "", avatar: info.picture || "", googleLinked: true, anthropicLinked: (cfg.account || {}).anthropicLinked || false };
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
ipcMain.handle("brainedge:githubSignIn", async () => {
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
        const u = await (await fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + tk.access_token, "User-Agent": "BrainEdge", Accept: "application/vnd.github+json" } })).json();
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

app.on("before-quit", () => { mcp.disconnectAll(); });

app.whenReady().then(() => { createWindow(); reconcileMessaging(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
