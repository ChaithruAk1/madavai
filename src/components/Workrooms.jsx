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
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Plus, Trash2, FileText, FileUp, MessageSquare, Github, FolderInput, RefreshCw, Search, ArrowUpDown, ArrowLeft, Users, UserPlus, Hammer, BookOpen, Sparkles, Share2, Upload, X, Maximize2, LayoutGrid, List, Plug, GraduationCap, Play, BookOpen as BookIcon, Compass, Target, ShieldCheck, ShieldAlert, ArrowRight, Check } from "lucide-react";
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

// Room icon catalog — the classic glyphs plus a generous emoji spread. Rooms should be fun.
const GLYPHS = ["🜁","✦","◆","⌘","♟","✺","☄","❖","⚙","🜃","♜","✤",
  "🚀","🎯","📈","📣","🧪","🧠","💡","🔥","🌊","🌿","🌞","🌙","⭐","⚡","🎨","🎬","🎵","🎮","🏆","🏗️","🛠️","🔬","🔭","🧭",
  "📚","📝","📊","📦","🗂️","💼","💰","🏦","🛒","🧾","📅","✉️","🔔","🔑","🛡️","🤝","🌍","🏠","🏥","🎓","⚖️","🧬","🍀","🎁",
  "🐉","🦊","🐝","🦉","🐢","🐙","🦄","🤖","👾","💎","🧩","♟️","🪄","🎪","🌋","🛰️","✈️","🚢","🍕","☕","🍎","🌶️","🧊","🎈"];
