import { useEffect, useState } from "react";
import { Plus, Trash2, FileText, FileUp, MessageSquare, Github, FolderInput, RefreshCw, Search, ArrowUpDown, ArrowLeft, Send, Users } from "lucide-react";
import { bridge } from "../bridge/index.js";
import Composer from "./Composer.jsx";

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() - ts, day = 86400000;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < day) return Math.floor(d / 3600000) + "h ago";
  if (d < 7 * day) return Math.floor(d / day) + " days ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProjectsBrowser({ onOpen, onStartChat, onStartCowork }) {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("list");      // list | detail
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", desc: "" });
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("date");   // date | name

  const [selId, setSelId] = useState(null);
  const [project, setProject] = useState(null);
  const [convs, setConvs] = useState([]);
  const [instr, setInstr] = useState("");
  const [knText, setKnText] = useState("");
  const [ghUrl, setGhUrl] = useState("");
  const [src, setSrc] = useState("");
  const [chat, setChat] = useState("");
  const [pmode, setPmode] = useState("chat");   // chat | cowork

  const loadList = async () => setProjects(await bridge.listProjects());
  useEffect(() => { loadList(); }, []);

  const open = async (id) => {
    const p = await bridge.getProject(id);
    setSelId(id); setProject(p); setInstr(p?.instructions || ""); setSrc(""); setGhUrl(""); setChat("");
    setConvs(await bridge.listConversations(id));
    setView("detail");
  };
  const back = () => { setView("list"); setProject(null); setSelId(null); loadList(); };
  const refreshProject = async () => { const p = await bridge.getProject(selId); setProject(p); };

  const doCreate = async () => {
    const p = await bridge.createProject(draft.name.trim() || "Untitled project");
    if (draft.desc.trim()) await bridge.updateProject(p.id, { instructions: draft.desc.trim() });
    setCreating(false); setDraft({ name: "", desc: "" });
    await loadList(); open(p.id);
  };
  const saveInstr = async () => { await bridge.updateProject(selId, { instructions: instr }); };
  const delProject = async () => {
    if (!window.confirm(`Delete project "${project.name}" and all its conversations?`)) return;
    await bridge.deleteProject(selId); back();
  };

  const linkFolder = async () => { const r = await bridge.linkProjectFolder(selId); if (r?.folder) { setSrc(""); refreshProject(); } };
  const linkGithub = async () => { if (!ghUrl.trim()) return; setSrc("Cloning…"); const r = await bridge.linkGithub(selId, ghUrl.trim()); if (r?.error) setSrc("Error: " + r.error); else { setSrc(""); setGhUrl(""); refreshProject(); } };
  const pull = async () => { setSrc("Pulling…"); const r = await bridge.pullGithub(selId); setSrc(r?.error ? "Error: " + r.error : "Updated from GitHub"); };
  const unlinkSrc = async () => { await bridge.unlinkProjectSource(selId); setSrc(""); refreshProject(); };
  const addText = async () => { if (!knText.trim()) return; await bridge.addKnowledgeText(selId, "Note", knText.trim()); setKnText(""); refreshProject(); };
  const addFile = async () => { const r = await bridge.addKnowledgeFile(selId); if (!r?.error) refreshProject(); };
  const removeKn = async (knId) => { await bridge.removeKnowledge(selId, knId); refreshProject(); };

  const startChat = async () => {
    const text = chat.trim();
    if (!text) return;
    if (pmode === "cowork") { onStartCowork && onStartCowork(project, text); return; }
    if (onStartChat) onStartChat(project, text);
    else { const c = await bridge.createConversation(selId); onOpen(project, c); }
  };
  const newBlank = async () => { const c = await bridge.createConversation(selId); onOpen(project, c); };
  const delConv = async (id) => { await bridge.deleteConversation(id); setConvs(await bridge.listConversations(selId)); };

  // ---------- DETAIL ----------
  if (view === "detail" && project) {
    const kn = project.knowledge || [];
    return (
      <div className="pjd scroll">
        <button className="pj-back" onClick={back}><ArrowLeft size={15} /> All projects</button>
        <div className="pjd-grid">
          <div className="pjd-main">
            <div className="pjd-titlewrap">
              <h1 className="pjd-title">{project.name}</h1>
              <button className="icon-btn danger" title="Delete project" onClick={delProject}><Trash2 size={15} /></button>
            </div>

            <Composer mode="project" busy={false} onSend={(text) => onStartChat && onStartChat(project, text)} onStop={() => {}} />
            <button className="pjd-cowork" onClick={() => onStartCowork && onStartCowork(project)}>
              <Users size={15} /> Start a task in Cowork
            </button>

            <div className="pjd-convs">
              {convs.length === 0 ? (
                <div className="pjd-convs-empty">Start a chat to keep conversations organized and re‑use this project's knowledge.</div>
              ) : convs.map((c) => (
                <div key={c.id} className="pjd-conv" onClick={() => onOpen(project, c)}>
                  <MessageSquare size={14} style={{ color: "var(--accent)" }} />
                  <span className="pjd-conv-title">{c.title || "Conversation"}</span>
                  <span className="mo-sub">{c.count || 0} msgs</span>
                  <button className="btn ghost" onClick={(e) => { e.stopPropagation(); delConv(c.id); }} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <aside className="pjd-rail">
            <div className="pjd-railsec">
              <div className="pjd-railhead">Instructions</div>
              <p className="mo-sub" style={{ margin: "0 0 8px" }}>Tailors BrainEdge's responses across every chat in this project.</p>
              <textarea className="model-search" rows={5} style={{ resize: "vertical", fontFamily: "inherit", width: "100%" }}
                placeholder="Tone, role, rules, context to always remember…" value={instr}
                onChange={(e) => setInstr(e.target.value)} onBlur={saveInstr} />
            </div>

            <div className="pjd-railsec">
              <div className="pjd-railhead">Files &amp; sources</div>
              {project.folder ? (
                <div className="folder-bar" style={{ borderRadius: 10, border: "1px solid var(--line)", marginBottom: 10 }}>
                  {project.githubUrl ? <Github size={14} /> : <FolderInput size={14} />}
                  <span className="path" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{project.folder}</span>
                  {project.githubUrl && <button className="btn ghost" onClick={pull} title="git pull" style={{ padding: "4px 7px" }}><RefreshCw size={13} /></button>}
                  <button className="btn ghost danger" onClick={unlinkSrc} style={{ padding: "4px 8px" }}>Unlink</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <button className="btn" onClick={linkFolder}><FolderInput size={14} /> Link folder</button>
                </div>
              )}
              {!project.folder && (
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  <input className="model-search" style={{ flex: 1, minWidth: 0, marginBottom: 0 }} placeholder="github.com/user/repo.git" value={ghUrl} onChange={(e) => setGhUrl(e.target.value)} />
                  <button className="btn" onClick={linkGithub}><Github size={14} /></button>
                </div>
              )}

              <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                <input className="model-search" style={{ flex: 1, minWidth: 0, marginBottom: 0 }} placeholder="Paste text…" value={knText} onChange={(e) => setKnText(e.target.value)} />
                <button className="btn" onClick={addText} title="Add text"><FileText size={14} /></button>
                <button className="btn" onClick={addFile} title="Add file"><FileUp size={14} /></button>
              </div>
              {kn.length === 0 ? (
                <div className="pjd-files-empty">Add PDFs, documents, or text to reference in this project.</div>
              ) : kn.map((k) => (
                <div key={k.id} className="pjd-file">
                  <FileText size={14} style={{ color: "var(--text-2)" }} />
                  <span style={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                  <span className="mo-sub">{String(k.content || "").length}c</span>
                  <button className="btn ghost" onClick={() => removeKn(k.id)} style={{ padding: "2px 6px" }}><Trash2 size={12} /></button>
                </div>
              ))}
              {src && <div style={{ color: src.startsWith("Error") ? "var(--danger)" : "var(--text-2)", fontSize: 11.5, marginTop: 8 }}>{src}</div>}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ---------- LIST ----------
  const shown = projects
    .filter((p) => !q || (p.name || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sortBy === "name" ? (a.name || "").localeCompare(b.name || "") : ((b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)));

  return (
    <div className="pj scroll">
      <div className="pj-head">
        <h1 className="pj-title">Projects</h1>
        <div className="pj-actions">
          <button className="icon-btn" title={`Sort by ${sortBy === "date" ? "name" : "date"}`} onClick={() => setSortBy((s) => s === "date" ? "name" : "date")}><ArrowUpDown size={15} /></button>
          <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" /></div>
          <button className="btn primary" onClick={() => { setDraft({ name: "", desc: "" }); setCreating(true); }}><Plus size={15} /> New project</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="pjd-files-empty" style={{ marginTop: 20 }}>No projects yet. Click "New project" to create one.</div>
      ) : (
        <div className="pj-grid">
          {shown.map((p) => (
            <button key={p.id} className="pj-card" onClick={() => open(p.id)}>
              <div className="pj-card-name">{p.name}</div>
              {p.instructions ? <div className="pj-card-desc">{String(p.instructions).slice(0, 100)}</div> : <div className="pj-card-desc dim">No instructions yet</div>}
              <div className="pj-card-time">{rel(p.updatedAt || p.createdAt)}</div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="pj-create">
            <h2>Create a personal project</h2>
            <label>What are you working on?</label>
            <input className="model-search" autoFocus value={draft.name} placeholder="Name your project"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doCreate()} />
            <label>What are you trying to achieve?</label>
            <textarea className="model-search" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={draft.desc}
              placeholder="Describe your project, goals, subject, etc…" onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
            <div className="pj-create-btns">
              <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn primary" onClick={doCreate}>Create project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
