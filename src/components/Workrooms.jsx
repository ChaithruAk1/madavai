// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// WORKROOMS — projects reimagined as rooms staffed by agent crews.
// Shelf: wide horizontal room banners (identity color spine + glyph, pulse line,
// crew strip of Portrait faces, knowledge meter) — not cards.
// Room interior, 3 zones: LEFT brief (instructions + knowledge book-spines + linked
// folder/repo) · CENTER unified work feed (chats + tasks merged chronologically,
// filter chips incl. by-agent) · RIGHT crew (portraits/moods, per-agent "Put to work
// in this room", per-room track record, recruiter hint).
// Engine contract: project.{identity,agentIds} (projects-store), assign/unassign IPC,
// runs tagged projectId, getProjectAgentHistory for the room record.
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, FileText, FileUp, MessageSquare, Github, FolderInput, RefreshCw, Search, ArrowUpDown, ArrowLeft, Users, UserPlus, Hammer, BookOpen, Sparkles, Share2, Upload, X } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { madavAlert, madavConfirm } from "../dialogs.jsx";
import Composer from "./Composer.jsx";
import Portrait from "./Portrait.jsx";

const DAY = 86400000;
function rel(ts) {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < DAY) return Math.floor(d / 3600000) + "h ago";
  if (d < 7 * DAY) return Math.floor(d / DAY) + " days ago";
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

// The room's pulse — one warm line computed from chats + task runs. On the shelf,
// chat activity arrives pre-computed as room.lastConvAt (listProjects); inside a room
// the loaded conversations are passed in so fresh chats count immediately.
function pulseLine(room, sessions, convs = []) {
  const mine = sessions.filter((s) => s.projectId === room.id);
  const stamps = [...mine.map((s) => s.updatedAt || 0), ...convs.map((c) => c.updatedAt || 0)];
  const today = stamps.filter((t) => t >= startOfToday()).length;
  const lastAt = Math.max(room.lastConvAt || 0, ...stamps, 0);
  if (today) return `${today} run${today > 1 ? "s" : ""} today · ${rel(lastAt)}`;
  if (lastAt) return `last activity ${rel(lastAt)}`;
  return "quiet — put the crew to work";
}

// Mood from the agent's latest run in THIS room: fresh win → happy, last run failed →
// working (back at the bench), older history → idle, never ran here → hello.
function moodFor(agentId, roomHist) {
  const latest = (roomHist || []).find((e) => e.agentId === agentId);
  if (!latest) return "hello";
  if (!latest.ok) return "working";
  if (Date.now() - (latest.at || 0) < DAY) return "happy";
  return "idle";
}

