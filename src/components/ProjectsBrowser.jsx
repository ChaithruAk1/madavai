import { useEffect, useRef, useState } from "react";
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

export default function ProjectsBrowser({ onOpen, onStartChat, onStartCowork, onOpenTask, openId }) {
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState("list");      // list | detail
  const [tasks, setTasks] = useState([]);        // Let's Collaborate tasks scoped to this project
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
  // Returning from a project-scoped Collaborate task: land directly on that project's page.
  useEffect(() => { if (openId) open(openId); }, []); // eslint-disable-line

  const loadTasks = async (id) => {
    try {
      const all = (await bridge.listSessions("cowork")) || [];
      setTasks(all.filter((t) => t.projectId === id));
    } catch { setTasks([]); }
  };
  const open = async (id) => {
    const p = await bridge.getProject(id);
    setSelId(id); setProject(p); setInstr(p?.instructions || ""); setSrc(""); setGhUrl(""); setChat("");
    setConvs(await bridge.listConversations(id));
    loadTasks(id);
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
  // Add individual files to the project's knowledge. Desktop: native dialog (parses
  // PDF/docx via the main process). Web (or as fallback): a file picker whose files
  // are parsed RIGHT HERE — xlsx → CSV per sheet, docx → text, txt/md/csv inline.
  const webFileRef = useRef(null);
  const addFile = async () => {
    if (bridge.addKnowledgeFile) {
      const r = await bridge.addKnowledgeFile(selId);
      if (r?.error) setSrc("Error: " + r.error);
      else { setSrc(""); refreshProject(); }
      return;
    }
    webFileRef.current && webFileRef.current.click();
  };
  const onWebFiles = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    for (const f of files.slice(0, 8)) {
      try {
        const lower = (f.name || "").toLowerCase();
        let content = "";
        if (/\.(xlsx|xls)$/.test(lower)) {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
          for (const sn of (wb.SheetNames || []).slice(0, 8)) content += `--- sheet: ${sn} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sn]).slice(0, 20000) + "\n";
        } else if (/\.docx$/.test(lower)) {
          const m = await import("mammoth/mammoth.browser.js");
          content = String((await (m.default || m).extractRawText({ arrayBuffer: await f.arrayBuffer() })).value || "");
        } else if (/\.pdf$/.test(lower)) {
          setSrc("Error: PDFs need the desktop app (it extracts their text)."); continue;
        } else {
          content = await f.text();
        }
        if (content.trim()) await bridge.addKnowledgeText(selId, f.name, content.slice(0, 200000));
      } catch (err) { setSrc("Error reading " + f.name + ": " + String((err && err.message) || err).slice(0, 80)); }
    }
    refreshProject();
  };
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
              <Users size={15} /> Start work in Let's Collaborate
            </button>

            <div className="pjd-convs">
              {convs.length === 0 && tasks.length === 0 ? (
                <div className="pjd-convs-empty">Start a chat or a Collaborate task to keep this project's work organized and re‑use its knowledge.</div>
              ) : (
                <>
                  {convs.length > 0 && (
                    <>
                      <div className="pjd-railhead" style={{ margin: "10px 0 6px" }}>Chats · Let's Chat</div>
                      {convs.map((c) => (
                        <div key={c.id} className="pjd-conv" onClick={() => onOpen(project, c)}>
                          <MessageSquare size={14} style={{ color: "var(--accent)" }} />
                          <span className="pjd-conv-title">{c.title || "Conversation"}</span>
                          <span className="mo-sub">{c.count || 0} msgs</span>
                          <button className="btn ghost" onClick={(e) => { e.stopPropagation(); delConv(c.id); }} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </>
                  )}
                  {tasks.length > 0 && (
                    <>
                      <div className="pjd-railhead" style={{ margin: "14px 0 6px" }}>Tasks · Let's Collaborate</div>
                      {tasks.map((t) => (
                        <div key={t.id} className="pjd-conv" onClick={() => onOpenTask && onOpenTask(t.id)}>
                          <Users size={14} style={{ color: "var(--accent)" }} />
                          <span className="pjd-conv-title">{t.title || "Task"}</span>
                          <span className="mo-sub">{t.count || 0} msgs · {rel(t.updatedAt)}</span>
                          <button className="btn ghost" onClick={async (e) => { e.stopPropagation(); await bridge.deleteSession(t.id); loadTasks(selId); }} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <aside className="pjd-rail">
            <div className="pjd-railsec">
              <div className="pjd-railhead">Instructions</div>
              <p className="mo-sub" style={{ margin: "0 0 8px" }}>Tailors Madav's responses across every chat in this project.</p>
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

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
                <button className="btn" onClick={addFile}><FileUp size={14} /> Add files</button>
                <input ref={webFileRef} type="file" multiple style={{ display: "none" }}
                  accept=".txt,.md,.csv,.json,.xml,.html,.xlsx,.xls,.docx,.pdf,.js,.ts,.py,.java,.yaml,.yml,.log" onChange={onWebFiles} />
              </div>
              <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
                <input className="model-search" style={{ flex: 1, minWidth: 0, marginBottom: 0 }} placeholder="Paste text…" value={knText} onChange={(e) => setKnText(e.target.value)} />
                <button className="btn" onClick={addText} title="Add text"><FileText size={14} /></button>
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
