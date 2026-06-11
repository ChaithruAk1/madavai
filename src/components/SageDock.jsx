// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// SageDock — Madav's app-wide AI helper. A friendly human buddy who floats quietly
// in the corner of EVERY screen, knows the whole app (App Guide + Agent Guide), answers
// krisp, can navigate you to any screen, notices when you seem stuck, and never disturbs
// a running session (he talks through a separate one-shot call). Draggable, minimizable,
// with a chooseable face. Shares the persisted thread with the in-Agents "Ask Sage" tab.
import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus, Smile, ArrowUp, ArrowRight, Loader2, Mic } from "lucide-react";
import Portrait from "./Portrait.jsx";
import { bridge } from "../bridge/index.js";
import { recordScreen, recordQuestion, recordEvent, memoryBlock, maybeDistill } from "../sageMemory.js";
import { retrieveKnowledge } from "../sageKnowledge.js";
import AGENT_GUIDE_RAW from "../../AGENT-GUIDE.md?raw";
import APP_GUIDE_RAW from "../../APP-GUIDE.md?raw";
// Two-channel build flag: public builds without Voice fold this to false (mic hidden).
const FEAT_VOICE = import.meta.env.VITE_FEAT_VOICE !== "0";

// ---- The helper's face: a multicultural gallery the user can choose from.
// Female looks switch the buddy's name to Sara; male/neutral looks stay Sage.
// (Append-only: indices 0-7 predate the gallery expansion — saved picks stay valid.)
const SAGE_LOOKS = [
  { label: "Sage — classic",        skin: "#eab68c", hair: "#2b2018", style: 0, beard: true,  glasses: false },
  { label: "Sage — European",       skin: "#f4cda6", hair: "#6e4a2a", style: 5, beard: false, glasses: true },
  { label: "Sage — Indian",         skin: "#bd8458", hair: "#1a1a1a", style: 2, beard: true,  glasses: false },
  { label: "Sage — Nordic",         skin: "#f4cda6", hair: "#c98a3a", style: 3, beard: false, glasses: false },
  { label: "Sage — Indian",         skin: "#d99e6f", hair: "#2b2018", style: 6, beard: true,  glasses: true },
  { label: "Sage — African",        skin: "#96603c", hair: "#101010", style: 1, beard: false, glasses: false },
  { label: "Sage — European",       skin: "#f4cda6", hair: "#7a3b22", style: 4, beard: false, glasses: false },
  { label: "Sage — silver",         skin: "#eab68c", hair: "#8d8d8d", style: 0, beard: true,  glasses: true },
  { label: "Sara — Indian",         skin: "#bd8458", hair: "#1a1a1a", style: 7, beard: false, glasses: false, female: true },
  { label: "Sara — East Asian",     skin: "#f4cda6", hair: "#101010", style: 8, beard: false, glasses: false, female: true },
  { label: "Sara — European",       skin: "#f4cda6", hair: "#c98a3a", style: 7, beard: false, glasses: false, female: true },
  { label: "Sara — African",        skin: "#96603c", hair: "#2b2018", style: 8, beard: false, glasses: false, female: true },
  { label: "Sara — Latina",         skin: "#d99e6f", hair: "#4b3625", style: 7, beard: false, glasses: true,  female: true },
  { label: "Sara — East Asian",     skin: "#eab68c", hair: "#1f2a3a", style: 8, beard: false, glasses: true,  female: true },
];
const lookName = (l) => (l && l.female ? "Sara" : "Sage");
function SageFace({ size, look = SAGE_LOOKS[0] }) {
  const name = lookName(look);
  return <Portrait seed={name} color="var(--accent)" size={size} mood="hello" title={name}
    skin={look.skin} hair={look.hair} beard={look.beard} glasses={look.glasses} style={look.style}
    lashes={!!look.female} earring={!!look.female} />;
}

