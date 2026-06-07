import { useEffect, useState } from "react";
import { Plus, Puzzle, Plug, Send, BarChart3, FolderKanban, Cpu, Trash2, Search, Settings as SettingsIcon, Blocks, LayoutGrid, ChevronDown, ChevronRight, SlidersHorizontal, List, Gauge, Clock } from "lucide-react";
import { bridge } from "../bridge/index.js";

const TOP = [
  { id: "project", label: "Projects", icon: FolderKanban },
];
const INTERFACE = [
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "plugins", label: "Plugins", icon: Blocks },
  { id: "viamobile", label: "Via Mobile", icon: Send },
];
const MODELS = [
  { id: "models", label: "Model configuration", icon: SlidersHorizontal },
  { id: "models-overview", label: "Models overview", icon: List },
  { id: "models-speed", label: "Models speed check", icon: Gauge },
];
const BOTTOM = [
  { id: "scheduler", label: "Scheduler", icon: Clock },
  { id: "consumption", label: "Consumption", icon: BarChart3 },
];

export default function Sidebar({ active, onSelect, historyMode, activeConvId, refreshKey, onNew, onOpenSession, onDeleteSession }) {
  const [recents, setRecents] = useState([]);
  const [q, setQ] = useState("");
  const [ifaceOpen, setIfaceOpen] = useState(true);
  const [modelsOpen, setModelsOpen] = useState(false);
  const navBtn = (t) => {
    const I = t.icon;
    return (
      <button key={t.id} className={`nav-item ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
        <I size={16} /> <span className="sb-t">{t.label}</span>
      </button>
    );
  };
  useEffect(() => {
    let live = true;
    bridge.listSessions(historyMode).then((l) => { if (live) setRecents(l || []); }).catch(() => {});
    return () => { live = false; };
  }, [historyMode, refreshKey]);

  const newLabel = historyMode === "chat" ? "New chat" : "New task";
  const shown = q ? recents.filter((it) => (it.title || "").toLowerCase().includes(q.toLowerCase())) : recents;

  return (
    <aside className="sidebar glass">
      <button className="sb-new" onClick={onNew}><Plus size={16} /> <span className="sb-t">{newLabel}</span></button>

      {TOP.map(navBtn)}

      <button className={`nav-item nav-group ${INTERFACE.some((t) => t.id === active) ? "active-within" : ""}`} onClick={() => setIfaceOpen((o) => !o)}>
        <LayoutGrid size={16} /> <span className="sb-t">Interface</span>
        <span className="nav-caret sb-t">{ifaceOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {ifaceOpen && INTERFACE.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item nav-sub ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={15} /> <span className="sb-t">{t.label}</span>
          </button>
        );
      })}

      <button className={`nav-item nav-group ${MODELS.some((t) => t.id === active) ? "active-within" : ""}`} onClick={() => setModelsOpen((o) => !o)}>
        <Cpu size={16} /> <span className="sb-t">Models</span>
        <span className="nav-caret sb-t">{modelsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
      {modelsOpen && MODELS.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item nav-sub ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={15} /> <span className="sb-t">{t.label}</span>
          </button>
        );
      })}

      {BOTTOM.map(navBtn)}

      <div className="sb-expand">
        <div className="nav-label" style={{ marginTop: 10 }}>Recents</div>
        <div className="sb-search">
          <Search size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats…" />
        </div>
        <div className="sb-recents scroll">
          {recents.length === 0 && <div className="sb-empty">No saved chats yet.</div>}
          {recents.length > 0 && shown.length === 0 && <div className="sb-empty">No matches.</div>}
          {shown.map((it) => (
            <div key={it.id} className={`sb-rec ${it.id === activeConvId ? "active" : ""}`} onClick={() => onOpenSession(it.id)} title={it.title}>
              <span className="sb-rec-title">{it.title || "Untitled"}</span>
              <button className="sb-rec-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDeleteSession(it.id); }}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>

      <button className={`nav-item ${active === "settings" ? "active" : ""}`} onClick={() => onSelect("settings")}>
        <SettingsIcon size={16} /> <span className="sb-t">Settings</span>
      </button>
      <div className="sb-copyright sb-t">© 2026 BrainEdge · Proprietary</div>
    </aside>
  );
}
