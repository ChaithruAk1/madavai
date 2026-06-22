// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Madav-themed dialogs — STANDING RULE: never use the native window.alert/confirm/prompt
// (white Windows boxes). Call madavAlert / madavConfirm / madavPrompt instead; <DialogHost />
// is mounted once in App and renders them in the app's own visual language (scrim +
// card, same family as the create dialogs and the agent-question modal). All
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

// Text-input dialog. Resolves to the entered string (trimmed), or null if cancelled/left empty.
export function madavPrompt(text, { value = "", placeholder = "", okLabel = "Save", cancelLabel = "Cancel", maxLength = 200 } = {}) {
  if (!push) { try { const r = window.prompt(text, value); return Promise.resolve(r == null ? null : (String(r).trim() || null)); } catch { return Promise.resolve(null); } }
  return push({ kind: "prompt", text: String(text == null ? "" : text), value: String(value == null ? "" : value), placeholder, okLabel, cancelLabel, maxLength });
}

export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  const [val, setVal] = useState("");
  useEffect(() => {
    push = (d) => new Promise((res) => setQueue((q) => [...q, { ...d, res }]));
    return () => { push = null; };
  }, []);
  const d = queue[0];
  // Seed the input whenever a prompt becomes the active dialog.
  useEffect(() => { if (d && d.kind === "prompt") setVal(d.value || ""); }, [d]);
  const close = (v) => { try { d && d.res(v); } catch {} setQueue((q) => q.slice(1)); };
  const submit = () => { if (!d) return; if (d.kind === "prompt") close(String(val || "").trim() || null); else close(true); };
  const cancel = () => { if (!d) return; close(d.kind === "confirm" ? false : (d.kind === "prompt" ? null : true)); };
  useEffect(() => {
    if (!d) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [d, val]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  return (
    <div className="scrim" style={{ zIndex: 95 }} onMouseDown={(e) => { if (e.target === e.currentTarget && d.kind === "alert") close(true); }}>
      <div className="pj-create" style={{ width: 460 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageCircleQuestion size={18} style={{ color: "var(--accent)" }} />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>Madav</h2>
        </div>
        <p style={{ margin: "12px 0 4px", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{d.text}</p>
        {d.kind === "prompt" && (
          <input className="model-search" autoFocus value={val} placeholder={d.placeholder || ""} maxLength={d.maxLength || 200}
            onChange={(e) => setVal(e.target.value)} style={{ width: "100%", marginTop: 6, marginBottom: 0 }} />
        )}
        <div className="pj-create-btns">
          {(d.kind === "confirm" || d.kind === "prompt") && <button className="btn" onClick={cancel}>{d.cancelLabel || "Cancel"}</button>}
          <span style={{ flex: 1 }} />
          <button className="btn primary" autoFocus={d.kind !== "prompt"} onClick={submit}>{d.kind === "alert" ? "OK" : (d.okLabel || "OK")}</button>
        </div>
      </div>
    </div>
  );
}
