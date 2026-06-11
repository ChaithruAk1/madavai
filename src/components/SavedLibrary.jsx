import { useEffect, useState } from "react";
import { Bookmark, Trash2, Copy, Search, MessageSquare, Tag, Save } from "lucide-react";
import { bridge } from "../bridge/index.js";

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() - ts, day = 86400000;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < day) return Math.floor(d / 3600000) + "h ago";
  if (d < 7 * day) return Math.floor(d / day) + "d ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SavedLibrary({ onOpenSession }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ note: "", tags: "" });

  const load = async () => setItems(await bridge.listSaved());
  useEffect(() => { load(); }, []);

  const remove = async (id) => { await bridge.removeSaved(id); load(); };
  const startEdit = (it) => { setEditId(it.id); setDraft({ note: it.note || "", tags: (it.tags || []).join(", ") }); };
  const saveEdit = async (id) => {
    await bridge.updateSaved(id, { note: draft.note.trim(), tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean) });
    setEditId(null); load();
  };

  const shown = items.filter((it) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (it.text || "").toLowerCase().includes(s) || (it.question || "").toLowerCase().includes(s) ||
      (it.note || "").toLowerCase().includes(s) || (it.tags || []).some((t) => t.toLowerCase().includes(s));
  });

  return (
    <div className="pj scroll">
      <div className="pj-head">
        <h1 className="pj-title"><Bookmark size={20} style={{ verticalAlign: "-3px", marginRight: 8 }} />Saved</h1>
        <div className="pj-actions">
          <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved responses…" /></div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="pjd-files-empty" style={{ marginTop: 20 }}>
          {items.length === 0 ? "No saved responses yet. Hover any Madav reply and click Save to keep it here." : "No matches."}
        </div>
      ) : (
        <div className="sv-list">
          {shown.map((it) => (
            <div key={it.id} className="sv-card">
              <div className="sv-meta">
                <span className="sv-time">{rel(it.createdAt)}</span>
                {it.meta && (it.meta.provider || it.meta.model) && <span className="mo-sub">{it.meta.provider || it.meta.kind}{it.meta.model ? ` · ${it.meta.model}` : ""}</span>}
                <span style={{ flex: 1 }} />
                {it.convId && onOpenSession && <button className="btn ghost" title="Open source chat" onClick={() => onOpenSession(it.convId)} style={{ padding: "3px 7px" }}><MessageSquare size={13} /></button>}
                <button className="btn ghost" title="Copy" onClick={() => { try { navigator.clipboard.writeText(it.text || ""); } catch {} }} style={{ padding: "3px 7px" }}><Copy size={13} /></button>
                <button className="btn ghost danger" title="Delete" onClick={() => remove(it.id)} style={{ padding: "3px 7px" }}><Trash2 size={13} /></button>
              </div>

              {it.question && <div className="sv-q">{it.question}</div>}
              <div className="sv-text">{it.text}</div>

              {editId === it.id ? (
                <div className="sv-edit">
                  <input className="model-search" placeholder="Note…" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                  <input className="model-search" placeholder="tags, comma, separated" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn primary" onClick={() => saveEdit(it.id)}><Save size={13} /> Save</button>
                    <button className="btn" onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="sv-foot">
                  {(it.tags || []).map((t) => <span key={t} className="sv-tag"><Tag size={10} /> {t}</span>)}
                  {it.note && <span className="sv-note">{it.note}</span>}
                  <button className="slash-link" onClick={() => startEdit(it)}>{it.note || (it.tags || []).length ? "Edit note / tags" : "Add note / tags"}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
