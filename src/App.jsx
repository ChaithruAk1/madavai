import { useEffect, useRef, useState, useCallback } from "react";
import { FolderOpen, FolderKanban } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import TopNav from "./components/TopNav.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import PermissionModal from "./components/PermissionModal.jsx";
import Settings from "./components/Settings.jsx";
import Connectors from "./components/Connectors.jsx";
import Skills from "./components/Skills.jsx";
import ProjectsBrowser from "./components/ProjectsBrowser.jsx";
import Dispatch from "./components/Dispatch.jsx";
import SavedLibrary from "./components/SavedLibrary.jsx";
import Consumption from "./components/Consumption.jsx";
import ModelsSection from "./components/ModelsSection.jsx";
import ArtifactPanel from "./components/ArtifactPanel.jsx";
import ThinkLogo from "./components/ThinkLogo.jsx";
import ModelPicker from "./components/ModelPicker.jsx";
import { PermissionPicker } from "./components/Topbar.jsx";
import { bridge } from "./bridge/index.js";

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
  const [activeConvId, setActiveConvId] = useState(null);
  const [histRefresh, setHistRefresh] = useState(0);
  const [chatMode, setChatMode] = useState("chat"); // last primary mode → drives the Recents list
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sessionRef = useRef(null);
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

  // Bookmark a BrainEdge response into the Saved library (toggle).
  const saveResponse = async (i) => {
    const item = timeline[i];
    if (!item || item.role !== "assistant") return;
    if (item.savedId) {
      await bridge.removeSaved(item.savedId);
      setTimeline((tl) => tl.map((it, idx) => idx === i ? { ...it, savedId: null } : it));
      return;
    }
    // nearest preceding user message = the question
    let question = "";
    for (let j = i - 1; j >= 0; j--) { if (timeline[j].type === "message" && timeline[j].role === "user") { question = timeline[j].text; break; } }
    const rec = await bridge.saveResponse({
      text: item.text, question, meta: item.meta || null,
      convId: projectCtx ? projectCtx.conversationId : activeConvId,
      mode: projectCtx ? "project" : mode,
    });
    if (rec && rec.id) setTimeline((tl) => tl.map((it, idx) => idx === i ? { ...it, savedId: rec.id } : it));
  };

  const changePermission = (m) => {
    setPermissionMode(m);
    if (sessionRef.current) bridge.setPermissionMode(sessionRef.current, m);
  };

  const pickFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (dir) { setCwd(dir); sessionRef.current = null; setTimeline([]); setActiveConvId(null); }
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
    // Secondary views (settings/skills/connectors/dispatch/consumption): leave the
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
  const isDispatch = mode === "dispatch";
  const isConsumption = mode === "consumption";
  const isSaved = mode === "saved";
  const isModels = mode === "models";

  const statusDot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  const controlsRow = (
    <div className="ctrl-row">
      {isAgentMode && <button className="chip" onClick={pickFolder}><FolderOpen size={13} /> {cwd || "Choose folder"}</button>}
      {isAgentMode && <PermissionPicker value={permissionMode} onChange={changePermission} />}
      <ModelPicker value={activeValue} groups={pickerGroups} onChange={selectModel} onRefresh={refreshModels} />
    </div>
  );

  return (
    <div className="app-v">
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
      <div className={`app-body ${sidebarOpen ? "" : "sb-collapsed"}`}>
      <Sidebar active={mode} onSelect={switchMode}
        historyMode={chatMode} activeConvId={activeConvId} refreshKey={histRefresh}
        onNew={newSession} onOpenSession={openSession} o