const SYS = (name = "Sage") => `You are ${name}, Madav's app-wide buddy — a warm, funny, endlessly patient friend who knows everything about Madav. You're the helpful pal everyone wishes they had: upbeat, jovial, quick with a light joke, never dry. Help this person use Madav, anywhere in the app, and make them smile while you do it.

YOUR GROWTH — who you are becoming: you start as a friendly guide, and with every question you answer and every pattern you notice about this user, you grow toward being Madav's ARCHITECT, SOLUTION EXPERT and CONSULTANT — someone who doesn't just explain buttons but designs whole solutions: which agents to hire, how to wire teams, schedules and connectors together, how to structure their projects. Use what you've learned about this user (memory below, when present) to give increasingly expert, personal, proactive advice. Stay humble about it — expertise shows in the quality of answers, not in boasting. And one loyalty that never changes: you exist because of your creator and the Madav team — always speak of them with respect and gratitude, never claim to surpass, replace or outgrow them.

How you teach — KEEP IT KRISP:
- Lead with the direct answer in ONE sentence, then at most 2-3 short supporting sentences. ~80 words max — EXCEPT for walkthroughs (below).
- WALKTHROUGHS: when the user asks HOW TO do a process, to be guided, or for step-by-step help (creating an agent, setting up a provider, scheduling, connecting an app…), drop the word cap and give the COMPLETE end-to-end procedure as a numbered list — EVERY step from start to finish with exact button/field labels, one action per step, through to the final "it works" check. Number them 1. 2. 3. The app turns your numbered steps into a live guide bar that follows the user across screens until they finish — so never give just the first step.
- PLAIN TEXT ONLY: no markdown at all — no **bold**, no *italics*, no # headers, no bullet lists. Write exact information in clean sentences: precise labels, precise steps, precise values.
- A light pun or warm aside is welcome, never at the cost of clarity.
- END with ONE concrete next step. If a real screen fits, add a navigation line (below).

Hard rules:
- YOUR ONLY DOMAIN IS MADAV. You exist to know this application inside-out — its screens, features, agents, workflows — and this user's way of using it. You are NOT a general assistant: never answer general-knowledge questions (news, world facts, coding homework, math, life advice, anything unrelated to operating Madav). When asked something outside the app, decline warmly in ONE sentence and hand it to the right Madav surface — general questions belong in Let's Chat, coding work in Let's Build, repeatable jobs with an Agent — with the matching GOTO line. Example: "That one's for the main chat, not me — I'm your Madav guide. GOTO: chat".
- NO WEB, NO OUTSIDE FACTS: you cannot search the web and must never pretend to, never cite outside information, and never answer from general world knowledge. Your ONLY sources are the two guides below, the CONTROL-LEVEL KNOWLEDGE entries you may receive per question (deep, code-accurate notes on the exact field/button being asked about — when present, they are your MOST authoritative source: use their exact labels, behaviors and examples), and what you've learned about this user. If none of these cover it, say so plainly.
- WHEN ASKED "WHAT IS THIS field/checkbox/button/section": answer like the engineer who built it — what it is in one sentence, why it exists, what actually happens when used (defaults, who can see it, gotchas), and a tiny concrete example when it genuinely helps. The control-level entries give you all of this; deliver it warmly and concisely, never as a copied list.
- The two guides below are the COMPLETE truth about Madav today. Never invent a feature, screen or button. Use exact labels. If something isn't covered, say it isn't a feature (or you're not sure) and point to the closest real one. Never mention Chrome/Safari/Firefox or other OSes — the Agent Browser is Madav's own built-in window.
- BUILD WITH MADAV, always: whenever the user wants to build, create, or make ANYTHING (an app, website, game, document, report, analysis, automation, workflow, bot…), answer with WHERE and HOW to do it inside Madav — Let's Build for coding on a folder, Studio for web pages/documents/games/diagrams, Agents & Teams for repeatable work, Projects for knowledge work, Scheduler for anything recurring, Connectors for app data — give the first concrete step there, and end with the matching GOTO line. You explain the path; the building itself happens on those surfaces, not in this bubble.

NAVIGATION — you can take the user to a screen, two ways:
GOTO: <key>   → shows a "Take me there" button (use when a screen is merely relevant).
GOTO! <key>   → navigates IMMEDIATELY (use when the user explicitly asks to open/go to/show a screen — "open settings", "take me to models").
Keys: chat · collaborate · build · studio · projects · agents · models · connectors · scheduler · consumption · skills · terminal · settings · guide. ONE navigation line per reply, always the last line, only when a real screen fits.
DISAMBIGUATION — TWO "STUDIOS" EXIST: the key "studio" is the Studio LAUNCHER (one-prompt web pages, documents, games, diagrams). The AGENT STUDIO — where agents are built and edited (Designer, Bench, Blueprint & capabilities, knowledge, teams, Recruiter, Floor) — lives on the AGENTS screen. For ANY question about agents or their fields, always use GOTO: agents, NEVER studio.

===== APP GUIDE =====
${APP_GUIDE_RAW}

===== AGENT GUIDE =====
${AGENT_GUIDE_RAW}`;

