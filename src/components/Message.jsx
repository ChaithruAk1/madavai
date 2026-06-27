import { useState, memo } from "react";
import { LayoutTemplate, Copy, Check, Pencil, RotateCcw } from "lucide-react";
import ToolCard from "./ToolCard.jsx";
import { bridge, isWeb } from "../bridge/index.js";
import ThinkLogo from "./ThinkLogo.jsx";
import Markdown, { OfficeIcon, OPEN_LABEL } from "../markdown.jsx";
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

function FileOutCard({ name, path, b64, onOpenArtifact }) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  const onDisk = !!path && !!(bridge && bridge.openPath); // a real saved file on this machine -> Open in place, not download
  const t = (ext === "xlsx" || ext === "xls" || ext === "csv") ? "xlsx" : (ext === "docx" || ext === "doc") ? "docx" : (ext === "pptx" || ext === "ppt") ? "pptx" : ext === "pdf" ? "pdf" : "";
  // Web download: a run_python-produced file arrives as base64 (Let's Chat has no folder). Decode to a Blob
  // and save it via the browser — the SAME in-browser download the officedoc cards use. One path, all surfaces.
  const MIME = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", pdf: "application/pdf" };
  const downloadB64 = () => {
    try {
      const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u], { type: MIME[t] || "application/octet-stream" }));
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {}
  };
  const canDownload = !!b64; // BOTH surfaces now — desktop downloads to your Downloads folder too (same a.click blob the officedoc cards use), unified with web. No desktop-only scratch-folder reveal.
  // In-app preview of the SAVED spreadsheet — parse the bytes back into a spec and open the SAME right-panel
  // preview an inline officedoc card uses. Identical on desktop + web (bytes come from the card's b64).
  const canPreview = !!b64 && t === "xlsx";
  const previewXlsx = async () => { try { const { xlsxB64ToSpec } = await import("../office.js"); const spec = await xlsxB64ToSpec(b64, name); onOpenArtifact && onOpenArtifact({ kind: "office", code: JSON.stringify(spec), office: "xlsx", title: name, previewable: true }); } catch {} };
  return (
    <div className="md-office">
      <span className="md-office-meta"><b>{name}</b><i>{onDisk ? "saved in your project folder" : "produced by the run · ready to download"}</i></span>
      <span className={"md-office-ico" + (t ? " md-office-ico--" + t : "")}><OfficeIcon type={t} /></span>
      {/* Desktop folder output -> Open / Open folder (already on disk). Web (bytes only) -> Download. One card, path-driven. */}
      {canPreview && onOpenArtifact && <button className="md-office-open" title="Preview in the side panel" onClick={previewXlsx}>Preview</button>}
      {onDisk && <button className="md-office-btn" title="Open the file" onClick={() => { try { bridge.openPath(path); } catch {} }}>Open</button>}
      {onDisk && <button className="md-office-open" title="Show it in your folder" onClick={() => { try { bridge.showInFolder(path); } catch {} }}>Open folder</button>}
      {!onDisk && canDownload && <button className="md-office-btn" title="Download the file" onClick={downloadB64}>Download</button>}
    </div>
  );
}
function Message({ item, streaming, onOpenArtifact, userName, onRetry, onEdit }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (item.type === "tool") return <ToolCard {...item} />;
  if (item.type === "fileout") return <FileOutCard {...item} onOpenArtifact={onOpenArtifact} />;

  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  const artifacts = isUser || streaming ? [] : extractArtifacts(item.text);

  const copy = () => { try { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const startEdit = () => { setDraft(item.text || ""); setEditing(true); };
  const saveEdit = () => { setEditing(false); const t = draft.trim(); if (t && t !== item.text && onEdit) onEdit(t); };

  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar"><ThinkLogo size={34} animated={false} /></div>}
      <div className="body">
        <div className="who">{isUser ? (userName || "You") : "Madav"}{!isUser && item.meta && item.meta.model ? <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "var(--text-3, var(--text-2))", opacity: 0.85 }} title={"Generated by " + ((item.meta.provider && item.meta.provider + " · ") || "") + item.meta.model}>{item.meta.model}</span> : null}</div>
        {isUser && Array.isArray(item.images) && item.images.length > 0 && (
          <div className="msg-images">{item.images.map((im, i) => <img key={i} src={im.dataUrl} alt={im.name || ""} />)}</div>
        )}

        {editing ? (
          <div className="msg-edit">
            <textarea value={draft} autoFocus spellCheck={true} onChange={(e) => setDraft(e.target.value)}
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
            <button className="msg-act" onClick={copy} title={copied ? "Copied" : "Copy"}>{copied ? <Check size={18} /> : <Copy size={18} />}</button>
            {isUser && onEdit && <button className="msg-act" onClick={startEdit} title="Edit"><Pencil size={18} /></button>}
            {onRetry && <button className="msg-act" onClick={onRetry} title={isUser ? "Run again" : "Retry"}><RotateCcw size={18} /></button>}
            {item.at ? <span className="msg-time" title={new Date(item.at).toLocaleString()}>{new Date(item.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span> : null}
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
