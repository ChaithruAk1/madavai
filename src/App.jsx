// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { FolderOpen, FolderKanban, Smartphone, Bot, X, Zap, MessageCircleQuestion } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import TopNav from "./components/TopNav.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import PermissionModal from "./components/PermissionModal.jsx";
import Settings from "./components/Settings.jsx";
import Connectors from "./components/Connectors.jsx";
import Skills from "./components/Skills.jsx";
import Plugins from "./components/Plugins.jsx";
import Workrooms from "./components/Workrooms.jsx";
import Consumption from "./components/Consumption.jsx";
import ActivityPanel from "./components/Activity.jsx";
import ModelsSection from "./components/ModelsSection.jsx";
import ArtifactPanel from "./components/ArtifactPanel.jsx";
import Agents from "./components/Agents.jsx";
import TeamOps from "./components/TeamOps.jsx";
import AgentOps from "./components/AgentOps.jsx";
import Onboarding from "./components/Onboarding.jsx";
import UserGuide from "./components/UserGuide.jsx";
// ADMIN-ONLY, BUILD-GATED: the Test Center UI (and the functional sweep it imports) is
// compiled in ONLY when the build sets VITE_INCLUDE_QA=1 (dev + `npm run build:admin`).
// The plain `npm run build` used for installers and web deploys statically drops this
// branch, so the QA interface never exists in what end users download.
const QA_IN_BUILD = import.meta.env.VITE_INCLUDE_QA === "1";
const TestCenter = QA_IN_BUILD ? lazy(() => import("./components/TestCenter.jsx")) : null;
// ---- Two-channel feature flags (Extras switchboard → public installer) ----
// scripts/build-features.mjs writes VITE_FEAT_<KEY>=0 for features the owner switched
// off in Settings → Extras before a PUBLIC build; Vite folds each comparison to a
// constant, so Rollup statically DROPS the feature's chunk from the public bundle
// (exact same mechanism as the QA exclusion above). Dev + admin builds have everything.
const FEAT_SAGE = import.meta.env.VITE_FEAT_SAGE !== "0";
const FEAT_STUDIO = import.meta.env.VITE_FEAT_STUDIO !== "0";
const FEAT_TERMINAL = import.meta.env.VITE_FEAT_TERMINAL !== "0";
const FEAT_SCHEDULER = import.meta.env.VITE_FEAT_SCHEDULER !== "0";
const FEAT_VIAMOBILE = import.meta.env.VITE_FEAT_VIAMOBILE !== "0";
const SageDockLazy = FEAT_SAGE ? lazy(() => import("./components/SageDock.jsx")) : null;
const StudioLauncher = FEAT_STUDIO ? lazy(() => import("./components/StudioLauncher.jsx")) : null;
const TerminalPanel = FEAT_TERMINAL ? lazy(() => import("./components/TerminalPanel.jsx")) : null;
const Scheduler = FEAT_SCHEDULER ? lazy(() => import("./components/Scheduler.jsx")) : null;
const ViaMobile = FEAT_VIAMOBILE ? lazy(() => import("./components/ViaMobile.jsx")) : null;
// Features the build excludes are forced OFF in the runtime switchboard the UI consults
// (sidebar entries etc.) — one merged source the rest of the app reads.
const BUILD_OFF = [!FEAT_SAGE && "sage", !FEAT_STUDIO && "studio", !FEAT_TERMINAL && "terminal", !FEAT_SCHEDULER && "scheduler", !FEAT_VIAMOBILE && "viamobile"].filter(Boolean);
const NotInBuild = () => (
  <div className="agents-page scroll"><div className="ag-empty"><div className="ag-empty-t">Not in this build</div><div className="ag-empty-s">This feature isn't included in this edition of Madav.</div></div></div>
);
import EnvPicker from "./components/EnvPicker.jsx";
import ModelPicker from "./components/ModelPicker.jsx";
import MadavMark from "./components/MadavMark.jsx";
import { PermissionPicker } from "./components/Topbar.jsx";
import { bridge, isWeb } from "./bridge/index.js";
import { extractArtifacts } from "./artifacts.js";
import DialogHost, { madavAlert } from "./dialogs.jsx";

// On the web, local-folder access uses the File System Access API (Chrome/Edge only).
const folderInChromeEdge = isWeb && !(typeof window !== "undefined" && typeof window.showDirectoryPicker === "function");
const webFolderSupported = isWeb && typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
// Internal tools we never surface as cards in the chat (plumbing, not user-facing).
const HIDDEN_TOOLS = new Set(["load_skill"]);