export default function Workrooms({ onOpen, onStartChat, onStartCowork, onOpenTask, onPutToWork, openId }) {
  const [rooms, setRooms] = useState([]);
  const [agents, setAgents] = useState([]);      // full roster from settings
  const [sessions, setSessions] = useState([]);  // all task runs (chat/cowork/build) for pulse + feed
  const [view, setView] = useState("list");      // list | room
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", desc: "" });
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("date");

  const [selId, setSelId] = useState(null);
  const [room, setRoom] = useState(null);
  const [convs, setConvs] = useState([]);
  const [roomHist, setRoomHist] = useState([]);  // per-room agent track record
  const [feedFilter, setFeedFilter] = useState("all"); // all | chats | tasks | agent:<name>
  const [instr, setInstr] = useState("");
  const [knText, setKnText] = useState("");
  const [knView, setKnView] = useState(null);    // open knowledge item: { id, name, content } (view + edit)
  const [assignOpen, setAssignOpen] = useState(false); // staffing panel (multi-select with portraits)
  const [assignSel, setAssignSel] = useState({});      // agentId -> true while picking
  const [ghUrl, setGhUrl] = useState("");
  const [src, setSrc] = useState("");

  const loadSessions = async () => {
    try {
      const [a, b, c] = await Promise.all([bridge.listSessions("cowork"), bridge.listSessions("chat"), bridge.listSessions("code")]);
      setSessions([...(a || []), ...(b || []), ...(c || [])]);
    } catch { setSessions([]); }
  };
  const loadList = async () => setRooms(await bridge.listProjects());
  useEffect(() => {
    loadList(); loadSessions();
    bridge.getSettings().then((s) => setAgents(s.agents || [])).catch(() => {});
  }, []);
  // Returning from a room-scoped run: land straight back inside that room.
  useEffect(() => { if (openId) open(openId); }, []); // eslint-disable-line

  const open = async (id) => {
    const p = await bridge.getProject(id);
    if (!p) return;
    setSelId(id); setRoom(p); setInstr(p.instructions || ""); setSrc(""); setGhUrl(""); setFeedFilter("all");
    setConvs(await bridge.listConversations(id));
    bridge.getProjectAgentHistory && bridge.getProjectAgentHistory(id).then((h) => setRoomHist(h || [])).catch(() => setRoomHist([]));
    loadSessions();
    setView("room");
  };
  const back = () => { setView("list"); setRoom(null); setSelId(null); loadList(); loadSessions(); };
  const refreshRoom = async () => { const p = await bridge.getProject(selId); setRoom(p); };

  const doCreate = async () => {
    const p = await bridge.createProject(draft.name.trim() || "Untitled workroom");
    if (draft.desc.trim()) await bridge.updateProject(p.id, { instructions: draft.desc.trim() });
    setCreating(false); setDraft({ name: "", desc: "" });
    await loadList(); open(p.id);
  };
  const saveInstr = async () => { await bridge.updateProject(selId, { instructions: instr }); };
  const delRoom = async () => {
    if (!(await madavConfirm(`Close workroom "${room.name}"? Its conversations are deleted too.`, { okLabel: "Close workroom" }))) return;
    await bridge.deleteProject(selId); back();
  };

  // ---- brief: sources ----
  const linkFolder = async () => { const r = await bridge.linkProjectFolder(selId); if (r?.folder) { setSrc(""); refreshRoom(); } else if (r?.error) setSrc("Error: " + r.error); };
  const linkGithub = async () => { if (!ghUrl.trim()) return; setSrc("Cloning…"); const r = await bridge.linkGithub(selId, ghUrl.trim()); if (r?.error) setSrc("Error: " + r.error); else { setSrc(""); setGhUrl(""); refreshRoom(); } };
  const pull = async () => { setSrc("Pulling…"); const r = await bridge.pullGithub(selId); setSrc(r?.error ? "Error: " + r.error : "Updated from GitHub"); };
  const unlinkSrc = async () => { await bridge.unlinkProjectSource(selId); setSrc(""); refreshRoom(); };
  const addText = async () => { if (!knText.trim()) return; await bridge.addKnowledgeText(selId, "Note", knText.trim()); setKnText(""); refreshRoom(); };
  const webFileRef = useRef(null);
  const addFile = async () => {
    if (bridge.addKnowledgeFile) {
      const r = await bridge.addKnowledgeFile(selId);
      if (r?.error) setSrc("Error: " + r.error); else { setSrc(""); refreshRoom(); }
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
    refreshRoom();
  };
  const removeKn = async (knId) => { await bridge.removeKnowledge(selId, knId); refreshRoom(); };
  // Open a knowledge item to READ it (and edit in place) — a shelf you can't open isn't a shelf.
  const saveKn = async () => {
    const knowledge = (room.knowledge || []).map((k) => k.id === knView.id ? { ...k, name: (knView.name || "note").slice(0, 120), content: String(knView.content || "").slice(0, 200000) } : k);
    await bridge.updateProject(selId, { knowledge });
    setKnView(null); refreshRoom();
  };

  // ---- share / import: a workroom travels WITH its crew ----
  // Export = one portable .madavroom.json: brief + knowledge + identity + the full crew
  // agent definitions. Import recreates the room AND any missing agents in the roster.
  const shareRoom = async () => {
    const full = await bridge.getProject(selId);
    if (!full) return;
    const crewAgents = (full.agentIds || []).map((id) => agents.find((a) => a.id === id)).filter(Boolean);
    const payload = {
      app: "madav", kind: "workroom", version: 1, exportedAt: Date.now(),
      room: {
        name: full.name, instructions: full.instructions || "", identity: full.identity,
        knowledge: (full.knowledge || []).map((k) => ({ id: k.id, name: k.name, type: k.type, content: k.content })),
        githubUrl: full.githubUrl || "", agentIds: full.agentIds || [],
      },
      agents: crewAgents, // local folder path + conversations deliberately NOT exported
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (full.name || "workroom").replace(/[^\w.-]+/g, "-").toLowerCase() + ".madavroom.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    madavAlert(`"${full.name}" exported${crewAgents.length ? ` with its crew (${crewAgents.map((x) => x.name).join(", ")})` : ""}.\n\nSend the .madavroom.json file — importing it recreates the room and any missing agents. The linked folder and chat history stay private on this machine.`);
  };

  const importRef = useRef(null);
  const onImportRoom = async (e) => {
    const f = (e.target.files || [])[0]; e.target.value = "";
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== "madav" || j.kind !== "workroom" || !j.room) { madavAlert("That's not a Madav workroom file (.madavroom.json)."); return; }
      // 1) Crew first: add missing agents to the roster. SAFETY: imported agents never
      //    keep full autonomy or a foreign model pin — they arrive asking permission.
      const cfg = await bridge.getSettings();
      const roster = (cfg.agents || []).slice();
      const idMap = {}; const addedNames = [];
      for (const a of (j.agents || []).slice(0, 50)) {
        if (!a || !a.name) continue;
        const same = roster.find((x) => x.id === a.id && x.name === a.name);
        if (same) { idMap[a.id] = same.id; continue; }
        const clash = roster.some((x) => x.id === a.id);
        const nid = (!a.id || clash) ? "agent_" + Math.random().toString(36).slice(2, 10) : a.id;
        const clean = { ...a, id: nid, model: "" };
        delete clean.autonomy;
        roster.push(clean); idMap[a.id] = nid; addedNames.push(a.name);
      }
      if (addedNames.length) await bridge.saveSettings({ ...cfg, agents: roster });
      // 2) The room itself.
      const p = await bridge.createProject(String(j.room.name || "Imported workroom").slice(0, 80));
      const kn = (j.room.knowledge || []).slice(0, 100).map((k) => ({ id: "kn_" + Math.random().toString(36).slice(2, 9), name: String(k.name || "note").slice(0, 120), type: k.type === "file" ? "file" : "text", content: String(k.content || "").slice(0, 200000) }));
      const patch = { instructions: String(j.room.instructions || "").slice(0, 20000), knowledge: kn };
      if (j.room.identity && j.room.identity.color) patch.identity = j.room.identity;
      await bridge.updateProject(p.id, patch);
      for (const aid of (j.room.agentIds || [])) { if (idMap[aid]) await bridge.assignProjectAgent(p.id, idMap[aid]); }
      setAgents(roster);
      await loadList();
      open(p.id);
      madavAlert(`Workroom "${j.room.name}" imported.` +
        (addedNames.length ? `\n\nNew agents added to your roster: ${addedNames.join(", ")} (they start in ask-permission mode, on your default model).` : "") +
        (j.room.githubUrl ? `\n\nIt referenced a GitHub repo — relink it under Linked folder & repo:\n${j.room.githubUrl}` : "\n\nLink a local folder to enable file work."));
    } catch (err) { madavAlert("Couldn't import: " + String((err && err.message) || err).slice(0, 200)); }
  };

  // ---- crew ----
  const crew = useMemo(() => (room ? (room.agentIds || []).map((id) => agents.find((a) => a.id === id)).filter(Boolean) : []), [room, agents]);
  const benched = useMemo(() => agents.filter((a) => !room || !(room.agentIds || []).includes(a.id)), [room, agents]);
  const assignMany = async () => {
    const ids = Object.keys(assignSel).filter((k) => assignSel[k]);
    for (const id of ids) await bridge.assignProjectAgent(selId, id);
    setAssignOpen(false); setAssignSel({});
    refreshRoom();
  };
  const unassign = async (agentId) => { await bridge.unassignProjectAgent(selId, agentId); refreshRoom(); };
  const recordFor = (agentId) => {
    const runs = roomHist.filter((e) => e.agentId === agentId);
    if (!runs.length) return "no missions in this room yet";
    const clean = runs.filter((e) => e.ok).length;
    return `${runs.length} mission${runs.length > 1 ? "s" : ""} here · ${Math.round((clean / runs.length) * 100)}% clean`;
  };

  // ---- work feed: chats + task runs merged chronologically ----
  const feed = useMemo(() => {
    if (!room) return [];
    const chats = convs.map((c) => ({ kind: "chat", id: c.id, title: c.title || "Conversation", count: c.count || 0, updatedAt: c.updatedAt || 0 }));
    const tasks = sessions.filter((s) => s.projectId === room.id)
      .map((s) => ({ kind: "task", id: s.id, title: s.title || "Task", count: s.count || 0, updatedAt: s.updatedAt || 0, agentName: s.agentName || s.teamName || null, mode: s.mode }));
    let all = [...chats, ...tasks].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (feedFilter === "chats") all = all.filter((x) => x.kind === "chat");
    else if (feedFilter === "tasks") all = all.filter((x) => x.kind === "task");
    else if (feedFilter.startsWith("agent:")) { const n = feedFilter.slice(6); all = all.filter((x) => x.agentName === n); }
    return all;
  }, [room, convs, sessions, feedFilter]);

  const delFeedItem = async (item) => {
    if (item.kind === "chat") { await bridge.deleteConversation(item.id); setConvs(await bridge.listConversations(selId)); }
    else { await bridge.deleteSession(item.id); loadSessions(); }
  };
  const openFeedItem = (item) => {
    if (item.kind === "chat") onOpen && onOpen(room, { id: item.id, title: item.title });
    else onOpenTask && onOpenTask(item.id);
  };

  // ---------- ROOM INTERIOR ----------
  if (view === "room" && room) {
    const kn = room.knowledge || [];
    const idn = room.identity || { color: "var(--accent)", glyph: "✦" };
    return (
      <div className="wr-roomwrap scroll">
        <button className="pj-back" onClick={back}><ArrowLeft size={15} /> All workrooms</button>

        {/* Room header — a soft gradient spine in the room's identity color */}
        <header className="wr-roomhead" style={{ "--wr": idn.color }}>
          <span className="wr-roomglyph">{idn.glyph}</span>
          <div className="wr-roomtitle">
            <h1 className="wr-roomname">{room.name}</h1>
            <div className="wr-pulse">{pulseLine(room, sessions, convs)}</div>
          </div>
          <button className="icon-btn" title="Share this workroom — exports a .madavroom.json with the brief, knowledge, and crew agents" onClick={shareRoom}><Share2 size={15} /></button>
          <button className="icon-btn danger" title="Close this workroom" onClick={delRoom}><Trash2 size={15} /></button>
        </header>

        <div className="wr-zones">
          {/* LEFT — the brief */}
          <aside className="wr-brief">
            <div className="wr-sec wr-resizable" title="Drag the bottom-right corner to resize">
              <div className="wr-sechead"><Sparkles size={13} /> Brief</div>
              <p className="mo-sub" style={{ margin: "0 0 8px" }}>Standing instructions — every chat and crew mission in this room follows them.</p>
              <textarea className="model-search" rows={5} style={{ resize: "vertical", fontFamily: "inherit", width: "100%" }}
                placeholder="Goals, tone, rules, context this room should always remember…" value={instr}
                onChange={(e) => setInstr(e.target.value)} onBlur={saveInstr} />
            </div>

            <div className="wr-sec wr-resizable" title="Drag the bottom-right corner to resize">
              <div className="wr-sechead"><BookOpen size={13} /> Knowledge</div>
              {kn.length === 0 ? (
                <div className="pjd-files-empty">An empty shelf. Add documents, data, or notes the room should know.</div>
              ) : (
                <div className="wr-shelfrows">
                  {kn.map((k) => (
                    <div key={k.id} className="wr-book" style={{ "--wr": idn.color }} title="Open this note" onClick={() => setKnView({ id: k.id, name: k.name, content: String(k.content || "") })}>
                      <span className="wr-bookspine" />
                      <span className="wr-booktitle">{k.name}</span>
                      <span className="mo-sub">{Math.max(1, Math.round(String(k.content || "").length / 1000))}k</span>
                      <button className="btn ghost" onClick={(e) => { e.stopPropagation(); removeKn(k.id); }} style={{ padding: "2px 6px" }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button className="btn" onClick={addFile}><FileUp size={14} /> Add files</button>
                <input ref={webFileRef} type="file" multiple style={{ display: "none" }}
                  accept=".txt,.md,.csv,.json,.xml,.html,.xlsx,.xls,.docx,.pdf,.js,.ts,.py,.java,.yaml,.yml,.log" onChange={onWebFiles} />
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input className="model-search" style={{ flex: 1, minWidth: 0, marginBottom: 0 }} placeholder="Paste text…" value={knText} onChange={(e) => setKnText(e.target.value)} />
                <button className="btn" onClick={addText} title="Add text"><FileText size={14} /></button>
              </div>
            </div>

            <div className="wr-sec">
              <div className="wr-sechead"><FolderInput size={13} /> Linked folder &amp; repo</div>
              {room.folder ? (
                <div className="folder-bar" style={{ borderRadius: 10, border: "1px solid var(--line)" }}>
                  {room.githubUrl ? <Github size={14} /> : <FolderInput size={14} />}
                  <span className="path" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{room.folder}</span>
                  {room.githubUrl && <button className="btn ghost" onClick={pull} title="git pull" style={{ padding: "4px 7px" }}><RefreshCw size={13} /></button>}
                  <button className="btn ghost danger" onClick={unlinkSrc} style={{ padding: "4px 8px" }}>Unlink</button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <button className="btn" onClick={linkFolder}><FolderInput size={14} /> Link folder</button>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="model-search" style={{ flex: 1, minWidth: 0, marginBottom: 0 }} placeholder="github.com/user/repo.git" value={ghUrl} onChange={(e) => setGhUrl(e.target.value)} />
                    <button className="btn" onClick={linkGithub}><Github size={14} /></button>
                  </div>
                </>
              )}
              {src && <div style={{ color: src.startsWith("Error") ? "var(--danger)" : "var(--text-2)", fontSize: 11.5, marginTop: 8 }}>{src}</div>}
            </div>
          </aside>

          {/* CENTER — the work feed */}
          <main className="wr-feed">
            <Composer mode="project" busy={false} onSend={(text) => onStartChat && onStartChat(room, text)} onStop={() => {}} />
            <button className="pjd-cowork" onClick={() => onStartCowork && onStartCowork(room)}>
              <Users size={15} /> Work in the room's folder (Let's Collaborate)
            </button>

            <div className="wr-chips">
              <button className={`chip ${feedFilter === "all" ? "on" : ""}`} onClick={() => setFeedFilter("all")}>All</button>
              <button className={`chip ${feedFilter === "chats" ? "on" : ""}`} onClick={() => setFeedFilter("chats")}>Chats</button>
              <button className={`chip ${feedFilter === "tasks" ? "on" : ""}`} onClick={() => setFeedFilter("tasks")}>Tasks</button>
              {crew.map((a) => (
                <button key={a.id} className={`chip ${feedFilter === "agent:" + a.name ? "on" : ""}`}
                  style={a.identity ? { color: a.identity.color } : undefined}
                  onClick={() => setFeedFilter(feedFilter === "agent:" + a.name ? "all" : "agent:" + a.name)}>
                  {a.identity ? a.identity.glyph + " " : ""}{a.name}
                </button>
              ))}
            </div>

            {feed.length === 0 ? (
              <div className="pjd-convs-empty">Nothing here yet. Send a message above, or put a crew member to work — everything this room produces lands in this feed.</div>
            ) : (
              <div className="wr-feedlist">
                {feed.map((it) => (
                  <div key={it.kind + it.id} className="wr-feeditem" onClick={() => openFeedItem(it)}>
                    {it.kind === "chat"
                      ? <MessageSquare size={14} style={{ color: idn.color, flex: "none" }} />
                      : <Hammer size={14} style={{ color: idn.color, flex: "none" }} />}
                    <span className="wr-feedtitle">{it.title}</span>
                    {it.agentName && <span className="chip wr-feedagent">{it.agentName}</span>}
                    <span className="mo-sub">{it.count || 0} msgs · {rel(it.updatedAt)}</span>
                    <button className="btn ghost" onClick={(e) => { e.stopPropagation(); delFeedItem(it); }} style={{ padding: "2px 6px" }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* RIGHT — the crew */}
          <aside className="wr-crewzone">
            <div className="wr-sechead" style={{ marginBottom: 8 }}><Users size={13} /> Crew</div>
            {crew.length === 0 && (
              <div className="pjd-files-empty">No agents staffed. Assign one below — it works with this room's brief, knowledge, and folder.</div>
            )}
            {crew.map((a) => (
              <div key={a.id} className="wr-crewcard">
                <Portrait seed={a.id || a.name} color={(a.identity && a.identity.color) || idn.color} size={40} mood={moodFor(a.id, roomHist)} title={a.name} />
                <div className="wr-crewinfo">
                  <div className="wr-crewname">{a.name}</div>
                  <div className="mo-sub" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "Custom agent"}</div>
                  <div className="wr-crewrecord">{recordFor(a.id)}</div>
                </div>
                <div className="wr-crewbtns">
                  <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} title="Launch this agent with the room's brief, knowledge, and folder"
                    onClick={() => onPutToWork && onPutToWork(room, a)}>Put to work</button>
                  <button className="btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} title="Remove from this room's crew" onClick={() => unassign(a.id)}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}

            {benched.length > 0 && !assignOpen && (
              <button className="btn" style={{ marginTop: 10, justifyContent: "center" }} onClick={() => { setAssignSel({}); setAssignOpen(true); }}>
                <UserPlus size={14} /> Assign agents to this room…
              </button>
            )}
            {assignOpen && (
              <div className="wr-assign">
                <div className="wr-sechead" style={{ marginBottom: 6 }}><UserPlus size={13} /> Staff this room</div>
                <div className="wr-assignlist">
                  {benched.map((a) => {
                    const on = !!assignSel[a.id];
                    return (
                      <button key={a.id} className={`wr-assignrow ${on ? "on" : ""}`} onClick={() => setAssignSel({ ...assignSel, [a.id]: !on })} title={a.description || a.name}>
                        <Portrait seed={a.id || a.name} color={(a.identity && a.identity.color) || "var(--accent)"} size={30} mood={on ? "hello" : "idle"} title={a.name} />
                        <span className="wr-assignname">{a.name || "Untitled agent"}</span>
                        <span className={`wr-assigncheck ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" onClick={() => { setAssignOpen(false); setAssignSel({}); }}>Cancel</button>
                  <span style={{ flex: 1 }} />
                  <button className="btn primary" disabled={!Object.values(assignSel).some(Boolean)} onClick={assignMany}>
                    Add {Object.values(assignSel).filter(Boolean).length || ""} to crew
                  </button>
                </div>
              </div>
            )}
            <div className="wr-recruit"><UserPlus size={12} /> Need a specialist? Recruit one in Agents — then staff it here.</div>
          </aside>
        </div>

        {/* Knowledge viewer/editor — click a book-spine to read it; resizable like all dialogs */}
        {knView && (
          <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setKnView(null); }}>
            <div className="pj-create" style={{ width: 640 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BookOpen size={16} style={{ color: idn.color }} />
                <input className="model-search" style={{ flex: 1, marginBottom: 0, fontWeight: 600 }} value={knView.name}
                  onChange={(e) => setKnView({ ...knView, name: e.target.value })} />
                <span className="mo-sub" style={{ flex: "none" }}>{String(knView.content || "").length.toLocaleString()} chars</span>
                <button className="icon-btn" onClick={() => setKnView(null)}><X size={16} /></button>
              </div>
              <textarea className="model-search" rows={16} style={{ resize: "vertical", fontFamily: "inherit", width: "100%", marginTop: 12, lineHeight: 1.5 }}
                value={knView.content} onChange={(e) => setKnView({ ...knView, content: e.target.value })} />
              <div className="pj-create-btns">
                <button className="btn" onClick={() => setKnView(null)}>Close</button>
                <span style={{ flex: 1 }} />
                <button className="btn primary" onClick={saveKn}>Save changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- SHELF (landing) ----------
  const shown = rooms
    .filter((p) => !q || (p.name || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sortBy === "name" ? (a.name || "").localeCompare(b.name || "") : ((b.lastConvAt || b.updatedAt || b.createdAt || 0) - (a.lastConvAt || a.updatedAt || a.createdAt || 0)));

  return (
    <div className="wr scroll">
      <div className="pj-head">
        <div>
          <h1 className="pj-title">Workrooms</h1>
          <p style={{ color: "var(--text-2)", fontSize: 13, margin: "4px 0 0" }}>Each room keeps a brief, a knowledge shelf, and a crew of agents on the job.</p>
        </div>
        <div className="pj-actions">
          <button className="icon-btn" title={`Sort by ${sortBy === "date" ? "name" : "date"}`} onClick={() => setSortBy((s) => s === "date" ? "name" : "date")}><ArrowUpDown size={15} /></button>
          <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workrooms…" /></div>
          <button className="btn" title="Import a shared .madavroom.json — recreates the room and its crew agents" onClick={() => importRef.current && importRef.current.click()}><Upload size={15} /> Import</button>
          <input ref={importRef} type="file" accept=".json,.madavroom" style={{ display: "none" }} onChange={onImportRoom} />
          <button className="btn primary" onClick={() => { setDraft({ name: "", desc: "" }); setCreating(true); }}><Plus size={15} /> New workroom</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="pjd-files-empty" style={{ marginTop: 20 }}>No workrooms yet. Open one, brief it, shelve some knowledge, and staff a crew.</div>
      ) : (
        <div className="wr-shelf">
          {shown.map((p) => {
            const idn = p.identity || { color: "var(--accent)", glyph: "✦" };
            const crewFaces = (p.agentIds || []).map((id) => agents.find((a) => a.id === id)).filter(Boolean);
            const meterPct = Math.min(100, Math.round(((p.knowledgeBytes || 0) / 200000) * 100)) || (p.knowledgeCount ? 8 : 0);
            return (
              <button key={p.id} className="wr-banner" style={{ "--wr": idn.color }} onClick={() => open(p.id)}>
                <span className="wr-spine"><span className="wr-glyph">{idn.glyph}</span></span>
                <span className="wr-body">
                  <span className="wr-name">{p.name}</span>
                  <span className="wr-pulse">{pulseLine(p, sessions)}</span>
                </span>
                <span className="wr-crewstrip" title={crewFaces.length ? crewFaces.map((a) => a.name).join(" · ") : "No crew yet"}>
                  {crewFaces.slice(0, 5).map((a) => (
                    <span key={a.id} className="wr-face">
                      <Portrait seed={a.id || a.name} color={(a.identity && a.identity.color) || idn.color} size={28} mood="idle" title={a.name} />
                    </span>
                  ))}
                  {crewFaces.length > 5 && <span className="wr-more">+{crewFaces.length - 5}</span>}
                  {crewFaces.length === 0 && <span className="wr-nocrew">no crew</span>}
                </span>
                <span className="wr-meterwrap" title={`${p.knowledgeCount || 0} knowledge source${(p.knowledgeCount || 0) === 1 ? "" : "s"}`}>
                  <span className="wr-meter"><span className="wr-meterfill" style={{ width: meterPct + "%" }} /></span>
                  <span className="wr-meterlabel">{p.knowledgeCount || 0} sources</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {creating && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="pj-create">
            <h2>Open a new workroom</h2>
            <label>What is this room for?</label>
            <input className="model-search" autoFocus value={draft.name} placeholder="Name the workroom"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && doCreate()} />
            <label>The brief (you can refine it later)</label>
            <textarea className="model-search" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={draft.desc}
              placeholder="Goals, context, rules this room should always work by…" onChange={(e) => setDraft({ ...draft, desc: e.target.value })} />
            <div className="pj-create-btns">
              <button className="btn" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn primary" onClick={doCreate}>Open workroom</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
