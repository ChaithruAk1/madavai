import { useState, memo } from "react";
import { LayoutTemplate, Copy, Check, Pencil, RotateCcw } from "lucide-react";
import ToolCard from "./ToolCard.jsx";
import ThinkLogo from "./ThinkLogo.jsx";
import Markdown from "../markdown.jsx";
import { extractArtifacts } from "../artifacts.js";

// Strip a leading raw-JSON blob some weak models prepend to their reply.
function cleanAssistant(t) {
  if (!t) return t;
  return t.replace(/^\s*\{[^{}]*\}\s*(?=[A-Za-z("'])/, "");
}

// A user message can carry attached files inline (Composer wraps them in
// "--- Attached file: NAME ---\n…content…\n--- end of file: NAME ---"). The model
// reads the full content, but here we collapse each block to a compact 📎 chip so
// the file body never floods the chat. Returns { body, chips }.
function splitAttachments(text) {
  const chips = [];
  const body = String(text || "").replace(
    /\n*--- Attached file: (.+?) ---\n([\s\S]*?)\n--- end of file: .*? ---\n*/g,
    (_, name, content) => { chips.push({ name, chars: (content || "").length }); return "\n"; }
  ).trim();
  return { body, chips };
}
const ATT_CHIP = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", margin: "6px 6px 0 0", border: "1px solid var(--line)", borderRadius: 8, background: "var(--bg-2)", fontSize: 12, opacity: 0.92 };
// User bubble body: the typed text, then a compact 📎 chip per attached file (the file's
// content stays in the message for the model but is hidden from the chat view).
function UserBody({ text }) {
  const { body, chips } = splitAttachments(text);
  return (
    <>
      {body}
      {chips.length > 0 && (
        <div style={{ marginTop: body ? 8 : 0 }}>
          {chips.map((c, i) => <span key={i} style={ATT_CHIP} title={`${c.chars.toLocaleString()} characters included for the model`}>📎 {c.name}</span>)}
        </div>
      )}
    </>
  );
}

function Message({ item, streaming, onOpenArtifact, userName, onRetry, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (item.type === "tool") return <ToolCard {...item} />;

  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  const artifacts = isUser || streaming ? [] : extractArtifacts(item.text);

  const copy = () => { try { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const startEdit = () => { setDraft(item.text || ""); setEditing(true); };
  const saveEdit = () => { setEditing(false); const t = draft.trim(); if (t && t !== item.text && onEdit) onEdit(t); };

  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar"><ThinkLogo size={28} animated={false} /></div>}
      <div className="body">
        <div className="who">{isUser ? (userName || "You") : "Madav"}</div>
        {isUser && Array.isArray(item.images) && item.images.length > 0 && (
          <div className="msg-images">{item.images.map((im, i) => <img key={i} src={im.dataUrl} alt={im.name || ""} />)}</div>
        )}

        {editing ? (
          <div className="msg-edit">
            <textarea value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(); if (e.key === "Escape") setEditing(false); }}
              rows={Math.min(12, (String(draft).match(/\n/g)?.length || 0) + 2)} />
            <div className="msg-edit-actions">
              <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn primary" onClick={saveEdit}>Save &amp; send</button>
            </div>
          </div>
        ) : (
          <div className="content">
            {isUser ? <UserBody text={text} /> : <Markdown text={text} streaming={streaming} />}
            {streaming && <span className="cursor" />}
          </div>
        )}
        {isUser && item.routed && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }} title="Auto routing chose this model for your request">✨ routed to {item.routed}</div>}

        {artifacts.map((a, i) => (
          <span key={i} className="artifact-pill" onClick={() => onOpenArtifact && onOpenArtifact(a)}>
            <LayoutTemplate size={13} /> Open {a.title}
          </span>
        ))}

        {!editing && !streaming && (text || "").trim() && (
          <div className="msg-actions">
            <button className="msg-act" onClick={copy} title={copied ? "Copied" : "Copy"}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
            {isUser && onEdit && <button className="msg-act" onClick={startEdit} title="Edit"><Pencil size={15} /></button>}
            {!isUser && onRetry && <button className="msg-act" onClick={onRetry} title="Retry"><RotateCcw size={15} /></button>}
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized: while streaming, only the LIVE message's props change — settled messages skip
// re-rendering entirely, which keeps long conversations smooth during token streams.
export default memo(Message, (prev, next) =>
  prev.item === next.item && prev.streaming === next.streaming && prev.userName === next.userName
  && !!prev.onEdit === !!next.onEdit && !!prev.onRetry === !!next.onRetry);
