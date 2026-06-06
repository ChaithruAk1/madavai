import ThinkLogo from "./ThinkLogo.jsx";
import { MODES } from "../bridge/contract.js";

const ORDER = ["chat", "cowork", "code"];

export default function TopNav({ mode, onSelect }) {
  const tabs = ORDER.map((id) => MODES.find((m) => m.id === id)).filter(Boolean);
  return (
    <header className="topnav glass">
      <div className="tn-brand">
        <ThinkLogo size={30} />
        <span className="tn-name">Thinkflux</span>
      </div>

      <nav className="tn-tabs">
        {tabs.map((m) => (
          <button key={m.id} className={`tn-tab ${mode === m.id ? "active" : ""}`} onClick={() => onSelect(m.id)}>{m.label}</button>
        ))}
      </nav>

      <div className="tn-right" />
    </header>
  );
}