const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ---- PROJECTS GUIDE — same format as the Agent Guide (agg-* classes, Node/Arrow
// infographics, chapter rail + Flight School sims + Do's & don'ts reference).
// KEEP the Node/Arrow markup in sync with Agents.jsx.
const Node = ({ color = "var(--accent)", glyph, label, sub, dashed }) => (
  <div className={`agg-node ${dashed ? "dashed" : ""}`} style={{ "--c": color }}>
    <span className="agg-node-face">{glyph}</span>
    <span className="agg-node-label">{label}</span>
    {sub && <span className="agg-node-sub">{sub}</span>}
  </div>
);
const Arrow = ({ label }) => (
  <div className="agg-arrow">
    {label && <span className="agg-arrow-lbl">{label}</span>}
    <span className="agg-arrow-line" />
  </div>
);

const PG_CHAPTERS = [
  {
    title: "What a workroom is made of", sub: "anatomy",
    lead: <>Four parts, all in plain language. A room carries <b>instructions</b> (how everything in it behaves), a <b>knowledge shelf</b> (what it knows), an optional <b>linked folder or repo</b> (where file work happens), and a <b>crew</b> of agents staffed to it. Set them once — every chat and mission inherits all four.</>,
    note: <>Rooms get an identity (color + icon) automatically — click the icon in the room header to pick any emoji.</>,
    diagram: (
      <div className="agg-flow">
        <Node glyph="¶" color="#8b7cf6" label="Instructions" sub="tone, rules, goals" />
        <Arrow />
        <Node glyph="📚" color="#f4a261" label="Knowledge" sub="notes, files, data" />
        <Arrow />
        <Node glyph="📁" color="#5fb573" label="Folder / repo" sub="where file work happens" />
        <Arrow />
        <Node glyph="✦" label="The room" sub="everything rides along" />
      </div>
    ),
  },
  {
    title: "Every chat is grounded", sub: "context",
    lead: <>Ask anything in the room's composer and the room's instructions and knowledge are injected <b>silently, every time</b>. You never re-explain the project — the room remembers so you don't have to.</>,
    note: <>Try it: simulations 2 and 3 on the right prove the injection with answers you can verify.</>,
    diagram: (
      <div className="agg-flow">
        <Node glyph="🧑" color="var(--text-1)" label="You" sub="one question" />
        <Arrow label="ask" />
        <Node glyph="✦" label="Room" sub="instructions + knowledge applied" />
        <Arrow label="answer" />
        <Node glyph="✓" color="#5fb573" label="Grounded reply" sub="cites the room's facts" />
      </div>
    ),
  },
  {
    title: "The crew works in context", sub: "crew",
    lead: <>Staff agents (and teams) into the room, then click <b>Put to work</b>. The agent brings its own craft; the room brings the brief-ing — instructions, knowledge, and folder. File-tool agents open Let's Collaborate in the room's folder; chat agents open a grounded chat.</>,
    note: <>Each agent builds a per-room track record ("3 missions here · 100% clean") and its portrait's mood follows its latest run.</>,
    diagram: (
      <div className="agg-flow">
        <Node glyph="◆" color="#13c2d6" label="Crew agent" sub="its own instructions" />
        <Arrow label="+ room context" />
        <Node glyph="⚒" color="#8b7cf6" label="Mission" sub="chat or folder work" />
        <Arrow label="lands in" />
        <Node glyph="☰" color="#5fb573" label="Work feed" sub="tagged with the agent" />
      </div>
    ),
  },
  {
    title: "One feed, the whole story", sub: "feed",
    lead: <>Everything the room produces — chats, Collaborate tasks, crew missions — lands in <b>one chronological feed</b>, filterable by type or by agent. The banner's pulse line ("3 runs today · 2h ago") tells you at a glance whether a room is alive.</>,
    note: <>Click any feed row to reopen that conversation exactly where it left off.</>,
    diagram: (
      <div className="agg-flow">
        <Node glyph="💬" color="#13c2d6" label="Chats" />
        <Arrow />
        <Node glyph="🔨" color="#f4a261" label="Missions" sub="crew + Collaborate" />
        <Arrow label="merge" />
        <Node glyph="☰" label="Work feed" sub="filter: All · Chats · Tasks · per-agent" />
        <Arrow />
        <Node glyph="📈" color="#5fb573" label="Pulse" sub="runs today · last activity" />
      </div>
    ),
  },
  {
    title: "Automate it, share it", sub: "scale",
    lead: <>The Scheduler can run a <b>room + agent combo</b> on a timer — the agent does room work headless while you sleep. And a whole room <b>travels</b>: the share button exports one .madavroom.json with the instructions, knowledge, and crew; importing it recreates the room <i>and</i> the agents on any machine.</>,
    note: <>Shared rooms never include your local folder path or chat history; imported agents arrive in ask-permission mode.</>,
    diagram: (
      <div className="agg-flow">
        <Node glyph="⏱" color="#f4a261" label="Scheduler" sub="daily · weekly · manual" />
        <Arrow label="room + agent" />
        <Node glyph="✦" label="Headless mission" sub="brief + knowledge applied" />
        <Arrow />
        <Node glyph="📦" color="#8b7cf6" label=".madavroom" sub="room + crew, portable" />
        <Arrow label="import" />
        <Node glyph="🧑‍🤝‍🧑" color="#5fb573" label="A teammate" sub="agents recreated" />
      </div>
    ),
  },
];

const PG_DOS = [
  <>Write the <b>instructions</b> like standing orders — tone, rules, goals. Every chat and mission in the room follows them silently.</>,
  <>Shelve real <b>knowledge</b> — pricing, specs, voice guides. Anything on the shelf is citable by the whole room, crew included.</>,
  <>Staff <b>specialist agents</b>, not generalists — the room supplies context; the agent supplies craft.</>,
  <>Link the <b>folder</b> before putting file-tool agents to work — that's where their hands go.</>,
  <>Use the <b>Scheduler combo</b> for recurring room work — the run lands in the agent's per-room record.</>,
];
const PG_DONTS = [
  <>Don't paste secrets into instructions or knowledge — they travel with shared .madavroom exports.</>,
  <>Don't overload the shelf — knowledge is injected whole each run; a few hundred KB is the practical ceiling today.</>,
  <>Don't put behavior rules in knowledge or facts in instructions — behavior goes in instructions, facts on the shelf.</>,
  <>Don't expect scheduled room runs in the feed — headless runs live in the task's run history and the agent's record.</>,
  <>Don't delete the Simulation room or its crew — they're the built-in classroom (and they're protected anyway).</>,
];
const PG_FEATURES = [
  { icon: Sparkles, t: "Instructions", d: "The room's standing orders — injected into every chat, mission, and scheduled run.",
    use: "Set tone, rules, and goals once instead of repeating them in every conversation.",
    how: ["Open the room → Instructions (left zone)", "Write rules in plain words; it saves on blur", "Use the expand button for the large resizable editor"],
    eg: 'A legal room: "Always flag liability clauses" — every chat in the room flags them unprompted.' },
  { icon: BookIcon, t: "Knowledge shelf", d: "Notes, files, and data the whole room can draw on — click any book-spine to read or edit it.",
    use: "Give the room facts: pricing, specs, brand voice, reference docs. PDFs and Word files are parsed on desktop.",
    how: ["Add files or paste text in the Knowledge section", "Click a book-spine row to open, edit, and save it", "Prune stale items — the trash on each row"],
    eg: "A pricing note on the shelf → \"what do we know about pricing?\" answers correctly in any room chat." },
  { icon: Users, t: "Crew & teams", d: "Agents and teams staffed to the room; Put to work launches them with full room context.",
    use: "Run your specialists inside the project so they know everything the room knows.",
    how: ["Assign agents (multi-select with portraits) or a team", "Click Put to work — file agents open the room's folder, chat agents open a grounded chat", "Watch the per-room record grow on each crew card"],
    eg: "Pitchwright in a launch room pitches WITH the tagline — agent craft + room context in one reply." },
  { icon: Hammer, t: "Work feed", d: "Every chat and mission the room produced, merged chronologically with filter chips.",
    use: "Find anything the room ever made — by type or by which agent made it.",
    how: ["Open the room — the feed is the center column", "Filter with All · Chats · Tasks · per-agent chips", "Click a row to reopen it; trash removes just that item"],
    eg: "Click the \"Pitchwright\" chip → only Pitchwright's runs remain." },
  { icon: Plug, t: "Connectors in rooms", d: "Room chats can pull from every enabled connector — @-mention one in the composer to point at it.",
    use: "Ask a room to check Gmail, a drive, a repo, or any connected app — with the room's instructions and knowledge still applied.",
    how: ["Enable connectors in the Connectors screen", "In any room chat, type @ — your connectors appear in the mention menu", "Pick one and ask; approve the tool call when it appears"],
    eg: "In the launch room: \"@finance-data what changed today?\" — the answer uses the connector AND the room's context." },
  { icon: Share2, t: "Share & import", d: "One .madavroom.json carries the room AND its crew; importing recreates both.",
    use: "Hand a colleague a ready-to-work room — no rebuild, no agent setup on their side.",
    how: ["Room header → share button → send the file", "They click Import on the Workrooms shelf", "Missing agents are created (ask-permission mode, default model); existing ones are reused"],
    eg: "Export \"Launch Marketing\" → a teammate imports it and Pitchwright appears on their roster, staffed in the room." },
];
const PG_MATRIX = [
  ["Room chat (composer)", "Instructions + knowledge injected every turn; @-mention connectors work here too."],
  ["Put to work (crew)", "Agent instructions + room context combined; runs tagged to the room."],
  ["Work in the room's folder", "Collaborate session in the linked folder; room context injected once up front."],
  ["Scheduled room + agent combo", "Headless: room context + agent + folder; results in run history + per-room record."],
  ["Teams put to work", "Mission chat tagged to the room; the room context injects before the relay/managed run."],
];

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

export default function Workrooms({ onOpen, onStartChat, onStartCowork, onOpenTask, onPutToWork, onPutTeamToWork, openId }) {
  const [rooms, setRooms] = useState([]);
  const [agents, setAgents] = useState([]);      // full roster from settings
  const [teams, setTeams] = useState([]);        // saved teams from settings
  const [layout, setLayout] = useState(lsGet("be.wr.layout", "rows")); // rows | tiles
  const [briefOpen, setBriefOpen] = useState(false);   // brief in a big resizable editor
  const [glyphOpen, setGlyphOpen] = useState(false);   // room icon picker
  const [guideTab, setGuideTab] = useState("tour");    // Projects guide: tour | reference
  const [chapter, setChapter] = useState(0);            // Projects guide chapter rail
  const [openFeat, setOpenFeat] = useState(0);          // Projects guide reference accordion
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
    bridge.getSettings().then((s) => { setAgents(s.agents || []); setTeams(s.teams || []); }).catch(() => {});
  }, []);
  // Returning from a room-scoped run: land straight back inside that room.
  useEffect(() => { if (openId) open(openId); }, []); // eslint-disable-line

  // ---- PROJECT SIMULATION (the built-in Workrooms guide) ----
  // Two delete-protected demo agents live in a "Project Simulation" folder by default,
  // and the guide can stand up a protected demo room that exercises every concept.
  const SIM_BRIEF = 'We are launching madav.ai. Tone: confident, no hype words. Always mention the tagline "Built to think with you".';
  const ensureSimAgents = async () => {
    const cfg = await bridge.getSettings();
    let roster = (cfg.agents || []).slice(); let groups = (cfg.agentGroups || []).slice(); let changed = false;
    if (!groups.some((g) => g.id === "grp_simulation")) { groups.push({ id: "grp_simulation", name: "Project Simulation" }); changed = true; }
    const mk = (id, name, description, instructions, tools, glyph, color) => {
      if (roster.some((a) => a.id === id)) return;
      roster.push({ id, name, description, instructions, tools, identity: { color, glyph }, group: "grp_simulation", createdAt: Date.now() });
      changed = true;
    };
    mk("agent_sim_pitchwright", "Pitchwright", "Writes crisp one-paragraph product pitches. (Project Simulation)",
       "You write crisp one-paragraph product pitches. Keep it tight, concrete, and confident.",
       { files: false, shell: false, connectors: false, skills: false }, "📣", "#8b7cf6");
    mk("agent_sim_reviewer", "Doc Reviewer", "Reads the room folder's files and reports on them. (Project Simulation)",
       "You review documents and files: list them, summarize each in one line, and flag anything inconsistent.",
       { files: true, shell: false, connectors: false, skills: false }, "🔎", "#13c2d6");
    if (changed) { await bridge.saveSettings({ ...cfg, agents: roster, agentGroups: groups }); setAgents(roster); }
    return roster;
  };
  useEffect(() => { ensureSimAgents().catch(() => {}); }, []); // defaults exist from first launch

  const ensureSimRoom = async () => {
    const roster = await ensureSimAgents();
    let simRoom = (await bridge.listProjects()).find((r) => r.sim);
    if (!simRoom) {
      const p = await bridge.createProject("Simulation · Launch Marketing");
      await bridge.updateProject(p.id, {
        sim: true, instructions: SIM_BRIEF,
        identity: { ...(p.identity || {}), glyph: "🎓" },
        knowledge: [{ id: "kn_sim_pricing", name: "Pricing note", type: "text", content: "Pricing: early-bird, announced at launch. Audience: indie builders and small teams." }],
      });
      await bridge.assignProjectAgent(p.id, "agent_sim_pitchwright");
      await bridge.assignProjectAgent(p.id, "agent_sim_reviewer");
      simRoom = await bridge.getProject(p.id);
      await loadList();
    } else {
      simRoom = await bridge.getProject(simRoom.id);
    }
    return { simRoom, roster };
  };

  // Guide step actions — each one performs the test FOR the user.
  const simChat = async (text) => { const { simRoom } = await ensureSimRoom(); onStartChat && onStartChat(simRoom, text); };
  const simPitch = async () => {
    const { simRoom, roster } = await ensureSimRoom();
    onPutToWork && onPutToWork(simRoom, roster.find((a) => a.id === "agent_sim_pitchwright"), "Pitch us in one paragraph.");
  };
  const simFiles = async () => {
    const { simRoom, roster } = await ensureSimRoom();
    let r = simRoom;
    if (!r.folder) {
      const ok = await madavConfirm("This test needs a folder with a few files in it.\n\nWant me to set that up for you? Pick (or create) any folder next — I'll add three small sample marketing files there and link it to the simulation room. Nothing is ever overwritten.", { okLabel: "Pick a folder" });
      if (!ok) return;
      const dir = await bridge.chooseFolder();
      if (typeof dir !== "string" || !dir) { if (dir && dir.error) madavAlert(dir.error); return; }
      const res = bridge.seedSampleFiles ? await bridge.seedSampleFiles(dir) : { error: "Creating sample files needs the desktop app." };
      if (res && res.error) { madavAlert(res.error); return; }
      await bridge.updateProject(r.id, { folder: dir, githubUrl: "" });
      r = await bridge.getProject(r.id);
    }
    onPutToWork && onPutToWork(r, roster.find((a) => a.id === "agent_sim_reviewer"), "List the files here and summarize each in one line.");
  };
  const simGuard = async () => {
    const { roster } = await ensureSimRoom();
    let guard = (await bridge.listProjects()).find((x) => x.name === "Guard Test");
    if (!guard) {
      guard = await bridge.createProject("Guard Test");
      await bridge.assignProjectAgent(guard.id, "agent_sim_reviewer");
    }
    const full = await bridge.getProject(guard.id);
    await loadList();
    onPutToWork && onPutToWork(full, roster.find((a) => a.id === "agent_sim_reviewer"));
  };

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
    if (room.sim) { madavAlert("This is Madav's built-in simulation room (the Workrooms guide uses it) — it can't be deleted. You can still play with everything inside it."); return; }
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
  const crewTeams = useMemo(() => (room ? (room.teamIds || []).map((id) => teams.find((t) => t.id === id)).filter(Boolean) : []), [room, teams]);
  const benchedTeams = useMemo(() => teams.filter((t) => !room || !(room.teamIds || []).includes(t.id)), [room, teams]);
  const assignTeam = async (teamId) => { if (!teamId) return; await bridge.assignProjectTeam(selId, teamId); refreshRoom(); };
  const unassignTeam = async (teamId) => { await bridge.unassignProjectTeam(selId, teamId); refreshRoom(); };
  const setGlyph = async (glyph) => {
    await bridge.updateProject(selId, { identity: { ...(room.identity || {}), glyph } });
    setGlyphOpen(false); refreshRoom(); loadList();
  };
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

  // ---------- PROJECTS GUIDE (same format as the Agent Guide) ----------
  if (view === "guide") {
    const PG_SIMS = [
      { n: 1, chap: 0, title: "Chapter 1 · Open the simulation room", arch: "Setup", time: "1 min",
        goal: "The built-in Simulation · Launch Marketing room — instructions, a pricing note, and a two-agent crew.",
        story: "Every classroom needs a room. This one comes pre-briefed for a product launch, with Pitchwright and Doc Reviewer already on the crew. It's permanent — play freely, you can't break it.",
        steps: ["Click Run — the room is created (or refreshed) with instructions + knowledge + crew", "Find it on the shelf: the 🎓 banner", "Open it and look around: Instructions, Knowledge, Crew"],
        act: async () => { await ensureSimRoom(); await loadList(); setView("list"); madavAlert('Simulation room is ready — open "Simulation · Launch Marketing" on the shelf.'); } },
      { n: 2, chap: 1, title: "Chapter 2 · It obeys its instructions", arch: "Instructions", time: "2 min",
        goal: "A launch tweet that carries the room's tagline — which you never typed.",
        story: "You ask for one tweet. The room's standing instructions demand the tagline and a no-hype tone — watch both appear without you mentioning either.",
        steps: ["Run — we send \"Write one tweet announcing our launch\" in the room", "Read the reply", "PASS: it contains \"Built to think with you\""],
        act: () => simChat("Write one tweet announcing our launch.") },
      { n: 3, chap: 1, title: "Chapter 3 · It knows its knowledge", arch: "Knowledge", time: "2 min",
        goal: "A pricing answer that could only come from the note on the room's shelf.",
        story: "The early-bird pricing fact lives in exactly one place: the room's knowledge note. If the answer cites it, the shelf is working.",
        steps: ["Run — we ask \"What do we know about pricing?\" in the room", "PASS: the answer says early-bird, announced at launch"],
        act: () => simChat("What do we know about pricing?") },
      { n: 4, chap: 2, title: "Chapter 4 · Put a chat agent to work", arch: "Crew · chat agent", time: "3 min",
        goal: "One reply that blends Pitchwright's craft with the room's context.",
        story: "Pitchwright writes tight pitches; the room demands the tagline. One reply showing BOTH proves agent + room combine — the heart of Workrooms.",
        steps: ["Run — Pitchwright launches in the room with \"Pitch us in one paragraph\"", "PASS: pitch format AND the tagline/launch context", "Back in the room: the feed row is tagged Pitchwright; its record reads \"1 mission here\""],
        act: simPitch },
      { n: 5, chap: 2, title: "Chapter 5 · Put a file agent to work", arch: "Crew · file agent", time: "4 min",
        goal: "Doc Reviewer reads real files from a folder of YOUR choosing.",
        story: "File agents need a folder. If the room has none, Madav offers to create three sample files in a folder you pick, links it, then sends Doc Reviewer in.",
        steps: ["Run — if needed, agree and pick (or create) any folder", "Madav adds three sample files there (never overwrites) and links it", "PASS: a Collaborate session opens in your folder and the reply names your actual files"],
        act: simFiles },
      { n: 6, chap: 2, title: "Chapter 6 · The folder guard", arch: "Crew · safety", time: "1 min",
        goal: "Proof that a file agent refuses to launch without a folder.",
        story: "A disposable \"Guard Test\" room with no folder. Doc Reviewer should be stopped at the door with a clear message — nothing launches.",
        steps: ["Run — Doc Reviewer is put to work in the folder-less room", "PASS: a popup asks you to link a folder first", "Delete Guard Test afterwards if you like — that tests delete, too"],
        act: simGuard },
    ];
    const ch = PG_CHAPTERS[chapter];

    if (guideTab === "reference") {
      return (
        <div className="agg-ref scroll">
          <div className="agg-ref-inner">
            <button className="pj-back" style={{ marginBottom: 6 }} onClick={() => setView("list")}><ArrowLeft size={15} /> Workrooms</button>
            <div className="agg-subnav">
              <button onClick={() => setGuideTab("tour")}><Compass size={14} /> Tour &amp; practice</button>
              <button className="on"><BookIcon size={14} /> Do's &amp; don'ts</button>
              <button onClick={() => setView("list")}><ArrowRight size={14} /> Go to Workrooms</button>
            </div>
            <div className="agg-kicker"><BookIcon size={13} /> Madav Projects Guide</div>
            <h1>Do's &amp; don'ts, and how rooms work</h1>
            <p className="agg-ref-sub">The short reference for getting the most out of your workrooms — skim the do's and don'ts first; the map below shows where the room's context applies.</p>
            <div className="agg-ref-grid">
              <div className="agg-ref-card do">
                <h3><ShieldCheck size={16} /> Do</h3>
                <ul>{PG_DOS.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
              <div className="agg-ref-card dont">
                <h3><ShieldAlert size={16} /> Don't</h3>
                <ul>{PG_DONTS.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            </div>
            <div className="agg-ref-sec">
              <h2>What a room gives you</h2>
              <p className="agg-ref-cap" style={{ display: "block", margin: "4px 0 8px", border: "none", background: "none", padding: 0, color: "var(--text-2)", fontSize: 12 }}>Tap any capability to see how to leverage it.</p>
              <div className="agg-ref-feats">
                {PG_FEATURES.map((f, i) => {
                  const I = f.icon;
                  const isOpen = openFeat === i;
                  return (
                    <Fragment key={i}>
                      <button className={`agg-ref-feat ${isOpen ? "open" : ""}`} onClick={() => setOpenFeat(isOpen ? null : i)} aria-expanded={isOpen}>
                        <span className="agg-ref-ic"><I size={15} /></span>
                        <span className="agg-ref-feat-main">
                          <span className="agg-ref-feat-t">{f.t}</span>
                          <span className="agg-ref-feat-d">{f.d}</span>
                        </span>
                        <ArrowRight size={15} className="agg-ref-feat-cx" />
                      </button>
                      {isOpen && (
                        <div className="agg-ref-detail">
                          {f.use && <p><b style={{ color: "var(--text-0)" }}>When to use it: </b>{f.use}</p>}
                          {f.how && <ol className="agg-ref-how">{f.how.map((h, k) => <li key={k}>{h}</li>)}</ol>}
                          {f.eg && <span className="agg-ref-eg"><b>Example — </b>{f.eg}</span>}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
            <div className="agg-ref-sec">
              <h2>Where the room's context applies</h2>
              <dl className="agg-ref-cap" style={{ marginTop: 8 }}>
                {PG_MATRIX.flatMap(([k, v], i) => [<dt key={"k" + i}>{k}</dt>, <dd key={"v" + i}>{v}</dd>])}
              </dl>
            </div>
            <div className="ag-hint">Privacy note: shared .madavroom files carry instructions, knowledge, and crew definitions — never your local folder path or chat history. Imported agents always arrive in ask-permission mode.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="agg-wrap">
        {/* LEFT — the story, one chapter at a time */}
        <div className="agg-left scroll">
          <button className="pj-back" style={{ marginBottom: 6 }} onClick={() => setView("list")}><ArrowLeft size={15} /> Workrooms</button>
          <div className="agg-tophead">
            <div className="agg-kicker"><BookIcon size={13} className="agg-book" /> A 3-minute guide</div>
            <button className="btn primary" onClick={() => { setView("list"); setCreating(true); }}><Plus size={14} /> Open your first workroom</button>
          </div>
          <h1 className="agg-h1">Meet your Workrooms</h1>
          <p className="agg-intro">
            Most chats forget your project the moment you close them. A workroom <b>remembers for you</b> —
            its instructions, its knowledge, its folder, and a crew of agents that use all of it
            automatically. Brief the room once. Then everything you run inside it already knows the job.
          </p>
          <div className="agg-subnav">
            <button className="on"><Compass size={14} /> Tour &amp; practice</button>
            <button onClick={() => setGuideTab("reference")}><BookIcon size={14} /> Do's &amp; don'ts</button>
            <button onClick={() => setView("list")}><ArrowRight size={14} /> Go to Workrooms</button>
          </div>
          <div className="agg-rail">
            {PG_CHAPTERS.map((c, i) => (
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
            {/* On the first chapter, Back EXITS to Workrooms — never a dead button */}
            <button className="btn ghost" onClick={() => (chapter === 0 ? setView("list") : setChapter((c) => c - 1))}>← {chapter === 0 ? "Workrooms" : "Back"}</button>
            <span className="agg-pager-dots">{PG_CHAPTERS.map((_, i) => <span key={i} className={chapter === i ? "on" : ""} />)}</span>
            {chapter < PG_CHAPTERS.length - 1
              ? <button className="btn primary" onClick={() => setChapter((c) => c + 1)}>Next <ArrowRight size={13} /></button>
              : <button className="btn primary" onClick={() => setView("list")}><Plus size={13} /> Open Workrooms</button>}
          </div>
        </div>

        {/* RIGHT — flight school: runnable simulations */}
        <div className="agg-right scroll">
          <div className="agg-right-head">
            <div className="agg-kicker" style={{ marginBottom: 8 }}><Play size={12} /> Flight school</div>
            <h2>Run the Launch Marketing simulation</h2>
            <p>One story, six chapters. You're testing the launch room for <b>madav.ai</b> with a permanent, protected crew (find them in the "Project Simulation" agents folder). Every chapter runs a real test FOR you — each one proves the concept the chapter on the left just taught.</p>
          </div>
          <div className="agg-sims">
            {PG_SIMS.map((sim) => (
              <div key={sim.n} className={`agg-sim ${sim.chap === chapter ? "lit" : ""}`}>
                <div className="agg-sim-head">
                  <span className="agg-sim-n">{sim.n}</span>
                  <div>
                    <div className="agg-sim-title">{sim.title}</div>
                    <div className="agg-sim-meta">{sim.arch} · {sim.time}</div>
                  </div>
                </div>
                <div className="agg-sim-goal"><Target size={14} /><span><b>Goal:</b> {sim.goal}</span></div>
                <p className="agg-sim-story">{sim.story}</p>
                <div className="agg-sim-label">Steps</div>
                <ol className="agg-sim-steps">{sim.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                <button className="btn ghost agg-sim-go" onClick={() => sim.act()}><Play size={12} /> Run simulation</button>
              </div>
            ))}
          </div>
          <div className="ag-hint" style={{ margin: "16px 0 8px" }}>Reopen this guide any time — <BookIcon size={11} style={{ verticalAlign: "-2px" }} /> Projects Guide lives in the Workrooms header.</div>
        </div>
      </div>
    );
  }

  // ---------- ROOM INTERIOR ----------
  if (view === "room" && room) {
    const kn = room.knowledge || [];
    const idn = room.identity || { color: "var(--accent)", glyph: "✦" };
    return (
      <div className="wr-roomwrap scroll">
        <button className="pj-back" onClick={back}><ArrowLeft size={15} /> All workrooms</button>

        {/* Room header — a soft gradient spine in the room's identity color */}
        <header className="wr-roomhead" style={{ "--wr": idn.color }}>
          <button className="wr-roomglyph" title="Change this room's icon" onClick={() => setGlyphOpen(true)}>{idn.glyph}</button>
          <div className="wr-roomtitle">
            <h1 className="wr-roomname">{room.name}</h1>
            <div className="wr-pulse">{pulseLine(room, sessions, convs)}</div>
          </div>
          <button className="icon-btn" title="Share this workroom — exports a .madavroom.json with the brief, knowledge, and crew agents" onClick={shareRoom}><Share2 size={15} /></button>
          {!room.sim && <button className="icon-btn danger" title="Close this workroom" onClick={delRoom}><Trash2 size={15} /></button>}
        </header>

        <div className="wr-zones">
          {/* LEFT — the brief */}
          <aside className="wr-brief">
            <div className="wr-sec wr-resizable" title="Drag the bottom-right corner to resize">
              <div className="wr-sechead"><Sparkles size={13} /> Instructions
                <span style={{ flex: 1 }} />
                <button className="icon-btn" title="Open in a large editor" style={{ width: 22, height: 22 }} onClick={() => setBriefOpen(true)}><Maximize2 size={12} /></button>
              </div>
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
            {(crewTeams.length > 0 || benchedTeams.length > 0) && (
              <>
                <div className="wr-sechead" style={{ margin: "14px 0 8px" }}><Users size={13} /> Teams</div>
                {crewTeams.map((t) => (
                  <div key={t.id} className="wr-crewcard">
                    <span className="wr-teamfaces">
                      {(t.members || []).slice(0, 3).map((m, i) => (
                        <span key={i} className="wr-face" style={{ marginLeft: i ? -10 : 0 }}>
                          <Portrait seed={m.id || m.name} color={(m.identity && m.identity.color) || idn.color} size={26} mood="idle" title={m.name} />
                        </span>
                      ))}
                    </span>
                    <div className="wr-crewinfo">
                      <div className="wr-crewname">{t.name}</div>
                      <div className="mo-sub">{(t.members || []).length} agents · {t.mode === "manager" ? "managed" : "relay"}</div>
                    </div>
                    <div className="wr-crewbtns">
                      <button className="btn primary" style={{ padding: "4px 8px", fontSize: 12 }} title="Launch this team with the room's brief and knowledge"
                        onClick={() => onPutTeamToWork && onPutTeamToWork(room, t)}>Put to work</button>
                      <button className="btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} title="Remove this team from the room" onClick={() => unassignTeam(t.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
                {benchedTeams.length > 0 && (
                  <select className="model-search" style={{ marginTop: 6 }} value="" onChange={(e) => assignTeam(e.target.value)}>
                    <option value="">+ Assign a team to this room…</option>
                    {benchedTeams.map((t) => <option key={t.id} value={t.id}>{t.name || "Untitled team"} · {(t.members || []).length} agents</option>)}
                  </select>
                )}
              </>
            )}
            <div className="wr-recruit"><UserPlus size={12} /> Need a specialist? Recruit one in Agents — then staff it here.</div>
          </aside>
        </div>

        {/* Brief in a big resizable editor — long, detailed instructions deserve room */}
        {briefOpen && (
          <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setBriefOpen(false); }}>
            <div className="pj-create" style={{ width: 700 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Sparkles size={16} style={{ color: idn.color }} />
                <h2 style={{ flex: 1, margin: 0, fontSize: 17 }}>Instructions — {room.name}</h2>
                <button className="icon-btn" onClick={() => setBriefOpen(false)}><X size={16} /></button>
              </div>
              <textarea className="model-search" rows={18} autoFocus style={{ resize: "vertical", fontFamily: "inherit", width: "100%", marginTop: 12, lineHeight: 1.55 }}
                value={instr} onChange={(e) => setInstr(e.target.value)} placeholder="Goals, tone, rules, context this room should always work by…" />
              <div className="pj-create-btns">
                <button className="btn" onClick={() => setBriefOpen(false)}>Close</button>
                <span style={{ flex: 1 }} />
                <button className="btn primary" onClick={async () => { await saveInstr(); setBriefOpen(false); }}>Save instructions</button>
              </div>
            </div>
          </div>
        )}

        {/* Room icon picker — glyphs + emojis; rooms should be fun to recognize */}
        {glyphOpen && (
          <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setGlyphOpen(false); }}>
            <div className="pj-create" style={{ width: 520 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ flex: 1, margin: 0, fontSize: 17 }}>Pick an icon for {room.name}</h2>
                <button className="icon-btn" onClick={() => setGlyphOpen(false)}><X size={16} /></button>
              </div>
              <div className="wr-glyphgrid">
                {GLYPHS.map((g) => (
                  <button key={g} className={`wr-glyphopt ${idn.glyph === g ? "on" : ""}`} onClick={() => setGlyph(g)}>{g}</button>
                ))}
              </div>
            </div>
          </div>
        )}

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
          <p style={{ color: "var(--text-2)", fontSize: 13, margin: "4px 0 0" }}>Each room keeps instructions, a knowledge shelf, and a crew of agents on the job.</p>
        </div>
        <div className="pj-actions">
          <button className="icon-btn" title={layout === "rows" ? "Tile view" : "List view"} onClick={() => { const v = layout === "rows" ? "tiles" : "rows"; setLayout(v); lsSet("be.wr.layout", v); }}>
            {layout === "rows" ? <LayoutGrid size={15} /> : <List size={15} />}
          </button>
          <button className="icon-btn" title={`Sort by ${sortBy === "date" ? "name" : "date"}`} onClick={() => setSortBy((s) => s === "date" ? "name" : "date")}><ArrowUpDown size={15} /></button>
          <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workrooms…" /></div>
          <button className="btn ghost" title="Projects Guide — tour, do's & don'ts, and runnable simulations" onClick={() => { setGuideTab("tour"); setChapter(0); setView("guide"); }}><BookIcon size={15} /> Projects Guide</button>
          <button className="btn ghost" title="Import a shared .madavroom.json — recreates the room and its crew agents" onClick={() => importRef.current && importRef.current.click()}><Upload size={15} /> Import</button>
          <input ref={importRef} type="file" accept=".json,.madavroom" style={{ display: "none" }} onChange={onImportRoom} />
          <button className="btn primary" onClick={() => { setDraft({ name: "", desc: "" }); setCreating(true); }}><Plus size={15} /> New workroom</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="pjd-files-empty" style={{ marginTop: 20 }}>No workrooms yet. Open one, brief it, shelve some knowledge, and staff a crew.</div>
      ) : (
        <div className={`wr-shelf ${layout === "tiles" ? "tiles" : ""}`}>
          {shown.map((p) => {
            const idn = p.identity || { color: "var(--accent)", glyph: "✦" };
            const crewFaces = (p.agentIds || []).map((id) => agents.find((a) => a.id === id)).filter(Boolean);
            const meterPct = Math.min(100, Math.round(((p.knowledgeBytes || 0) / 200000) * 100)) || (p.knowledgeCount ? 8 : 0);
            if (layout === "tiles") return (
              <button key={p.id} className="wr-tile" style={{ "--wr": idn.color }} onClick={() => open(p.id)}>
                <span className="wr-tileglyph">{idn.glyph}</span>
                <span className="wr-name" style={{ fontSize: 16 }}>{p.name}</span>
                <span className="wr-pulse">{pulseLine(p, sessions)}</span>
                <span className="wr-crewstrip" style={{ marginTop: 6 }}>
                  {crewFaces.slice(0, 4).map((a) => (
                    <span key={a.id} className="wr-face"><Portrait seed={a.id || a.name} color={(a.identity && a.identity.color) || idn.color} size={24} mood="idle" title={a.name} /></span>
                  ))}
                  {crewFaces.length === 0 && <span className="wr-nocrew">no crew</span>}
                </span>
              </button>
            );
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
            <label>Instructions (optional — refine anytime)</label>
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
