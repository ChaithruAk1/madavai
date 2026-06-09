// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
import { useEffect, useRef, useState, useCallback } from "react";
import { FolderOpen, FolderKanban, Smartphone } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import TopNav from "./components/TopNav.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import PermissionModal from "./components/PermissionModal.jsx";
import Settings from "./components/Settings.jsx";
import Connectors from "./components/Connectors.jsx";
import Skills from "./components/Skills.jsx";
import Plugins from "./components/Plugins.jsx";
import ProjectsBrowser from "./components/ProjectsBrowser.jsx";
import Scheduler from "./components/Scheduler.jsx";
import ViaMobile from "./components/ViaMobile.jsx";
import Consumption from "./components/Consumption.jsx";
import ModelsSection from "./components/ModelsSection.jsx";
import ArtifactPanel from "./components/ArtifactPanel.jsx";
import StudioLauncher from "./components/StudioLauncher.jsx";
import TerminalPanel from "./components/TerminalPanel.jsx";
import EnvPicker from "./components/EnvPicker.jsx";
import ThinkLogo from "./components/ThinkLogo.jsx";
import ModelPicker from "./components/ModelPicker.jsx";
import { PermissionPicker } from "./components/Topbar.jsx";
import { bridge, isWeb } from "./bridge/index.js";

// On the web, local-folder access uses the File System Access API (Chrome/Edge only).
const folderInChromeEdge = isWeb && !(typeof window !== "undefined" && typeof window.showDirectoryPicker === "function");
const webFolderSupported = isWeb && typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
// Internal tools we never surface as cards in the chat (plumbing, not user-facing).
const HIDDEN_TOOLS = new Set(["load_skill"]);

