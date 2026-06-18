// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// PLAYBOOK (formerly "Skills") — every move Madav has learned, presented as PLAYS.
// Original anatomy (not a list+detail clone): a TEACH strip (record web / record
// desktop / write / import), an approval strip for forged drafts, then a play WALL
// of cards; clicking a card drills into a full-page reader (ModelConfig drill-in
// convention). Engine contract unchanged: listSkills/readSkill/setSkillEnabled/
// deleteSkill/createSkill/import*, forgeList/Approve/Discard, recorders.
import { useEffect, useState, createElement } from "react";
import { FolderPlus, FolderUp, Upload, Plus, RefreshCw, Trash2, ToggleLeft, ToggleRight, X, ArrowLeft, Search, Globe, AppWindow, PenLine, Package, Sparkles, BookOpen, Pin, Share2, Download, Compass, Target, ShieldCheck, ShieldAlert, ArrowRight, Check, Bot, FolderKanban, Clock, BarChart3, Users, GitMerge, Plug, FolderInput, Play } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
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
const relTime = (ts) => {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 3600000) return Math.max(1, Math.floor(d / 60000)) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  const days = Math.floor(d / 86400000);
  return days < 30 ? days + "d ago" : Math.floor(days / 30) + "mo ago";
};

// ---- PLAYBOOK GUIDE — same Agent-Guide format (agg-* classes, Node/Arrow infographics) ----
const Node = ({ color = "var(--accent)", glyph, label, sub, dashed }) => (
  <div className={`agg-node ${dashed ? "dashed" : ""}`} style={{ "--c": color }}>
    <span className="agg-node-face">{glyph}</span>
    <span className="agg-node-label">{label}</span>
    {sub && <span className="agg-node-sub">{sub}</span>}
  </div>
);
const Arrow = ({ label }) => (
  <div className="agg-arrow">{label && <span className="agg-arrow-lbl">{label}</span>}<span className="agg-arrow-line" /></div>
);