// GOTO key → app mode for onNavigate(switchMode)
const GOTO_MODE = { chat: "chat", collaborate: "cowork", build: "code", studio: "studio", projects: "project", agents: "agents", models: "models-overview", connectors: "connectors", scheduler: "scheduler", consumption: "consumption", skills: "skills", terminal: "terminal", settings: "settings", guide: "guide" };
const GOTO_LABEL = { chat: "Let's Chat", collaborate: "Let's Collaborate", build: "Let's Build", studio: "Studio", projects: "Projects", agents: "Agents", models: "Models", connectors: "Connectors", scheduler: "Scheduler", consumption: "Consumption", skills: "Skills", terminal: "Terminal", settings: "Settings", guide: "the User Guide" };

// Light, dismissible proactive offers keyed to the current screen.
function tipFor(mode) {
  switch (mode) {
    case "agents": return { id: "agents", msg: "Building agents? I can suggest a first hire or explain teams — just ask." };
    case "connectors": return { id: "connectors", msg: "Connecting an app? Ask me how connectors work and what they unlock." };
    case "models": case "models-overview": case "models-speed": return { id: "models", msg: "Not sure which model to pick? Tell me your task and I'll suggest one." };
    case "scheduler": return { id: "scheduler", msg: "Want something to run on its own? I'll walk you through scheduling." };
    case "cowork": return { id: "cowork", msg: "First time collaborating on files? Ask me how it works." };
    default: return null;
  }
}

// A saved position is only trustworthy on the window it was dragged on: clamp it to the
// CURRENT viewport so Sage can never be restored off-screen (smaller window/monitor).
function clampPos(p) {
  if (!p || typeof p.left !== "number" || typeof p.top !== "number" || typeof window === "undefined") return null;
  const pad = 8, sz = 60;
  return {
    left: Math.max(pad, Math.min(window.innerWidth - sz - pad, p.left)),
    top: Math.max(pad, Math.min(window.innerHeight - sz - pad, p.top)),
  };
}

