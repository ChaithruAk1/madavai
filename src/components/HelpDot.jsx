// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// HelpDot — the "?" beside a control. Click it and a small popover explains that
// control: what it is + when you'd use it. Reads from src/help/screens.js, the ONE
// source that also feeds Sage's "Explain this screen" and the User Guide — so the
// three surfaces can never drift. Zero tokens: this is pure local lookup.
//
//   <HelpDot mode="project" section="goals" />
//
// If `section` is omitted, the dot explains the whole screen (title + blurb).
import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { SCREEN_HELP } from "../help/screens.js";
import "../helpdot.css";

export default function HelpDot({ mode, section, label }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Resolve the content once per render — cheap object lookup.
  const screen = SCREEN_HELP[mode] || null;
  const sec = section && screen && (screen.sections || []).find((s) => (s.id || s.label) === section);
  const title = sec ? sec.label : screen ? screen.title : label || "Help";
  const what = sec ? sec.what : screen ? screen.blurb : "";
  const more = sec ? sec.more : "";
  const when = sec ? sec.when : "";

  // Close on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!screen && !label) return null; // nothing to explain — render nothing

  return (
    <span className="hd-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`hd-btn ${open ? "on" : ""}`}
        title={`What is “${title}”?`}
        aria-label={`What is ${title}?`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <HelpCircle size={13} />
      </button>
      {open && (
        <div className="hd-pop" role="dialog">
          <div className="hd-pop-head">
            <span className="hd-pop-title">{title}</span>
            <button className="hd-pop-x" onClick={() => setOpen(false)} aria-label="Close"><X size={12} /></button>
          </div>
          {what && <p className="hd-pop-what">{what}</p>}
          {more && <p className="hd-pop-more">{more}</p>}
          {when && (
            <p className="hd-pop-when"><span className="hd-pop-when-k">When</span> {when}</p>
          )}
        </div>
      )}
    </span>
  );
}
