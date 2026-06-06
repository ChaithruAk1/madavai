import { Puzzle, Plug, Send, Settings as SettingsIcon } from "lucide-react";

const TOOLS = [
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "dispatch", label: "Dispatch", icon: Send },
];

export default function Sidebar({ active, onSelect }) {
  return (
    <aside className="sidebar glass slim">
      <div className="nav-label">Tools</div>
      {TOOLS.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={16} /> {t.label}
          </button>
        );
      })}

      <div className="sidebar-spacer" />

      <button className={`nav-item ${active === "settings" ? "active" : ""}`} onClick={() => onSelect("settings")}>
        <SettingsIcon size={16} /> Settings
      </button>
    </aside>
  );
}
