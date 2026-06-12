// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Madav-themed dialogs — STANDING RULE: never use the native window.alert/confirm
// (white Windows boxes). Call madavAlert / madavConfirm instead; <DialogHost /> is
// mounted once in App and renders them in the app's own visual language (scrim +
// card, same family as the create dialogs and the agent-question modal). Both
// return promises; dialogs queue if several fire at once. Native fallback only
// if the host isn't mounted (should never happen in practice).
import { useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";

let push = null; // set while a DialogHost is mounted

export function madavAlert(text) {
  if (!push) { try { window.alert(text); } catch {} return Promise.resolve(true); }
  return push({ kind: "alert", text: String(text == null ? "" : text) });
}

export function madavConfirm(text, { okLabel = "OK", cancelLabel = "Cancel" } = {}) {
  if (!push) return Promise.resolve(window.confirm(text));
  return push({ kind: "confirm", text: String(text == null ? "" : text), okLabel, cancelLabel });
}

export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    push = (d) => new Promise((res) => setQueue((q) => [...q, { ...d, res }]));
    return () => { push = null; };
  }, []);
  const d = queue[0];
  useEffect(() => {
    if (!d) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(d.kind === "alert"); }
      if (e.key === "Enter") { e.preventDefault(); close(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const close = (val) => { try { d.res(val); } catch {} setQueue((q) => q.slice(1)); };
  return (
    <div className="scrim" style={{ zIndex: 95 }} onMouseDown={(e) => { if (e.target === e.currentTarget && d.kind === "alert") close(true); }}>
      <div className="pj-create" style={{ width: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircleQuestion size={18} style={{ color: "var(--accent)" }} />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>Madav</h2>
        </div>
        <p style={{ margin: "12px 0 4px", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{d.text}</p>
        <div className="pj-create-btns">
          {d.kind === "confirm" && <button className="btn" onClick={() => close(false)}>{d.cancelLabel}</button>}
          <span style={{ flex: 1 }} />
          <button className="btn primary" autoFocus onClick={() => close(true)}>{d.kind === "confirm" ? d.okLabel : "OK"}</button>
        </div>
      </div>
    </div>
  );
}
