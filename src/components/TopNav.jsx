import ThinkLogo from "./ThinkLogo.jsx";
import { MODES } from "../bridge/contract.js";

const ORDER = ["chat", "cowork", "code"];

export default function TopNav({ mode, onSelect, online, loc }) {
  const tabs = ORDER.map((id) => MODES.find((m) => m.id === id)).filter(Boolean);
  const dot = online === null ? "var(--text-2)" : online ? "var(--ok)" : "var(--danger)";
  return (
    <header className="topnav glass">
      <div className="tn-brand">
        <ThinkLogo size={46} />
        <div className="tn-brandtext">
          <span className="tn-name">Thinkflux</span>
          <span className="tn-by">by Chaithrodaya Sukruth</span>
        </div>
      </div>

      <nav className="tn-tabs">
        {tabs.map((m) => (
          <button key={m.id} className={`tn-tab ${mode === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>{m.label}</button>
        ))}
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