const PB_CHAPTERS = [
  {
    title: "What a play is", sub: "anatomy",
    lead: <>A <b>play</b> is one reusable move Madav has learned — recorded, written, or imported. It lives in your Playbook and runs <b>automatically when a task matches</b>, or on demand with <b>/name</b>. Think of it as muscle memory you only have to teach once.</>,
    note: <>Plays are plain SKILL.md files — portable, editable, and never locked in.</>,
    diagram: (<div className="agg-flow"><Node glyph="🎬" color="#13c2d6" label="Record / write" sub="teach it once" /><Arrow /><Node glyph="⚡" label="A play" sub="reusable move" /><Arrow label="task matches" /><Node glyph="✓" color="#5fb573" label="It just runs" /></div>),
  },
  {
    title: "Pin it to an agent — a signature move", sub: "signature",
    lead: <>By default every agent reaches into the <i>whole</i> shared Playbook and hopes the matcher picks the right play. <b>Pin</b> a play to an agent and it's <b>always in that agent's hands</b> — pre-loaded on every mission, no guessing.</>,
    note: <>Example: pin "file a Jira bug our way" to your Bughunter agent. Its card reads "knows 2 plays," and every run already follows your team's bug format.</>,
    diagram: (<div className="agg-flow"><Node glyph="◆" color="#8b7cf6" label="Bughunter" sub="knows 2 plays" /><Arrow label="every mission" /><Node glyph="📌" color="#f4a261" label="Pinned play" sub="pre-loaded" /><Arrow /><Node glyph="✓" color="#5fb573" label="Done your way" /></div>),
  },
  {
    title: "Pin it to a room — a team playbook", sub: "room",
    lead: <>Pin plays to a <b>workroom</b> and <b>everyone working there</b> — you, the crew, every mission — uses them automatically. One room, one standard.</>,
    note: <>Example: pin "write in our brand voice" to the Launch Marketing room. Every chat and crew mission in that room sounds on-brand without anyone asking.</>,
    diagram: (<div className="agg-flow"><Node glyph="✦" color="#13c2d6" label="Launch room" /><Arrow label="every chat + mission" /><Node glyph="📌" color="#f4a261" label="Brand-voice play" /><Arrow /><Node glyph="🧑‍🤝‍🧑" color="#5fb573" label="Whole crew on-brand" /></div>),
  },
  {
    title: "See what earns its keep", sub: "stats",
    lead: <>Every time a play loads, Madav logs it. Each card shows <b>"used 12× · last by Pitchwright"</b> — so you instantly see the workhorses and the dead weight ("used 0× · 3 months") you can delete. The Playbook keeps itself clean.</>,
    note: <>Pinned pre-loads and live /name calls both count — the number reflects real use across agents, rooms, and schedules.</>,
    diagram: (<div className="agg-flow"><Node glyph="⚡" color="#13c2d6" label="A play loads" /><Arrow /><Node glyph="📊" color="#8b7cf6" label="Logged" sub="who + when" /><Arrow /><Node glyph="🏆" color="#5fb573" label="used 12×" sub="workhorse" /></div>),
  },
  {
    title: "Schedule it, share it", sub: "scale",
    lead: <>Put a play on a <b>timer</b> ("compile the weekly competitor summary," every Monday 7am — the result is just waiting). And <b>share</b> it: a <b>.madavplay</b> file carries the play <i>plus the agent that's mastered it</i>, so a teammate imports one file and gets both — zero setup.</>,
    note: <>Imported experts arrive in ask-permission mode on the default model — safe by default, like shared rooms.</>,
    diagram: (<div className="agg-flow"><Node glyph="⏱" color="#f4a261" label="Scheduler" sub="run a play" /><Arrow /><Node glyph="⚡" label="Weekly summary" /><Arrow /><Node glyph="📦" color="#8b7cf6" label=".madavplay" sub="play + expert" /><Arrow label="import" /><Node glyph="🤝" color="#5fb573" label="A teammate, set up" /></div>),
  },
];
const PB_DOS = [
  <>Pin an agent's <b>signature plays</b> — the moves that ARE its job — so they preload every mission.</>,
  <>Give a <b>room</b> the plays its work always needs (brand voice, your ticket format) so the whole crew is consistent.</>,
  <>Watch the <b>usage line</b>: a play at "used 0× · 3 months" is safe to delete; a workhorse deserves a pin.</>,
  <>Record a play once instead of re-explaining a workflow — the recorder drafts it, you approve it.</>,
  <>Share a play <b>with its expert</b> (.madavplay) so a teammate gets the move AND the agent that knows it.</>,
];
const PB_DONTS = [
  <>Don't over-pin — a handful of signature plays beats pinning everything (pins pre-load into context).</>,
  <>Don't paste secrets into a play's steps — plays travel in .madavplay and .madavroom exports.</>,
  <>Don't worry if a pinned play is missing or renamed — Madav silently falls back to the normal Playbook; nothing breaks.</>,
  <>Don't keep dead plays around — the usage line tells you which to retire.</>,
];
const PB_MATRIX = [
  ["Pinned to an agent", "Pre-loaded into every one of that agent's missions (solo, team, scheduled)."],
  ["Pinned to a room", "Pre-loaded into every chat and crew mission run inside that workroom."],
  ["Not pinned", "Still available to all Skills-capable agents via the matcher and /name — the normal path."],
  ["Missing / renamed pin", "Silently skipped — the run continues on the normal Playbook. Pins never block a run."],
  ["Scheduled play", "Scheduler target \"Run a play\" loads its steps and runs them on your timer."],
  ["Chained plays", "A play hands off to the plays in its chain — they load right after it (cycles skipped)."],
  ["Play needs", "Declared connectors/folder are surfaced as a hint when the play loads; missing tools never block."],
  ["Auto-pin suggestion", "An agent that loads a play 5+ times is offered as a one-click signature pin."],
  ["Team playbook", "Plays pinned to a team apply to every member, on top of each member's own pins."],
];

