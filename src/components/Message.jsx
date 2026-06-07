import { useState, useRef, useEffect } from "react";
import { LayoutTemplate, Copy, MoreHorizontal } from "lucide-react";
import ToolCard from "./ToolCard.jsx";
import ThinkLogo from "./ThinkLogo.jsx";
import { extractArtifacts } from "../artifacts.js";

// Strip a leading raw-JSON blob some weak models prepend to their reply
// (e.g. {"status":"success","output":""} The folder was created.)
function cleanAssistant(t) {
  if (!t) return t;
  return t.replace(/^\s*\{[^{}]*\}\s*(?=[A-Za-z("'])/, "");
}

export default function Message({ item, streaming, onOpenArtifact, userName }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const actRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => { if (actRef.current && !actRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);
  if (item.type === "tool") {
    return <ToolCard {...item} />;
  }
  const isUser = item.role === "user";
  const text = isUser ? item.text : cleanAssistant(item.text);
  const artifacts = isUser || streaming ? [] : extractArtifacts(item.text);
  return (
    <div className={`msg ${isUser ? "user" : "assistant"}`}>
      {!isUser && <div className="avatar"><ThinkLogo size={28} animated={false} /></div>}
      <div className="body">
        <div className="who">{isUser ? (userName || "You") : "BrainEdge"}</div>
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
          <div className="msg-actions" ref={actRef}>
            <button className={`msg-act ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen((o) => !o)} title="More">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className="msg-menu">
                <button className="msg-menu-item" onClick={() => { try { navigator.clipboard.writeText(text); } catch {} setMenuOpen(false); }}>
                  <Copy size={14} /> Copy response
                </button>
                {item.meta && (item.meta.model || item.meta.provider) && (
                  <>
                    <div className="msg-menu-sep" />
                    <div className="msg-menu-info">{item.meta.provider || item.meta.kind}{item.meta.model ? ` · ${item.meta.model}` : ""}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