// One quiet line for a burst of agent work — the chat stays a conversation
// (your words, the agent's words); the steps expand on demand.
function WorkStrip({ steps, renderMsg }) {
  const [open, setOpen] = useState(false);
  const running = steps.some(({ item }) => item.status === "run");
  return (
    <div className="workstrip-wrap">
      <button className="workstrip" onClick={() => setOpen((o) => !o)}>
        {running ? <span className="workstrip-spin" /> : <span className="workstrip-ok">✓</span>}
        {running ? "Working" : "Worked"} — {steps.length} steps {open ? "▾" : "▸"}
      </button>
      {open && steps.map(({ item, i }) => renderMsg(item, i))}
    </div>
  );
}

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
  const [coworkProj, setCoworkProj] = useState(null); // { id, name } when a Collaborate task is scoped to a project
  const [projOpenId, setProjOpenId] = useState(null); // Projects screen opens straight to this project's page (back-from-task)
  const [online, setOnline] = useState(null);
  const [artifact, setArtifact] = useState(null);
  const [repo, setRepo] = useState({ open: false, url: "", busy: false, err: "" });
  const [activeConvId, setActiveConvId] = useState(null);
  const [mobileLink, setMobileLink] = useState(null); // Telegram-linked session binding
  const [botRunning, setBotRunning] = useState(false); // Telegram bot online?
  const [histRefresh, setHistRefresh] = useState(0);
  const [chatMode, setChatMode] = useState("chat"); // last primary mode → drives the Recents list
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentCtx, setAgentCtx] = useState(null); // active custom agent for this session ({id,name,instructions,tools,model})
  const [teamCtx, setTeamCtx] = useState(null);   // active agent team ({name,mode,members:[agents]})
  const [teamRun, setTeamRun] = useState(null);   // live mission state for TeamOps: { startedAt, steps, plan, synth, finished, budget }
  const [ask, setAsk] = useState(null);           // pending mid-mission question from an agent ({requestId, question, options})
  const [askText, setAskText] = useState("");
  const askQueue = useRef([]);                    // queued questions (parallel members can ask at once)
  const [missionPending, setMissionPending] = useState(null); // unfinished team-mission checkpoint for this conversation
  const sessionRef = useRef(null);
  const studioSeed = useRef(null); // pending Studio starter prompt, sent once we're in chat mode
  const agentSeed = useRef(null);  // pending { agent, prompt } from the Agents launcher
  const teamSeed = useRef(null);   // pending team from the Teams launcher
  const permQueue = useRef([]);    // pending permission requests (parallel team members can overlap)
  const [soloRun, setSoloRun] = useState(null); // live activity feed for SOLO agent turns (Mission Control's little sibling)
  const chatRef = useRef(null);
  const streamOpen = useRef(false);
  const lastInfoRef = useRef(null); // real {model, provider, kind} from the backend init event
  const replyBufRef = useRef("");   // current turn's assistant text (for spoken replies)
  const settingsRef = useRef(null); // settings mirror readable inside the stable onEvent callback
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
    // Bind the session from the FIRST init event: the web bridge emits `init`
    // synchronously inside bridge.start() — before the caller's await resolves
    // and assigns sessionRef — so a strict guard alone would drop it.
    if (e.kind === "init" && e.sessionId && !sessionRef.current) sessionRef.current = e.sessionId;
    // Events from a PREVIOUS session (e.g. one detached by navigation) must not
    // mutate the conversation currently on screen. Strict: when no session is
    // bound (after a detach), foreign events are ignored instead of passing through.
    if (e.sessionId && e.sessionId !== sessionRef.current) return;
    switch (e.kind) {
      case "init":
        if (e.data.permissionMode) setPermissionMode(e.data.permissionMode);
        if (e.data.model || e.data.provider) lastInfoRef.current = { model: e.data.model, provider: e.data.provider, kind: e.data.kind };
        break;
      case "assistant_delta": {
        const text = e.data.text ?? "";
        if (!text) break;
        replyBufRef.current += text;
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
        // Team mission tracking → drives the Mission Control (TeamOps) panel.
        if (/\(teammate\)$/.test(e.data.name || "")) {
          const member = e.data.name.replace(/\s*\(teammate\)$/, "");
          setTeamRun((r) => r ? { ...r, steps: r.steps.some((s) => s.name === member)
            ? r.steps.map((s) => s.name === member ? { ...s, status: "working", evId: e.data.id } : s)
            : [...r.steps, { name: member, status: "working", evId: e.data.id }],
            plan: r.plan && r.plan.status !== "done" ? { ...r.plan, status: "done" } : r.plan } : r);
        } else if (/^Team plan/.test(e.data.name || "")) {
          setTeamRun((r) => r ? { ...r, plan: { status: "working", evId: e.data.id } } : r);
        } else {
          // Solo agent activity → drives the AgentOps live panel.
          setSoloRun((r) => r && !r.finished ? { ...r, steps: [...r.steps, { id: e.data.id, name: e.data.name, status: "run" }].slice(-40) } : r);
        }
        setTimeline((tl) => [...tl, { type: "tool", id: e.data.id, name: e.data.name, input: e.data.input, auto: e.data.auto, status: "run" }]);
        break;
      case "tool_result":
        setTeamRun((r) => {
          if (!r) return r;
          if (r.plan && r.plan.evId === e.data.id) return { ...r, plan: { ...r.plan, status: "done", output: e.data.output } };
          if (r.steps.some((s) => s.evId === e.data.id)) {
            const steps = r.steps.map((s) => s.evId === e.data.id ? { ...s, status: /^\(member failed/.test(e.data.output || "") ? "failed" : "done", output: e.data.output } : s);
            const allDone = steps.every((s) => s.status === "done" || s.status === "failed");
            return { ...r, steps, synth: allDone && r.plan ? "working" : r.synth };
          }
          return r;
        });
        setSoloRun((r) => r ? { ...r, steps: r.steps.map((s) => s.id === e.data.id ? { ...s, status: "done" } : s) } : r);
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, output: e.data.output, image: e.data.image || it.image, status: "ok" } : it));
        break;
      case "permission_request":
        // Queue requests: parallel team members can ask at the same time — show one
        // modal at a time and feed the next when the current one is resolved.
        setPerm((cur) => { if (cur) { permQueue.current.push(e.data); return cur; } return e.data; });
        break;
      case "user_question":
        // Mid-mission "ask the human": the agent paused; answering resumes it.
        setAsk((cur) => { if (cur) { askQueue.current.push(e.data); return cur; } return e.data; });
        break;
      case "budget":
        // Live token meter for Mission Control's cost guardrail.
        setTeamRun((r) => (r ? { ...r, budget: e.data } : r));
        break;
      case "permission_denied":
        setPerm((cur) => (cur && cur.toolUseId === e.data.id) ? (permQueue.current.shift() || null) : cur);
        setSoloRun((r) => r ? { ...r, steps: r.steps.map((s) => s.id === e.data.id ? { ...s, status: "deny" } : s) } : r);
        setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, status: "deny" } : it));
        break;
      case "result":
        streamOpen.current = false; setStreaming(false); setBusy(false);
        setTeamRun((r) => r ? { ...r, finished: true, synth: r.synth === "working" ? "done" : r.synth } : r);
        setSoloRun((r) => r ? { ...r, finished: true, endedAt: Date.now(), steps: r.steps.map((s) => s.status === "run" ? { ...s, status: "done" } : s) } : r);
        setHistRefresh((n) => n + 1); // refresh the saved-chat list (new title / new convo)
        // Spoken replies (voice toggle): read the final answer aloud via OS speech synthesis.
        if (settingsRef.current && settingsRef.current.voiceSpeak && replyBufRef.current && window.speechSynthesis) {
          const speech = replyBufRef.current
            .replace(/```[\s\S]*?```/g, " (code omitted) ")
            .replace(/[*_#>`|]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1")
            .replace(/\s+/g, " ").trim().slice(0, 1400);
          if (speech) {
            try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(speech)); } catch {}
          }
        }
        replyBufRef.current = "";
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

  // Accent color: "default" = original two-tone (iris + teal, multi-color marks);
  // "#hex" = monochrome blend; "grad:#a:#b[:#c]" = MULTI-COLOR accent — a gradient
  // paints primary surfaces (--accent-grad) while a solid mid-stop keeps text,
  // borders, and icons readable (--accent). The "Madav" preset uses the logo's
  // measured colors: cyan #0ad0f5 → azure #2196f8 → violet #8b50f5.
  useEffect(() => {
    const root = document.documentElement;
    const MADAV_ACCENT = "grad:#0ad0f5:#2196f8:#8b50f5";
    let raw = ((settings && settings.accent) || MADAV_ACCENT).trim();
    if (raw === "default") raw = MADAV_ACCENT; // previous default retired — Madav is the default now
    const clearVars = () => { ["--accent", "--accent-rgb", "--accent-2", "--accent2-rgb", "--accent-ink", "--accent-grad"].forEach((v) => root.style.removeProperty(v)); };
    const hexRgb = (hex) => { const n = parseInt(hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const apply = (solidHex, secondHex, gradStops) => {
      const [r, g, b] = hexRgb(solidHex);
      const [r2, g2, b2] = hexRgb(secondHex);
      root.dataset.accent = "custom";
      root.style.setProperty("--accent", "#" + solidHex);
      root.style.setProperty("--accent-rgb", `${r},${g},${b}`);
      root.style.setProperty("--accent-2", "#" + secondHex);
      root.style.setProperty("--accent2-rgb", `${r2},${g2},${b2}`);
      if (gradStops) root.style.setProperty("--accent-grad", `linear-gradient(110deg, ${gradStops.map((h) => "#" + h).join(", ")})`);
      else root.style.removeProperty("--accent-grad");
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      root.style.setProperty("--accent-ink", brightness < 145 ? "#ffffff" : "#04121a");
    };
    if (raw.startsWith("grad:")) {
      const stops = raw.slice(5).split(":").map((x) => (/^#?([0-9a-f]{6})$/i.exec(x.trim()) || [])[1]).filter(Boolean);
      if (stops.length >= 2) { apply(stops[Math.floor((stops.length - 1) / 2)], stops[stops.length - 1], stops); return; }
    }
    const m = /^#?([0-9a-f]{6})$/i.exec(raw);
    if (raw === "default" || !m) { root.dataset.accent = "default"; clearVars(); return; }
    apply(m[1], m[1], null);
  }, [settings && settings.accent]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) { e.preventDefault(); setSidebarOpen((v) => !v); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // Spoken replies: the composer's speaker button (next to the mic) toggles
  // settings.voiceSpeak. It saves to settings directly, so keep App's in-memory
  // copy fresh via the window event — otherwise settingsRef would go stale and
  // read-aloud wouldn't react until a reload.
  useEffect(() => {
    const sync = (e) => setSettings((s) => (s ? { ...s, voiceSpeak: !!e.detail } : s));
    window.addEventListener("madav:voicespeak", sync);
    return () => window.removeEventListener("madav:voicespeak", sync);
  }, []);

  const isAgentMode = mode === "cowork" || mode === "code";

  // Retry an assistant reply: drop from the preceding user message onward and re-send it (fresh turn).
  const retryAt = (i) => {
    let u = -1; for (let k = i - 1; k >= 0; k--) { if (timeline[k]?.type === "message" && timeline[k].role === "user") { u = k; break; } }
    if (u < 0) return; const item = timeline[u];
    setTimeline((tl) => tl.slice(0, u)); sessionRef.current = null; streamOpen.current = false;
    send(item.text, item.images || []);
  };
  // Edit a user message: drop from that message onward and re-send the edited text.
  const editAt = (i, newText) => {
    const item = timeline[i]; if (!item) return;
    setTimeline((tl) => tl.slice(0, i)); sessionRef.current = null; streamOpen.current = false;
    send(newText, item.images || []);
  };
  // Latest-handler indirection: Message is memoized and may keep an old onEdit/onRetry
  // closure — routing through this ref guarantees the call always hits the CURRENT
  // retryAt/editAt (fresh timeline), regardless of which render created the prop.
  const handlersRef = useRef({});
  handlersRef.current = { retryAt, editAt };

  // Version history for the open artifact — memoized so long timelines aren't
  // re-scanned (filter + extractArtifacts) on every unrelated render.
  const artifactVersions = useMemo(
    () => artifact
      ? timeline.filter((it) => it.type === "message" && it.role === "assistant").flatMap((it) => extractArtifacts(it.text)).filter((a) => a.kind === artifact.kind)
      : [],
    [timeline, artifact]
  );

  const send = async (text, images = [], agentOv = null, teamOv = null, opts = {}) => {
    const ag = agentOv || agentCtx; // explicit override beats state (avoids a stale closure on seeded launches)
    const tm = teamOv || teamCtx;
    if (tm) setTeamRun({ startedAt: Date.now(), steps: tm.members.map((m) => ({ name: m.name, status: "queued", identity: m.identity })), plan: tm.mode === "manager" ? { status: "queued" } : null, synth: null, finished: false });
    setSoloRun(ag && !tm ? { startedAt: Date.now(), finished: false, steps: [] } : null); // solo agents get their own live panel
    setTimeline((tl) => [...tl, { type: "message", role: "user", text, images }]);
    setBusy(true);
    streamOpen.current = false;
    replyBufRef.current = "";
    try {
      if (!sessionRef.current) {
        const req = projectCtx
          ? { mode: "project", prompt: text, projectId: projectCtx.projectId, conversationId: projectCtx.conversationId, images }
          : { mode, prompt: text, cwd: opts.cwd || cwd, permissionMode, conversationId: activeConvId, images, agent: ag || undefined, team: tm || undefined, resumeMission: opts.resumeMission || undefined,
              // Workrooms: any run launched from a room (chat, cowork, agent) is tagged with
              // the room's projectId — it lists in the room's work feed and gets the room's
              // instructions + knowledge injected by the engine.
              projectId: opts.projectId || (coworkProj ? coworkProj.id : undefined) };
        const { sessionId, conversationId } = await bridge.start(req);
        sessionRef.current = sessionId;
        if (!projectCtx && conversationId) setActiveConvId(conversationId);
      } else {
        bridge.sendInput(sessionRef.current, text, images);
      }
    } catch (e) {
      setBusy(false);
      setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ Couldn't start: ${(e && e.message) || e}` }]);
    }
  };

  // Answer (or skip) a mid-mission agent question — resumes the paused mission.
  const answerQuestion = (answer) => {
    if (!ask) return;
    bridge.resolvePermission(ask.requestId, { behavior: "allow", answer: answer || "(the user skipped the question — use your best judgment)" });
    setAsk(askQueue.current.shift() || null);
    setAskText("");
  };

  // Durable missions: resume an interrupted team mission from its checkpoint.
  const resumeMission = () => {
    const m = missionPending;
    if (!m || !teamCtx) return;
    setMissionPending(null);
    send(m.userText, [], null, teamCtx, { resumeMission: true });
  };

  // ---- persisted chat history (Talk / Collaborate / Build) ----
  const openSession = async (id) => {
    const conv = await bridge.getSession(id);
    if (!conv) return;
    const msgs = (conv.messages || []).map((m) => ({ type: "message", role: m.role, text: m.content }));
    setMode(conv.mode); setChatMode(conv.mode); setTimeline(msgs); setActiveConvId(id); setCwd(conv.cwd || null);
    setProjectCtx(null); setCoworkProj(null);
    // Re-attach the project scope this Collaborate task ran under (saved on the record).
    if (conv.projectId && bridge.getProject) {
      bridge.getProject(conv.projectId).then((p) => { if (p) setCoworkProj({ id: p.id, name: p.name }); }).catch(() => {});
    }
    // Re-attach the agent/team this conversation ran with (saved on the record).
    setAgentCtx(conv.agent || null);
    setTeamCtx(conv.team && conv.team.members && conv.team.members.length ? conv.team : null);
    setTeamRun(null);
    // Durable missions: if this conversation has an unfinished checkpoint, offer Resume.
    setMissionPending(null);
    if (conv.team && conv.team.members && conv.team.members.length && bridge.getMission) {
      bridge.getMission(id).then((m) => { if (m && !m.finished && m.userText) setMissionPending(m); }).catch(() => {});
    }
    sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  // Start a fresh chat — also returns to the chat surface if we're in a tool/settings view.
  const newSession = () => {
    if (!PRIMARY.includes(mode)) setMode(chatMode);
    setProjectCtx(null); setCoworkProj(null); setAgentCtx(null); setTeamCtx(null); setTeamRun(null); setMissionPending(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
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
    if (!activeConvId) { madavAlert("Send a message first so this session is saved, then link it to your phone."); return; }
    const title = (timeline.find((t) => t.role === "user")?.text || "Cowork session").slice(0, 60);
    const link = await bridge.setMobileLink({ sessionId: activeConvId, title, cwd: cwd || "" });
    setMobileLink(link);
    if (!botRunning) madavAlert("Linked ✓\n\nOpen Via Mobile and enable your Telegram bot. Then message the bot — it continues this session and replies appear here when you return.");
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
  // Back from a project-scoped Collaborate task to THAT project's page (not the projects list).
  const backToProject = () => {
    if (!coworkProj) return;
    setProjOpenId(coworkProj.id);
    setMode("project"); setProjectCtx(null); setCoworkProj(null);
    setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };

  // Start a new project conversation from the Projects detail composer (opens the chat surface + sends).
  const startProjectChat = async (project, text) => {
    const conv = await bridge.createConversation(project.id);
    setProjectCtx({ projectId: project.id, projectName: project.name, conversationId: conv.id, title: (text || "").slice(0, 48) || "New conversation" });
    setTimeline(text ? [{ type: "message", role: "user", text }] : []);
    sessionRef.current = null; streamOpen.current = false;
    if (text) {
      setBusy(true);
      try {
        const { sessionId } = await bridge.start({ mode: "project", prompt: text, projectId: project.id, conversationId: conv.id });
        sessionRef.current = sessionId;
      } catch (e) {
        setBusy(false);
        setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ Couldn't start: ${(e && e.message) || e}` }]);
      }
    }
  };

  // Start a Cowork task scoped to a project: uses the project's linked folder as the
  // working dir and injects its instructions + knowledge as context.
  const startProjectCowork = async (project, text) => {
    if (!project.folder) { madavAlert("Link a folder to this room first (Instructions \u2192 Linked folder & repo) to start work in Let's Collaborate."); return; }
    setMode("cowork"); setChatMode("cowork");
    setProjectCtx(null); setCoworkProj({ id: project.id, name: project.name });
    setCwd(project.folder);
    setTimeline(text ? [{ type: "message", role: "user", text }] : []);
    setActiveConvId(null); sessionRef.current = null; streamOpen.current = false;
    if (text) {
      setBusy(true);
      try {
        const { sessionId, conversationId } = await bridge.start({ mode: "cowork", prompt: text, cwd: project.folder, permissionMode, projectId: project.id });
        sessionRef.current = sessionId;
        if (conversationId) setActiveConvId(conversationId);
      } catch (e) {
        setBusy(false);
        setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ Couldn't start: ${(e && e.message) || e}` }]);
      }
    }
  };

  const changePermission = (m) => {
    setPermissionMode(m);
    if (sessionRef.current) bridge.setPermissionMode(sessionRef.current, m);
  };

  const pickFolder = async () => {
    const dir = await bridge.chooseFolder();
    if (typeof dir === "string" && dir) { setCwd(dir); sessionRef.current = null; setTimeline([]); setActiveConvId(null); }
    else if (dir && dir.error) { madavAlert(dir.error); } // e.g. web: folder access is desktop-only
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
    setPerm(permQueue.current.shift() || null); // next pending request, if a parallel member is waiting
  };

  const switchMode = (m) => {
    // Snapshot the conversation of the mode we're leaving so we can restore it.
    if (PRIMARY.includes(mode)) modeCacheRef.current[mode] = { convId: activeConvId, timeline };
    if (m !== mode) bridge.track?.("view", { section: m }); // analytics: which sections get used
    // A running turn KEEPS RUNNING when you navigate away: busy, the live session
    // binding and any pending permission request all survive — the permission modal
    // is a global overlay, answerable from any screen. Only the view changes.
    // (Previously this reset busy + dropped the permission request, which orphaned
    // the engine mid-task: the agent waited forever on a question nobody could see.)
    setMode(m); streamOpen.current = false;
    if (PRIMARY.includes(m)) setChatMode(m);
    if (PRIMARY.includes(m)) {
      const c = modeCacheRef.current[m];
      // Returning to the SAME conversation that is still mid-turn? Keep the live
      // timeline — restoring the snapshot would discard everything streamed while away.
      const liveReturn = busy && sessionRef.current && c && c.convId === activeConvId;
      setProjectCtx(null); setCoworkProj(null);
      if (!liveReturn) {
        if (!agentSeed.current) setAgentCtx(null); // manual navigation drops the agent; a pending launch keeps it
        if (!teamSeed.current) { setTeamCtx(null); setTeamRun(null); }
        setSoloRun(null);
        setTimeline(c ? c.timeline : []);
        setActiveConvId(c ? c.convId : null);
        sessionRef.current = null;
        setBusy(false); // a restored (non-live) conversation is never mid-turn
      }
    } else if (m === "project") {
      setProjOpenId(null); // sidebar navigation always lands on the projects LIST
      setProjectCtx(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null; setBusy(false); setSoloRun(null);
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
  const isActivity = mode === "activity";
  const isGuide = mode === "guide";
  const isStudio = mode === "studio";
  const isTerminal = mode === "terminal";
  const isAgents = mode === "agents";
  const startStudio = (prompt) => {
    studioSeed.current = prompt || null;
    modeCacheRef.current.chat = { convId: null, timeline: [] }; // fresh chat per Studio idea (don't restore the last one)
    switchMode("chat");
  };
  useEffect(() => { if (mode === "chat" && studioSeed.current) { const seed = studioSeed.current; studioSeed.current = null; send(seed); } }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Launch a custom agent: pin its model (if any), open a FRESH session in the right
  // mode (file/terminal agents collaborate on a folder; the rest chat), then seed it.
  const startAgentSession = (agent, prompt) => {
    if (agent.model) selectModel(agent.model); // agents run on the model selector — pinning just repoints it
    const target = (agent.tools && (agent.tools.files || agent.tools.shell)) ? "cowork" : "chat";
    agentSeed.current = { agent, prompt: prompt || null, target };
    modeCacheRef.current[target] = { convId: null, timeline: [] }; // fresh conversation per agent run
    switchMode(target);
  };
  useEffect(() => {
    const seed = agentSeed.current;
    if (seed && mode === seed.target) {
      agentSeed.current = null;
      setAgentCtx(seed.agent);
      // Workrooms launch: re-attach the room scope (switchMode cleared it) so the run
      // is tagged with the room's projectId and uses the room's folder.
      if (seed.room) { setCoworkProj(seed.room); if (seed.cwd) setCwd(seed.cwd); }
      if (seed.prompt) send(seed.prompt, [], seed.agent, null, seed.room ? { projectId: seed.room.id, cwd: seed.cwd || undefined } : {});
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearAgent = () => { setAgentCtx(null); sessionRef.current = null; setTimeline([]); setActiveConvId(null); };
  // Deep-link: clicking the attached agent's NAME opens that agent's editor directly
  // (not the Agents list). Agents.jsx consumes openAgentId and calls back to clear it.
  const [agentsOpenId, setAgentsOpenId] = useState(null);
  const openAgentPage = (id) => { setAgentsOpenId(id); switchMode("agents"); };

  // Workrooms: put a crew agent to work INSIDE a room — the run gets the agent's
  // instructions + the room's knowledge (engine injects both), uses the room's linked
  // folder when the agent has file tools, and is tagged with the room's projectId
  // (work feed + per-room track record).
  const startRoomAgent = (project, agent, prompt) => {
    if (agent.model) selectModel(agent.model);
    const wantsFolder = !!(agent.tools && (agent.tools.files || agent.tools.shell));
    if (wantsFolder && !project.folder) {
      madavAlert("Link a folder to this room first (Instructions \u2192 Linked folder & repo) so this agent can use its file tools here.");
      return;
    }
    const target = wantsFolder ? "cowork" : "chat";
    agentSeed.current = { agent, prompt: prompt || null, target, room: { id: project.id, name: project.name }, cwd: wantsFolder ? project.folder : null };
    modeCacheRef.current[target] = { convId: null, timeline: [] }; // fresh conversation per room mission
    switchMode(target);
  };
  // Return to the Agent Studio screen, keeping the conversation saved in history.
  const backToAgents = () => { switchMode("agents"); };

  // Launch a team: fresh chat session bound to the team; Mission Control opens alongside.
  const startTeamSession = (team) => {
    teamSeed.current = { team };
    modeCacheRef.current.chat = { convId: null, timeline: [] };
    switchMode("chat");
  };
  // Workrooms: put a staffed TEAM to work inside a room — the mission chat is tagged
  // with the room's projectId, so the brief + knowledge inject and it lists in the feed.
  const startRoomTeam = (project, team) => {
    teamSeed.current = { team, room: { id: project.id, name: project.name } };
    modeCacheRef.current.chat = { convId: null, timeline: [] };
    switchMode("chat");
  };
  useEffect(() => {
    if (teamSeed.current && mode === "chat") {
      const seed = teamSeed.current; teamSeed.current = null;
      setAgentCtx(null); setTeamCtx(seed.team); setTeamRun(null);
      if (seed.room) setCoworkProj(seed.room); // re-attach the room scope (switchMode cleared it)
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearTeam = () => { setTeamCtx(null); setTeamRun(null); setMissionPending(null); sessionRef.current = null; setTimeline([]); setActiveConvId(null); };

  // First-run onboarding RETIRED (2026-06-12): Madav Starter gives every signed-in user
  // working free models with zero setup, so the "pick a provider, paste a key" gate is
  // no longer needed. Settings → Model configuration carries the add-your-own-key path.
  const needsOnboarding = false;

  const statusDot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  // Agent-mode controls live OUTSIDE the window on the model row:
  // [Select Folder] [model selector] [Permission]. Chat keeps just the centered selector.
  const controlsRow = null; // nothing under the pill — the bar stays Gemini-clean
  // Model selector lives OUTSIDE the chat window — centered on its own row below it.
  // In agent modes the row becomes [Select Folder] [model] [Permission].
  const modelRow = (
    <div className="model-dock">
      {isAgentMode && <EnvPicker cwd={cwd} onPickFolder={pickFolder} onUseFolder={useFolder} onAddRepoUrl={addRepo} github={mode !== "cowork"} />}
      <ModelPicker value={activeValue} groups={pickerGroups} onChange={selectModel} onRefresh={refreshModels} />
      {isAgentMode && <PermissionPicker value={permissionMode} onChange={changePermission} />}
    </div>
  );

  return (
    <div className={`app-v ${sidebarOpen ? "" : "sb-collapsed"}`}>
      {needsOnboarding && <Onboarding onDone={async () => { try { const s2 = await bridge.getSettings(); setSettings(s2); loadModelsFor(s2); } catch {} }} />}
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
            <p style={{ margin: "0 0 14px", color: "var(--text-2)", fontSize: 13 }}>Paste a public repo URL — Madav clones it and works on it{isWeb ? ". (Cloning needs the desktop app.)" : "."}</p>
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
        onNew={newSession} onOpenSession={openSession} onDeleteSession={removeSession}
        extras={{ ...((settings && settings.extras) || {}), ...Object.fromEntries(BUILD_OFF.map((k) => [k, false])) }} />
      <div className="main">
        {isSettings ? (
          <Settings onChanged={setSettings} />
        ) : isConnectors ? (
          <Connectors />
        ) : isSkills ? (
          <Skills onSelectScreen={switchMode} />
        ) : isPlugins ? (
          <Plugins onNavigate={switchMode} />
        ) : isViaMobile ? (
          ViaMobile ? <Suspense fallback={null}><ViaMobile onNavigate={switchMode} onSettingsChanged={setSettings} /></Suspense> : <NotInBuild />
        ) : isScheduler ? (
          Scheduler ? <Suspense fallback={null}><Scheduler /></Suspense> : <NotInBuild />
        ) : isActivity ? (
          <ActivityPanel onNavigate={switchMode} />
        ) : isConsumption ? (
          <Consumption />
        ) : isGuide ? (
          <UserGuide onNavigate={switchMode} />
        ) : mode === "testcenter" ? (
          TestCenter
            ? <Suspense fallback={<div className="skel-page"><div className="skel" style={{ width: 240, height: 26 }} /><div className="skel" style={{ height: 200 }} /></div>}><TestCenter onNavigate={switchMode} /></Suspense>
            : <div className="agents-page scroll"><div className="ag-empty"><div className="ag-empty-t">Not in this build</div><div className="ag-empty-s">Testing tools are excluded from distributed builds of Madav.</div></div></div>
        ) : isAgents ? (
          <Agents onLaunch={startAgentSession} onLaunchTeam={startTeamSession} onOpenSession={openSession} groups={pickerGroups} activeValue={activeValue} onSelectModel={selectModel} onRefresh={refreshModels} openAgentId={agentsOpenId} onOpenedAgent={() => setAgentsOpenId(null)} />
        ) : isStudio ? (
          StudioLauncher ? <Suspense fallback={null}><StudioLauncher onStart={startStudio} /></Suspense> : <NotInBuild />
        ) : isTerminal ? (
          TerminalPanel ? <Suspense fallback={null}><TerminalPanel cwd={cwd} /></Suspense> : <NotInBuild />
        ) : isModels ? (
          <ModelsSection activeModel={activeProfile && activeProfile.model} onChanged={setSettings}
            tab={modelsTab} onTab={(t) => switchMode(t === "overview" ? "models-overview" : t === "speed" ? "models-speed" : "models")} />
        ) : (mode === "project" && !projectCtx) ? (
          <Workrooms onOpen={openConversation} onStartChat={startProjectChat} onStartCowork={startProjectCowork} onOpenTask={openSession} onPutToWork={startRoomAgent} onPutTeamToWork={startRoomTeam} openId={projOpenId} />
        ) : (
          <div className="work-split">
            <div className="work-main">
              {timeline.length === 0 ? (
                <div className="hero scroll">
                  {/* Session context — pinned top-left for a consistent home across modes
                      (was centered under the composer; user request 2026-06-12). */}
                  {(projectCtx || coworkProj || agentCtx || teamCtx) && (
                    <div className="hero-ctx">
                      {projectCtx && (
                        <div className="hero-opts">
                          <button className="chip" onClick={backToProjects}>← Projects</button>
                          <span className="chip">{projectCtx.projectName} · {projectCtx.title}</span>
                        </div>
                      )}
                      {coworkProj && !projectCtx && (
                        <div className="hero-opts">
                          <button className="chip" onClick={backToProject} title="Back to this project's page">← {coworkProj.name}</button>
                          <span className="chip">Workroom task</span>
                        </div>
                      )}
                      {(agentCtx || teamCtx) && (
                        <div className="hero-opts">
                          <button className="chip" onClick={backToAgents} title="Back to the Agents screen">← Agents</button>
                          {agentCtx && (
                            <span className="chip agent-chip" style={agentCtx.identity ? { color: agentCtx.identity.color, borderColor: `${agentCtx.identity.color}66`, background: `${agentCtx.identity.color}1f` } : undefined}>
                              {agentCtx.identity ? <span>{agentCtx.identity.glyph}</span> : <Bot size={13} />}
                              <span style={{ cursor: "pointer" }} title="Open this agent" onClick={() => openAgentPage(agentCtx.id)}>{agentCtx.name}</span>
                              <button className="agent-chip-x" title="Detach agent" onClick={clearAgent}><X size={12} /></button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="hero-inner">
                    {teamCtx ? (
                      <div className="hero-greet hero-agent">
                        <span className="tops-faces">
                          {teamCtx.members.slice(0, 4).map((m, i) => (
                            <span key={i} className="hero-agent-ic" style={{ marginLeft: i ? -12 : 0, width: 40, height: 40, ...(m.identity ? { background: `${m.identity.color}22`, borderColor: `${m.identity.color}66`, color: m.identity.color } : {}) }}>
                              <span style={{ fontSize: 18 }}>{(m.identity && m.identity.glyph) || "✦"}</span>
                            </span>
                          ))}
                        </span>
                        <div>
                          <h1 className="greeting">{teamCtx.name}</h1>
                          <div className="hero-agent-sub">{teamCtx.members.length} agents · {teamCtx.mode === "manager" ? "a coordinator splits and merges the work" : "work flows down the line"} — brief them once, watch them go</div>
                        </div>
                      </div>
                    ) : agentCtx ? (
                      <div className="hero-greet hero-agent">
                        <span className="hero-agent-ic" style={agentCtx.identity ? { background: `${agentCtx.identity.color}22`, borderColor: `${agentCtx.identity.color}66`, color: agentCtx.identity.color } : undefined}>
                          {agentCtx.identity ? <span style={{ fontSize: 22 }}>{agentCtx.identity.glyph}</span> : <Bot size={26} />}
                        </span>
                        <div>
                          <h1 className="greeting">{agentCtx.name}</h1>
                          <div className="hero-agent-sub">{agentCtx.description || "Custom agent"} · ready when you are</div>
                        </div>
                      </div>
                    ) : coworkProj ? (
                      <div className="hero-greet hero-agent">
                        <span className="hero-agent-ic"><FolderKanban size={24} /></span>
                        <div>
                          <h1 className="greeting">{coworkProj.name}</h1>
                          <div className="hero-agent-sub">What would you like to work on in this project? Its instructions &amp; knowledge are applied.</div>
                        </div>
                      </div>
                    ) : (
                      <div className="hero-greet"><MadavMark size={44} /><h1 className="greeting">{greeting}</h1></div>
                    )}
                    <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} agent={isAgentMode} permissionMode={permissionMode} onPermissionChange={changePermission} />
                    {modelRow}
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
                      {isWeb && cwd && (
                        <span style={{ fontSize: 11, color: "var(--text-2)", marginLeft: 10 }}>
                          File edits only on web — running commands (npm, git, tests) needs the desktop app
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
                  {coworkProj && !projectCtx && (
                    <div className="folder-bar">
                      <button className="btn ghost" onClick={backToProject} style={{ padding: "4px 8px" }} title="Back to this project's page">← {coworkProj.name}</button>
                      <FolderKanban size={14} />
                      <span className="path">{coworkProj.name}</span>
                      <span style={{ color: "var(--text-2)" }}>· workroom task</span>
                    </div>
                  )}
                  {agentCtx && (
                    <div className="folder-bar agent-bar">
                      <button className="btn ghost" style={{ padding: "3px 9px" }} title="Back to the Agents screen" onClick={backToAgents}>← Agents</button>
                      {agentCtx.identity ? <span style={{ color: agentCtx.identity.color }}>{agentCtx.identity.glyph}</span> : <Bot size={14} />}
                      <span className="path" style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }} title="Open this agent" onClick={() => openAgentPage(agentCtx.id)}>{agentCtx.name}</span>
                      <span style={{ color: "var(--text-2)" }}>· custom agent</span>
                      <button className="btn ghost" style={{ padding: "3px 7px", marginLeft: "auto" }} title="Detach agent" onClick={clearAgent}><X size={12} /></button>
                    </div>
                  )}
                  {teamCtx && (
                    <div className="folder-bar agent-bar">
                      <button className="btn ghost" style={{ padding: "3px 9px" }} title="Back to the Agents screen" onClick={backToAgents}>← Agents</button>
                      <span style={{ color: "var(--accent)" }}>{(teamCtx.members[0] && teamCtx.members[0].identity && teamCtx.members[0].identity.glyph) || "✦"}</span>
                      <span className="path">{teamCtx.name}</span>
                      <span style={{ color: "var(--text-2)" }}>· {teamCtx.mode === "manager" ? "managed team" : "relay team"}</span>
                      <button className="btn ghost" style={{ padding: "3px 7px", marginLeft: "auto" }} title="Detach team" onClick={clearTeam}><X size={12} /></button>
                    </div>
                  )}
                  {missionPending && teamCtx && !busy && (
                    <div className="folder-bar" style={{ borderColor: "color-mix(in srgb, var(--accent) 50%, transparent)" }}>
                      <Zap size={14} style={{ color: "var(--accent)" }} />
                      <span className="path">Mission interrupted — {(missionPending.outputs || []).length} step{(missionPending.outputs || []).length === 1 ? "" : "s"} already done and checkpointed</span>
                      <button className="btn primary" style={{ marginLeft: "auto", padding: "4px 12px" }} onClick={resumeMission}>Resume mission</button>
                      <button className="btn ghost" style={{ padding: "4px 8px" }} title="Dismiss" onClick={() => setMissionPending(null)}><X size={12} /></button>
                    </div>
                  )}
                  <div className="chat scroll" ref={chatRef}>
                    <div className="chat-inner">
                      {(() => {
                        // Conversation-first rendering: consecutive routine tool steps
                        // collapse into ONE quiet "worked" strip (expandable); only the
                        // user's words, the agent's words, images and questions stand
                        // alone. The live side panels still show every step as it runs.
                        const out = []; let buf = [];
                        const renderMsg = (item, i) => (
                          <Message key={i} item={item} onOpenArtifact={setArtifact} userName={_who || "You"}
                            onRetry={!busy && item.type === "message" && item.role === "assistant" ? () => handlersRef.current.retryAt(i) : undefined}
                            onEdit={!busy && item.type === "message" && item.role === "user" ? (t) => handlersRef.current.editAt(i, t) : undefined}
                            streaming={streaming && i === timeline.length - 1 && item.type === "message" && item.role === "assistant"} />
                        );
                        const flush = () => {
                          if (!buf.length) return;
                          if (buf.length === 1) out.push(renderMsg(buf[0].item, buf[0].i));
                          else out.push(<WorkStrip key={"ws" + buf[0].i} steps={buf} renderMsg={renderMsg} />);
                          buf = [];
                        };
                        timeline.forEach((item, i) => {
                          const groupable = item.type === "tool" && !item.image && !/^ask_user/.test(item.name || "");
                          if (groupable) buf.push({ item, i });
                          else { flush(); out.push(renderMsg(item, i)); }
                        });
                        flush();
                        return out;
                      })()}
                    </div>
                  </div>
                  <Composer mode={mode} busy={busy} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} />
                  {modelRow}
                </>
              )}
            </div>
            {artifact && <ArtifactPanel artifact={artifact}
              key={artifact.kind + ":" + (artifact.code || "").slice(0, 80)}
              versions={artifactVersions}
              onClose={() => setArtifact(null)} />}
            {teamCtx && !artifact && <TeamOps team={teamCtx} run={teamRun} onClose={clearTeam} />}
            {agentCtx && !teamCtx && !artifact && soloRun && <AgentOps agent={agentCtx} run={soloRun} onClose={() => setSoloRun(null)} />}
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

      {/* Madav-themed alert/confirm host — STANDING RULE: no native white dialogs */}
      <DialogHost />

      {/* Mid-mission question — an agent paused and is waiting on your answer */}
      {ask && (
        <div className="scrim">
          <div className="pj-create" style={{ width: 540 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircleQuestion size={18} style={{ color: "var(--accent)" }} />
              <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>An agent needs your input</h2>
            </div>
            <p style={{ margin: "12px 0 10px", fontSize: 14, lineHeight: 1.5 }}>{ask.question}</p>
            {Array.isArray(ask.options) && ask.options.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {ask.options.map((o, i) => (
                  <button key={i} className="chip" style={{ cursor: "pointer" }} onClick={() => answerQuestion(o)}>{o}</button>
                ))}
              </div>
            )}
            <input className="model-search" autoFocus value={askText} placeholder="Type your answer…"
              onChange={(e) => setAskText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && askText.trim()) answerQuestion(askText.trim()); }} />
            {/* Path-shaped question → offer the native folder picker instead of hand-typing
                (e.g. "Which directory do you want me to list the files from?"). */}
            {/(folder|directory|path|location)/i.test(ask.question || "") && bridge.chooseFolder && (
              <button className="btn" style={{ marginTop: 8, alignSelf: "flex-start" }} onClick={async () => {
                const dir = await bridge.chooseFolder();
                if (typeof dir === "string" && dir) setAskText(dir);
                else if (dir && dir.error) madavAlert(dir.error);
              }}><FolderOpen size={14} /> Browse for a folder…</button>
            )}
            <div className="pj-create-btns">
              <button className="btn" onClick={() => answerQuestion("")}>Skip — let it decide</button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" disabled={!askText.trim()} onClick={() => answerQuestion(askText.trim())}>Answer & resume</button>
            </div>
          </div>
        </div>
      )}

      {/* Sage — the app-wide buddy: floats over every screen, never disturbs a running session */}
      {SageDockLazy && (!settings || (settings.extras || {}).sage !== false) && <Suspense fallback={null}><SageDockLazy mode={mode} onNavigate={switchMode} /></Suspense>}
    </div>
  );
}
