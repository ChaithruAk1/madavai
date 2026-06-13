import { useEffect, useRef, useState } from "react";
import MadavLogo from "./MadavLogo.jsx";
import { MessageCircle, Users, Hammer, PanelLeft, CircleDot, Globe, AppWindow, Square } from "lucide-react";
import { MODES } from "../bridge/contract.js";
import { bridge, isWeb } from "../bridge/index.js";
import { madavAlert } from "../dialogs.jsx";

const ORDER = ["chat", "cowork", "code"];
const ICONS = { chat: MessageCircle, cowork: Users, code: Hammer };

// Global workflow recorder — start/stop from anywhere (user request 2026-06-12).
// Reuses the exact same bridge APIs as the Skills screen: recordFlowStart (web —
// an Electron recorder window opens; closing it finishes) and recordDesktopStart/
// Stop (native apps via UI Automation). Output is always a Skill Forge DRAFT that
// waits for approval at the top of the Skills screen. Desktop builds only.
function RecordControl({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [rec, setRec] = useState(null); // null | "web" | "desktop"
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // The chip mirrors REALITY, wherever a recording was started (here, the Playbook
  // teach tiles, anywhere): poll both recorders' status. Web recordings end when the
  // user closes the recorder window — the poll catches that and announces the draft.
  const prevRef = useRef(null);
  useEffect(() => {
    const tick = async () => {
      try {
        const [w, d] = await Promise.all([
          bridge.recordFlowStatus ? bridge.recordFlowStatus() : null,
          bridge.recordDesktopStatus ? bridge.recordDesktopStatus() : null,
        ]);
        const next = (d && d.recording) ? "desktop" : (w && w.recording) ? "web" : null;
        if (prevRef.current === "web" && next === null) {
          madavAlert("Web recording finished. Madav is drafting the play — it appears in the Playbook for your approval (give it ~30s).");
          onSelect && onSelect("skills");
        }
        prevRef.current = next;
        setRec(next);
      } catch {}
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isWeb || (!bridge.recordFlowStart && !bridge.recordDesktopStart)) return null;

  const startWeb = async () => {
    setOpen(false);
    await bridge.recordFlowStart();
    setRec("web"); prevRef.current = "web";
    madavAlert("Recording — do the workflow by hand in the new browser window, then CLOSE that window to finish. Credential fields are never recorded.");
  };
  const startDesktop = async () => {
    setOpen(false);
    const r = await bridge.recordDesktopStart();
    if (r && r.error) { madavAlert(r.error); return; }
    setRec("desktop"); prevRef.current = "desktop";
  };
  const stop = async () => {
    if (rec === "desktop") {
      const r = await bridge.recordDesktopStop();
      setRec(null);
      madavAlert(((r && (r.note || r.error)) || "Recording stopped.") + "\n\nThe draft appears at the top of the Skills screen for your approval.");
      onSelect && onSelect("skills");
    } else {
      setRec(null); // web: the recorder window is the real stop control
      madavAlert("Close the recorder browser window to finish the web recording — the draft then appears in Skills.");
    }
  };

  return (
    <div className="tn-recwrap" ref={wrapRef}>
      {rec ? (
        <button className="chip tn-rec on" onClick={stop} title={rec === "desktop" ? "Recording your desktop — click to stop and draft the skill" : "Recording the web window — close that window to finish (click for help)"}>
          <span className="tn-recdot" /> Recording {rec === "desktop" ? "desktop" : "web"} · <Square size={10} style={{ verticalAlign: "-1px" }} /> Stop
        </button>
      ) : (
        <button className="chip tn-rec" onClick={() => setOpen((o) => !o)} title="Record a workflow once — Madav turns what it watched into a skill draft you approve">
          <CircleDot size={13} /> Record
        </button>
      )}
      {open && !rec && (
        <div className="plus-menu tn-recmenu">
          {bridge.recordFlowStart && (
            <button className="plus-item" onClick={startWeb} title="A browser window opens; do the task by hand; close the window — Madav drafts a skill from what it watched">
              <Globe size={15} /> Record a web workflow
            </button>
          )}
          {bridge.recordDesktopStart && (
            <button className="plus-item" onClick={startDesktop} title="Do the task in your real Windows apps; press Stop here when done — Madav drafts a skill from the clicks and fields it saw">
              <AppWindow size={15} /> Record a desktop workflow
            </button>
          )}
          <div className="mo-sub" style={{ padding: "6px 10px 4px", maxWidth: 240 }}>The result is a skill draft — approve it in Skills, then any Skills-capable agent can replay it.</div>
        </div>
      )}
    </div>
  );
}

export default function TopNav({ mode, onSelect, online, loc, sidebarOpen, onToggleSidebar }) {
  const tabs = ORDER.map((id) => MODES.find((m) => m.id === id)).filter(Boolean);
  const dot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  return (
    <header className="topnav glass">
      <div className="tn-left">
        <button className="tn-collapse" onClick={onToggleSidebar} title={(sidebarOpen ? "Collapse" : "Expand") + " sidebar (Ctrl+B)"}><PanelLeft size={18} /></button>
        <div className="tn-brand">
          <div className="tn-brandtext">
            <MadavLogo height={32} />
            <span className="tn-by">Built to think with you</span>
          </div>
        </div>
      </div>

      <nav className="tn-tabs">
        {tabs.map((m) => {
          const I = ICONS[m.id];
          return (
            <button key={m.id} className={`tn-tab ${mode === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>
              {I && <I size={19} className="tn-tabicon" />}<span>{m.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="tn-right">
        <RecordControl onSelect={onSelect} />
        <span className="chip tn-status" title={`Active model is ${online === null ? "checking…" : online ? "online" : "offline"}`}
          style={{ color: online === false ? "var(--danger)" : undefined }}>
          <span className="tn-statusdot" style={{ background: dot, boxShadow: online ? "0 0 7px var(--ok)" : "none" }} />
          {online === null ? "checking…" : online ? "online" : "offline"}
        </span>
      </div>
    </header>
  );
}
