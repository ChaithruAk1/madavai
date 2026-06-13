// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// PLAYBOOK (formerly "Skills") — every move Madav has learned, presented as PLAYS.
// Original anatomy (not a list+detail clone): a TEACH strip (record web / record
// desktop / write / import), an approval strip for forged drafts, then a play WALL
// of cards; clicking a card drills into a full-page reader (ModelConfig drill-in
// convention). Engine contract unchanged: listSkills/readSkill/setSkillEnabled/
// deleteSkill/createSkill/import*, forgeList/Approve/Discard, recorders.
import { useEffect, useState, createElement } from "react";
import { FolderPlus, FolderUp, Upload, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, X, ArrowLeft, Search, Globe, AppWindow, PenLine, Package, Sparkles, BookOpen } from "lucide-react";
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

// Deterministic glyph per play — same hash trick as agent/room identities.
const PLAY_GLYPHS = ["⚡", "🧭", "📋", "🔁", "🧪", "✉️", "📊", "🗂️", "🔍", "🛠️", "📝", "🌐", "🎯", "🧮", "🪄", "📦"];
const hashS = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const glyphFor = (name) => PLAY_GLYPHS[hashS(name || "play") % PLAY_GLYPHS.length];

export default function Skills() {
  const [dirs, setDirs] = useState([]);
  const [skills, setSkills] = useState([]);
  const [sel, setSel] = useState(null);       // open play (drill-in reader), or null = the wall
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [writing, setWriting] = useState(false); // "Write a play" tile expanded
  const [status, setStatus] = useState("");
  const [deskRec, setDeskRec] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [drafts, setDrafts] = useState([]);

  const webNote = isWeb ? "Built-in packs work right here. Recording, importing and writing your own plays need the desktop app — the browser can't manage files on your computer." : "";

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setDirs(cfg.skillsDirs || []);
    const list = await bridge.listSkills();
    setSkills(list);
    try { setDrafts(bridge.forgeList ? (await bridge.forgeList()) || [] : []); } catch {}
    return list;
  };
  useEffect(() => { refresh(); }, []);

  const open = async (s) => { setSel(s); setDetail(null); setDetail(await bridge.readSkill(s.dir)); };
  const back = () => { setSel(null); setDetail(null); };

  const approveDraft = async (d) => { const r = await bridge.forgeApprove(d.name); setStatus(r?.error || `"${d.name}" approved — it's in the playbook now`); await refresh(); };
  const discardDraft = async (d) => { await bridge.forgeDiscard(d.name); await refresh(); };

  const saveDirs = async (next) => {
    const cfg = await bridge.getSettings();
    await bridge.saveSettings({ ...cfg, skillsDirs: next });
    setDirs(next); await refresh();
  };
  const addFolder = async () => { const dir = await bridge.chooseFolder(); if (!dir || typeof dir !== "string" || dirs.includes(dir)) return; await saveDirs([...dirs, dir]); setStatus(`Added ${dir}`); };
  const removeFolder = async (d) => saveDirs(dirs.filter((x) => x !== d));

  const after = async (r, label) => {
    if (r?.canceled) return;
    if (r?.error) { setStatus(r.error); return; }
    setStatus(`${label}${r.count ? ` (${r.count})` : ""}`);
    await refresh();
  };
  const create = async () => { if (!newName.trim()) return; await after(await bridge.createSkill(newName.trim()), "Created"); setNewName(""); setWriting(false); };
  const importFolder = async () => after(await bridge.importSkillFolder(), "Imported");
  const importZip = async () => after(await bridge.importSkillZip(), "Imported");

  const toggleSkill = async (s) => { await bridge.setSkillEnabled(s.dir, s.enabled === false); if (sel && sel.dir === s.dir) setSel({ ...s, enabled: s.enabled === false }); await refresh(); };
  const deleteSkill = async (s) => {
    if (!(await madavConfirm(`Delete "${s.name}" from the playbook?\n${s.dir}`, { okLabel: "Delete" }))) return;
    const r = await bridge.deleteSkill(s.dir);
    setStatus(r?.error || `Deleted ${s.name}`);
    back(); await refresh();
  };

  // ---------- DRILL-IN READER ----------
  if (sel) {
    const on = sel.enabled !== false;
    const trigger = "/" + (sel.dir.split(/[\\/]/).pop());
    const updated = detail && detail.updated ? new Date(detail.updated).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
    return (
      <div className="pb2 scroll">
        <div className="pb2-inner">
          <button className="pj-back" onClick={back}><ArrowLeft size={15} /> All plays</button>
          <div className="pb2-readhead">
            <span className="pb2-glyph" style={{ fontSize: 26 }}>{glyphFor(sel.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="pb2-readtitle">{sel.name}</h1>
              <div className="mo-sub">{sel.bundled ? "Ships with Madav · read-only" : "Yours"} · updated {updated} · trigger <code className="sk-ic">{trigger}</code> or automatic when a task matches</div>
            </div>
            {!sel.bundled && (<>
              <button className="btn ghost" title={on ? "Benched: click to disable" : "Click to enable"} onClick={() => toggleSkill(sel)} style={{ color: on ? "var(--ok)" : "var(--text-2)" }}>
                {on ? <ToggleRight size={20} /> : <ToggleLeft size={20} />} {on ? "In play" : "Benched"}
              </button>
              <button className="btn ghost danger" title="Delete this play" onClick={() => deleteSkill(sel)}><Trash2 size={15} /></button>
            </>)}
          </div>
          {sel.description && <p className="pb2-readdesc">{sel.description}</p>}
          <div className="sk-card">
            {detail ? renderMd(detail.body) : <div className="sk-empty">Loading…</div>}
          </div>
          <div className="sk-dir">{sel.dir}</div>
        </div>
      </div>
    );
  }

  // ---------- THE PLAYBOOK (wall) ----------
  const shown = skills.filter((s) => !q || (s.name + " " + (s.description || "")).toLowerCase().includes(q.toLowerCase()));
  const packs = shown.filter((s) => s.bundled);
  const own = shown.filter((s) => !s.bundled);

  const Tile = ({ icon: I, title, sub, onClick, active, children }) => (
    <div className={`pb2-tile ${active ? "on" : ""}`} onClick={onClick} role="button" tabIndex={0}>
      <span className="pb2-tileic"><I size={18} /></span>
      <span className="pb2-tilet">{title}</span>
      <span className="pb2-tiles">{sub}</span>
      {children}
    </div>
  );

  const Card = (s) => (
    <button key={s.dir} className={`pb2-card ${s.enabled === false ? "off" : ""}`} onClick={() => open(s)} title={s.description || s.name}>
      <span className="pb2-glyph">{glyphFor(s.name)}</span>
      <span className="pb2-cardname">{s.name}</span>
      <span className="pb2-carddesc">{s.description || "No description yet"}</span>
      <span className="pb2-cardmeta">
        {s.bundled && <span className="badge">pack</span>}
        {s.enabled === false && <span className="badge" style={{ color: "var(--danger)" }}>benched</span>}
        <code className="sk-ic">/{s.dir.split(/[\\/]/).pop()}</code>
      </span>
    </button>
  );

  return (
    <div className="pb2 scroll">
      <div className="pb2-inner">
        <div className="pj-head" style={{ maxWidth: "none" }}>
          <div>
            <h1 className="pj-title">Playbook</h1>
            <p style={{ color: "var(--text-2)", fontSize: 13, margin: "4px 0 0" }}>Every move Madav has learned — it runs a play automatically when a task matches, or when you call it with /name. Agents with the Skills capability use the whole book.</p>
          </div>
          <div className="pj-actions">
            <button className="icon-btn" title="Reload" onClick={() => refresh()}><RefreshCw size={15} /></button>
            <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plays…" /></div>
            <button className="btn ghost" onClick={() => setShowFolders((v) => !v)}><FolderPlus size={14} /> Folders</button>
          </div>
        </div>
        {webNote && <div className="ag-hint" style={{ marginBottom: 10 }}>🖥️ {webNote}</div>}
        {showFolders && (
          <div className="sk-folders" style={{ marginBottom: 12 }}>
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

        {/* TEACH STRIP — four ways Madav learns a new play */}
        <div className="wr-sechead" style={{ margin: "4px 0 8px" }}><Sparkles size={13} /> Teach Madav a new play</div>
        <div className="pb2-teach">
          {!isWeb && bridge.recordFlowStart && (
            <Tile icon={Globe} title="Record on the web" sub="Do it once in a browser window; close it — Madav drafts the play."
              onClick={async () => { await bridge.recordFlowStart(); setStatus("Recording — do the workflow in the new window, then CLOSE it. The draft appears here (~30s after closing)."); }} />
          )}
          {!isWeb && bridge.recordDesktopStart && (
            <Tile icon={AppWindow} title={deskRec ? "■ Stop desktop recording" : "Record on the desktop"} active={deskRec}
              sub={deskRec ? "Recording your apps — click to stop and draft." : "Do it once in your real Windows apps; stop — Madav drafts the play."}
              onClick={async () => {
                if (!deskRec) { const r = await bridge.recordDesktopStart(); setDeskRec(!!(r && r.recording)); setStatus(r && r.error ? r.error : "Recording your desktop — do the workflow in any app, then Stop here."); }
                else { setStatus("Distilling what you showed…"); const r = await bridge.recordDesktopStop(); setDeskRec(false); setStatus((r && (r.note || r.error)) || "stopped"); setTimeout(refresh, 4000); }
              }} />
          )}
          {!isWeb && (
            <Tile icon={PenLine} title="Write it by hand" sub="A named SKILL.md you fill in yourself." onClick={() => setWriting((v) => !v)} active={writing}>
              {writing && (
                <span style={{ display: "flex", gap: 6, marginTop: 8, width: "100%" }} onClick={(e) => e.stopPropagation()}>
                  <input className="model-search" style={{ flex: 1, marginBottom: 0, fontSize: 12.5 }} placeholder="play-name" value={newName} autoFocus
                    onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
                  <button className="btn primary" style={{ padding: "4px 10px" }} onClick={create}><Plus size={13} /></button>
                </span>
              )}
            </Tile>
          )}
          {!isWeb && (
            <Tile icon={Package} title="Import" sub="A skill folder or .zip from anywhere.">
              <span style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={importFolder}><FolderUp size={13} /> Folder</button>
                <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={importZip}><Upload size={13} /> .zip</button>
              </span>
            </Tile>
          )}
        </div>
        {status && <div className="sk-status" style={{ margin: "8px 0" }}>{status}</div>}

        {/* APPROVAL STRIP — plays Madav drafted on its own (Skill Forge + recorders) */}
        {drafts.length > 0 && (
          <>
            <div className="wr-sechead" style={{ margin: "14px 0 8px", color: "var(--accent)" }}><BookOpen size={13} /> Drafted by Madav — your approval needed</div>
            <div className="pb2-drafts">
              {drafts.map((d) => (
                <div key={d.name} className="pb2-draft">
                  <div style={{ fontWeight: 650 }}>{glyphFor(d.name)} {d.name}</div>
                  <div className="mo-sub" style={{ margin: "3px 0 6px" }}>{d.description}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 8 }}>Madav noticed {d.evidence?.length || 0} similar tasks and drafted this play.</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn primary" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => approveDraft(d)}>Approve</button>
                    <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => discardDraft(d)}>Discard</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* THE WALL */}
        {own.length > 0 && <div className="wr-sechead" style={{ margin: "16px 0 8px" }}>Your plays · {own.length}</div>}
        {own.length > 0 && <div className="pb2-wall">{own.map(Card)}</div>}
        {packs.length > 0 && <div className="wr-sechead" style={{ margin: "16px 0 8px" }}>Built-in packs · {packs.length}</div>}
        {packs.length > 0 && <div className="pb2-wall">{packs.map(Card)}</div>}
        {shown.length === 0 && <div className="sk-empty" style={{ marginTop: 24 }}>{q ? "No play matches that search." : "The playbook is empty — teach Madav its first play above."}</div>}
      </div>
    </div>
  );
}
