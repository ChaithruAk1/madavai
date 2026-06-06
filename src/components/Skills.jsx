import { useEffect, useState, createElement } from "react";
import { FolderPlus, FolderUp, Upload, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { bridge } from "../bridge/index.js";

// --- tiny markdown renderer (headings, bold, inline code, bullets, fenced code) ---
function inline(t, k0 = 0) {
  const parts = []; let key = k0, last = 0, m;
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  while ((m = re.exec(t))) {
    if (m.index > last) parts.push(t.slice(last, m.index));
    if (m[2] != null) parts.push(<b key={key++}>{m[2]}</b>);
    else parts.push(<code key={key++} className="sk-ic">{m[3]}</code>);
    last = re.lastIndex;
  }
  if (last < t.length) parts.push(t.slice(last));
  return parts;
}
function renderMd(md) {
  const lines = (md || "").split(/\r?\n/);
  const out = []; let key = 0, inCode = false, code = [], list = null;
  const flushList = () => { if (list) { out.push(<ul key={key++} className="sk-ul">{list}</ul>); list = null; } };
  const flushCode = () => { out.push(<pre key={key++} className="sk-code">{code.join("\n")}</pre>); code = []; };
  for (const line of lines) {
    if (line.trim().startsWith("```")) { if (inCode) { flushCode(); inCode = false; } else { flushList(); inCode = true; } continue; }
    if (inCode) { code.push(line); continue; }
    if (/^#{1,6}\s/.test(line)) { flushList(); const lvl = Math.min(line.match(/^#+/)[0].length + 1, 4); out.push(createElement("h" + lvl, { key: key++, className: "sk-h" }, inline(line.replace(/^#+\s/, "")))); continue; }
    if (/^\s*[-*]\s+/.test(line)) { list = list || []; list.push(<li key={key++}>{inline(line.replace(/^\s*[-*]\s+/, ""))}</li>); continue; }
    if (line.trim() === "") { flushList(); continue; }
    flushList(); out.push(<p key={key++} className="sk-p">{inline(line)}</p>);
  }
  flushList(); if (inCode) flushCode();
  return out;
}

export default function Skills() {
  const [dirs, setDirs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [showFolders, setShowFolders] = useState(false);

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setDirs(cfg.skillsDirs || []);
    const list = await bridge.listSkills();
    setSkills(list);
    return list;
  };
  useEffect(() => { refresh().then((l) => { if (l && l[0]) select(l[0]); }); }, []);

  const select = async (s) => {
    setSel(s); setDetail(null);
    const d = await bridge.readSkill(s.dir);
    setDetail(d);
  };

  const saveDirs = async (next) => {
    const cfg = await bridge.getSettings();
    await bridge.saveSettings({ ...cfg, skillsDirs: next });
    setDirs(next); await refresh();
  };
  const addFolder = async () => { const dir = await bridge.chooseFolder(); if (!dir || dirs.includes(dir)) return; await saveDirs([...dirs, dir]); setStatus(`Added ${dir}`); };
  const removeFolder = async (d) => saveDirs(dirs.filter((x) => x !== d));

  const after = async (r, label) => {
    if (r?.canceled) return;
    if (r?.error) { setStatus(r.error); return; }
    setStatus(`${label}${r.count ? ` (${r.count})` : ""}`);
    const l = await refresh(); if (l && l[0] && !sel) select(l[0]);
  };
  const create = async () => after(await bridge.createSkill(newName || "new-skill"), "Created");
  const importFolder = async () => after(await bridge.importSkillFolder(), "Imported");
  const importZip = async () => after(await bridge.importSkillZip(), "Imported");

  const toggleSkill = async (s) => { await bridge.setSkillEnabled(s.dir, s.enabled === false); await refresh(); };
  const deleteSkill = async (s) => {
    if (!window.confirm(`Delete skill "${s.name}"?\n${s.dir}`)) return;
    const r = await bridge.deleteSkill(s.dir);
    setStatus(r?.error || `Deleted ${s.name}`);
    const l = await refresh(); setSel(null); setDetail(null); if (l && l[0]) select(l[0]);
  };

  const on = sel && sel.enabled !== false;
  const trigger = sel ? "/" + (sel.dir.split(/[\\/]/).pop()) : "";
  const updated = detail && detail.updated ? new Date(detail.updated).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <div className="skills2">
      <aside className="sk-list">
        <div className="sk-list-head">
          <span className="sk-list-title">Skills</span>
          <button className="icon-btn" title="Reload" onClick={() => refresh()}><RefreshCw size={14} /></button>
        </div>
        <div className="nav-label" style={{ paddingLeft: 8 }}>Personal skills</div>
        <div className="sk-items scroll">
          {skills.length === 0 && <div className="sk-empty" style={{ padding: "8px 10px" }}>No skills found.</div>}
          {skills.map((s) => (
            <button key={s.dir} className={`sk-item ${sel && sel.dir === s.dir ? "active" : ""} ${s.enabled === false ? "off" : ""}`} onClick={() => select(s)}>
              {s.name}
            </button>
          ))}
        </div>

        <div className="sk-foot">
          <div className="sk-create">
            <input className="model-search" style={{ marginBottom: 0 }} placeholder="new-skill-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn primary" onClick={create}><Plus size={14} /></button>
          </div>
          <div className="sk-foot-btns">
            <button className="btn" onClick={importFolder}><FolderUp size={13} /> Import folder</button>
            <button className="btn" onClick={importZip}><Upload size={13} /> .zip</button>
            <button className="btn" onClick={() => setShowFolders((v) => !v)}><FolderPlus size={13} /> Folders</button>
          </div>
          {showFolders && (
            <div className="sk-folders">
              {dirs.map((d, i) => (
                <div key={d} className="sk-folder">
                  {i === 0 && <span className="badge">primary</span>}
                  <span className="sk-folder-path" title={d}>{d}</span>
                  <button className="icon-btn" onClick={() => removeFolder(d)}><X size={12} /></button>
                </div>
              ))}
              <button className="btn" onClick={addFolder} style={{ marginTop: 4 }}><FolderPlus size={13} /> Add folder</button>
            </div>
          )}
          {status && <div className="sk-status">{status}</div>}
        </div>
      </aside>

      <section className="sk-detail scroll">
        {!sel ? (
          <div className="sk-empty" style={{ marginTop: 60, textAlign: "center" }}>Select a skill to view its details.</div>
        ) : (
          <div className="sk-detail-inner">
            <div className="sk-detail-head">
              <h2>{sel.name}</h2>
              <span style={{ flex: 1 }} />
              <button className="btn ghost" title={on ? "Disable" : "Enable"} onClick={() => toggleSkill(sel)} style={{ color: on ? "var(--ok)" : "var(--text-2)" }}>
                {on ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
              <button className="btn ghost danger" title="Delete" onClick={() => deleteSkill(sel)}><Trash2 size={15} /></button>
            </div>

            <div className="sk-meta">
              <div><label>Added by</label><span>You</span></div>
              <div><label>Last updated</label><span>{updated}</span></div>
              <div><label>Trigger</label><span>{trigger} + auto</span></div>
            </div>

            <div className="sk-meta-label">Description</div>
            <div className="sk-meta-desc">{sel.description || "(no description)"}</div>

            <div className="sk-card">
              {detail ? renderMd(detail.body) : <div className="sk-empty">Loading…</div>}
            </div>
            <div className="sk-dir">{sel.dir}</div>
          </div>
        )}
      </section>
    </div>
  );
}
