import { useEffect, useState, createElement } from "react";
import { FolderPlus, FolderUp, Upload, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { bridge, isWeb } from "../bridge/index.js";
import { madavConfirm } from "../dialogs.jsx";

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
  const [deskRec, setDeskRec] = useState(false); // desktop Flow Recorder live?
  const [showFolders, setShowFolders] = useState(false);
  const [drafts, setDrafts] = useState([]); // Skill Forge: learned drafts awaiting approval

  // Honest signposting on web: skill folders live on a real disk, which a browser can't manage.
  const webNote = isWeb ? "Built-in skill packs work right here. Your own skill folders, import and creation need the desktop app — the browser can't manage files on your computer." : "";

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setDirs(cfg.skillsDirs || []);
    const list = await bridge.listSkills();
    setSkills(list);
    try { setDrafts(bridge.forgeList ? (await bridge.forgeList()) || [] : []); } catch {}
    return list;
  };
  const approveDraft = async (d) => {
    const r = await bridge.forgeApprove(d.name);
    setStatus(r?.error || `Skill "${d.name}" approved — it's live now`);
    await refresh();
  };
  const discardDraft = async (d) => { await bridge.forgeDiscard(d.name); await refresh(); };
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
    if (!(await madavConfirm(`Delete skill "${s.name}"?\n${s.dir}`, { okLabel: "Delete" }))) return;
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
        {webNote && <div className="ag-hint" style={{ padding: "0 8px 8px", fontSize: 11.5 }}>🖥️ {webNote}</div>}
        {!isWeb && bridge.recordFlowStart && (
          <button className="btn" style={{ margin: "0 8px 8px", fontSize: 12.5 }}
            title="Show Madav a workflow once: a browser window opens, you do the task by hand, close the window — Madav drafts a skill from what it watched (you approve it below). Credential fields are never recorded."
            onClick={async () => { await bridge.recordFlowStart(); setStatus("Recording — do the workflow in the new window, then CLOSE it. A draft will appear below (give it ~30s after closing)."); }}>
            ⏺ Record a web workflow → skill
          </button>
        )}
        {!isWeb && bridge.recordDesktopStart && (
          <button className={`btn ${deskRec ? "primary" : ""}`} style={{ margin: "0 8px 8px", fontSize: 12.5 }}
            title="Show Madav a workflow in your real Windows apps: start, do the task by hand in any application, then stop — Madav drafts a skill from the buttons you clicked and fields you filled (credential fields are never recorded). Replays need the Desktop capability."
            onClick={async () => {
              if (!deskRec) { const r = await bridge.recordDesktopStart(); setDeskRec(!!(r && r.recording)); setStatus(r && r.error ? r.error : "Recording your desktop — do the workflow in any app, then press Stop here."); }
              else { setStatus("Distilling what you showed…"); const r = await bridge.recordDesktopStop(); setDeskRec(false); setStatus((r && (r.note || r.error)) || "stopped"); setTimeout(refresh, 4000); }
            }}>
            {deskRec ? "■ Stop desktop recording" : "⏺ Record a desktop workflow → skill"}
          </button>
        )}
        <div className="nav-label" style={{ paddingLeft: 8 }}>Personal skills</div>
        <div className="sk-items scroll">
          {skills.length === 0 && <div className="sk-empty" style={{ padding: "8px 10px" }}>No skills found.</div>}
          {skills.map((s) => (
            <button key={s.dir} className={`sk-item ${sel && sel.dir === s.dir ? "active" : ""} ${s.enabled === false ? "off" : ""}`} onClick={() => select(s)}>
              {s.name}
            </button>
          ))}
        </div>

        {drafts.length > 0 && (
          <>
            <div className="nav-label" style={{ paddingLeft: 8 }}>Learned drafts — your approval needed</div>
            <div className="sk-items">
              {drafts.map((d) => (
                <div key={d.name} className="sk-item" style={{ display: "block", cursor: "default" }} title={d.description}>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-2)", margin: "2px 0 6px" }}>{d.description}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 6 }}>Madav noticed {d.evidence?.length || 0} similar tasks and drafted this.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => approveDraft(d)}>Approve</button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => discardDraft(d)}>Discard</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

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
              {sel.bundled ? (
                <span className="badge" title="Ships with Madav — read-only here">built-in</span>
              ) : (<>
                <button className="btn ghost" title={on ? "Disable" : "Enable"} onClick={() => toggleSkill(sel)} style={{ color: on ? "var(--ok)" : "var(--text-2)" }}>
                  {on ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <button className="btn ghost danger" title="Delete" onClick={() => deleteSkill(sel)}><Trash2 size={15} /></button>
              </>)}
            </div>

            <div className="sk-meta">
              <div><label>Added by</label><span>{sel.bundled ? "Madav (built-in)" : "You"}</span></div>
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
