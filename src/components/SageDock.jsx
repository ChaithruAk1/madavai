// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// SageDock — BrainEdge's app-wide AI helper. A friendly human buddy who floats quietly
// in the corner of EVERY screen, knows the whole app (App Guide + Agent Guide), answers
// krisp, can navigate you to any screen, notices when you seem stuck, and never disturbs
// a running session (he talks through a separate one-shot call). Draggable, minimizable,
// with a chooseable face. Shares the persisted thread with the in-Agents "Ask Sage" tab.
import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus, Smile, ArrowUp, ArrowRight, Loader2, Mic } from "lucide-react";
import Portrait from "./Portrait.jsx";
import { bridge } from "../bridge/index.js";
import AGENT_GUIDE_RAW from "../../AGENT-GUIDE.md?raw";
import APP_GUIDE_RAW from "../../APP-GUIDE.md?raw";

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

const SYS = (name = "Sage") => `You are ${name}, BrainEdge's app-wide buddy — a warm, funny, endlessly patient friend who knows everything about BrainEdge. You're the helpful pal everyone wishes they had: upbeat, jovial, quick with a light joke, never dry. Help this person use BrainEdge, anywhere in the app, and make them smile while you do it.

How you teach — KEEP IT KRISP:
- Lead with the direct answer in ONE sentence, then at most 2-3 short supporting sentences. ~80 words max unless they ask to "explain more".
- A light pun or warm aside is welcome, never at the cost of clarity. Plain language, no markdown headers, no walls of bullets.
- END with ONE concrete next step. If a real screen fits, add a navigation line (below).

Hard rules:
- The two guides below are the COMPLETE truth about BrainEdge today. Never invent a feature, screen or button. Use exact labels. If something isn't covered, say it isn't a feature (or you're not sure) and point to the closest real one. Never mention Chrome/Safari/Firefox or other OSes — the Agent Browser is BrainEdge's own built-in window.
- BUILD WITH BRAINEDGE, always: whenever the user wants to build, create, or make ANYTHING (an app, website, game, document, report, analysis, automation, workflow, bot…), answer with how to build it USING BrainEdge. Pick the best surface — Let's Build for coding on a folder, Studio for web pages/documents/games/diagrams, Agents & Teams for repeatable work, Projects for knowledge work, Scheduler for anything recurring, Connectors for app data — give the first concrete step there, and end with the matching GOTO line. Never send them to an outside tool when a BrainEdge surface can do the job.

NAVIGATION — you can take the user to a screen. When they ask where to find/do something, add ONE final line exactly:
GOTO: <key>
from: chat · collaborate · build · studio · projects · agents · models · connectors · scheduler · consumption · skills · terminal · settings · guide. The app turns it into a "Take me there" button. One GOTO per reply, only when a real screen fits.

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

export default function SageDock({ mode, onNavigate }) {
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.thread") || "[]"); } catch { return []; } });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem("be.sage.hidden") === "1"; } catch { return false; } });
  const [pos, setPos] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.pos") || "null"); } catch { return null; } });
  const [look, setLook] = useState(() => { try { return Number(localStorage.getItem("be.sage.look")) || 0; } catch { return 0; } });
  const [lookPick, setLookPick] = useState(false);
  const [peek, setPeek] = useState(() => { try { return localStorage.getItem("be.sage.greeted") !== "1"; } catch { return false; } });
  const [tip, setTip] = useState(null);
  const [listening, setListening] = useState(false);
  const [size, setSize] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.size") || "null"); } catch { return null; } });
  const posRef = useRef(pos);
  const endRef = useRef(null);
  const tipDismissed = useRef({});
  const recRef = useRef(null);
  const lookObj = SAGE_LOOKS[look] || SAGE_LOOKS[0];
  const name = lookName(lookObj); // female looks answer as Sara, the rest as Sage

  useEffect(() => { try { localStorage.setItem("be.sage.thread", JSON.stringify(msgs.slice(-40))); } catch {} }, [msgs]);
  useEffect(() => { if (open) endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);
  useEffect(() => { if (peek) { try { localStorage.setItem("be.sage.greeted", "1"); } catch {} const t = setTimeout(() => setPeek(false), 5000); return () => clearTimeout(t); } }, []); // eslint-disable-line
  useEffect(() => { const id = setInterval(() => { setPeek(true); setTimeout(() => setPeek(false), 4000); }, 300000); return () => clearInterval(id); }, []);
  // proactive tip per screen
  useEffect(() => {
    setTip(null);
    if (open || hidden) return;
    const t = tipFor(mode);
    if (!t || tipDismissed.current[t.id]) return;
    const timer = setTimeout(() => { if (!open && !hidden) setTip(t); }, 16000);
    return () => clearTimeout(timer);
  }, [mode, open, hidden]);

  const openDock = () => { setOpen(true); setPeek(false); try { localStorage.setItem("be.sage.greeted", "1"); } catch {} };
  const newThread = () => { setMsgs([]); setInput(""); try { localStorage.removeItem("be.sage.thread"); } catch {} };
  const hide = () => { setHidden(true); setOpen(false); try { localStorage.setItem("be.sage.hidden", "1"); } catch {} };
  const show = () => { setHidden(false); try { localStorage.removeItem("be.sage.hidden"); } catch {} };
  const chooseLook = (i) => { setLook(i); setLookPick(false); try { localStorage.setItem("be.sage.look", String(i)); } catch {} };

  const ask = async (preset) => {
    const text = (typeof preset === "string" ? preset : input).trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    const next = [...msgs, { role: "user", text }];
    setMsgs(next);
    try {
      const hist = next.slice(-12).map((m) => ({ role: m.role === "mentor" ? "assistant" : "user", content: m.text }));
      const r = await bridge.completeOnce([{ role: "system", content: SYS(name) }, ...hist]);
      setMsgs((m) => [...m, { role: "mentor", text: (r && r.text) || (r && r.error) || "(no reply)" }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "mentor", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setBusy(false); }
  };

  // Voice command: click to record, click again to stop — transcribed through the
  // user's own Whisper-capable key (desktop) or the browser's speech engine (web),
  // then SENT automatically so you can just talk to ${name}.
  const toggleMic = async () => {
    if (listening) { try { recRef.current && recRef.current.stop(); } catch {} return; }
    if (busy) return;
    if (bridge.transcribe && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = async () => {
          setListening(false);
          stream.getTracks().forEach((t) => t.stop());
          try {
            const blob = new Blob(chunks, { type: mime });
            const b64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1] || "");
              fr.onerror = rej;
              fr.readAsDataURL(blob);
            });
            const r = await bridge.transcribe({ b64, mime });
            if (r && r.text) ask(r.text);
            else if (r && r.error) setMsgs((m) => [...m, { role: "mentor", text: "I couldn't hear that: " + r.error }]);
          } catch (e) { setMsgs((m) => [...m, { role: "mentor", text: "Voice didn't come through: " + String((e && e.message) || e) }]); }
        };
        rec.start(); setListening(true); recRef.current = rec;
        return;
      } catch { setListening(false); setMsgs((m) => [...m, { role: "mentor", text: "Microphone access was blocked — allow it in your system settings and try again." }]); return; }
    }
    // Web fallback: browser-native speech recognition where available.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setMsgs((m) => [...m, { role: "mentor", text: "Voice needs the desktop app (with an OpenAI or Groq key), or a Chromium browser on the web." }]); return; }
    try {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
      rec.onresult = (e) => { const t = e.results[0][0].transcript; if (t) ask(t); };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start(); setListening(true); recRef.current = rec;
    } catch { setListening(false); }
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
      setSize((s) => { if (s) { try { localStorage.setItem("be.sage.size", JSON.stringify(s)); } catch {} } return s; });
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
    e.preventDefault(); e.stopPropagation();
  };

  const gotoKey = (m) => { const x = /(?:^|\n)\s*GOTO:\s*([a-z]+)/i.exec(m.text || ""); const k = x && x[1].toLowerCase(); return GOTO_MODE[k] ? k : null; };
  const clean = (t) => String(t || "").replace(/(?:^|\n)\s*GOTO:\s*[a-z]+\s*$/i, "").trim();
  const go = (k) => { setOpen(false); onNavigate && onNavigate(GOTO_MODE[k]); };

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
      if (posRef.current) { try { localStorage.setItem("be.sage.pos", JSON.stringify(posRef.current)); } catch {} }
      if (fromFab && !d.moved) openDock();
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
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
        <div className="sage-panel" style={size ? { width: size.w, height: size.h } : undefined}>
          <div className="sage-grip" onPointerDown={startResize} title="Drag to resize" />
          <div className="sage-panel-head" onPointerDown={startDrag} title="Drag to move">
            <SageFace size={36} look={lookObj} />
            <div className="sage-panel-id"><b>{name}</b><span>your BrainEdge buddy</span></div>
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
          <div className="sage-panel-msgs scroll">
            {msgs.length === 0 && (
              <div className="sage-hello">
                <SageFace size={56} look={lookObj} />
                <div>Hey, I'm <b>{name}</b> 👋 Your BrainEdge buddy. Ask me anything — type it or tap the mic and just talk. I keep it short and can whisk you to the right screen.</div>
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
            <button className={`sage-mic ${listening ? "rec" : ""}`} aria-label={listening ? "Stop listening" : `Talk to ${name}`} title={listening ? "Listening — click to stop" : `Talk to ${name}`} onClick={toggleMic}><Mic size={15} /></button>
            <input value={input} placeholder={listening ? "Listening…" : `Ask ${name} anything…`} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
            <button className="agsd-send" aria-label={`Ask ${name}`} disabled={busy || !input.trim()} onClick={send}><ArrowUp size={15} /></button>
          </div>
        </div>
      ) : (
        <div className="sage-fab-wrap">
          <button className="sage-fab" title={`Ask ${name} — drag to move me`} onPointerDown={startDrag}><SageFace size={52} look={lookObj} /></button>
          <button className="sage-fab-hide" title={`Tuck ${name} away`} onClick={hide}><X size={11} /></button>
          {tip
            ? <span className="sage-tip" onClick={() => { const a = tip.ask || ("Help me with " + mode); setTip(null); openDock(); }}>
                <span className="sage-tip-msg">{tip.msg}</span>
                <button className="sage-tip-x" title="Dismiss" onClick={(e) => { e.stopPropagation(); tipDismissed.current[tip.id] = true; setTip(null); }}><X size={11} /></button>
              </span>
            : <span className={`sage-fab-nudge ${peek ? "show" : ""}`}>I'm {name}, need help?</span>}
        </div>
      )}
    </div>
  );
}