export default function App() {
  const [mode, setMode] = useState("chat");
  const [settings, setSettings] = useState(null);
  const [permissionMode, setPermissionMode] = useState("default");
  const [timeline, setTimeline] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(null);
  const [modelsByProfile, setModelsByProfile] = useState({});
  const [cwd, setCwd] = useState(null);
  const [projectCtx, setProjectCtx] = useState(null);
  const [coworkProj, setCoworkProj] = useState(null); // { id, name } when a Cowork task is scoped to a project
  const [online, setOnline] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [repo, setRepo] = useState({ open: false, url: "", busy: false, err: "" });
  const [activeConvId, setActiveConvId] = useState(null);
  const [mobileLink, setMobileLink] = useState(null); // Telegram-linked session binding
  const [botRunning, setBotRunning] = useState(false); // Telegram bot online?
  const [histRefresh, setHistRefresh] = useState(0);
  const [chatMode, setChatMode] = useState("chat"); // last primary mode → drives the Recents list
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sessionRef = useRef(null);
  const studioSeed = useRef(null); // pending Studio starter prompt, sent once we're in chat mode
  const chatRef = useRef(null);
  const streamOpen = useRef(false);
  const lastInfoRef = useRef(null); // real {model, provider, kind} from the backend init event
  const modeCacheRef = useRef({}); // per-mode {convId, timeline} so navigating away/back restores

  const PRIMARY = ["chat", "cowork", "code"];

  async function loadModelsFor(cfg) {
    if (!cfg) return;
    const entries = await Promise.all(
      Object.values(cfg.profiles).map(async (p) => {
        try { return [p.id, await bridge.listModels(p.id)]; } catch { return [p.id, []]; }
      })
    );
    setModelsByProfile(Object.fromEntries(entries));
  }

  useEffect(() => {
    bridge.getSettings().then(async (cfg) => {
      // On every launch, snap the active model to the saved Default Model.
      if (cfg.defaultModel && cfg.defaultModel.includes("::")) {
        const i = cfg.defaultModel.indexOf("::");
        const pid = cfg.defaultModel.slice(0, i), mid = cfg.defaultModel.slice(i + 2);
        if (cfg.profiles[pid]) {
          cfg = { ...cfg, activeProfileId: pid, profiles: { ...cfg.profiles, [pid]: { ...cfg.profiles[pid], model: mid } } };
          await bridge.saveSettings(cfg);
        }
      }
      setSettings(cfg);
      loadModelsFor(cfg);
    });
  }, []);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [timeline, streaming]);

  const onEvent = useCallback((e) => {
    switch (e.kind) {
      case "init":
        if (e.data.permissionMode) setPermissionMode(e.data.permissionMode);
        if (e.data.model || e.data.provider) lastInfoRef.current = { model: e.data.model, provider: e.data.provider, kind: e.data.kind };
        break;
      case "assistant_delta": {
        const text = e.data.text ?? "";
        if (!text) break;
        setStreaming(true);
        setTimeline((tl) => {
          const last = tl[tl.length - 1];
          if (streamOpen.current && last && last.type === "message" && last.role === "assistant") {
            return [...tl.slice(0, -1), { ...last, text: last.text + text }];
          }
          streamOpen.current = true;
          return [...tl, { type: "message", role: "assistant", text, meta: lastInfoRef.current }];
        });
        break;
      }
      case "assistant_message":
        streamOpen.current = false; setStreaming(false);
        break;
      case "tool_use":
        streamOpen.current = false; setStreaming(false);
        if (HIDDEN_TOOLS.has(e.data.name)) break; // internal plumbing — don't surface to the user
        setTimeline((tl) => [...tl, { type: "tool", id: e.data.id, name: e.data.name, input: e.data.input, auto: e.data.auto, status: "run" }]);
        break;
      case "tool_result":
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, output: e.data.output, status: "ok" } : it));
        break;
      case "permission_request":
        setPerm(e.data);
        break;
      case "permission_denied":
        setPerm(null);
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, status: "deny" } : it));
        break;
      case "result":
        streamOpen.current = false; setStreaming(false); setBusy(false);
        setHistRefresh((n) => n + 1); // refresh the saved-chat list (new title / new convo)
        break;
      case "error":
        streamOpen.current = false; setStreaming(false); setBusy(false);
        setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ ${e.data?.message || "Error"}` }]);
        break;
      default: break;
    }
  }, []);

  useEffect(() => bridge.onEvent(onEvent), [onEvent]);

  // Theme: apply dark/light/system to <html data-theme>, and follow the OS when "system".
  useEffect(() => {
    const theme = (settings && settings.theme) || "dark";
    const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      const resolved = theme === "system" ? (mq && mq.matches ? "light" : "dark") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    if (theme === "system" && mq) {
      mq.addEventListener ? mq.addEventListener("change", apply) : mq.addListener(apply);
      return () => { mq.removeEventListener ? mq.removeEventListener("change", apply) : mq.removeListener(apply); };
    }
  }, [settings && settings.theme]);

  // Accent color: "default" = original two-tone (iris + teal, multi-color marks).
  // Any hex = monochrome blend of the whole UI to that single color.
  useEffect(() => {
    const root = document.documentElement;
    const raw = ((settings && settings.accent) || "default").trim();
    const clearVars = () => { ["--accent", "--accent-rgb", "--accent-2", "--accent2-rgb"].forEach((v) => root.style.removeProperty(v)); };
    const m = /^#?([0-9a-f]{6})$/i.exec(raw);
    if (raw === "default" || !m) { root.dataset.accent = "default"; clearVars(); return; }
    const n = parseInt(m[1], 16);
    const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    root.dataset.accent = "custom";
    root.style.setProperty("--accent", "#" + m[1]);
    root.style.setProperty("--accent-rgb", rgb);
    root.style.setProperty("--accent-2", "#" + m[1]);   // blend secondary into the chosen color
    root.style.setProperty("--accent2-rgb", rgb);
  }, [settings && settings.accent]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) { e.preventDefault(); setSidebarOpen((v) => !v); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isAgentMode = mode === "cowork" || mode === "code";

  const send = async (text, images = []) => {
    setTimeline((tl) => [...tl, { type: "message", role: "user", text, images }]);
    setBusy(true);
    streamOpen.current = false;
    if (!sessionRef.current) {
      const req = projectCtx
        ? { mode: "project", prompt: text, projectId: projectCtx.projectId, conversationId: projectCtx.conversationId, images }
        : { mode, prompt: text, cwd, permissionMode, conversationId: activeConvId, images };
      const { sessionId, conversationId } = await bridge.start(req);
      sessionRef.current = sessionId;
      if (!projectCtx && conversationId) setActiveConvId(conversationId);
    } else {
      bridge.sendInput(sessionRef.current, text, images);
    }
  };

  // ---- persisted chat history (Talk / Collaborate / Build) ----
  const openSession = async (id) => {
    const conv = await bridge.getSession(id);
    if (!conv) return;
    const msgs = (conv.messages || []).map((m) => ({ type: "message", role: m.role, text: m.content }));
    setMode(conv.mode); setChatMode(conv.mode); setTimeline(msgs); setActiveConvId(id); setCwd(conv.cwd || null);
    setProjectCtx(null); setCoworkProj(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  // Start a fresh chat — also returns to the chat surface if we're in a tool/settings view.
  const newSession = () => {
    if (!PRIMARY.includes(mode)) setMode(chatMode);
    setProjectCtx(null); setCoworkProj(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  const removeSession = async (id) => {
    await bridge.deleteSession(id);
    if (id === activeConvId) newSession();
    setHistRefresh((n) => n + 1);
  };

  // ---- Continue on phone (bind a Cowork session to the Telegram bot) ----
  useEffect(() => { bridge.getMobileLink && bridge.getMobileLink().then(setMobileLink).catch(() => {}); }, []);
  // Poll whether the Telegram bot is online so we can auto-link when it is.
  useEffect(() => {
    let live = true;
    const tick = () => bridge.messagingStatus && bridge.messagingStatus().then((s) => { if (live) setBotRunning(!!(s && s.running)); }).catch(() => {});
    tick();
    const iv = setInterval(tick, 5000);
    return () => { live = false; clearInterval(iv); };
  }, []);
  const autoContinue = !settings || !settings.messaging || settings.messaging.autoContinue !== false; // default on
  const linkedHere = mobileLink && mobileLink.sessionId && mobileLink.sessionId === activeConvId;
  // Auto: while you're in a Cowork session (any project, any folder) AND the bot is online, make THAT
  // session the linked one — so each project uses its own folder. When you leave Cowork, release the
  // link so the bot reverts to working independently (its own Bot-setup folder/chat).
  useEffect(() => {
    if (!autoContinue) return;
    if (mode === "cowork" && activeConvId && botRunning) {
      if (mobileLink && mobileLink.sessionId === activeConvId) return;
      const title = (timeline.find((t) => t.role === "user")?.text || "Cowork session").slice(0, 60);
      bridge.setMobileLink({ sessionId: activeConvId, title, cwd: cwd || "" }).then(setMobileLink).catch(() => {});
    } else if (mode !== "cowork" && mobileLink) {
      bridge.clearMobileLink().then(() => setMobileLink(null)).catch(() => {});
    }
  }, [autoContinue, mode, activeConvId, botRunning, cwd]); // eslint-disable-line
  const linkThisToPhone = async () => {
    if (!activeConvId) { alert("Send a message first so this session is saved, then link it to your phone."); return; }
    const title = (timeline.find((t) => t.role === "user")?.text || "Cowork session").slice(0, 60);
    const link = await bridge.setMobileLink({ sessionId: activeConvId, title, cwd: cwd || "" });
    setMobileLink(link);
    if (!botRunning) alert("Linked ✓\n\nOpen Via Mobile and enable your Telegram bot. Then message the bot — it continues this session and replies appear here when you return.");
  };
  const unlinkPhone = async () => { await bridge.clearMobileLink(); setMobileLink(null); };

  // Open a saved project conversation into the chat surface.
  const openConversation = async (project, convMeta) => {
    const full = await bridge.getConversation(convMeta.id);
    const msgs = ((full && full.messages) || []).map((m) => ({ type: "message", role: m.role, text: m.content }));
    setTimeline(msgs);
    setProjectCtx({ projectId: project.id, projectName: project.name, conversationId: convMeta.id, title: (full && full.title) || convMeta.title });
    sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  const backToProjects = () => { setProjectCtx(null); setTimeline([]); sessionRef.current = null; setBusy(false); };

  // Start a new project conversation from the Projects detail composer (opens the chat surface + sends).
  const startProjectChat = async (project, text) => {
    const conv = await bridge.createConversation(project.id);
    setProjectCtx({ projectId: project.id, projectName: project.name, conversationId: conv.id, title: (text || "").slice(0, 48) || "New conversation" });
    setTimeline(text ? [{ type: "message", role: "user", text }] : []);
    sessionRef.current = null; streamOpen.current = false;
    if (text) {
      setBusy(true);
      const { sessionId } = await bridge.start({ mode: "project", prompt: text, projectId: project.id, conversationId: conv.id });
      sessionRef.current = sessionId;
    }
  };

  // Start a Cowork task scoped to a project: uses the project's linked folder as the
  // working dir and injects its instructions + knowledge as context (like Claude).
  const startProjectCowork = async (project, text) => {
    if (!project.folder) { alert("Link a folder to this project first (Files & sources) to run a Cowork task."); return; }
    setMode("cowork"); setChatMode("cowork");
    setProjectCtx(null); setCoworkProj({ id: project.id, name: project.name });
    setCwd(project.folder);
    setTimeline(text ? [{ type: "message", role: "user", text }] : []);
    setActiveConvId(null); sessionRef.current = null; streamOpen.current = false;
    if (text) {
      setBusy(true);
      const { sessionId, conversationId } = await bridge.start({ mode: "cowork", prompt: text, cwd: project.folder, permissionMode, projectId: project.id });
      sessionRef.current = sessionId;
      if (conversationId) setActiveConvId(conversationId);
    }
  };

  const changePermission = (m) => {
    setPermissionMode(m);
    if (sessionRef.current) bridge.setPermissionMode(sessionRef.current, m);
  };

  const pickFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (typeof dir === "string" && dir) { setCwd(dir); sessionRef.current = null; setTimeline([]); setActiveConvId(null); }
    else if (dir && dir.error) { alert(dir.error); } // e.g. web: folder access is desktop-only
  };
  // Connect a GitHub repo: clone it (desktop) and use it as the working folder for Build.
  // window.prompt() is disabled in Electron, so we use an in-app input modal.
  const addRepo = () => setRepo({ open: true, url: "", busy: false, err: "" });
  const connectRepo = async () => {
    const url = (repo.url || "").trim(); if (!url) return;
    setRepo((r) => ({ ...r, busy: true, err: "" }));
    const res = await (bridge.cloneRepo ? bridge.cloneRepo(url) : Promise.resolve({ error: "Not available." })).catch((e) => ({ error: String((e && e.message) || e) }));
    if (res && res.folder) {
      if (!PRIMARY.includes(mode)) setMode("code");
      setCwd(res.folder); sessionRef.current = null; setTimeline([]); setActiveConvId(null);
      setRepo({ open: false, url: "", busy: false, err: "" });
    } else setRepo((r) => ({ ...r, busy: false, err: (res && res.error) || "Couldn't connect the repo." }));
  };
  // Use an already-available folder (a saved repo, or one the EnvPicker just cloned) as the Build workspace.
  const useFolder = (folder) => {
    if (!folder) return;
    if (!PRIMARY.includes(mode)) setMode("code");
    setCwd(folder); sessionRef.current = null; setTimeline([]); setActiveConvId(null);
  };

  const stop = () => { if (sessionRef.current) bridge.interrupt(sessionRef.current); setBusy(false); };

  const resolve = (behavior) => {
    if (!perm) return;
    bridge.resolvePermission(perm.requestId, { behavior });
    if (behavior === "allow") {
      setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === perm.toolUseId ? { ...it, status: "run" } : it));
    }
    setPerm(null);
  };

  const switchMode = (m) => {
    // Snapshot the conversation of the mode we're leaving so we can restore it.
    if (PRIMARY.includes(mode)) modeCacheRef.current[mode] = { convId: activeConvId, timeline };
    if (m !== mode) bridge.track?.("view", { section: m }); // analytics: which sections get used
    setMode(m); streamOpen.current = false; setBusy(false); setPerm(null);
    if (PRIMARY.includes(m)) setChatMode(m);
    if (PRIMARY.includes(m)) {
      // Returning to a chat mode: restore its last conversation (or start fresh).
      const c = modeCacheRef.current[m];
      setProjectCtx(null); setCoworkProj(null);
      setTimeline(c ? c.timeline : []);
      setActiveConvId(c ? c.convId : null);
      sessionRef.current = null;
    } else if (m === "project") {
      setProjectCtx(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null;
    }
    // Secondary views (settings/skills/connectors/viamobile/consumption): leave the
    // current conversation untouched so coming back restores it.
  };

  // Live models per provider → one picker, grouped by provider. All providers are always
  // available; the chosen model in the picker decides which provider runs (no separate "active").
  const isLocal = (u) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(u || "");
  const profiles = settings ? Object.values(settings.profiles) : [];
  const activeProfile = settings ? settings.profiles[settings.activeProfileId] : null;
  const pickerGroups = profiles
    .map((p) => {
      const live = modelsByProfile[p.id] || [];
      const cached = p.cachedModels || [];
      const ids = live.length ? live : (cached.length ? cached : (p.model ? [p.model] : []));
      const loc = isLocal(p.baseUrl) ? "local" : "cloud";
      return { group: `${p.name} · ${loc}`, items: ids.slice(0, 500).map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: loc })) };
    })
    .filter((g) => g.items.length);

  const activeValue = activeProfile ? `${activeProfile.id}::${activeProfile.model || ""}` : undefined;
  const activeLoc = activeProfile ? (isLocal(activeProfile.baseUrl) ? "local" : "cloud") : "";

  // Online/offline indicator for the active provider.
  useEffect(() => {
    if (!activeProfile) return;
    let alive = true;
    setOnline(null);
    bridge.pingProvider(activeProfile.id).then((ok) => { if (alive) setOnline(ok); });
    const t = setInterval(() => bridge.pingProvider(activeProfile.id).then((ok) => alive && setOnline(ok)), 30000);
    return () => { alive = false; clearInterval(t); };
  }, [activeProfile && activeProfile.id, activeProfile && activeProfile.baseUrl]);

  // Selecting a model sets BOTH the active provider and that provider's model.
  // Re-read from disk first so we never clobber a profile added in the Settings panel.
  const selectModel = async (value) => {
    const i = value.indexOf("::");
    const pid = value.slice(0, i);
    const mid = value.slice(i + 2);
    const cur = await bridge.getSettings();
    if (!cur.profiles[pid]) return;
    const next = { ...cur, activeProfileId: pid, profiles: { ...cur.profiles, [pid]: { ...cur.profiles[pid], model: mid } } };
    setSettings(next); await bridge.saveSettings(next);
  };
  const refreshModels = () => loadModelsFor(settings);

  const _hour = new Date().getHours();
  const _part = _hour < 12 ? "Morning" : _hour < 18 ? "Afternoon" : "Evening";
  const _acct = (settings && settings.account) || {};
  const _nm = ((_acct.name || "").trim().split(" ")[0]) || ((_acct.email || "").split("@")[0]) || "";
  const _who = _nm ? _nm.charAt(0).toUpperCase() + _nm.slice(1) : "";
  const greeting = _who ? `Good ${_part.toLowerCase()}, ${_who}` : `Good ${_part.toLowerCase()}`;

  const isSettings = mode === "settings";
  const isConnectors = mode === "connectors";
  const isSkills = mode === "skills";
  const isPlugins = mode === "plugins";
  const isModels = mode === "models" || mode === "models-overview" || mode === "models-speed";
  const modelsTab = mode === "models-overview" ? "overview" : mode === "models-speed" ? "speed" : "config";
  const isViaMobile = mode === "viamobile";
  const isScheduler = mode === "scheduler";
  const isConsumption = mode === "consumption";
  const isStudio = mode === "studio";
  const isTerminal = mode === "terminal";
  const startStudio = (prompt) => {
    studioSeed.current = prompt || null;
    modeCacheRef.current.chat = { convId: null, timeline: [] }; // fresh chat per Studio idea (don't restore the last one)
    switchMode("chat");
  };
  useEffect(() => { if (mode === "chat" && studioSeed.current) { const seed = studioSeed.current; studioSeed.current = null; send(seed); } }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusDot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  const controlsRow = (
    <div className="ctrl-row">
      {isAgentMode && <EnvPicker cwd={cwd} onPickFolder={pickFolder} onUseFolder={useFolder} onAddRepoUrl={addRepo} />}
      {isAgentMode && <PermissionPicker value={permissionMode} onChange={changePermission} />}
      <ModelPicker value={activeValue} groups={pickerGroups} onChange={selectModel} onRefresh={refreshModels} />
    </div>
  );

  return (
    <div className={`app-v ${sidebarOpen ? "" : "sb-collapsed"}`}>
      <TopNav
        mode={mode}
        onSelect={switchMode}
        model={activeValue}
        groups={pickerGroups}
        onModel={selectModel}
        onRefresh={refreshModels}
        permissionMode={permissionMode}
        onPermissionChange={changePermission}
        online={online}
        loc={activeLoc}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />
      {repo.open && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !repo.busy) setRepo({ open: false, url: "", busy: false, err: "" }); }}>
          <div className="repo-modal">
            <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>Connect a GitHub repo</h3>
            <p style={{ margin: "0 0 14px", color: "var(--text-2)", fontSize: 13 }}>Paste a public repo URL — BrainEdge clones it and works on it{isWeb ? ". (Cloning needs the desktop app.)" : "."}</p>
            <input className="model-search" autoFocus value={repo.url} placeholder="https://github.com/user/repo"
              onChange={(e) => setRepo((r) => ({ ...r, url: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") connectRepo(); }} />
            {repo.err && <div className="repo-err">{repo.err}</div>}
            <div className="repo-actions">
              <button className="btn ghost" onClick={() => setRepo({ open: false, url: "", busy: false, err: "" })}>Cancel</button>
              <button className="btn primary" disabled={repo.busy || !repo.url.trim()} onClick={connectRepo}>{repo.busy ? "Cloning…" : "Connect"}</button>
            </div>
          </div>
        </div>
      )}
      <div className={`app-body ${sidebarOpen ? "" : "sb-collapsed"}`}>
      <Sidebar active={mode} onSelect={switchMode}
        historyMode={chatMode} activeConvId={activeConvId} refreshKey={histRefresh}
        onNew={newSession} onOpenSession={openSession} onDeleteSession={removeSession} />
      <div className="main">
        {isSettings ? (
          <Settings onChanged={setSettings} />
        ) : isConnectors ? (
          <Connectors />
        ) : isSkills ? (
          <Skills />
        ) : isPlugins ? (
          <Plugins onNavigate={switchMode} />
        ) : isViaMobile ? (
          <ViaMobile onNavigate={switchMode} onSettingsChanged={setSettings} />
        ) : isScheduler ? (
          <Scheduler />
        ) : isConsumption ? (
          <Consumption />
        ) : isStudio ? (
          <StudioLauncher onStart={startStudio} />
        ) : isTerminal ? (
          <TerminalPanel cwd={cwd} />
        ) : isModels ? (
          <ModelsSection activeModel={activeProfile && activeProfile.model} onChanged={setSettings}
            tab={modelsTab} onTab={(t) => switchMode(t === "overview" ? "models-overview" : t === "speed" ? "models-speed" : "models")} />
        ) : (mode === "project" && !projectCtx) ? (
          <ProjectsBrowser onOpen={openConversation} onStartChat={startProjectChat} onStartCowork={startProjectCowork} />
        ) : (
          <div className="work-split">
            <div className="work-main">
              {timeline.length === 0 ? (
                <div className="hero scroll">
                  <div className="hero-inner">
                    <div className="hero-greet"><ThinkLogo size={40} animated={false} /><h1 className="greeting">{greeting}</h1></div>
                    <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} agent={isAgentMode} model={activeValue} groups={pickerGroups} onModel={selectModel} onRefresh={refreshModels} permissionMode={permissionMode} onPermissionChange={changePermission} />
                    {projectCtx && (
                      <div className="hero-opts">
                        <button className="chip" onClick={backToProjects}>← Projects</button>
                        <span className="chip">{projectCtx.projectName} · {projectCtx.title}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {isAgentMode && (
                    <div className="folder-bar">
                      <FolderOpen size={14} />
                      {cwd ? <span className="path">{cwd}</span> : <span className="path muted">No folder selected</span>}
                      {isWeb && !cwd && (
                        <span style={{ fontSize: 11, color: folderInChromeEdge ? "var(--danger)" : "var(--text-2)", marginLeft: 10 }}>
                          {folderInChromeEdge ? "⚠ Open in Chrome or Edge to use folders" : "Works in Chrome & Edge"}
                        </span>
                      )}
                      <button className="btn" onClick={pickFolder} disabled={folderInChromeEdge} style={{ marginLeft: "auto", padding: "5px 10px" }}>{cwd ? "Change folder" : "Choose folder"}</button>
                      {mode === "cowork" && (
                        autoContinue
                          ? <span className={`folder-phone ${botRunning ? (linkedHere ? "active" : "linking") : "inactive"}`}
                              title={botRunning
                                ? (linkedHere
                                    ? "On phone (auto): this session is live on your phone via the Telegram bot. Turn auto off in Via Mobile to pin a specific session."
                                    : "Linking this session to your phone…")
                                : "Phone: the Telegram bot is offline. Enable it in Via Mobile."}>
                              <Smartphone size={16} />
                            </span>
                          : (linkedHere
                              ? <button className="btn phone-linked" onClick={unlinkPhone} title="This session continues on your phone via the Telegram bot. Click to unlink." style={{ padding: "5px 10px" }}><Smartphone size={14} /> On phone · Unlink</button>
                              : <button className="btn" onClick={linkThisToPhone} title="Continue this session from your phone via the Telegram bot" style={{ padding: "5px 10px" }}><Smartphone size={14} /> Continue on phone</button>)
                      )}
                    </div>
                  )}
                  {projectCtx && (
                    <div className="folder-bar">
                      <button className="btn ghost" onClick={backToProjects} style={{ padding: "4px 8px" }}>← Projects</button>
                      <FolderKanban size={14} />
                      <span className="path">{projectCtx.projectName}</span>
                      <span style={{ color: "var(--text-2)" }}>· {projectCtx.title}</span>
                    </div>
                  )}
                  <div className="chat scroll" ref={chatRef}>
                    <div className="chat-inner">
                      {timeline.map((item, i) => (
                        <Message key={i} item={item} onOpenArtifact={setArtifact} userName={_who || "You"}
                          streaming={streaming && i === timeline.length - 1 && item.type === "message" && item.role === "assistant"} />
                      ))}
                    </div>
                  </div>
                  <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} />
                </>
              )}
            </div>
            {artifact && <ArtifactPanel artifact={artifact} onClose={() => setArtifact(null)} />}
          </div>
        )}
      </div>
      </div>

      <PermissionModal
        req={perm}
        onAllow={() => resolve("allow")}
        onAllowAlways={() => { changePermission("bypassPermissions"); resolve("allow"); }}
        onDeny={() => resolve("deny")}
      />
    </div>
  );
}
