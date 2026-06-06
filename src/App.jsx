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
import Consumption from "./components/Consumption.jsx";
import ModelsOverview from "./components/ModelsOverview.jsx";
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
  const [online, setOnline] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [activeConvId, setActiveConvId] = useState(null);
  const [histRefresh, setHistRefresh] = useState(0);
  const [chatMode, setChatMode] = useState("chat"); // last primary mode → drives the Recents list
  const sessionRef = useRef(null);
  const chatRef = useRef(null);
  const streamOpen = useRef(false);
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
          return [...tl, { type: "message", role: "assistant", text }];
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

  const isAgentMode = mode === "cowork" || mode === "code";

  const send = async (text) => {
    setTimeline((tl) => [...tl, { type: "message", role: "user", text }]);
    setBusy(true);
    streamOpen.current = false;
    if (!sessionRef.current) {
      const req = projectCtx
        ? { mode: "project", prompt: text, projectId: projectCtx.projectId, conversationId: projectCtx.conversationId }
        : { mode, prompt: text, cwd, permissionMode, conversationId: activeConvId };
      const { sessionId, conversationId } = await bridge.start(req);
      sessionRef.current = sessionId;
      if (!projectCtx && conversationId) setActiveConvId(conversationId);
    } else {
      bridge.sendInput(sessionRef.current, text);
    }
  };

  // ---- persisted chat history (Talk / Collaborate / Build) ----
  const openSession = async (id) => {
    const conv = await bridge.getSession(id);
    if (!conv) return;
    const msgs = (conv.messages || []).map((m) => ({ type: "message", role: m.role, text: m.content }));
    setMode(conv.mode); setChatMode(conv.mode); setTimeline(msgs); setActiveConvId(id); setCwd(conv.cwd || null);
    setProjectCtx(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  // Start a fresh chat — also returns to the chat surface if we're in a tool/settings view.
  const newSession = () => {
    if (!PRIMARY.includes(mode)) setMode(chatMode);
    setProjectCtx(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
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
      setProjectCtx(null);
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
  const _who = ((settings && settings.account && settings.account.name) || "").trim().split(" ")[0];
  const greeting = _who ? `${_part}, ${_who}` : `Good ${_part.toLowerCase()}`;

  const isSettings = mode === "settings";
  const isConnectors = mode === "connectors";
  const isSkills = mode === "skills";
  const isDispatch = mode === "dispatch";
  const isConsumption = mode === "consumption";
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
      />
      <div className="app-body">
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
        ) : isDispatch ? (
          <Dispatch />
        ) : isConsumption ? (
          <Consumption />
        ) : isModels ? (
          <ModelsOverview activeModel={activeProfile && activeProfile.model} />
        ) : (mode === "project" && !projectCtx) ? (
          <ProjectsBrowser onOpen={openConversation} />
        ) : (
          <div className="work-split">
            <div className="work-main">
              {timeline.length === 0 ? (
                <div className="hero scroll">
                  <div className="hero-inner">
                    <div className="hero-greet"><ThinkLogo size={52} /><h1 className="greeting">{greeting}</h1></div>
                    <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} agent={isAgentMode} model={activeValue} groups={pickerGroups} onModel={selectModel} onRefresh={refreshModels} permissionMode={permissionMode} onPermissionChange={changePermission} />
                    {controlsRow}
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
                      <button className="btn" onClick={pickFolder} style={{ marginLeft: "auto", padding: "5px 10px" }}>{cwd ? "Change folder" : "Choose folder"}</button>
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
                        <Message key={i} item={item} onOpenArtifact={setArtifact}
                          streaming={streaming && i === timeline.length - 1 && item.type === "message" && item.role === "assistant"} />
                      ))}
                    </div>
                  </div>
                  <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} />
                  {controlsRow}
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
