// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { FolderOpen, FolderKanban, Smartphone, Bot, X, Zap, MessageCircleQuestion } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import TopNav from "./components/TopNav.jsx";
import Message from "./components/Message.jsx";
import { OfficeSaveDir } from "./markdown.jsx";
import { providerFreeTier, resolveModelValue, isVisionModel, isModelFree } from "./modelCost.js";
import Composer from "./components/Composer.jsx";
import PermissionModal from "./components/PermissionModal.jsx";
import Settings from "./components/Settings.jsx";
import Connectors from "./components/Connectors.jsx";
import Skills from "./components/Skills.jsx";
import Plugins from "./components/Plugins.jsx";
import Workrooms from "./components/Workrooms.jsx";
import { pickModel, routeReason } from "./modelRouter.js";
import { startOverlayGuard } from "./overlayGuard.js";
import Consumption from "./components/Consumption.jsx";
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
  // Per-PROCESS model choice (chat/cowork/code/project): a picker value, or "auto" to route per request.
  // Persisted in localStorage; unset = use the global default model (fully backward compatible).
  const [surfaceModel, setSurfaceModel] = useState(() => { try { return JSON.parse(localStorage.getItem("madav.surfaceModel") || "{}"); } catch { return {}; } });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarW, setSidebarW] = useState(() => { try { const v = parseInt(localStorage.getItem("madav.sidebarW") || "", 10); return v >= 200 && v <= 460 ? v : 236; } catch { return 236; } });
  const [artifactW, setArtifactW] = useState(() => { try { const v = parseInt(localStorage.getItem("madav.artifactW") || "", 10); return v >= 360 && v <= 960 ? v : 560; } catch { return 560; } });
  const appBodyRef = useRef(null);
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
  const sendRef = useRef(null);     // latest send() for the self-repair listener (stable across renders)
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
      // On launch, snap the active model to the current surface's PINNED model if there is one (so a
      // per-process pick survives a reload), otherwise the saved Default Model.
      let _pin = ""; try { _pin = (JSON.parse(localStorage.getItem("madav.surfaceModel") || "{}").chat) || ""; } catch {}
      const launchModel = (_pin && _pin !== "auto" && _pin.includes("::")) ? _pin : cfg.defaultModel;
      if (launchModel && launchModel.includes("::")) {
        const i = launchModel.indexOf("::");
        const pid = launchModel.slice(0, i), mid = launchModel.slice(i + 2);
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

  // ---- Live run buffers (reconnect-on-reopen) -------------------------------------------------
  // A run started in a room/conversation keeps streaming server-side after you navigate away.
  // We buffer each running session's timeline by id so re-opening that conversation re-attaches
  // and shows the live work-in-progress instead of a blank. The ACTIVE path below is unchanged;
  // these only mirror it and capture backgrounded runs.
  const timelineRef = useRef([]);
  const runBuffers = useRef(new Map());    // sessionId -> timeline items (kept live in the background)
  const runStreamOpen = useRef(new Map()); // sessionId -> delta-merge open flag
  const runBusy = useRef(new Map());       // sessionId -> running?
  const convSession = useRef(new Map());   // conversationId -> sessionId (to reconnect on re-open)
  const projectCtxRef = useRef(null);
  const activeConvIdRef = useRef(null);
  useEffect(() => { timelineRef.current = timeline; const sid = sessionRef.current; if (sid && runBusy.current.get(sid) !== false) runBuffers.current.set(sid, timeline); }, [timeline]);
  useEffect(() => { projectCtxRef.current = projectCtx; activeConvIdRef.current = activeConvId; }, [projectCtx, activeConvId]);
  const bufferBg = (e, sid) => {
    const so = runStreamOpen.current, get = () => runBuffers.current.get(sid) || [], set = (n) => runBuffers.current.set(sid, n);
    switch (e.kind) {
      case "init": runBusy.current.set(sid, true); break;
      case "assistant_delta": { const t = e.data.text ?? ""; if (!t) break; const tl = get(); const last = tl[tl.length - 1];
        if (so.get(sid) && last && last.type === "message" && last.role === "assistant") set([...tl.slice(0, -1), { ...last, text: last.text + t }]);
        else { so.set(sid, true); set([...tl, { type: "message", role: "assistant", text: t, meta: lastInfoRef.current, at: Date.now() }]); } break; }
      case "assistant_message": { so.set(sid, false); const ft = e.data && e.data.text; if (ft) { const tl = get(); const last = tl[tl.length - 1]; if (last && last.type === "message" && last.role === "assistant") { if (last.text !== ft) set([...tl.slice(0, -1), { ...last, text: ft }]); } else set([...tl, { type: "message", role: "assistant", text: ft, meta: lastInfoRef.current, at: Date.now() }]); } break; }
      case "tool_use": so.set(sid, false); if (HIDDEN_TOOLS.has(e.data.name)) break; set([...get(), { type: "tool", id: e.data.id, name: e.data.name, input: e.data.input, auto: e.data.auto, status: "run" }]); break;
      case "tool_result": set(get().map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, output: e.data.output, image: e.data.image || it.image, status: "ok" } : it)); break;
      case "permission_denied": set(get().map((it) => it.type === "tool" && it.id === e.data.id ? { ...it, status: "deny" } : it)); break;
      case "result": runBusy.current.set(sid, false); so.set(sid, false); break;
      case "error": runBusy.current.set(sid, false); so.set(sid, false); set([...get(), { type: "message", role: "assistant", text: `⚠ ${e.data?.message || "Error"}` }]); break;
      default: break;
    }
  };
  const onEvent = useCallback((e) => {
    // Bind the session from the FIRST init event: the web bridge emits `init`
    // synchronously inside bridge.start() — before the caller's await resolves
    // and assigns sessionRef — so a strict guard alone would drop it.
    if (e.kind === "init" && e.sessionId && !sessionRef.current) sessionRef.current = e.sessionId;
    // A chat was auto-titled after its first exchange: refresh the sidebar so the new title shows.
    // Safe before the foreign-session guard (sidebar-only; no display or session side effects).
    if (e.kind === "convtitle") { setHistRefresh((n) => n + 1); return; }
    // Events from a PREVIOUS session (e.g. one detached by navigation) must not
    // mutate the conversation currently on screen. Strict: when no session is
    // bound (after a detach), foreign events are ignored instead of passing through.
    if (e.sessionId && e.sessionId !== sessionRef.current) {
      // Approval prompts must surface no matter which conversation is on screen, else a
      // backgrounded run stalls forever waiting for a click. Everything else feeds the buffer.
      if (e.kind === "permission_request") { setPerm((cur) => { if (cur) { permQueue.current.push(e.data); return cur; } return e.data; }); return; }
      if (e.kind === "user_question") { setAsk((cur) => { if (cur) { askQueue.current.push(e.data); return cur; } return e.data; }); return; }
      if (e.kind === "permission_denied") { setPerm((cur) => (cur && cur.toolUseId === e.data.id) ? (permQueue.current.shift() || null) : cur); }
      bufferBg(e, e.sessionId); return;
    }
    switch (e.kind) {
      case "init":
        if (sessionRef.current) runBusy.current.set(sessionRef.current, true);
        try { const cid = (projectCtxRef.current && projectCtxRef.current.conversationId) || activeConvIdRef.current; if (cid && sessionRef.current) convSession.current.set(cid, sessionRef.current); } catch {}
        if (e.data.permissionMode) setPermissionMode(e.data.permissionMode);
        if (e.data.model || e.data.provider) lastInfoRef.current = { model: e.data.model, provider: e.data.provider, kind: e.data.kind };
        setHistRefresh((n) => n + 1); // new chat: surface it in the sidebar as soon as the turn starts (titled from the first message)
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
          return [...tl, { type: "message", role: "assistant", text, meta: lastInfoRef.current, at: Date.now() }];
        });
        break;
      }
      case "assistant_message":
        // Defer the bubble-close into the setTimeline queue so it runs AFTER the last streamed
        // delta's updater. Otherwise (esp. on web's fast in-process emit) the final chunk's queued
        // updater sees streamOpen already false and opens a NEW bubble — the "chopped reply" bug.
        // If a finalized text is supplied (weak-model cleanup pass / reasoning strip), swap the streamed
        // bubble for it so the user sees only the clean answer.
        setStreaming(false); setTimeline((tl) => {
          streamOpen.current = false;
          const ft = e.data && e.data.text; if (!ft) return tl;
          const last = tl[tl.length - 1];
          if (last && last.type === "message" && last.role === "assistant") return last.text !== ft ? [...tl.slice(0, -1), { ...last, text: ft }] : tl;
          return [...tl, { type: "message", role: "assistant", text: ft, meta: lastInfoRef.current, at: Date.now() }]; // model didn't stream a bubble — create one so the answer/reason always shows
        });
        break;
      case "tool_use":
        setStreaming(false); setTimeline((tl) => { streamOpen.current = false; return tl; }); // defer close so pre-tool text isn't chopped (see assistant_message)
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
        setStreaming(false); setBusy(false); setTimeline((tl) => { streamOpen.current = false; return tl.map((it) => it.type === "tool" && it.status === "run" ? { ...it, status: "done" } : it); }); // defer close + settle any lingering tool steps
        if (sessionRef.current) runBusy.current.set(sessionRef.current, false);
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
      case "file_output":
        setTimeline((tl) => tl.some((it) => it.type === "fileout" && (e.data.path ? it.path === e.data.path : it.name === e.data.name)) ? tl : [...tl, { type: "fileout", name: e.data.name, path: e.data.path, b64: e.data.b64 }]);
        break;
      case "error":
        setStreaming(false); setBusy(false); setTimeline((tl) => { streamOpen.current = false; return tl.map((it) => it.type === "tool" && it.status === "run" ? { ...it, status: "done" } : it); }); // defer close + settle any lingering tool steps
        if (sessionRef.current) runBusy.current.set(sessionRef.current, false);
        setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ ${e.data?.message || "Error"}` }]);
        setSoloRun((r) => r ? { ...r, finished: true, endedAt: Date.now(), steps: r.steps.map((s) => s.status === "run" ? { ...s, status: "done" } : s) } : r);
        setTeamRun((r) => r ? { ...r, finished: true } : r);
        setHistRefresh((n) => n + 1); // keep the saved-chat list fresh even if the first turn errors
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
  // Office Suite theme colour -> the deterministic Word/Excel renderers (headers/titles).
  useEffect(() => { let on = true; import("./office.js").then((m) => { if (on) { try { m.setOfficeAccent((settings && settings.officeAccent) || "1F3864"); } catch {} } }); return () => { on = false; }; }, [settings && settings.officeAccent]);
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

  // Office file cards open a live preview in the side panel (same panel artifacts use),
  // so a deck/doc/sheet/PDF shows "in a window next to it" on click, on every surface.
  useEffect(() => {
    const openOffice = (e) => {
      const d = (e && e.detail) || {};
      if (!d.code) return;
      setArtifact({ kind: "office", code: d.code, office: d.type || "pptx", title: d.name || "Document", previewable: true });
    };
    window.addEventListener("madav:openoffice", openOffice);
    return () => window.removeEventListener("madav:openoffice", openOffice);
  }, []);
  // Deck "View": a code-built deck rendered to HTML opens in the same side panel.
  useEffect(() => {
    const oh = (e) => { const d = (e && e.detail) || {}; if (d.html) setArtifact({ kind: "html", code: d.html, title: d.title || "Deck preview", previewable: true }); };
    window.addEventListener("madav:openhtml", oh);
    return () => window.removeEventListener("madav:openhtml", oh);
  }, []);
  // Self-repair (Layer 3): a document card found broken output (e.g. invalid formulas) and asked for ONE
  // corrected rebuild. We re-send through the normal turn so it works identically on web and desktop.
  useEffect(() => {
    const fix = (e) => {
      const d = (e && e.detail) || {};
      if (!d.code || !sendRef.current) return;
      if (d.polish) { const c0 = String(d.code || ""); const k0 = d.kind || (/addWorksheet/.test(c0) ? "xlsx" : /Packer|new\s+(?:docx\.)?Document/.test(c0) ? "docx" : /\bdoc\s*\.\s*(?:text|rect|setFont)/.test(c0) ? "pdf" : /addSlide|pptx\./.test(c0) ? "deck" : "doc"); const n0 = k0 === "xlsx" ? "spreadsheet" : k0 === "docx" ? "Word document" : k0 === "pdf" ? "PDF" : k0 === "deck" ? "deck" : "document"; sendRef.current(`Refine the ${n0} you just produced to a finished, professional standard \u2014 apply the design helpers (borders/gridlines, colour-coded inputs vs formulas, section grouping, and a chart for any time series), enrich any depth the content clearly warrants, and fix rough edges. Keep every correct value. Return the COMPLETE improved block, and begin it with a "// polished" comment.`); return; }
      if (d.error) { const c0 = String(d.code || ""); const k0 = d.kind || (/addWorksheet/.test(c0) ? "xlsx" : /Packer|new\s+(?:docx\.)?Document/.test(c0) ? "docx" : /\bdoc\s*\.\s*(?:text|rect|setFont)/.test(c0) ? "pdf" : /addSlide|pptx\./.test(c0) ? "deck" : "doc"); const n0 = k0 === "xlsx" ? "spreadsheet" : k0 === "docx" ? "Word document" : k0 === "pdf" ? "PDF" : k0 === "deck" ? "deck" : "document"; sendRef.current(`The ${n0} you generated could not be built \u2014 the code threw this error: "${String(d.error).slice(0, 200)}". Regenerate the COMPLETE corrected block as valid JavaScript that runs cleanly${k0 === "xlsx" ? ", with every formula a valid A1 reference and never the literal text undefined or NaN" : ""}. Begin the block with a "// repaired" comment.`); return; }
      const list = (d.issues || []).slice(0, 8).map((i) => `${i.sheet}!${i.cell} (${i.formula})`).join("; ");
      if (d.kind === "xlsx") sendRef.current(`The spreadsheet you just generated has formulas that error in Excel: ${list}. Regenerate the COMPLETE corrected xlsxjs block with the SAME data and styling. Every formula must be a valid A1 cell reference and must NEVER contain the text "undefined" or "NaN". To reference the previous month use that column's real cell (in column C reference B, in D reference C). Begin the block with a "// repaired" comment.`);
      else sendRef.current(`The ${d.kind === "pdf" ? "PDF" : "document"} you just generated has invalid content (${list}). Regenerate the COMPLETE corrected block with the SAME content and design. Every piece of text must be a real string \u2014 NEVER the literal "undefined", "NaN", or "[object Object]" \u2014 and the document must not be empty. Begin the block with a "// repaired" comment.`);
    };
    window.addEventListener("madav:fixdoc", fix);
    return () => window.removeEventListener("madav:fixdoc", fix);
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
  // Re-send a user message as-is (retry the same question as a fresh turn).
  const resendAt = (i) => {
    const item = timeline[i]; if (!item) return;
    setTimeline((tl) => tl.slice(0, i)); sessionRef.current = null; streamOpen.current = false;
    send(item.text, item.images || []);
  };
  // Latest-handler indirection: Message is memoized and may keep an old onEdit/onRetry
  // closure — routing through this ref guarantees the call always hits the CURRENT
  // retryAt/editAt (fresh timeline), regardless of which render created the prop.
  const handlersRef = useRef({});
  handlersRef.current = { retryAt, editAt, resendAt };

  // Version history for the open artifact — memoized so long timelines aren't
  // re-scanned (filter + extractArtifacts) on every unrelated render.
  const artifactVersions = useMemo(
    () => artifact
      ? timeline.filter((it) => it.type === "message" && it.role === "assistant").flatMap((it) => extractArtifacts(it.text)).filter((a) => a.kind === artifact.kind)
      : [],
    [timeline, artifact]
  );

  // Bind the side panel (office preview / artifact) to the conversation it was opened from, Claude-style:
  // each conversation REMEMBERS its open panel. Switching chats stashes the leaving chat's panel and
  // restores the entered chat's (or closes it if that chat had none) — it never lingers against the
  // wrong chat, and returning to a chat reopens its file. We commit the leaving chat's panel from a ref
  // (artifactRef), so the restore setArtifact() can't clobber it via effect ordering.
  const artifactByConv = useRef(new Map());
  const artifactRef = useRef(artifact);
  artifactRef.current = artifact;
  const artifactConvKey = activeConvId || (projectCtx && projectCtx.conversationId) || null;
  const prevArtifactKeyRef = useRef(artifactConvKey);
  useEffect(() => {
    const prev = prevArtifactKeyRef.current;
    if (prev === artifactConvKey) return;            // same conversation (initial mount / unrelated re-render)
    if (prev != null) {                              // stash the conversation we are leaving
      if (artifactRef.current) artifactByConv.current.set(prev, artifactRef.current);
      else artifactByConv.current.delete(prev);
    }
    setArtifact(artifactByConv.current.get(artifactConvKey) || null); // restore the one we are entering
    prevArtifactKeyRef.current = artifactConvKey;
  }, [artifactConvKey]);

  const send = async (text, images = [], agentOv = null, teamOv = null, opts = {}) => {
    const ag = agentOv || agentCtx; // explicit override beats state (avoids a stale closure on seeded launches)
    const tm = teamOv || teamCtx;
    // Vision guard: attaching an image to a TEXT-ONLY model just yields a confusing "please upload" non-answer.
    // Catch it up front with a clear message naming a model that CAN read images, instead of calling the model.
    if (images && images.length && !ag && !tm) {
      const _surf = ["chat", "cowork", "code", "project"].includes(mode) ? mode : "chat";
      const _auto = (surfaceModel || {})[_surf] === "auto";
      const _mid = activeProfile && activeProfile.model;
      if (!_auto && _mid && !isVisionModel(_mid)) {
        const _short = String(_mid).split("/").pop();
        // List the user's own FREE vision models (no paid suggestions) so they can switch without leaving the free tier.
        const _freeVision = [...new Set((pickerGroups || []).flatMap((g) => g.items || []).filter((it) => isModelFree(it) && isVisionModel(it.name)).map((it) => it.name))].slice(0, 12);
        const _list = _freeVision.length
          ? "Free vision models you can use — switch to one and re-send the image:\n\n" + _freeVision.map((m) => "- **" + m + "**").join("\n")
          : "You don't have a free vision model loaded. Add one on the free NVIDIA tier (e.g. **meta/llama-3.2-90b-vision-instruct**), then re-send the image.";
        setTimeline((tl) => [...tl,
          { type: "message", role: "user", text, images, at: Date.now() },
          { type: "message", role: "assistant", text: `⚠ **${_short}** is **text-only** and can't read images.\n\n${_list}`, at: Date.now() },
        ]);
        return;
      }
    }
    // Auto model routing — only for a plain (non-agent/team) send on a surface set to "Auto". Picks the
    // best keyed model for THIS request, applies it, and notes it on the message. Fail-open: any
    // problem leaves the current model untouched, so a send can never break here.
    let routed = null;
    try {
      const surf = ["chat", "cowork", "code", "project"].includes(mode) ? mode : "chat";
      if (!ag && !tm && (surfaceModel || {})[surf] === "auto") {
        const picked = pickModel({ prompt: text, images, mode, groups: pickerGroups });
        if (picked) { if (picked !== activeValue) await selectModel(picked); routed = picked.slice(picked.indexOf("::") + 2) + " · " + routeReason({ prompt: text, images, mode }); }
      }
    } catch {}
    if (tm) setTeamRun({ startedAt: Date.now(), steps: tm.members.map((m) => ({ name: m.name, status: "queued", identity: m.identity })), plan: tm.mode === "manager" ? { status: "queued" } : null, synth: null, finished: false });
    setSoloRun(ag && !tm ? { startedAt: Date.now(), finished: false, steps: [] } : null); // solo agents get their own live panel
    setTimeline((tl) => [...tl, { type: "message", role: "user", text, images, routed, at: Date.now() }]);
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
        try { const cid = (projectCtx && projectCtx.conversationId) || conversationId || activeConvId; if (cid) convSession.current.set(cid, sessionId); } catch {}
        if (!projectCtx && conversationId) setActiveConvId(conversationId);
      } else {
        bridge.sendInput(sessionRef.current, text, images);
      }
    } catch (e) {
      setBusy(false);
      setTimeline((tl) => [...tl, { type: "message", role: "assistant", text: `⚠ Couldn't start: ${(e && e.message) || e}` }]);
    }
  };

  sendRef.current = send;
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

  // ---- per-chat model memory (Claude-style): a conversation remembers the model it ran with. Opening a
  // chat restores that model into the picker AND as the active model, so the next turn continues on it
  // (bridge.start reads the saved active model). New chats keep your last-used model — we never reset it.
  const convModelInfo = (conv) => {
    if (!conv) return {};
    if (conv.model) return { model: conv.model, provider: conv.provider };
    const msgs = conv.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) { const m = msgs[i]; if (m && m.role === "assistant" && m.model) return { model: m.model, provider: m.provider }; }
    return {};
  };
  const applyConvModel = (model, provider, convMode) => {
    if (!model || !settings) return;
    const value = resolveModelValue(settings.profiles, model, provider);
    if (!value) return; // unknown model/provider -> leave the current selection untouched
    const surf = ["chat", "cowork", "code", "project"].includes(convMode) ? convMode : "chat";
    setSurfaceModel((prev) => { if (prev[surf] === value) return prev; const next = { ...prev, [surf]: value }; try { localStorage.setItem("madav.surfaceModel", JSON.stringify(next)); } catch {} return next; });
    selectModel(value);
  };

  // ---- persisted chat history (Talk / Collaborate / Build) ----
  const openSession = async (id) => {
    const sid0 = convSession.current.get(id);
    if (sid0 && runBuffers.current.has(sid0) && runBusy.current.get(sid0) === true) {
      // A run is still streaming for this chat — re-attach instead of reloading a stale/blank view.
      const conv0 = await bridge.getSession(id);
      setMode((conv0 && conv0.mode) || chatMode); setChatMode((conv0 && conv0.mode) || chatMode); setActiveConvId(id);
      setTimeline(runBuffers.current.get(sid0) || []);
      sessionRef.current = sid0; streamOpen.current = !!runStreamOpen.current.get(sid0); setBusy(true);
      setProjectCtx(null); setCoworkProj(null);
      { const mi = convModelInfo(conv0); applyConvModel(mi.model, mi.provider, conv0 && conv0.mode); }
      return;
    }
    const conv = await bridge.getSession(id);
    if (!conv) return;
    const msgs = (conv.messages || []).map((m) => ({ type: "message", role: m.role, text: m.content, meta: m.model ? { model: m.model, provider: m.provider } : undefined, at: m.at }));
    const outs = ((conv.outputs) || []).map((o) => ({ type: "fileout", name: o.name, path: o.path, b64: o.b64 }));
    setMode(conv.mode); setChatMode(conv.mode); setTimeline([...msgs, ...outs]); setActiveConvId(id); setCwd(conv.cwd || null);
    { const mi = convModelInfo(conv); applyConvModel(mi.model, mi.provider, conv.mode); }
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
    modeCacheRef.current.project = null;
    setProjectCtx(null); setCoworkProj(null); setAgentCtx(null); setTeamCtx(null); setTeamRun(null); setMissionPending(null); setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  const removeSession = async (id) => {
    await bridge.deleteSession(id);
    if (id === activeConvId) newSession();
    setHistRefresh((n) => n + 1);
  };
  const renameSession = async (id, title) => {
    try { await bridge.renameSession?.(id, title); } catch {}
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
    setAgentCtx(null); setTeamCtx(null); setTeamRun(null); // project context is exclusive with agent/team
    const sid = convSession.current.get(convMeta.id);
    if (sid && runBuffers.current.has(sid)) {
      const running = runBusy.current.get(sid) === true;
      setTimeline(runBuffers.current.get(sid) || []);
      setProjectCtx({ projectId: project.id, projectName: project.name, folder: project.folder || null, conversationId: convMeta.id, title: convMeta.title });
      if (running) { sessionRef.current = sid; streamOpen.current = !!runStreamOpen.current.get(sid); setBusy(true); }
      else { sessionRef.current = null; streamOpen.current = false; setBusy(false); }
      return;
    }
    const full = await bridge.getConversation(convMeta.id);
    const msgs = ((full && full.messages) || []).map((m) => ({ type: "message", role: m.role, text: m.content, meta: m.model ? { model: m.model, provider: m.provider } : undefined, at: m.at }));
    const outs = ((full && full.outputs) || []).map((o) => ({ type: "fileout", name: o.name, path: o.path, b64: o.b64 }));
    setTimeline([...msgs, ...outs]);
    setProjectCtx({ projectId: project.id, projectName: project.name, folder: project.folder || null, conversationId: convMeta.id, title: (full && full.title) || convMeta.title });
    { const mi = convModelInfo(full); const m2 = mi.model ? mi : { model: project.model, provider: project.provider }; applyConvModel(m2.model, m2.provider, (full && full.mode) || "project"); }
    sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  const backToProjects = () => { modeCacheRef.current.project = null; setProjectCtx(null); setTimeline([]); sessionRef.current = null; setBusy(false); };
  // Back from a project-scoped Collaborate task to THAT project's page (not the projects list).
  const backToProject = () => {
    if (!coworkProj) return;
    setProjOpenId(coworkProj.id);
    setMode("project"); setProjectCtx(null); setCoworkProj(null);
    setTimeline([]); setActiveConvId(null); sessionRef.current = null; streamOpen.current = false; setBusy(false);
  };
  // Back from a project CHAT to THAT project's own page (its chat list) — not the all-projects list.
  const backToProjectPage = () => {
    const pid = projectCtx && projectCtx.projectId;
    if (!pid) return backToProjects();
    modeCacheRef.current.project = null;
    setProjectCtx(null); setTimeline([]); sessionRef.current = null; setBusy(false);
    setProjOpenId(pid);
  };

  // Start a new project conversation from the Projects detail composer (opens the chat surface + sends).
  const startProjectChat = async (project, text) => {
    setAgentCtx(null); setTeamCtx(null); setTeamRun(null); // project context is exclusive with agent/team
    const conv = await bridge.createConversation(project.id);
    setProjectCtx({ projectId: project.id, projectName: project.name, folder: project.folder || null, conversationId: conv.id, title: (text || "").slice(0, 48) || "New conversation" });
    if (project.model) applyConvModel(project.model, project.provider, "project"); // Step 4 — new project chats use THIS project's model, not the global one
    setTimeline(text ? [{ type: "message", role: "user", text, at: Date.now() }] : []);
    sessionRef.current = null; streamOpen.current = false;
    if (text) {
      setBusy(true);
      try {
        const { sessionId } = await bridge.start({ mode: "project", prompt: text, projectId: project.id, conversationId: conv.id });
        sessionRef.current = sessionId;
        convSession.current.set(conv.id, sessionId);
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
    setTimeline(text ? [{ type: "message", role: "user", text, at: Date.now() }] : []);
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

  const stop = () => {
    if (sessionRef.current) bridge.interrupt(sessionRef.current);
    setBusy(false); setStreaming(false);
    setSoloRun((r) => r ? { ...r, finished: true, endedAt: Date.now(), steps: r.steps.map((s) => s.status === "run" ? { ...s, status: "done" } : s) } : r);
    setTeamRun((r) => r ? { ...r, finished: true } : r);
    setTimeline((tl) => tl.map((it) => it.type === "tool" && it.status === "run" ? { ...it, status: "done" } : it));
  };

  const resolve = (behavior) => {
    if (!perm) return;
    bridge.resolvePermission(perm.requestId, { behavior });
    if (behavior === "allow") {
      setTimeline((tl) => tl.map((it) => it.type === "tool" && it.id === perm.toolUseId ? { ...it, status: "run" } : it));
    }
    setPerm(permQueue.current.shift() || null); // next pending request, if a parallel member is waiting
  };

  // Draggable sidebar width: mutate the CSS var live during drag (no App re-render), commit on release.
  const startSidebarResize = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = sidebarW; const el = appBodyRef.current; let w = startW;
    const move = (ev) => { w = Math.min(460, Math.max(200, startW + (ev.clientX - startX))); if (el) el.style.setProperty("--sb-w", w + "px"); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.cursor = ""; document.body.style.userSelect = ""; setSidebarW(w); try { localStorage.setItem("madav.sidebarW", String(w)); } catch {} };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
  };
  // Draggable artifact-panel width. The panel is anchored RIGHT, so dragging its left edge leftward
  // widens it. Mutate the CSS var live during drag (no re-render); commit + persist on release.
  const startArtifactResize = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = artifactW; const el = appBodyRef.current; let w = startW, raf = 0;
    // Two things make an iframe-adjacent resize stutter, and we fix both: (1) a transparent full-window
    // shield so the cursor never enters the preview <iframe> (an iframe swallows the parent's mousemove);
    // (2) rAF-coalesced width writes so the heavy iframe reflows at most once per frame, not per event.
    const shield = document.createElement("div");
    shield.style.cssText = "position:fixed;inset:0;z-index:99999;cursor:col-resize";
    document.body.appendChild(shield);
    const apply = () => { raf = 0; if (el) el.style.setProperty("--art-w", w + "px"); };
    const move = (ev) => { w = Math.min(960, Math.max(360, startW - (ev.clientX - startX))); if (!raf) raf = requestAnimationFrame(apply); };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); document.body.style.userSelect = ""; if (raf) cancelAnimationFrame(raf); if (el) el.style.setProperty("--art-w", w + "px"); try { shield.remove(); } catch {} setArtifactW(w); try { localStorage.setItem("madav.artifactW", String(w)); } catch {} };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up); document.body.style.userSelect = "none";
  };
  const switchMode = (m) => {
    // Snapshot the conversation of the mode we're leaving so we can restore it.
    if (PRIMARY.includes(mode)) modeCacheRef.current[mode] = { convId: activeConvId, timeline };
    if (mode === "project" && projectCtx) modeCacheRef.current.project = { projectCtx, timeline }; // remember the open project conversation too
    if (m !== mode) bridge.track?.("view", { section: m }); // analytics: which sections get used
    // A running turn KEEPS RUNNING when you navigate away: busy, the live session
    // binding and any pending permission request all survive — the permission modal
    // is a global overlay, answerable from any screen. Only the view changes.
    // (Previously this reset busy + dropped the permission request, which orphaned
    // the engine mid-task: the agent waited forever on a question nobody could see.)
    setMode(m); streamOpen.current = false;
    // Per-surface model: re-apply this surface's pinned model when returning to it (Auto resolves at send).
    try { const _sm = (surfaceModel || {})[m]; if (["chat", "cowork", "code", "project"].includes(m) && _sm && _sm !== "auto") selectModel(_sm); } catch {}
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
        const cid = c ? c.convId : null;
        const sid = cid ? convSession.current.get(cid) : null;
        if (sid && runBuffers.current.has(sid)) {
          // A run streamed (or finished) in the background — show the buffered timeline, not a stale snapshot.
          const running = runBusy.current.get(sid) === true;
          setTimeline(runBuffers.current.get(sid) || (c ? c.timeline : []));
          setActiveConvId(cid);
          sessionRef.current = running ? sid : null;
          streamOpen.current = running ? !!runStreamOpen.current.get(sid) : false;
          setBusy(running);
        } else {
          setTimeline(c ? c.timeline : []);
          setActiveConvId(cid);
          sessionRef.current = null;
          setBusy(false); // a restored (non-live) conversation is never mid-turn
        }
      }
    } else if (m === "project") {
      // Project context is mutually exclusive with agent/team — clear those either way.
      setCoworkProj(null); setAgentCtx(null); setTeamCtx(null); setTeamRun(null); setSoloRun(null);
      const pc = modeCacheRef.current.project;
      if (pc && pc.projectCtx) {
        // Returning to the project conversation that was open — restore it instead of dumping to the list.
        setProjOpenId(null); setProjectCtx(pc.projectCtx);
        const sid = convSession.current.get(pc.projectCtx.conversationId);
        if (sid && runBuffers.current.has(sid)) {
          const running = runBusy.current.get(sid) === true;
          setTimeline(runBuffers.current.get(sid) || pc.timeline || []);
          if (running) { sessionRef.current = sid; streamOpen.current = !!runStreamOpen.current.get(sid); setBusy(true); }
          else { sessionRef.current = null; setBusy(false); }
        } else { setTimeline(pc.timeline || []); sessionRef.current = null; setBusy(false); }
      } else {
        setProjOpenId(null); setProjectCtx(null); // no open conversation cached → the projects LIST
        setTimeline([]); setActiveConvId(null); sessionRef.current = null; setBusy(false);
      }
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
      return { group: `${p.name} · ${loc}`, items: ids.slice(0, 500).map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: loc, baseUrl: p.baseUrl, kind: p.kind, free: providerFreeTier(p) })) }; // stamp provider tier (baseUrl known here); catalog price still overrides per-model
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

  // App-wide: keep every floating menu/flyout/popover inside the viewport (never past any edge).
  useEffect(() => { startOverlayGuard(); }, []);
  // Step 4 — on a project's detail page (no chat open), show THAT project's model in the picker.
  useEffect(() => {
    if (!projOpenId || projectCtx) return;
    (async () => { try { const p = await bridge.getProject(projOpenId); if (p && p.model) applyConvModel(p.model, p.provider, "project"); } catch {} })();
  }, [projOpenId]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Step 4 — the Workrooms project-page model picker saves to THAT project (projOpenId), not globally.
  const onSelectProjectModel = async (value) => {
    await selectModel(value);
    if (projOpenId && value && value !== "auto") { try { const j = value.indexOf("::"); const prof = settings && settings.profiles && settings.profiles[value.slice(0, j)]; await bridge.updateProject(projOpenId, { model: value.slice(j + 2), provider: (prof && prof.name) || "" }); } catch {} }
  };
  // Per-surface model + Auto. The dock shows "auto" when this surface is set to Auto; otherwise the
  // real active model. Picking a concrete model also applies it globally (selectModel); picking Auto
  // just records the preference — routing happens at send time.
  const curSurface = ["chat", "cowork", "code", "project"].includes(mode) ? mode : "chat";
  const dockValue = surfaceModel[curSurface] === "auto" ? "auto" : activeValue;
  const onPickModel = async (value) => {
    let v = value;
    // Clicking Auto again DESELECTS it → revert this surface to a concrete model (the active/default).
    if (v === "auto" && surfaceModel[curSurface] === "auto") v = activeValue || null;
    setSurfaceModel((prev) => { const next = { ...prev }; if (v) next[curSurface] = v; else delete next[curSurface]; try { localStorage.setItem("madav.surfaceModel", JSON.stringify(next)); } catch {} return next; });
    if (v && v !== "auto") await selectModel(v); // persist before any subsequent send uses it
    // NOTE: the chat picker is CHAT-specific — the conversation remembers its own model (stamped on each
    // run, restored on reopen). It deliberately does NOT change the project default; that's the project-page picker.
  };

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
  const isModels = mode === "models" || mode === "models-overview" || mode === "models-speed" || mode === "models-routing";
  const modelsTab = mode === "models-overview" ? "overview" : mode === "models-speed" ? "speed" : mode === "models-routing" ? "routing" : "config";
  const isViaMobile = mode === "viamobile";
  const isScheduler = mode === "scheduler";
  const isConsumption = mode === "consumption";
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
    <>
    <div className="model-dock">
      {isAgentMode && <EnvPicker cwd={cwd} onPickFolder={pickFolder} onUseFolder={useFolder} onAddRepoUrl={addRepo} github={mode !== "cowork"} />}
      <ModelPicker value={dockValue} groups={pickerGroups} onChange={onPickModel} onRefresh={refreshModels} />
      {isAgentMode && <PermissionPicker value={permissionMode} onChange={changePermission} />}
    </div>
    <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-3, var(--text-2))", marginTop: 6, opacity: 0.72 }}>Madav is AI and can make mistakes. Please double-check responses.</div>
    </>
  );

  return (
    <div className={`app-v ${sidebarOpen ? "" : "sb-collapsed"}`}>
      {needsOnboarding && <Onboarding onDone={async () => { try { const s2 = await bridge.getSettings(); setSettings(s2); loadModelsFor(s2); } catch {} }} />}
      <TopNav
        mode={mode}
        onSelect={switchMode}
        model={dockValue}
        groups={pickerGroups}
        onModel={onPickModel}
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
      <div ref={appBodyRef} className={`app-body ${sidebarOpen ? "" : "sb-collapsed"}`} style={{ "--sb-w": sidebarW + "px", "--art-w": artifactW + "px" }}>
      <Sidebar active={mode} onSelect={switchMode} onResize={startSidebarResize}
        historyMode={chatMode} activeConvId={activeConvId} refreshKey={histRefresh}
        onNew={newSession} onOpenSession={openSession} onDeleteSession={removeSession} onRenameSession={renameSession}
        soloRun={soloRun} teamRun={teamRun} onOpenRun={() => switchMode(chatMode)}
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
        ) : isConsumption ? (
          <Consumption onOpenSession={openSession} onNavigate={switchMode} />
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
            tab={modelsTab} onTab={(t) => switchMode(t === "overview" ? "models-overview" : t === "speed" ? "models-speed" : t === "routing" ? "models-routing" : "models")} />
        ) : (mode === "project" && !projectCtx) ? (
          <Workrooms onOpen={openConversation} onStartChat={startProjectChat} onStartCowork={startProjectCowork} onOpenTask={openSession} onPutToWork={startRoomAgent} onPutTeamToWork={startRoomTeam} openId={projOpenId} groups={pickerGroups} activeValue={activeValue} onSelectModel={onSelectProjectModel} onRefresh={refreshModels} />
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
                          <button className="chip" onClick={backToProjectPage}>← Back</button>
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
                    <Composer mode={mode} busy={busy || streaming || !!(soloRun && !soloRun.finished) || !!(teamRun && !teamRun.finished) || timeline.some((it) => it.type === "tool" && it.status === "run")} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} agent={isAgentMode} permissionMode={permissionMode} onPermissionChange={changePermission} />
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
                      <button className="btn ghost" onClick={backToProjectPage} style={{ padding: "4px 8px" }}>← Back</button>
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
                      <OfficeSaveDir.Provider value={cwd || (projectCtx && projectCtx.folder) || null}>{(() => {
                        // Conversation-first rendering: consecutive routine tool steps
                        // collapse into ONE quiet "worked" strip (expandable); only the
                        // user's words, the agent's words, images and questions stand
                        // alone. The live side panels still show every step as it runs.
                        const out = []; let buf = [];
                        const renderMsg = (item, i) => (
                          <Message key={i} item={item} onOpenArtifact={setArtifact} userName={_who || "You"}
                            onRetry={!busy && item.type === "message" ? (item.role === "assistant" ? () => handlersRef.current.retryAt(i) : item.role === "user" ? () => handlersRef.current.resendAt(i) : undefined) : undefined}
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
                          // Plain chat stays clean for everyday users — hide the behind-the-scenes tool
                          // steps (web search, skill loads, reads). The answer itself carries the result.
                          // Collaborate/Build keep them (seeing + approving the work matters there).
                          if (mode === "chat" && groupable) return;
                          if (groupable) buf.push({ item, i });
                          else { flush(); out.push(renderMsg(item, i)); }
                        });
                        flush();
                        return out;
                      })()}</OfficeSaveDir.Provider>
                      {busy && !streaming && (
                        <div className="msg assistant">
                          <div className="avatar" />
                          <div className="body">
                            <div className="who">Madav</div>
                            <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "6px 2px" }} title="Working…">
                              <style>{`@keyframes madavThink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}`}</style>
                              {[0, 1, 2].map((d) => <span key={d} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: `madavThink 1.1s ${d * 0.16}s infinite ease-in-out` }} />)}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <Composer mode={mode} busy={busy || streaming || !!(soloRun && !soloRun.finished) || !!(teamRun && !teamRun.finished) || timeline.some((it) => it.type === "tool" && it.status === "run")} onSend={send} onStop={stop} onNavigate={switchMode} onNewChat={newSession} onPickFolder={pickFolder} onAddRepo={addRepo} cwd={cwd} controls={controlsRow} />
                  {modelRow}
                </>
              )}
            </div>
            {artifact && <ArtifactPanel artifact={artifact}
              key={artifact.kind + ":" + (artifact.code || "").slice(0, 80)}
              versions={artifactVersions}
              onResize={startArtifactResize}
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
