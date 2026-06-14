// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// HelpDot — the "?" beside a control. Click it and a small popover explains that
// control: what it is + when you'd use it. Reads from src/help/screens.js, the ONE
// source that also feeds Sage's "Explain this screen" and the User Guide — so the
// three surfaces can never drift. Zero tokens: this is pure local lookup.
//
//   <HelpDot mode="project" section="goals" />
//
// If `section` is omitted, the dot explains the whole screen (title + blurb).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { SCREEN_HELP } from "../help/screens.js";
import "../helpdot.css";

export default function HelpDot({ mode, section, label }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popRef = useRef(null);

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

  // Dynamic placement — the popover is viewport-fixed; size comes from CSS (wide on big windows,
  // shrinks on small). Here we just clamp it inside the viewport and flip above the dot if there's
  // no room below, so it never runs off-screen regardless of where the "?" sits or the window size.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const btn = wrapRef.current && wrapRef.current.querySelector(".hd-btn");
      const pop = popRef.current;
      if (!btn || !pop) return;
      const d = btn.getBoundingClientRect();
      const pw = pop.offsetWidth, ph = pop.offsetHeight, M = 8;
      let left = d.left + d.width / 2 - pw / 2;
      left = Math.max(M, Math.min(left, window.innerWidth - pw - M));
      let top = d.bottom + 6;
      if (top + ph > window.innerHeight - M) top = Math.max(M, d.top - ph - 6); // flip above
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
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
        <div className="hd-pop" role="dialog" ref={popRef}>
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