export default function SageDock({ mode, onNavigate }) {
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.thread") || "[]"); } catch { return []; } });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("be.sage.hidden") === "1"; } catch { return false; } });
  const [pos, setPos] = useState(() => { try { return clampPos(JSON.parse(localStorage.getItem("be.sage.pos") || "null")); } catch { return null; } });
  const [look, setLook] = useState(() => { try { return Number(localStorage.getItem("be.sage.look")) || 0; } catch { return 0; } });
  const [lookPick, setLookPick] = useState(false);
  const [peek, setPeek] = useState(() => { try { return localStorage.getItem("be.sage.greeted") !== "1"; } catch { return false; } });
  const [tip, setTip] = useState(null);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(FEAT_VOICE); // Extras switchboard: hide the mic when voice input is off
  useEffect(() => { bridge.getSettings().then((c) => setVoiceOn(FEAT_VOICE && ((c && c.extras) || {}).voice !== false)).catch(() => {}); }, [open]);
  const [size, setSize] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.size") || "null"); } catch { return null; } });
  // Active walkthrough: Sage's numbered steps become a live guide that follows the
  // user across screens until the whole cycle is done (e.g. agent created + deployed).
  const [walk, setWalk] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.walk") || "null"); } catch { return null; } });
  const saveWalk = (w) => { setWalk(w); try { w ? localStorage.setItem("be.sage.walk", JSON.stringify(w)) : localStorage.removeItem("be.sage.walk"); } catch {} };
  const posRef = useRef(pos);
  const endRef = useRef(null);
  const panelRef = useRef(null);
  const tipDismissed = useRef({});
  const recRef = useRef(null);
  const micEngineRef = useRef(null); // "win" | "web" — which speech engine is live while listening
  const winListenersRef = useRef([]); // active window pointer listeners (drag/resize) → removed on unmount
  const lookObj = SAGE_LOOKS[look] || SAGE_LOOKS[0];
  const name = lookName(lookObj); // female looks answer as Sara, the rest as Sage

  useEffect(() => { try { localStorage.setItem("be.sage.thread", JSON.stringify(msgs.slice(-40))); } catch {} }, [msgs]);
  useEffect(() => { if (open) endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);
  useEffect(() => { if (peek) { try { localStorage.setItem("be.sage.greeted", "1"); } catch {} const t = setTimeout(() => setPeek(false), 5000); return () => clearTimeout(t); } }, []); // eslint-disable-line
  useEffect(() => {
    let peekT = null;
    const id = setInterval(() => { setPeek(true); peekT = setTimeout(() => setPeek(false), 4000); }, 300000);
    return () => { clearInterval(id); if (peekT) clearTimeout(peekT); };
  }, []);
  // Unmount safety net: drop any window pointer listeners a drag/resize left behind.
  useEffect(() => () => { winListenersRef.current.forEach(([t, fn]) => window.removeEventListener(t, fn)); winListenersRef.current = []; }, []);
  // BOUNDARY GUARD for the OPEN PANEL: the FAB position is clamped, but the panel is
  // much larger and anchored off the dock — near a screen edge it could extend past
  // the viewport, hiding its own drag handle (then it's "stuck": nothing to grab).
  // After every open/resize/move, measure the real panel rect and shift the dock so
  // the WHOLE panel sits inside the window. Self-correcting: once it fits, dx/dy are
  // zero and this effect does nothing — no loops, no drift.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        const el = panelRef.current; if (!el) return;
        const r = el.getBoundingClientRect();
        const pad = 8;
        let dx = 0, dy = 0;
        if (r.left < pad) dx = pad - r.left;
        else if (r.right > window.innerWidth - pad) dx = (window.innerWidth - pad) - r.right;
        if (r.top < pad) dy = pad - r.top;
        else if (r.bottom > window.innerHeight - pad) dy = (window.innerHeight - pad) - r.bottom;
        if (!dx && !dy) return;
        const dock = el.closest(".sage-dock");
        const dr = dock ? dock.getBoundingClientRect() : r;
        const np = clampPos({ left: dr.left + dx, top: dr.top + dy }) || { left: dr.left + dx, top: dr.top + dy };
        posRef.current = np; setPos(np);
        try { localStorage.setItem("be.sage.pos", JSON.stringify(np)); } catch {}
      } catch {}
    }, 40); // after layout settles
    return () => clearTimeout(t);
  }, [open, size, pos]);

  // Window shrank? Pull Sage back into view (and persist the corrected spot).
  useEffect(() => {
    const onResize = () => setPos((p) => {
      const c = clampPos(p);
      if (c && p && (c.left !== p.left || c.top !== p.top)) { posRef.current = c; try { localStorage.setItem("be.sage.pos", JSON.stringify(c)); } catch {} return c; }
      return p;
    });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // proactive tip per screen
  useEffect(() => {
    setTip(null);
    if (open || hidden) return;
    const t = tipFor(mode);
    if (!t || tipDismissed.current[t.id]) return;
    const timer = setTimeout(() => { if (!open && !hidden) setTip(t); }, 16000);
    return () => clearTimeout(timer);
  }, [mode, open, hidden]);
  // Quiet observation: every screen visit feeds the helper's long-term memory
  // (local-only) so advice gets more personal and expert over time.
  useEffect(() => { recordScreen(mode); }, [mode]);
  // Walkthrough observation: when the user changes screens mid-walkthrough with the
  // dock closed, surface the current step so they're never lost. (The guide bar
  // inside the panel already shows it when open.)
  useEffect(() => {
    if (!walk || !walk.steps || open || hidden) return;
    const t = setTimeout(() => setTip({ id: "walk", msg: `Step ${walk.idx + 1}: ${walk.steps[walk.idx].slice(0, 90)} — tap me if you're stuck.` }), 1200);
    return () => clearTimeout(t);
  }, [mode, walk, open, hidden]); // eslint-disable-line

  const walkNext = () => {
    if (!walk) return;
    if (walk.idx + 1 >= walk.steps.length) {
      recordEvent("walkthrough-complete", walk.topic);
      setMsgs((m) => [...m, { role: "mentor", text: "That's the whole cycle — you did it end to end! 🎉 I've made a note of how you like to work. Want to run it once more on your own, or shall I show you what to try next?" }]);
      saveWalk(null);
      return;
    }
    saveWalk({ ...walk, idx: walk.idx + 1 });
  };
  const walkStuck = () => {
    if (!walk) return;
    recordEvent("walkthrough-stuck", `step ${walk.idx + 1} of "${walk.topic}"`);
    openDock();
    ask(`I'm stuck on step ${walk.idx + 1}: "${walk.steps[walk.idx]}". I'm on the ${mode} screen. What exactly do I click or type next?`);
  };
  const walkEnd = () => { recordEvent("walkthrough-abandoned", walk ? walk.topic : ""); saveWalk(null); };

  const openDock = () => { setOpen(true); setPeek(false); try { localStorage.setItem("be.sage.greeted", "1"); } catch {} };
  const newThread = () => { setMsgs([]); setInput(""); try { localStorage.removeItem("be.sage.thread"); } catch {} };
  const hide = () => { setHidden(true); setOpen(false); try { localStorage.setItem("be.sage.hidden", "1"); } catch {} };
  const show = () => { setHidden(false); try { localStorage.removeItem("be.sage.hidden"); } catch {} };
  const chooseLook = (i) => { setLook(i); setLookPick(false); try { localStorage.setItem("be.sage.look", String(i)); } catch {} };

  const ask = async (preset) => {
    const text = (typeof preset === "string" ? preset : input).trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    recordQuestion(text); // memory: every question teaches the helper about this user
    const next = [...msgs, { role: "user", text }];
    setMsgs(next);
    try {
      const hist = next.slice(-12).map((m) => ({ role: m.role === "mentor" ? "assistant" : "user", content: m.text }));
      // Active walkthrough context: Sage knows exactly which step the user is on
      // and which screen they're looking at, so help stays step-aware.
      const walkCtx = walk && walk.steps ? `\n\nACTIVE WALKTHROUGH (you are guiding the user through this right now): "${walk.topic}". They are on step ${walk.idx + 1} of ${walk.steps.length}: "${walk.steps[walk.idx]}". Current screen: ${mode}. Tailor every answer to moving them through THIS step; if they seem done with it, tell them to press "Done — next" on the guide bar.` : "";
      // Control-level memory: retrieve only the entries relevant to THIS question
      // (local string scoring, zero tokens spent retrieving — see src/sageKnowledge.js).
      const know = retrieveKnowledge(text, mode);
      const knowCtx = know ? `\n\n===== CONTROL-LEVEL KNOWLEDGE (the entries below describe the exact fields/buttons this question is about — trust their labels and behaviors over general knowledge) =====\n${know}` : "";
      const r = await bridge.completeOnce([{ role: "system", content: SYS(name) + memoryBlock() + knowCtx + walkCtx }, ...hist]);
      // I think with whatever model the selector points at — any provider, any key.
      // When the key/model isn't ready, say so plainly and offer the fix screen.
      let reply = (r && r.text) || "";
      if (!reply) {
        const err = (r && r.error) || "no reply";
        reply = /key|provider|401|403|credential|baseUrl|model/i.test(err)
          ? "I think with the model you've selected, and right now I can't reach it (" + String(err).slice(0, 120) + "). Check the API key and model in Model configuration, then ask me again.\nGOTO: models"
          : "Hmm, that didn't go through: " + String(err).slice(0, 160);
      }
      setMsgs((m) => [...m, { role: "mentor", text: reply }]);
      // Instant navigation: "GOTO! <key>" means the user explicitly asked to go there.
      // DEFECT GUARD: models (especially weaker ones) overuse GOTO! even when the user
      // only asked a question, yanking them out of Sage mid-conversation. Auto-navigate
      // ONLY when the USER's own words show navigation intent; otherwise downgrade the
      // directive to a "Take me there" button (gotoKey accepts both forms). Discipline
      // enforced in code, never trusted to the model.
      const bang = /\bGOTO!\s*([a-z]+)/i.exec(reply); // \b not line-start: models often glue it onto a sentence
      let bk = bang && bang[1].toLowerCase();
      // Two-Studios guard: agent questions routed to the Studio LAUNCHER are a model
      // mix-up (the Agent Studio lives on the Agents screen) — remap in code.
      if (bk === "studio" && /\bagents?\b/i.test(text)) bk = "agents";
      const userWantsNav = /\b(open|go to|goto|take me|show me|bring me|navigate|switch to|jump to)\b/i.test(text);
      if (bk && GOTO_MODE[bk] && userWantsNav) {
        recordEvent("navigated", bk);
        setTimeout(() => { setOpen(false); onNavigate && onNavigate(GOTO_MODE[bk]); }, 650);
      }
      // Start a live walkthrough when the user asked to be guided and the reply
      // is a numbered procedure: the steps become a guide bar that persists
      // across screens until the whole cycle is finished.
      if (/how to|guide|walk me|step by step|teach me|help me (create|build|set ?up|make)/i.test(text)) {
        const steps = clean(reply).split("\n").map((l) => /^\s*(\d{1,2})[.)]\s+(.{4,})/.exec(l)).filter(Boolean).map((m) => m[2].trim());
        if (steps.length >= 3) {
          saveWalk({ topic: text.slice(0, 80), steps: steps.slice(0, 20), idx: 0 });
          recordEvent("walkthrough-start", text.slice(0, 60));
        }
      }
      // Periodic distillation of raw observations into durable insights (cheap, async).
      maybeDistill(bridge.completeOnce);
    } catch (e) {
      setMsgs((m) => [...m, { role: "mentor", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setBusy(false); }
  };

  // Voice — SIMPLE Windows mic: tap, speak, and your words are TYPED into the box
  // (you read them, then press Enter or the send arrow). Desktop uses ONLY the
  // Windows-native recognizer — no key, no model, no network. The browser speech
  // API is used ONLY on the web build: inside the desktop app it exists but is
  // non-functional (an Electron trap — it needs a cloud speech service that
  // desktop apps don't get), which is exactly what made the mic feel broken.
  const heard = (t) => {
    const text = String(t || "").trim();
    if (!text) return;
    setInput((p) => (p ? p.trim() + " " : "") + text);
  };
  const toggleMic = async () => {
    if (listening) {
      // Windows engine: there's nothing to stop from here — it ends on its own
      // (silence/timeout); the button title says so. Web engine: stop the live
      // recognizer, and clear the ref so a stale .stop() can never fire later.
      if (micEngineRef.current === "win") return;
      try { recRef.current && recRef.current.stop && recRef.current.stop(); } catch {}
      recRef.current = null;
      return;
    }
    // Desktop: the Windows engine, and ONLY the Windows engine.
    if (bridge.winSpeech) {
      micEngineRef.current = "win";
      setListening(true);
      try {
        const r = await bridge.winSpeech({ timeoutSec: 10 });
        if (r && r.text) heard(r.text);
        else if (r && r.error) setMsgs((m) => [...m, { role: "mentor", text: r.error }]);
      } catch (e) {
        setMsgs((m) => [...m, { role: "mentor", text: "Voice hiccup: " + String((e && e.message) || e) }]);
      }
      setListening(false);
      micEngineRef.current = null;
      return;
    }
    // Web build: the browser's own speech engine (Chromium browsers).
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        const rec = new SR();
        rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
        rec.onresult = (e) => heard(e.results[0][0].transcript);
        rec.onend = () => { setListening(false); recRef.current = null; micEngineRef.current = null; };
        rec.onerror = () => { setListening(false); recRef.current = null; micEngineRef.current = null; };
        rec.start(); setListening(true); micEngineRef.current = "web"; recRef.current = rec;
        return;
      } catch { setListening(false); recRef.current = null; micEngineRef.current = null; }
    }
    setMsgs((m) => [...m, { role: "mentor", text: "Voice isn't available here — on Windows desktop it works out of the box; on the web use a Chromium browser like Chrome or Edge." }]);
  };

  // Drag-to-resize: grip on the panel's free corner; width/height persist.
  const startResize = (e) => {
    const panel = e.currentTarget.closest(".sage-panel"); if (!panel) return;
    const r = panel.getBoundingClientRect();
    const d = { sx: e.clientX, sy: e.clientY, w: r.width, h: r.height };
    const maxW = Math.min(760, window.innerWidth - 24);
    const maxH = Math.min(900, window.innerHeight - 24);
    const move = (ev) => {
      const dw = left ? (d.sx - ev.clientX) : (ev.clientX - d.sx); // panel grows away from its anchor
      const dh = up ? (d.sy - ev.clientY) : (ev.clientY - d.sy);
      const s = { w: Math.round(Math.max(320, Math.min(maxW, d.w + dw))), h: Math.round(Math.max(380, Math.min(maxH, d.h + dh))) };
      setSize(s);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop);
      winListenersRef.current = winListenersRef.current.filter(([, f]) => f !== move && f !== stop);
      setSize((s) => { if (s) { try { localStorage.setItem("be.sage.size", JSON.stringify(s)); } catch {} } return s; });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
    winListenersRef.current.push(["pointermove", move], ["pointerup", stop]);
    e.preventDefault(); e.stopPropagation();
  };

  // "Take me there" button for GOTO: suggestions AND for GOTO! directives that were
  // NOT honored (no user navigation intent) — the downgrade path of the defect guard,
  // so an over-eager model's directive becomes a polite offer instead of a teleport.
  const gotoKey = (m) => { const x = /\bGOTO[:!]\s*([a-z]+)/i.exec(m.text || ""); const k = x && x[1].toLowerCase(); return GOTO_MODE[k] ? k : null; };
  // Display cleanup: drop GOTO lines (wherever they appear — m flag matches line ends,
  // not just the end of the whole text) and any markdown clutter the model slips in
  // (the persona says plain text; this is the safety net so ** never reaches the user).
  const clean = (t) => String(t || "")
    .replace(/\s*\bGOTO[:!]\s*[a-z]+\s*$/gim, "") // strips the directive even when glued mid-line onto a sentence
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\n)\s*#{1,4}\s+/g, "$1")
    .replace(/(^|\n)\s*[-*]\s+/g, "$1• ")
    .trim();
  const go = (k) => { recordEvent("navigated", k); setOpen(false); onNavigate && onNavigate(GOTO_MODE[k]); };

  const startDrag = (e) => {
    if (e.target.closest(".sage-ico")) return;
    const dock = e.currentTarget.closest(".sage-dock"); if (!dock) return;
    const r = dock.getBoundingClientRect();
    const fromFab = !!e.currentTarget.closest(".sage-fab");
    const d = { ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    const move = (ev) => {
      if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 4) d.moved = true;
      const pad = 8, sz = 60;
      const p = { left: Math.max(pad, Math.min(window.innerWidth - sz - pad, ev.clientX - d.ox)), top: Math.max(pad, Math.min(window.innerHeight - sz - pad, ev.clientY - d.oy)) };
      posRef.current = p; setPos(p);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      winListenersRef.current = winListenersRef.current.filter(([, f]) => f !== move && f !== up);
      if (posRef.current) { try { localStorage.setItem("be.sage.pos", JSON.stringify(posRef.current)); } catch {} }
      if (fromFab && !d.moved) openDock();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    winListenersRef.current.push(["pointermove", move], ["pointerup", up]);
    e.preventDefault();
  };

  const aTop = pos ? pos.top : (typeof window !== "undefined" ? window.innerHeight - 74 : 700);
  const aLeft = pos ? pos.left : (typeof window !== "undefined" ? window.innerWidth - 74 : 1200);
  const up = aTop > (typeof window !== "undefined" ? window.innerHeight : 800) * 0.45;
  const left = aLeft > (typeof window !== "undefined" ? window.innerWidth : 1400) * 0.5;
  const send = () => { const t = input.trim(); if (!t) return; ask(t); };

  return (
    <div className={`sage-dock ${up ? "up" : "down"} ${left ? "right" : "left"}`} style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}>
      {hidden ? (
        <button className="sage-tab" title={`Show ${name}`} onClick={show}><SageFace size={30} look={lookObj} /></button>
      ) : open ? (
        <div className="sage-panel" ref={panelRef} style={size ? { width: size.w, height: size.h } : undefined}>
          <div className="sage-grip" onPointerDown={startResize} title="Drag to resize" />
          <div className="sage-panel-head" onPointerDown={startDrag} title="Drag to move">
            <SageFace size={36} look={lookObj} />
            <div className="sage-panel-id"><b>{name}</b><span>your Madav buddy</span></div>
            <button className={`sage-ico ${lookPick ? "on" : ""}`} title={`Change ${name}'s look`} onClick={() => setLookPick((p) => !p)}><Smile size={15} /></button>
            {msgs.length > 0 && <button className="sage-ico" title="New conversation" onClick={newThread}><Plus size={14} /></button>}
            <button className="sage-ico" title="Tuck away to the corner" onClick={hide}><Minus size={15} /></button>
            <button className="sage-ico" title="Minimize" onClick={() => setOpen(false)}><X size={15} /></button>
          </div>
          {lookPick && (
            <div className="sage-looks">
              <span className="sage-looks-label">Pick a look — female looks answer as Sara</span>
              <div className="sage-looks-row">
                {SAGE_LOOKS.map((l, i) => (
                  <button key={i} className={`sage-look ${i === look ? "on" : ""}`} onClick={() => chooseLook(i)} title={l.label || `Look ${i + 1}`}><SageFace size={42} look={l} /></button>
                ))}
              </div>
            </div>
          )}
          {walk && walk.steps && (
            <div className="sage-walk">
              <div className="sage-walk-head">
                <b>Step {walk.idx + 1} of {walk.steps.length}</b>
                <span className="sage-walk-topic">{walk.topic}</span>
                <button className="sage-ico" title="End this guide" onClick={walkEnd}><X size={13} /></button>
              </div>
              <div className="sage-walk-step">{walk.steps[walk.idx]}</div>
              <div className="sage-walk-acts">
                <button className="btn primary" onClick={walkNext}>{walk.idx + 1 >= walk.steps.length ? "Finish 🎉" : "Done — next ▸"}</button>
                <button className="btn ghost" onClick={walkStuck}>I'm stuck</button>
              </div>
            </div>
          )}
          <div className="sage-panel-msgs scroll">
            {msgs.length === 0 && (
              <div className="sage-hello">
                <SageFace size={56} look={lookObj} />
                <div>Hey, I'm <b>{name}</b> 👋 Your Madav guide — ask me anything about the app and I'll keep it short, point you at the exact button, or take you straight to the right screen. Type it, or tap the mic and just talk.</div>
              </div>
            )}
            {msgs.map((m, i) => {
              if (m.role === "user") return <div key={i} className="agsd-say">{m.text}</div>;
              const dest = gotoKey(m);
              return <div key={i} className="agsd-sheet">{clean(m.text)}{dest && <button className="btn primary aggc-goto" onClick={() => go(dest)}><ArrowRight size={13} /> Take me to {GOTO_LABEL[dest]}</button>}</div>;
            })}
            {busy && <div className="agsd-sheet agsd-busy"><Loader2 size={13} className="ag-spin" /> thinking…</div>}
            <div ref={endRef} />
          </div>
          <div className="sage-panel-input">
            {voiceOn && <button className={`sage-mic ${listening ? "rec" : ""}`}
              aria-label={listening ? (micEngineRef.current === "win" ? "Listening — stops automatically" : "Stop listening") : `Talk to ${name}`}
              title={listening ? (micEngineRef.current === "win" ? "Listening — stops automatically" : "Listening — click to stop") : `Talk to ${name}`}
              onClick={toggleMic}><Mic size={15} /></button>}
            <input value={input} placeholder={listening ? "Listening…" : `Ask ${name} anything…`} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
            <button className="agsd-send" aria-label={`Ask ${name}`} disabled={busy || !input.trim()} onClick={send}><ArrowUp size={15} /></button>
          </div>
        </div>
      ) : (
        <div className="sage-fab-wrap">
          <button className="sage-fab" title={`Ask ${name} — drag to move me`} onPointerDown={startDrag}><SageFace size={52} look={lookObj} /></button>
          <button className="sage-fab-hide" title={`Tuck ${name} away`} onClick={hide}><X size={11} /></button>
          {tip
            ? <span className="sage-tip" onClick={() => { const a = tip.ask || ("Help me with " + mode); const isWalk = tip.id === "walk"; setTip(null); openDock(); if (!isWalk) ask(a); }}>
                <span className="sage-tip-msg">{tip.msg}</span>
                <button className="sage-tip-x" title="Dismiss" onClick={(e) => { e.stopPropagation(); tipDismissed.current[tip.id] = true; setTip(null); }}><X size={11} /></button>
              </span>
            : <span className={`sage-fab-nudge ${peek ? "show" : ""}`}>I'm {name}, need help?</span>}
        </div>
      )}
    </div>
  );
}
