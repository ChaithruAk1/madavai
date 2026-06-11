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
        <div className="who">{isUser ? (userName || "You") : "BrainEdge"}</div>
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
            {isUser ? text : <Markdown text={text} />}
            {streaming && <span className="cursor" />}
          </div>
        )}

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