// How to actually USE a play once it's in your Playbook — step-by-step, each route.
const PB_STEPS = [
  { icon: Bot, t: "Use it in any chat", steps: [
    "Open Let's Chat (or any chat in a Workroom).",
    "Just describe your task — if it matches a play, Madav loads and follows it automatically.",
    "Or force a specific play: type / then the play's name (e.g. /weekly-summary) and add your details.",
    "Watch the reply: a 'Play loaded' note means it's following the play's steps.",
  ] },
  { icon: Pin, t: "Make it an agent's signature", steps: [
    "Open the play here in the Playbook (click its card).",
    "Click 'Pin to agent' and choose one or more agents.",
    "Turn the agent's Skills capability ON (Agents → the agent → Blueprint → Capabilities).",
    "Now every time you Put that agent to work, the play is pre-loaded — no need to ask.",
  ] },
  { icon: FolderKanban, t: "Give it to a Workroom", steps: [
    "Open a Workroom (Projects) and find the 'Room playbook' section in the crew column.",
    "Click 'Pin a play to this room' and pick the play.",
    "Every chat and every crew mission in that room now uses it automatically.",
  ] },
  { icon: Clock, t: "Run it on a schedule", steps: [
    "Open Scheduler → New task → Set up manually.",
    "Set the target to 'Run a play' and pick your play.",
    "Choose a time (e.g. daily 07:00) — optionally attach a folder for plays that touch files.",
    "Save. The play runs itself on the timer; read the result in the task's run history.",
  ] },
  { icon: GitMerge, t: "Chain it into a pipeline", steps: [
    "Open the play → the 'Then run' row.",
    "Add the plays that should follow it, in order.",
    "When this play loads anywhere, the chained plays load right after — a quick pipeline.",
  ] },
  { icon: Share2, t: "Share it with a teammate", steps: [
    "Open the play → click the Share (export) button → save the .madavplay file.",
    "If an agent pins this play, that expert agent travels with it automatically.",
    "Your teammate clicks 'Import play' on the Playbook — the play (and the agent) appear, ready to use.",
  ] },
];

