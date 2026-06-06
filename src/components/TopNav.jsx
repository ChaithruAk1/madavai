import ThinkLogo from "./ThinkLogo.jsx";
import { MessageCircle, Users, Hammer, PanelLeft } from "lucide-react";
import { MODES } from "../bridge/contract.js";

const ORDER = ["chat", "cowork", "code"];
const ICONS = { chat: MessageCircle, cowork: Users, code: Hammer };

export default function TopNav({ mode, onSelect, online, loc, sidebarOpen, onToggleSidebar }) {
  const tabs = ORDER.map((id) => MODES.find((m) => m.id === id)).filter(Boolean);
  const dot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  return (
    <header className="topnav glass">
      <button className="tn-collapse" onClick={onToggleSidebar} title={(sidebarOpen ? "Collapse" : "Expand") + " sidebar (Ctrl+B)"}><PanelLeft size={18} /></button>
      <div className="tn-brand">
        <ThinkLogo size={38} />
        <div className="tn-brandtext">
          <span className="tn-name">BrainEdge</span>
          <span className="tn-by">by Chaithrodaya Sukruth</span>
        </div>
      </div>

      <nav className="tn-tabs">
        {tabs.map((m) => {
          const I = ICONS[m.id];
          return (
            <button key={m.id} className={`tn-tab ${mode === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>
              {I && <I size={15} className="tn-tabicon" />}<span>{m.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="tn-right">
        <span className="chip tn-status" title={`Active model is ${online === null ? "checking…" : online ? "online" : "offline"}`}>
          <span className="tn-statusdot" style={{ background: dot, boxShadow: online ? "0 0 7px var(--ok)" : "none" }} />
          {loc || (online ? "online" : "offline")}
        </span>
      </div>
    </header>
  );
}
