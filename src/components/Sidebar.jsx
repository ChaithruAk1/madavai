import { useEffect, useState } from "react";
import { Plus, Puzzle, Plug, Send, BarChart3, FolderKanban, Cpu, Trash2, Search, Settings as SettingsIcon, Bookmark } from "lucide-react";
import { bridge } from "../bridge/index.js";

const TOOLS = [
  { id: "project", label: "Projects", icon: FolderKanban },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "connectors", label: "Connectors", icon: Plug },
  { id: "models", label: "Models", icon: Cpu },
  { id: "dispatch", label: "Deploy", icon: Send },
  { id: "consumption", label: "Consumption", icon: BarChart3 },
];

export default function Sidebar({ active, onSelect, historyMode, activeConvId, refreshKey, onNew, onOpenSession, onDeleteSession }) {
  const [recents, setRecents] = useState([]);
  const [q, setQ] = useState("");
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

      {TOOLS.map((t) => {
        const I = t.icon;
        return (
          <button key={t.id} className={`nav-item ${active === t.id ? "active" : ""}`} onClick={() => onSelect(t.id)}>
            <I size={16} /> <span className="sb-t">{t.label}</span>
          </button>
        );
      })}

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
        <SettingsIcon size={16} /> <span className="sb-t">Se