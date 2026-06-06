import { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { bridge } from "../bridge/index.js";

// Left rail of saved conversations for the current mode (Talk / Collaborate / Build).
export default function HistoryRail({ mode, activeId, refreshKey, onOpen, onNew, onDelete }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let live = true;
    bridge.listSessions(mode).then((l) => { if (live) setItems(l || []); }).catch(() => {});
    return () => { live = false; };
  }, [mode, refreshKey]);

  return (
    <aside className="hist-rail">
      <button className="hist-new" onClick={onNew}><Plus size={15} /> New chat</button>
      <div className="hist-list scroll">
        {items.length === 0 && <div className="hist-empty">No saved chats yet.</div>}
        {items.map((it) => (
          <div key={it.id} className={`hist-item ${it.id === activeId ? "active" : ""}`} onClick={() => onOpen(it.id)} title={it.title}>
            <MessageSquare size={13} className="hist-ic" />
            <span className="hist-title">{it.title || "Untitled"}</span>
            <button className="hist-del" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete(it.id); }}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </aside>
  );
}