export default function Skills({ onSelectScreen = () => {} } = {}) {
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
  const [stats, setStats] = useState({});      // play name -> { uses, lastAt, lastBy }
  const [view, setView] = useState("wall");     // wall | guide
  const [guideTab, setGuideTab] = useState("tour");
  const [chapter, setChapter] = useState(0);
  const [openFeat, setOpenFeat] = useState(0);
  const [agents, setAgents] = useState([]);     // roster — for "pinned to which agents"
  const [pinFor, setPinFor] = useState(null);   // play whose pin manager is open
  const [playCfg, setPlayCfg] = useState({ chains: {}, meta: {} }); // chains + needs
  const [suggestions, setSuggestions] = useState([]); // auto-pin suggestions
  const [connectors, setConnectors] = useState([]);   // enabled connectors (for "needs")
  const [editChain, setEditChain] = useState(false);
  const [editNeeds, setEditNeeds] = useState(false);
  const [skEdit, setSkEdit] = useState(null); // web inline skill editor draft (isWeb only)

  const webNote = isWeb ? "Built-in packs and your own skills both work right here — create, edit, bench and import skills in the browser. (Importing a whole skill folder still needs the desktop app.)" : "";

  const refresh = async () => {
    const cfg = await bridge.getSettings();
    setDirs(cfg.skillsDirs || []);
    const list = await bridge.listSkills();
    setSkills(list);
    try { setDrafts(bridge.forgeList ? (await bridge.forgeList()) || [] : []); } catch {}
    try { setStats(bridge.getPlayStats ? (await bridge.getPlayStats()) || {} : {}); } catch {}
    try { setAgents((cfg.agents) || []); } catch {}
    try { setConnectors(((cfg.connectors) || []).filter((c) => c.enabled !== false)); } catch {}
    try { setPlayCfg(bridge.getPlayConfig ? (await bridge.getPlayConfig()) || { chains: {}, meta: {} } : { chains: {}, meta: {} }); } catch {}
    try { setSuggestions(bridge.getPinSuggestions ? (await bridge.getPinSuggestions()) || [] : []); } catch {}
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
  const sharePlay = async (s) => { const r = bridge.exportPlay ? await bridge.exportPlay(s.name) : { error: "Desktop only." }; if (r?.error) setStatus(r.error); else if (!r?.canceled) setStatus(`Exported "${s.name}"${r.withAgent ? ` with its expert agent (${r.withAgent})` : ""}.`); };
  const importPlay = async () => { const r = bridge.importPlay ? await bridge.importPlay() : { error: "Desktop only." }; if (r?.error) setStatus(r.error); else if (!r?.canceled) { setStatus(`Imported play "${r.play}"${r.agent ? ` + agent "${r.agent}"` : ""}.`); await refresh(); } };
  // Which agents pin this play (for the reader's "signature for" line + pin manager).
  const agentsPinning = (name) => agents.filter((a) => Array.isArray(a.pinnedSkills) && a.pinnedSkills.includes(name));
  const togglePin = async (agent, name) => {
    const cur = Array.isArray(agent.pinnedSkills) ? agent.pinnedSkills : [];
    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
    await bridge.setPinnedSkills("agent", agent.id, next);
    await refresh();
  };
  const statLine = (name) => { const st = stats[name]; if (!st || !st.uses) return "never used"; return `used ${st.uses}\u00d7${st.lastBy ? ` \u00b7 last by ${st.lastBy}` : ""}${st.lastAt ? ` \u00b7 ${relTime(st.lastAt)}` : ""}`; };
  const chainOf = (name) => (playCfg.chains && playCfg.chains[name]) || [];
  const needsOf = (name) => (playCfg.meta && playCfg.meta[name]) || { connectors: [], folder: "" };
  const setChain = async (name, next) => { await bridge.setPlayChain(name, next); await refresh(); };
  const setNeeds = async (name, conns, folder) => { await bridge.setPlayNeeds(name, conns, folder); await refresh(); };
  // A play is "dead" if never used or unused for 90+ days. "Broken" if its pinned loads failed.
  const isDead = (name) => { const st = stats[name]; return !st || !st.uses || (st.lastAt && Date.now() - st.lastAt > 90 * 86400000); };
  const acceptSuggestion = async (sg) => {
    const a = agents.find((x) => x.id === sg.agentId); if (!a) return;
    const next = [...(a.pinnedSkills || []), sg.play];
    await bridge.setPinnedSkills("agent", sg.agentId, next);
    await refresh();
  };

  const toggleSkill = async (s) => { await bridge.setSkillEnabled(s.dir, s.enabled === false); if (sel && sel.dir === s.dir) setSel({ ...s, enabled: s.enabled === false }); await refresh(); };
  const deleteSkill = async (s) => {
    if (!(await madavConfirm(`Delete "${s.name}" from the playbook?\n${s.dir}`, { okLabel: "Delete" }))) return;
    const r = await bridge.deleteSkill(s.dir);
    setStatus(r?.error || `Deleted ${s.name}`);
    back(); await refresh();
  };

  // ---------- PLAYBOOK GUIDE (Agent-Guide format) ----------
  if (view === "guide") {
    const ch = PB_CHAPTERS[chapter];
    if (guideTab === "activate") {
      return (
        <div className="agg-ref scroll">
          <div className="agg-ref-inner">
            <button className="pj-back" style={{ marginBottom: 6 }} onClick={() => setView("wall")}><ArrowLeft size={15} /> Playbook</button>
            <div className="agg-subnav">
              <button onClick={() => setGuideTab("tour")}><Compass size={14} /> Tour &amp; practice</button>
              <button onClick={() => setGuideTab("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
              <button className="on"><Play size={14} /> How to activate</button>
              <button onClick={() => setView("wall")}><ArrowRight size={14} /> Go to Playbook</button>
            </div>
            <div className="agg-kicker"><Play size={13} /> Madav Playbook Guide</div>
            <h1>How to activate a play</h1>
            <p className="agg-ref-sub">Six ways to put a play to work once it's in your Playbook — pick whichever fits the moment. Every route is one quick setup; after that the play just runs.</p>
            <div className="pb2-steps">
              {PB_STEPS.map((st, i) => { const I = st.icon; return (
                <div key={i} className="pb2-stepcard">
                  <div className="pb2-stephead"><span className="pb2-stepic"><I size={15} /></span> {st.t}</div>
                  <ol className="pb2-steplist">{st.steps.map((x, k) => <li key={k}>{x}</li>)}</ol>
                </div>
              ); })}
            </div>
            <div className="ag-hint" style={{ marginTop: 12 }}>Tip: the fastest route is just chatting — describe your task and Madav matches the right play on its own. Pin it when you want it guaranteed, every time.</div>
          </div>
        </div>
      );
    }
    if (guideTab === "reference") {
      return (
        <div className="agg-ref scroll">
          <div className="agg-ref-inner">
            <button className="pj-back" style={{ marginBottom: 6 }} onClick={() => setView("wall")}><ArrowLeft size={15} /> Playbook</button>
            <div className="agg-subnav">
              <button onClick={() => setGuideTab("tour")}><Compass size={14} /> Tour &amp; practice</button>
              <button className="on"><BookOpen size={14} /> Do's &amp; don'ts</button>
              <button onClick={() => setGuideTab("activate")}><Play size={14} /> How to activate</button>
              <button onClick={() => setView("wall")}><ArrowRight size={14} /> Go to Playbook</button>
            </div>
            <div className="agg-kicker"><BookOpen size={13} /> Madav Playbook Guide</div>
            <h1>Do's &amp; don'ts, and where pinned plays apply</h1>
            <p className="agg-ref-sub">The short reference for getting plays working everywhere — pin the signature moves, watch the usage line, share with the expert.</p>
            <div className="agg-ref-grid">
              <div className="agg-ref-card do"><h3><ShieldCheck size={16} /> Do</h3><ul>{PB_DOS.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div className="agg-ref-card dont"><h3><ShieldAlert size={16} /> Don't</h3><ul>{PB_DONTS.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            </div>
            <div className="agg-ref-sec">
              <h2>Where a play applies</h2>
              <dl className="agg-ref-cap" style={{ marginTop: 8 }}>{PB_MATRIX.flatMap(([k, v], i) => [<dt key={"k" + i}>{k}</dt>, <dd key={"v" + i}>{v}</dd>])}</dl>
            </div>
            <div className="ag-hint">Graceful by design: if a play isn't pinned, or a pinned play is missing or broken, Madav simply continues on the normal Playbook — pins never block a run.</div>
          </div>
        </div>
      );
    }
    return (
      <div className="agg-wrap">
        <div className="agg-left scroll">
          <button className="pj-back" style={{ marginBottom: 6 }} onClick={() => setView("wall")}><ArrowLeft size={15} /> Playbook</button>
          <div className="agg-tophead">
            <div className="agg-kicker"><BookOpen size={13} className="agg-book" /> A 3-minute guide</div>
            <button className="btn primary" onClick={() => setView("wall")}><Plus size={14} /> Open the Playbook</button>
          </div>
          <h1 className="agg-h1">Plays that work everywhere</h1>
          <p className="agg-intro">A play is a move Madav learned once. The magic is <b>pinning</b> — make a play an agent's signature, a room's standard, or a scheduled job. It's always in hand, you can see what's used, and you can share it with the expert who knows it.</p>
          <div className="agg-subnav">
            <button className="on"><Compass size={14} /> Tour &amp; practice</button>
            <button onClick={() => setGuideTab("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
            <button onClick={() => setGuideTab("activate")}><Play size={14} /> How to activate</button>
            <button onClick={() => setView("wall")}><ArrowRight size={14} /> Go to Playbook</button>
          </div>
          <div className="agg-rail">
            {PB_CHAPTERS.map((c, i) => (
              <button key={i} className={`agg-rail-item ${chapter === i ? "on" : ""} ${chapter > i ? "read" : ""}`} onClick={() => setChapter(i)}>
                <span className="agg-rail-n">{chapter > i ? <Check size={11} /> : `0${i + 1}`}</span>
                <span className="agg-rail-t">{c.title}</span>
                <span className="agg-rail-s">{c.sub}</span>
              </button>
            ))}
          </div>
          <div className="agg-stage" key={chapter}>
            <h2>{ch.title}</h2>
            <p>{ch.lead}</p>
            {ch.diagram}
            <div className="agg-note">{ch.note}</div>
          </div>
          <div className="agg-pager">
            <button className="btn ghost" onClick={() => (chapter === 0 ? setView("wall") : setChapter((c) => c - 1))}>\u2190 {chapter === 0 ? "Playbook" : "Back"}</button>
            <span className="agg-pager-dots">{PB_CHAPTERS.map((_, i) => <span key={i} className={chapter === i ? "on" : ""} />)}</span>
            {chapter < PB_CHAPTERS.length - 1
              ? <button className="btn primary" onClick={() => setChapter((c) => c + 1)}>Next <ArrowRight size={13} /></button>
              : <button className="btn primary" onClick={() => setView("wall")}><Plus size={13} /> Open the Playbook</button>}
          </div>
        </div>
        <div className="agg-right scroll">
          <div className="agg-right-head">
            <div className="agg-kicker" style={{ marginBottom: 8 }}><Pin size={12} /> Try it now</div>
            <h2>Three moves to feel the magic</h2>
            <p>Each opens the right screen so you can do it for real with your own plays.</p>
          </div>
          <div className="agg-sims">
            <div className="agg-sim lit">
              <div className="agg-sim-head"><span className="agg-sim-n">1</span><div><div className="agg-sim-title">Pin a signature move</div><div className="agg-sim-meta">Agent · 2 min</div></div></div>
              <div className="agg-sim-goal"><Target size={14} /><span><b>Goal:</b> an agent that always knows your play.</span></div>
              <p className="agg-sim-story">Open any play below, click "Pin to agent," and choose an agent. Its mission now pre-loads that play every time.</p>
              <button className="btn ghost agg-sim-go" onClick={() => setView("wall")}><ArrowRight size={12} /> Open the Playbook</button>
            </div>
            <div className="agg-sim lit">
              <div className="agg-sim-head"><span className="agg-sim-n">2</span><div><div className="agg-sim-title">Give a room a play</div><div className="agg-sim-meta">Workroom · 2 min</div></div></div>
              <div className="agg-sim-goal"><Target size={14} /><span><b>Goal:</b> the whole crew, one standard.</span></div>
              <p className="agg-sim-story">In a Workroom's Playbook section, pin a play. Every chat and crew mission in that room uses it.</p>
              <button className="btn ghost agg-sim-go" onClick={() => onSelectScreen("project")}><ArrowRight size={12} /> Open Workrooms</button>
            </div>
            <div className="agg-sim lit">
              <div className="agg-sim-head"><span className="agg-sim-n">3</span><div><div className="agg-sim-title">Schedule a play</div><div className="agg-sim-meta">Scheduler · 2 min</div></div></div>
              <div className="agg-sim-goal"><Target size={14} /><span><b>Goal:</b> a play that runs itself.</span></div>
              <p className="agg-sim-story">In the Scheduler, New task → target "Run a play" → pick a play and a time. The result is waiting for you.</p>
              <button className="btn ghost agg-sim-go" onClick={() => onSelectScreen("scheduler")}><ArrowRight size={12} /> Open Scheduler</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              {isWeb && <button className="btn ghost" title="Edit this skill" onClick={() => setSkEdit({ name: sel.name, description: sel.description || "", body: (detail && detail.body) || "" })}>Edit</button>}
            </>)}
            <button className="btn ghost" title="Share this play (with the expert agent that pins it)" onClick={() => sharePlay(sel)}><Share2 size={16} /></button>
          </div>
          {sel.description && <p className="pb2-readdesc">{sel.description}</p>}
          <div className="pb2-signrow">
            <span className="pb2-stat"><BarChart3 size={13} /> {statLine(sel.name)}</span>
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={() => setPinFor(pinFor === sel.name ? null : sel.name)}><Pin size={13} /> Pin to agent{agentsPinning(sel.name).length ? ` (${agentsPinning(sel.name).length})` : ""}</button>
          </div>
          {agentsPinning(sel.name).length > 0 && (
            <div className="mo-sub" style={{ margin: "2px 0 8px" }}>Signature move for: {agentsPinning(sel.name).map((a) => a.name).join(", ")}</div>
          )}
          {!sel.bundled && (
            <div className="pb2-config">
              {/* PLAY CHAINS — this play hands off to the next */}
              <div className="pb2-confrow">
                <span className="pb2-conflabel"><GitMerge size={13} /> Then run</span>
                {chainOf(sel.name).length === 0 && <span className="mo-sub">nothing — runs alone</span>}
                {chainOf(sel.name).map((n) => (
                  <span key={n} className="chip">{n}<button className="agent-chip-x" onClick={() => setChain(sel.name, chainOf(sel.name).filter((x) => x !== n))}><X size={11} /></button></span>
                ))}
                <button className="btn ghost" style={{ padding: "3px 8px" }} onClick={() => setEditChain((v) => !v)}><Plus size={12} /></button>
                {editChain && (
                  <select className="model-search" style={{ marginBottom: 0, width: "auto", maxWidth: 200 }} value="" onChange={(e) => { if (e.target.value) { setChain(sel.name, [...chainOf(sel.name), e.target.value]); setEditChain(false); } }}>
                    <option value="">add a play to the chain…</option>
                    {skills.filter((sk) => sk.name !== sel.name && !chainOf(sel.name).includes(sk.name)).map((sk) => <option key={sk.dir || sk.name} value={sk.name}>{sk.name}</option>)}
                  </select>
                )}
              </div>
              {/* PLAY NEEDS — connectors + folder this play declares */}
              <div className="pb2-confrow">
                <span className="pb2-conflabel"><Plug size={13} /> Needs</span>
                {(needsOf(sel.name).connectors || []).map((n) => <span key={n} className="chip">{n}<button className="agent-chip-x" onClick={() => setNeeds(sel.name, (needsOf(sel.name).connectors || []).filter((x) => x !== n), needsOf(sel.name).folder)}><X size={11} /></button></span>)}
                {needsOf(sel.name).folder && <span className="chip" title={needsOf(sel.name).folder}><FolderInput size={11} /> folder<button className="agent-chip-x" onClick={() => setNeeds(sel.name, needsOf(sel.name).connectors, "")}><X size={11} /></button></span>}
                {(needsOf(sel.name).connectors || []).length === 0 && !needsOf(sel.name).folder && <span className="mo-sub">none declared</span>}
                <button className="btn ghost" style={{ padding: "3px 8px" }} onClick={() => setEditNeeds((v) => !v)}><Plus size={12} /></button>
                {editNeeds && (
                  <>
                    {connectors.filter((c) => !(needsOf(sel.name).connectors || []).includes(c.name)).length > 0 && (
                      <select className="model-search" style={{ marginBottom: 0, width: "auto" }} value="" onChange={(e) => { if (e.target.value) setNeeds(sel.name, [...(needsOf(sel.name).connectors || []), e.target.value], needsOf(sel.name).folder); }}>
                        <option value="">+ connector…</option>
                        {connectors.filter((c) => !(needsOf(sel.name).connectors || []).includes(c.name)).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    )}
                    <button className="btn" style={{ padding: "3px 8px" }} onClick={async () => { const dir = await bridge.chooseFolder(); if (dir && typeof dir === "string") setNeeds(sel.name, needsOf(sel.name).connectors || [], dir); }}><FolderInput size={12} /> folder</button>
                  </>
                )}
              </div>
              <div className="ag-hint" style={{ margin: "2px 0 0" }}>Chained plays load right after this one (cycles are skipped). "Needs" is surfaced to the agent as a hint — it uses those tools if available, never blocks if missing.</div>
            </div>
          )}
          {pinFor === sel.name && (
            <div className="pb2-pinpanel">
              <div className="wr-sechead" style={{ marginBottom: 6 }}><Pin size={12} /> Pin "{sel.name}" to an agent — it pre-loads on every mission</div>
              {agents.length === 0 ? <div className="mo-sub">No agents yet — build one in Agents, then pin plays to it.</div> : (
                <div className="pb2-pinlist">
                  {agents.map((a) => {
                    const on = Array.isArray(a.pinnedSkills) && a.pinnedSkills.includes(sel.name);
                    return (
                      <button key={a.id} className={`wr-assignrow ${on ? "on" : ""}`} onClick={() => togglePin(a, sel.name)}>
                        <span style={{ color: (a.identity && a.identity.color) || "var(--accent)" }}>{(a.identity && a.identity.glyph) || "✦"}</span>
                        <span className="wr-assignname">{a.name}</span>
                        <span className={`wr-assigncheck ${on ? "on" : ""}`}>{on ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {isWeb && skEdit ? (
            <div className="sk-card" style={{ display: "grid", gap: 8 }}>
              <input className="model-search" style={{ marginBottom: 0 }} value={skEdit.name} placeholder="Skill name" onChange={(e) => setSkEdit({ ...skEdit, name: e.target.value })} />
              <input className="model-search" style={{ marginBottom: 0 }} value={skEdit.description} placeholder="One-line description (helps the agent pick it)" onChange={(e) => setSkEdit({ ...skEdit, description: e.target.value })} />
              <textarea className="model-search" rows={16} style={{ resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} value={skEdit.body} placeholder="Skill instructions in Markdown (an optional --- frontmatter block with name/description is supported)" onChange={(e) => setSkEdit({ ...skEdit, body: e.target.value })} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn ghost" onClick={() => setSkEdit(null)}>Cancel</button>
                <button className="btn" onClick={async () => { const r = await bridge.saveSkill(sel.dir, skEdit); if (r && r.error) { setStatus(r.error); return; } setSkEdit(null); const list = await refresh(); const fresh = (list || []).find((x) => x.dir === sel.dir); if (fresh) { setSel(fresh); setDetail(await bridge.readSkill(fresh.dir)); } setStatus("Saved"); }}>Save skill</button>
              </div>
            </div>
          ) : (
            <div className="sk-card">
              {detail ? renderMd(detail.body) : <div className="sk-empty">Loading…</div>}
            </div>
          )}
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
        {agentsPinning(s.name).length > 0 && <span className="badge" title={"Signature for " + agentsPinning(s.name).map((a) => a.name).join(", ")}><Pin size={9} style={{ verticalAlign: "-1px" }} /> {agentsPinning(s.name).length}</span>}
        {chainOf(s.name).length > 0 && <span className="badge" title={"Chains to: " + chainOf(s.name).join(" \u2192 ")}><GitMerge size={9} style={{ verticalAlign: "-1px" }} /> {chainOf(s.name).length}</span>}
        {!s.bundled && isDead(s.name) && <span className="badge" style={{ color: "var(--text-2)" }} title="Never used or idle 90+ days — consider retiring it">retire?</span>}
        <code className="sk-ic">/{s.dir.split(/[\\/]/).pop()}</code>
      </span>
      <span className="pb2-cardstat">{statLine(s.name)}</span>
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
            <button className="btn ghost" title="Playbook Guide — pinning, stats, sharing" onClick={() => { setGuideTab("tour"); setChapter(0); setView("guide"); }}><BookOpen size={14} /> Playbook Guide</button>
            <button className="btn ghost" title="Import a shared play file" onClick={importPlay}><Download size={14} /> Import play</button>
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

        {/* AUTO-PIN SUGGESTIONS — agents that keep loading a play but haven't pinned it */}
        {suggestions.length > 0 && (
          <div className="pb2-suggest">
            <div className="wr-sechead" style={{ marginBottom: 6, color: "var(--accent)" }}><Pin size={13} /> Suggested signatures — Madav noticed a habit<HelpDot mode="skills" section="pin" /></div>
            {suggestions.map((sg) => (
              <div key={sg.agentId + sg.play} className="pb2-suggestrow">
                <span><b>{sg.agentName}</b> loaded <b>{sg.play}</b> {sg.uses}× — make it a signature?</span>
                <span style={{ flex: 1 }} />
                <button className="btn primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => acceptSuggestion(sg)}>Pin it</button>
              </div>
            ))}
          </div>
        )}

        {/* TEACH STRIP — four ways Madav learns a new play */}
        <div className="wr-sechead" style={{ margin: "4px 0 8px" }}><Sparkles size={13} /> Teach Madav a new play<HelpDot mode="skills" section="teach" /></div>
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
          {(
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
          {(
            <Tile icon={Package} title="Import" sub={isWeb ? "A skill .zip or SKILL.md file." : "A skill folder or .zip from anywhere."}>
              <span style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                {!isWeb && <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={importFolder}><FolderUp size={13} /> Folder</button>}
                <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={importZip}><Upload size={13} /> {isWeb ? ".zip / .md" : ".zip"}</button>
              </span>
            </Tile>
          )}
        </div>
        {status && <div className="sk-status" style={{ margin: "8px 0" }}>{status}</div>}

        {/* APPROVAL STRIP — plays Madav drafted on its own (Skill Forge + recorders) */}
        {drafts.length > 0 && (
          <>
            <div className="wr-sechead" style={{ margin: "14px 0 8px", color: "var(--accent)" }}><BookOpen size={13} /> Drafted by Madav — your approval needed<HelpDot mode="skills" section="drafts" /></div>
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
        {own.length > 0 && <div className="wr-sechead" style={{ margin: "16px 0 8px" }}>Your plays \u00b7 {own.length}</div>}
        {own.length > 0 && <div className="pb2-wall">{own.map(Card)}</div>}
        {packs.length > 0 && <div className="wr-sechead" style={{ margin: "16px 0 8px" }}>Built-in packs \u00b7 {packs.length}</div>}
        {packs.length > 0 && <div className="pb2-wall">{packs.map(Card)}</div>}
        {shown.length === 0 && <div className="sk-empty" style={{ marginTop: 24 }}>{q ? "No play matches that search." : "The playbook is empty \u2014 teach Madav its first play above."}</div>}
      </div>
    </div>
  );
}
