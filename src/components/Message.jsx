import { LayoutTemplate, Bookmark, BookmarkCheck, Copy } from "lucide-react";
import ToolCard from "./ToolCard.jsx";
import ThinkLogo from "./ThinkLogo.jsx";
import { extractArtifacts } from "../artifacts.js";

// Strip a leading raw-JSON blob some weak models prepend to their reply
// (e.g. {"status":"success","output":""} The folder was created.)
function cleanAssistant(t) {
  if (!t) return t;
  return t.replace(/^\s*\{[^{}]*\}\s*(?=[A-Za-z("'])/, "");
}

export default function Message({ item, streaming, onOpenArtifact, userName, onSave, saved }) {
  if (item.type === "tool") {
    return <ToolCard {...item} />;
  }
  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  const artifacts = isUser || streaming ? [] : extractArtifacts(item.text);
  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar"><ThinkLogo size={28} /></div>}
      <div className="body">
        <div className="who">
          {isUser ? (userName || "You") : "BrainEdge"}
          {!isUser && item.meta && (item.meta.model || item.meta.provider) && (
            <span className="msg-model" title="The provider & model the backend actually used for this response">
              {" · "}{item.meta.provider || item.meta.kind}{item.meta.model ? ` · ${item.meta.model}` : ""}
            </span>
          )}
        </div>
        {isUser && Array.isArray(item.images) && item.images.length > 0 && (
          <div className="msg-images">
            {item.images.map((im, i) => <img key={i} src={im.dataUrl} alt={im.name || ""} />)}
          </div>
        )}
        <div className="content">
          {text}
          {streaming && <span className="cursor" />}
        </div>
        {artifacts.map((a, i) => (
          <span key={i} className="artifact-pill" onClick={() => onOpenArtifact && onOpenArtifact(a)}>
            <LayoutTemplate size={13} /> Open {a.title}
          </span>
        ))}
        {!isUser && !streaming && (text || "").trim() && (
          <div className="msg-actions">
            {onSave && (
              <button className={`msg-act ${saved ? "on" : ""}`} onClick={onSave} title={saved ? "Saved to library — click to remove" : "Save this response to your library"}>
                {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {saved ? "Saved" : "Save"}
              </button>
            )}
            <button className="msg-act" onClick={() => { try { navigator.clipboard.writeText(text); } catch {} }} title="Copy response">
              <Copy size={14} /> Copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
