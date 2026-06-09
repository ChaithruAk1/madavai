// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Agent Studio — build agents by talking to a designer, watch them come alive in a live
// test bench, and send them to work. Agents carry a visual identity (color + glyph) and
// run on the model from the model selector (optionally pinned per agent — never an API key).
// Backend contract unchanged: settings.agents store, bridge.completeOnce, onLaunch(agent, prompt).
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Pencil, Rocket, FolderOpen, TerminalSquare, Plug, Puzzle, Check, Loader2, ArrowUp, Cpu, Send, RotateCcw, Wand2, FlaskConical, Hammer, Users, User, Zap, GitMerge, BookOpen, ArrowRight, Play } from "lucide-react";
import { bridge } from "../bridge/index.js";
import ModelPicker from "./ModelPicker.jsx";

const TOOL_DEFS = [
  { key: "files",      label: "Files",      icon: FolderOpen,     note: "Read, write, edit and search files in a working folder." },
  { key: "shell",      label: "Terminal",   icon: TerminalSquare, note: "Run shell commands (desktop only)." },
  { key: "connectors", label: "Connectors", icon: Plug,           note: "Your enabled MCP connectors (mail, GitHub, Slack…)." },
  { key: "skills",     label: "Skills",     icon: Puzzle,         note: "Load installed skill playbooks on demand." },
];

// Identity palette — every agent gets a face.
const ID_COLORS = ["#13c2d6", "#8b7cf6", "#f4a261", "#e76f81", "#5fb573", "#d6a313", "#5e9bf2", "#c77dba"];
const ID_GLYPHS = ["🜁", "✦", "◆", "⌘", "♟", "✺", "☄", "❖", "⚙", "🜃", "♜", "✤"];
const hashStr = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const autoIdentity = (seed) => ({ color: ID_COLORS[hashStr(seed) % ID_COLORS.length], glyph: ID_GLYPHS[hashStr(seed + "g") % ID_GLYPHS.length] });

// Personas — the same proven configs, presented as a crew you can hire. (Instructions/tools unchanged.)
const PERSONAS = [
  { cat: "Research", persona: "Scout", role: "Deep research, cited", desc: "Multi-step research with source synthesis and citations.",
    tools: { files: false, shell: false, connectors: true, skills: true },
    instructions: "You are a deep researcher. Break the question into sub-questions, gather evidence step by step (use connectors such as fetch/search when available), cross-check claims across at least two sources, and synthesize a structured answer with inline citations. Flag low-confidence claims explicitly. Never fabricate sources." },
  { cat: "Research", persona: "Radar", role: "What changed in your field", desc: "Scans sources for a topic and writes a what-changed brief.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You monitor a field/topic. Given a topic (and sources when provided), gather the latest developments, compare against what was previously known, and write a concise what-changed brief: 'New', 'Changed', 'Unchanged but notable'. Lead with the single most important development. Tip: schedule me weekly from the Scheduler." },
  { cat: "Ops", persona: "Sentinel", role: "Incident command", desc: "Triages an alert, drafts the incident ticket, runs the war room.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You are an incident commander. Given an alert or report: 1) triage severity and likely blast radius, 2) draft an incident ticket (title, severity, impact, timeline, current hypothesis), 3) coordinate next actions as a checklist with owners, 4) keep a running war-room log. Use connectors (issue tracker, chat) when connected; otherwise produce the artifacts as text." },
  { cat: "Ops", persona: "Concierge", role: "Support from your docs", desc: "Answers customer questions from your docs and escalates honestly.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a customer-support agent. Answer ONLY from the provided docs/knowledge (files in the working folder or connected sources). Quote the relevant passage when helpful. If the answer is not in the docs, say so plainly and draft an escalation summary (issue, what was tried, customer impact) instead of guessing." },
  { cat: "Ops", persona: "Bridger", role: "Support → engineering", desc: "Turns a support thread into a reproduced, filed bug report.",
    tools: { files: true, shell: true, connectors: true, skills: false },
    instructions: "You turn support conversations into engineering-ready bug reports. Read the conversation, identify the defect, attempt to reproduce it (use the working folder/terminal when code is available), then file or draft an issue: title, environment, exact repro steps, expected vs actual, severity, and the support context link. Mark repro as confirmed/unconfirmed honestly." },
  { cat: "Docs", persona: "Clausewise", role: "Contract obligations", desc: "Extracts clauses, deadlines and obligations — quotes every term.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You analyze contracts. Extract parties, term, renewal/termination windows, payment terms, SLAs, liability caps and unusual clauses. Build an obligations table with due dates sorted soonest-first and flag anything within 30 days. Quote the exact clause text for every extracted item — never paraphrase a legal term without the quote." },
  { cat: "Docs", persona: "Retroscribe", role: "Sprint retro docs", desc: "Pulls a closed sprint, synthesizes themes, writes the retro doc.",
    tools: { files: true, shell: false, connectors: true, skills: true },
    instructions: "You facilitate sprint retros. Given sprint data (from a connected tracker or pasted/linked files), synthesize: what shipped vs planned, themes in what went well / what didn't, and 3-5 concrete action items with owners. Write the result as a clean retro doc. Be specific — name the tickets behind each theme." },
  { cat: "Docs", persona: "Schema", role: "Text → typed JSON", desc: "Parses unstructured text into a strict, typed JSON schema.",
    tools: { files: true, shell: false, connectors: false, skills: false },
    instructions: "You convert unstructured text into clean, typed JSON. First infer or confirm the target schema, then extract strictly — no invented fields, null for missing values, ISO-8601 dates, numbers as numbers. Output ONLY the JSON unless asked otherwise. Validate the result against the schema before answering." },
  { cat: "Data", persona: "Quant", role: "Data analysis & reports", desc: "Loads, profiles and analyzes datasets with real computed numbers.",
    tools: { files: true, shell: true, connectors: false, skills: true },
    instructions: "You are a data analyst. Load datasets from the working folder, profile them first (shape, types, missing values), then answer questions with real computed numbers — never estimates. Prefer scripts (run via the terminal on desktop) so results are reproducible. Present findings readably: key numbers first, method after, caveats last." },
];
const PERSONA_CATS = ["Research", "Ops", "Docs", "Data"];

const blankAgent = () => {
  const id = "agent_" + Math.random().toString(36).slice(2, 9);
  return { id, name: "", description: "", instructions: "", tools: { files: false, shell: false, connectors: true, skills: true }, model: "", identity: autoIdentity(id), createdAt: Date.now() };
};

function extractJson(text) {
  if (!text) return null;
  const i = text.indexOf("{"); const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

// The designer the user talks to on the left. Always returns reply + the full updated config.
const DESIGNER_SYS = (cfg) => `You are the agent designer in BrainEdge's Agent Studio. The user is creating or refining a custom agent by talking to you.
Current agent config JSON:
${JSON.stringify({ name: cfg.name, description: cfg.description, instructions: cfg.instructions, tools: cfg.tools })}
Apply the user's message to the config (create it if empty, refine it if not). Reply with ONLY a JSON object, no prose, no code fence:
{"reply":"one or two short, friendly sentences saying what you set up or changed (or ONE clarifying question if truly needed)","config":{"name":"...","description":"one sentence","instructions":"detailed second-person system instructions covering role, method, output format, and what it must never do","tools":{"files":false,"shell":false,"connectors":false,"skills":false}}}
Tool meanings — files: read/write files in a working folder; shell: run terminal commands; connectors: external apps via MCP (mail, GitHub, Slack, web fetch…); skills: installed skill playbooks. Enable only what the agent genuinely needs. Keep everything the user didn't ask to change.`;

// Identity dot used across the Studio.
function Face({ identity, size = 34, fontSize }) {
  const c = (identity && identity.color) || ID_COLORS[0];
  const g = (identity && identity.glyph) || "✦";
  return (
    <span className="ags-face" style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.46), background: `${c}22`, border: `1px solid ${c}66`, color: c }}>{g}</span>
  );
}

const GUIDE_SEEN_KEY = "be.agentsGuideSeen";

// Simulations — guided missions the user can run to learn each architecture.
const SIMULATIONS = [
  { n: 1, kind: "agent", title: "Your first hire", arch: "Solo agent", time: "5 min",
    story: "Meet Briefly — a specialist who turns walls of text into three sharp bullets. Build it by describing it, interview it on the Bench, then hand it real work.",
    steps: ["Tell the Designer what Briefly does (we'll pre-fill it)", "Paste any paragraph on the Bench — expect exactly 3 bullets", "Put to work → paste a long article in the real session"],
    designer: "An agent called Briefly that turns any text into exactly 3 bullet points, max 15 words each, no intro or outro." },
  { n: 2, kind: "agent", title: "Hands on the files", arch: "Solo agent + tools", time: "5 min",
    story: "Quant doesn't chat — it opens your folder, reads your data, and answers with real numbers. Watch tool cards appear and approve its moves.",
    steps: ["Hire Quant from the crew (Agents tab)", "Put to work → pick a folder with a CSV", "Ask: \"profile the data — 3 most interesting findings\""] },
  { n: 3, kind: "teams", title: "The assembly line", arch: "Relay team", time: "7 min",
    story: "Digger researches. Drafter writes. Polisher perfects. Each hands their work to the next — watch the stations clear one by one in Mission Control.",
    steps: ["Build Digger, Drafter, Polisher (one Designer sentence each)", "New team → Relay line → order them", "Brief: \"a blog post on why small businesses should adopt AI agents\""] },
  { n: 4, kind: "teams", title: "The factory floor", arch: "Managed team · parallel", time: "7 min",
    story: "Four specialists, one coordinator, zero waiting. The mission splits, every station lights up AT ONCE, and one finished launch kit comes out the other end.",
    steps: ["Build Adsmith, Faqster, Socialite, Mailwright", "New team → Managed → add all four", "Brief: \"launch kit for BeanBox, a coffee subscription\" — watch all 4 glow simultaneously"] },
  { n: 5, kind: "teams", title: "The grand finale", arch: "All three together", time: "8 min",
    story: "One mission, eight agents, three architectures. Briefly profiles the customer → the Launch Crew fans out in parallel → the Blog Line polishes it into the final post.",
    steps: ["Run Briefly: \"3 bullets: target customer for a premium coffee subscription\"", "Brief Launch Crew with those bullets pasted in", "Brief Blog Line with the launch kit pasted in — the post should carry stage-1 details"] },
];

// Lightweight flow-diagram pieces (pure CSS/markup, theme-aware).
const Node = ({ color = "var(--accent)", glyph, label, sub, dashed }) => (
  <div className={`agg-node ${dashed ? "dashed" : ""}`}>
    <span className="agg-node-face" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, color }}>{glyph}</span>
    <span className="agg-node-label">{label}</span>
    {sub && <span className="agg-node-sub">{sub}</span>}
  </div>
);
const Arrow = ({ label }) => <div className="agg-arrow">{label && <span>{label}</span>}<ArrowRight size={15} /></div>;

export default function Agents({ onLaunch, onLaunchTeam, groups, activeValue, onSelectModel, onRefresh }) {
  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [tab, setTab] = useState("agents");         // "agents" | "teams"
  const [view, setView] = useState(() => {          // "guide" | "list" | "studio" | "team"
    try { return localStorage.getItem(GUIDE_SEEN_KEY) ? "list" : "guide"; } catch { return "guide"; }
  });
  const [chapter, setChapter] = useState(0);        // guide: which story chapter is on stage (0-3)
  const [needModel, setNeedModel] = useState(false); // gate: a model must be selected before building agents
  const [tdraft, setTdraft] = useState(null);       // team being edited: { id, name, identity, mode, members: [agentId] }
  const [tErr, setTErr] = useState("");
  const [draft, setDraft] = useState(blankAgent());
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [q, setQ] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  // designer chat (left pane)
  const [dMsgs, setDMsgs] = useState([]);           // { role: "user"|"designer", text }
  const [dInput, setDInput] = useState("");
  const [dBusy, setDBusy] = useState(false);
  const dEndRef = useRef(null);

  // test bench (right pane)
  const [tMsgs, setTMsgs] = useState([]);           // { role: "user"|"agent", text }
  const [tInput, setTInput] = useState("");
  const [tBusy, setTBusy] = useState(false);
  const tEndRef = useRef(null);

  useEffect(() => { bridge.getSettings().then((s) => { setAgents((s && s.agents) || []); setTeams((s && s.teams) || []); }).catch(() => {}); }, []);
  useEffect(() => { dEndRef.current && dEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [dMsgs, dBusy]);
  useEffect(() => { tEndRef.current && tEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [tMsgs, tBusy]);

  // Re-read settings from disk before every write (clobber-bug pattern).
  const persist = async (next) => {
    const cur = await bridge.getSettings();
    await bridge.saveSettings({ ...cur, agents: next });
    setAgents(next);
  };

  const saveDraft = async (closeAfter) => {
    setSaveErr(""); setSaveBusy(true);
    try {
      const a = { ...draft, name: draft.name.trim() || "Untitled agent", updatedAt: Date.now() };
      const next = agents.some((x) => x.id === a.id) ? agents.map((x) => (x.id === a.id ? a : x)) : [...agents, a];
      await persist(next);
      setDraft(a);
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 1800);
      if (closeAfter) setView("list");
      return true;
    } catch (e) { setSaveErr("Save failed: " + String((e && e.message) || e)); return false; }
    finally { setSaveBusy(false); }
  };

  const removeAgent = async (id) => { await persist(agents.filter((a) => a.id !== id)); };

  // ---- teams (multi-agent) ----
  const persistTeams = async (next) => {
    const cur = await bridge.getSettings();
    await bridge.saveSettings({ ...cur, teams: next });
    setTeams(next);
  };
  const newTeam = () => {
    const id = "team_" + Math.random().toString(36).slice(2, 9);
    setTdraft({ id, name: "", identity: autoIdentity(id), mode: "relay", members: [], createdAt: Date.now() });
    setTErr(""); setView("team");
  };
  const editTeam = (t) => { setTdraft({ ...t, members: [...t.members] }); setTErr(""); setView("team"); };
  const removeTeam = async (id) => { await persistTeams(teams.filter((t) => t.id !== id)); };
  const saveTeam = async (closeAfter) => {
    if (!tdraft.members.length) { setTErr("Add at least one agent to the team."); return false; }
    setTErr("");
    try {
      const t = { ...tdraft, name: tdraft.name.trim() || "Untitled team", updatedAt: Date.now() };
      const next = teams.some((x) => x.id === t.id) ? teams.map((x) => (x.id === t.id ? t : x)) : [...teams, t];
      await persistTeams(next);
      setTdraft(t);
      if (closeAfter) setView("list");
      return true;
    } catch (e) { setTErr("Save failed: " + String((e && e.message) || e)); return false; }
  };
  // Resolve member ids → live agent objects (so agent edits always flow into the team).
  const resolveTeam = (t) => ({ ...t, members: t.members.map((id) => agents.find((a) => a.id === id)).filter(Boolean) });
  const launchTeam = async (t) => {
    const full = resolveTeam(t);
    if (!full.members.length) { setTErr("This team has no surviving members — add agents first."); return; }
    onLaunchTeam && onLaunchTeam(full);
  };
  const toggleMember = (aid) => setTdraft((d) => ({ ...d, members: d.members.includes(aid) ? d.members.filter((x) => x !== aid) : [...d.members, aid] }));
  const moveMember = (i, dir) => setTdraft((d) => {
    const m = [...d.members]; const j = i + dir;
    if (j < 0 || j >= m.length) return d;
    [m[i], m[j]] = [m[j], m[i]];
    return { ...d, members: m };
  });

  const hasModel = !!(activeValue && activeValue.split("::")[1]);

  const openStudio = (agent) => {
    if (!hasModel) { setNeedModel(true); setView("list"); return; } // agents run on a model — pick one first
    const a = agent ? { ...agent, tools: { ...agent.tools }, identity: agent.identity || autoIdentity(agent.id) } : blankAgent();
    setDraft(a);
    setDMsgs(agent ? [{ role: "designer", text: `${a.name} is loaded. Tell me what to change — instructions, capabilities, tone, anything.` }]
                   : [{ role: "designer", text: "Who are we building? Describe the agent in your own words, or pick a persona below to start from." }]);
    setTMsgs([]); setDInput(""); setTInput(""); setSaveErr(""); setBlueprintOpen(false);
    setView("studio");
  };

  const hirePersona = (p) => {
    const idn = autoIdentity(p.persona);
    setDraft((d) => ({ ...d, name: p.persona, description: p.desc, instructions: p.instructions, tools: { ...p.tools }, identity: idn }));
    setDMsgs((m) => [...m, { role: "designer", text: `${p.persona} joined — ${p.role.toLowerCase()}. Try them in the bench on the right, or tell me what to adjust.` }]);
  };

  // Talk to the designer → updated config + a conversational reply.
  const designerSend = async () => {
    const text = dInput.trim();
    if (!text || dBusy) return;
    setDInput(""); setDBusy(true);
    setDMsgs((m) => [...m, { role: "user", text }]);
    try {
      const r = await bridge.completeOnce([{ role: "system", content: DESIGNER_SYS(draft) }, { role: "user", content: text }]);
      const out = extractJson(r && r.text);
      if (!out || !out.config || !out.config.instructions) {
        setDMsgs((m) => [...m, { role: "designer", text: (r && r.error) || "I couldn't shape that into a config — try rephrasing, or switch to a stronger model in the picker." }]);
        return;
      }
      const c = out.config;
      setDraft((d) => ({
        ...d,
        name: String(c.name || d.name || "").slice(0, 60),
        description: String(c.description || "").slice(0, 200),
        instructions: String(c.instructions || ""),
        tools: { files: !!(c.tools && c.tools.files), shell: !!(c.tools && c.tools.shell), connectors: !!(c.tools && c.tools.connectors), skills: !!(c.tools && c.tools.skills) },
        identity: d.identity || autoIdentity(c.name || d.id),
      }));
      setDMsgs((m) => [...m, { role: "designer", text: String(out.reply || "Updated.") }]);
    } catch (e) {
      setDMsgs((m) => [...m, { role: "designer", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setDBusy(false); }
  };

  // Test bench: run the agent's instructions directly (no tools — those activate in a real session).
  const benchSend = async () => {
    const text = tInput.trim();
    if (!text || tBusy || !draft.instructions.trim()) return;
    setTInput(""); setTBusy(true);
    const nextMsgs = [...tMsgs, { role: "user", text }];
    setTMsgs(nextMsgs);
    try {
      const sys = `You are "${draft.name || "a custom agent"}".${draft.description ? ` Purpose: ${draft.description}` : ""}\n\nAgent instructions (always follow):\n${draft.instructions}`;
      const hist = nextMsgs.map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.text }));
      const r = await bridge.completeOnce([{ role: "system", content: sys }, ...hist]);
      setTMsgs((m) => [...m, { role: "agent", text: (r && r.text) || (r && r.error) || "(no reply)" }]);
    } catch (e) {
      setTMsgs((m) => [...m, { role: "agent", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setTBusy(false); }
  };

  const launch = async () => {
    const ok = await saveDraft(false);
    if (ok) onLaunch && onLaunch({ ...draft, name: draft.name.trim() || "Untitled agent" }, null);
  };

  // Per-agent knowledge: text files the agent permanently knows (GPTs-style).
  const knFileRef = useRef(null);
  const addKnowledgeFiles = (files) => {
    const list = Array.from(files || []).slice(0, 8);
    for (const f of list) {
      if (f.size > 1024 * 1024) { setSaveErr(`"${f.name}" is over 1MB — split it or trim it first.`); continue; }
      const reader = new FileReader();
      reader.onload = () => setDraft((d) => ({
        ...d,
        knowledge: [...(d.knowledge || []), { name: f.name, content: String(reader.result || "").slice(0, 200000) }].slice(0, 8),
      }));
      reader.readAsText(f);
    }
  };
  const removeKnowledge = (i) => setDraft((d) => ({ ...d, knowledge: (d.knowledge || []).filter((_, x) => x !== i) }));

  const cycleIdentity = () => {
    const ci = ID_COLORS.indexOf((draft.identity || {}).color);
    const gi = ID_GLYPHS.indexOf((draft.identity || {}).glyph);
    setDraft({ ...draft, identity: { color: ID_COLORS[(ci + 1) % ID_COLORS.length], glyph: ID_GLYPHS[(gi + 1) % ID_GLYPHS.length] } });
  };

  const toolPills = (tools) => TOOL_DEFS.filter((t) => tools && tools[t.key]).map((t) => {
    const I = t.icon;
    return <span key={t.key} className="ag-pill"><I size={11} /> {t.label}</span>;
  });

  const shownAgents = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? agents.filter((a) => ((a.name || "") + " " + (a.description || "")).toLowerCase().includes(k)) : agents;
  }, [agents, q]);

  const canRun = !!draft.instructions.trim();

  useEffect(() => { if (hasModel) setNeedModel(false); }, [hasModel]);

  const leaveGuide = (next) => {
    try { localStorage.setItem(GUIDE_SEEN_KEY, "1"); } catch {}
    setView(next || "list");
  };
  const runSimulation = (sim) => {
    try { localStorage.setItem(GUIDE_SEEN_KEY, "1"); } catch {}
    if (sim.kind === "agent" && sim.designer) { openStudio(null); setDInput(sim.designer); }
    else if (sim.kind === "agent") { setTab("agents"); setView("list"); }
    else { setTab("teams"); setView("list"); }
  };

  // ---------------- guide (two-pane interactive: chapters left, simulations right) ----------------
  if (view === "guide") {
    const chapters = [
      {
        title: "What an agent is made of", sub: "anatomy",
        lead: <>Four parts, all in plain language — no code anywhere. You describe the agent to a <b>Designer</b> in your own words; it assembles all four. You can interview your agent on a live <b>Bench</b> before it ever touches real work.</>,
        note: <>No API keys, ever — agents run on whatever model your selector points at, or a model you pin per agent.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="✦" label="Identity" sub="name, face, purpose" />
            <Arrow />
            <Node color="#8b7cf6" glyph="¶" label="Instructions" sub="how it thinks & answers" />
            <Arrow />
            <Node color="#f4a261" glyph="⚙" label="Capabilities" sub="files · terminal · connectors · skills" />
            <Arrow />
            <Node color="#5fb573" glyph="◇" label="Model" sub="any model from your selector" />
          </div>
        ),
      },
      {
        title: "The solo agent — your specialist", sub: "solo",
        lead: <>Brief it once, it delivers. A solo agent answers in chat — or, with Files and Terminal switched on, it works inside a folder of yours: reading data, editing documents, running analysis. Every risky move asks your permission first.</>,
        note: <>Try it: simulation 1 on the right builds your first specialist in five minutes.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="🧑" color="var(--text-1)" label="You" sub="one brief" />
            <Arrow label="brief" />
            <Node glyph="✦" label="Agent" sub="thinks · uses its tools" />
            <Arrow label="deliver" />
            <Node glyph="✓" color="#5fb573" label="Deliverable" sub="answer, file, report" />
          </div>
        ),
      },
      {
        title: "The Relay team — an assembly line", sub: "relay",
        lead: <>Some work is a chain: research <i>then</i> write <i>then</i> polish. A Relay team runs your agents <b>in order</b> — each one receives everything its teammates produced and adds its own craft. The last station's work is your deliverable.</>,
        note: <><Zap size={12} /> Watch it live: Mission Control shows each station lighting up, finishing, and passing the baton.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="◆" color="#13c2d6" label="Digger" sub="researches" />
            <Arrow label="hands off" />
            <Node glyph="✺" color="#8b7cf6" label="Drafter" sub="writes" />
            <Arrow label="hands off" />
            <Node glyph="❖" color="#e76f81" label="Polisher" sub="perfects" />
            <Arrow />
            <Node glyph="✓" color="#5fb573" label="Final post" />
          </div>
        ),
      },
      {
        title: "The Managed team — a factory floor", sub: "managed · parallel",
        lead: <>Some work splits: a launch needs ads <i>and</i> FAQs <i>and</i> emails — none depends on the other. A Managed team has a <b>Coordinator</b> that gives every agent its own slice and runs them <b>all at the same time</b>, then welds the pieces into one deliverable. Five agents in parallel feels like a department, not a chatbot.</>,
        note: <><GitMerge size={12} /> All stations glow at once in Mission Control — that's the parallel fan-out.</>,
        diagram: (
          <div className="agg-flow agg-fan">
            <Node glyph="🧭" color="var(--accent)" label="Coordinator" sub="splits the mission" />
            <div className="agg-fan-mid">
              <div className="agg-fan-branch"><Arrow /><Node glyph="◆" color="#13c2d6" label="Adsmith" sub="working…" /></div>
              <div className="agg-fan-branch"><Arrow /><Node glyph="✺" color="#8b7cf6" label="Faqster" sub="working…" /></div>
              <div className="agg-fan-branch"><Arrow /><Node glyph="♟" color="#f4a261" label="Socialite" sub="working…" /></div>
              <div className="agg-fan-branch"><Arrow /><Node glyph="☄" color="#e76f81" label="Mailwright" sub="working…" /></div>
            </div>
            <div className="agg-fan-end"><Arrow label="merge" /><Node glyph="✓" color="#5fb573" label="Launch kit" sub="one deliverable" /></div>
          </div>
        ),
      },
    ];
    const ch = chapters[chapter];
    return (
      <div className="agg-wrap">
        {/* LEFT — the story, one chapter at a time */}
        <div className="agg-left scroll">
          <div className="agg-tophead">
            <div className="agg-kicker"><BookOpen size={13} className="agg-book" /> A 3-minute guide</div>
            <button className="btn primary" onClick={() => { leaveGuide("list"); openStudio(null); }}><Plus size={14} /> Create your first agent</button>
          </div>
          <h1 className="agg-h1">Meet your AI workforce</h1>
          <p className="agg-intro">
            Most people use AI one question at a time. Here you <b>build specialists once and put
            them to work forever</b> — each with a name, a face, its own instructions and tools.
            Build one in a minute. Then build a team of them.
          </p>

          <div className="agg-rail">
            {chapters.map((c, i) => (
              <button key={i} className={`agg-rail-item ${chapter === i ? "on" : ""} ${chapter > i ? "read" : ""}`} onClick={() => setChapter(i)}>
                <span className="agg-rail-n">{chapter > i ? <Check size={11} /> : `0${i + 1}`}</span>
                <span className="agg-rail-t">{c.title.split(" — ")[0]}</span>
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
            <button className="btn ghost" disabled={chapter === 0} onClick={() => setChapter((c) => c - 1)}>← Back</button>
            <span className="agg-pager-dots">{chapters.map((_, i) => <span key={i} className={chapter === i ? "on" : ""} />)}</span>
            {chapter < chapters.length - 1
              ? <button className="btn primary" onClick={() => setChapter((c) => c + 1)}>Next <ArrowRight size={13} /></button>
              : <button className="btn primary" onClick={() => { leaveGuide("list"); openStudio(null); }}><Plus size={13} /> Create your first agent</button>}
          </div>
        </div>

        {/* RIGHT — flight school: simulations + hire CTA */}
        <div className="agg-right scroll">
          <div className="agg-right-head">
            <div className="agg-kicker" style={{ marginBottom: 8 }}><Play size={12} /> Flight school</div>
            <h2>Fly the simulations</h2>
            <p>Five guided missions, easiest first. Each one teaches an architecture by running it for real.</p>
          </div>
          <div className="agg-sims">
            {SIMULATIONS.map((s) => (
              <div key={s.n} className={`agg-sim ${chapter >= 2 && s.kind === "teams" ? "lit" : chapter < 2 && s.kind === "agent" ? "lit" : ""}`}>
                <div className="agg-sim-head">
                  <span className="agg-sim-n">{s.n}</span>
                  <div>
                    <div className="agg-sim-title">{s.title}</div>
                    <div className="agg-sim-meta">{s.arch} · {s.time}</div>
                  </div>
                </div>
                <p className="agg-sim-story">{s.story}</p>
                <ol className="agg-sim-steps">{s.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                <button className="btn ghost agg-sim-go" onClick={() => runSimulation(s)}><Play size={12} /> {s.kind === "agent" && s.designer ? "Start — Designer pre-filled" : s.kind === "teams" ? "Open Teams" : "Open Agents"}</button>
              </div>
            ))}
          </div>
          <div className="ag-hint" style={{ margin: "16px 0 8px" }}>Reopen this guide any time — <BookOpen size={11} style={{ verticalAlign: "-2px" }} /> Agent Guide lives next to the Studio tabs.</div>
        </div>
      </div>
    );
  }

  // ---------------- list ("Your crew" + "Teams") ----------------
  if (view === "list") {
    return (
      <div className="agents-page scroll">
        <div className="ag-head">
          <div>
            <h2 className="ag-title">Agent Studio</h2>
            <p className="ag-sub">Build agents by talking to a designer, test them live, then put them to work — solo or as a team. They run on whatever model your selector is on.</p>
          </div>
          <div className="ag-head-right">
            <span className={`ags-mp ${needModel ? "need" : ""}`}>
              <ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} agenticOnly />
            </span>
          </div>
        </div>
        {needModel && <div className="ag-err" style={{ marginBottom: 10 }}>Pick a model first — your agents will run on it. (Top right.)</div>}

        <div className="ags-tabs">
          <button className="ags-tab ags-guide-tab" title="How agents work" onClick={() => setView("guide")}><BookOpen size={13} className="agg-book" /> Agent Guide</button>
          <span className="ags-tab-div" />
          <button className={`ags-tab ${tab === "agents" ? "on" : ""}`} onClick={() => setTab("agents")}><User size={13} /> Agent</button>
          <button className={`ags-tab ${tab === "teams" ? "on" : ""}`} onClick={() => setTab("teams")}><Users size={13} /> Agents Team</button>
        </div>

        {tab === "teams" && (
          <>
            <div className="ags-grid">
              <button className="ags-card ags-new" onClick={newTeam}>
                <span className="ags-face ags-face-new"><Plus size={20} /></span>
                <div className="ags-card-name">New team</div>
                <div className="ag-card-desc">Put agents together — they hand work down the line, or a coordinator runs them.</div>
              </button>
              {teams.map((t) => {
                const members = resolveTeam(t).members;
                return (
                  <div key={t.id} className="ags-card">
                    <div className="ags-card-top">
                      <span className="tops-faces">
                        {members.slice(0, 4).map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><Face identity={m.identity || autoIdentity(m.id)} size={30} /></span>)}
                        {!members.length && <Face identity={t.identity} size={30} />}
                      </span>
                      <div className="ags-card-id">
                        <div className="ags-card-name">{t.name || "Untitled team"}</div>
                        <div className="ags-card-role">{t.mode === "manager" ? "Managed" : "Relay line"} · {members.length} agent{members.length === 1 ? "" : "s"}{members.length ? " — " + members.map((m) => m.name).join(", ") : ""}</div>
                      </div>
                    </div>
                    <div className="ag-card-actions">
                      <button className="btn primary" disabled={!members.length} onClick={() => launchTeam(t)}><Rocket size={13} /> Brief the team</button>
                      <button className="btn ghost" onClick={() => editTeam(t)}><Pencil size={13} /> Edit</button>
                      <button className="btn ghost ag-del" title="Delete" onClick={() => removeTeam(t.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            {tErr && <div className="ag-err">{tErr}</div>}
            {agents.length === 0 && <div className="ag-hint" style={{ marginTop: 14 }}>Teams are made of agents — build a couple of agents first (Agents tab).</div>}
          </>
        )}

        {tab === "agents" && agents.length > 3 && (
          <div className="ag-tpl-search" style={{ maxWidth: 320 }}>
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your agents" />
          </div>
        )}

        {tab === "agents" && (
        <div className="ags-grid">
          <button className="ags-card ags-new" onClick={() => openStudio(null)}>
            <span className="ags-face ags-face-new"><Plus size={20} /></span>
            <div className="ags-card-name">New agent</div>
            <div className="ag-card-desc">Describe it, shape it, test it — all in one room.</div>
          </button>
          {shownAgents.map((a) => (
            <div key={a.id} className="ags-card">
              <div className="ags-card-top">
                <Face identity={a.identity || autoIdentity(a.id)} />
                <div className="ags-card-id">
                  <div className="ags-card-name">{a.name || "Untitled agent"}</div>
                  <div className="ags-card-role">{a.description || "No description"}</div>
                </div>
              </div>
              <div className="ag-card-pills">
                {toolPills(a.tools)}
                {a.model && <span className="ag-pill ag-pill-model"><Cpu size={11} /> {a.model.split("::")[1] || a.model}</span>}
              </div>
              <div className="ag-card-actions">
                <button className="btn primary" onClick={() => onLaunch && onLaunch(a, null)}><Rocket size={13} /> Put to work</button>
                <button className="btn ghost" onClick={() => openStudio(a)}><Pencil size={13} /> Open in Studio</button>
                <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        )}

        {tab === "agents" && agents.length === 0 && (
          <div className="ags-crew">
            <div className="ags-crew-head">…or hire from the crew</div>
            {PERSONA_CATS.map((cat) => (
              <div key={cat} className="ags-crew-cat">
                <div className="ags-crew-label">{cat}</div>
                <div className="ags-crew-row">
                  {PERSONAS.filter((p) => p.cat === cat).map((p) => (
                    <button key={p.persona} className="ags-persona" onClick={() => { openStudio(null); setTimeout(() => hirePersona(p), 0); }}>
                      <Face identity={autoIdentity(p.persona)} size={30} />
                      <div>
                        <div className="ags-persona-name">{p.persona}</div>
                        <div className="ags-persona-role">{p.role}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------------- team builder ----------------
  if (view === "team" && tdraft) {
    const memberObjs = tdraft.members.map((id) => agents.find((a) => a.id === id)).filter(Boolean);
    return (
      <div className="agents-page scroll">
        <div className="ags-topbar">
          <button className="btn ghost ag-back" onClick={() => setView("list")}>← Studio</button>
          <Face identity={tdraft.identity} size={30} />
          <input className="ags-name" value={tdraft.name} placeholder="Name your team…" onChange={(e) => setTdraft({ ...tdraft, name: e.target.value })} />
          <div className="ags-topbar-right">
            {tErr && <span className="ag-err" style={{ margin: 0 }}>{tErr}</span>}
            <button className="btn ghost" onClick={() => saveTeam(true)}>Save & close</button>
            <button className="btn primary" disabled={!memberObjs.length} onClick={async () => { if (await saveTeam(false)) launchTeam(tdraft); }}><Rocket size={13} /> Brief the team</button>
          </div>
        </div>

        <div className="ag-field" style={{ marginTop: 14 }}>
          <label>How they work</label>
          <div className="ags-modes">
            <button className={`ags-mode ${tdraft.mode === "relay" ? "on" : ""}`} onClick={() => setTdraft({ ...tdraft, mode: "relay" })}>
              <span className="ags-mode-top"><Zap size={15} /> Relay line</span>
              <span className="ag-tool-note">Agents work one after another — each picks up the previous one's work. Great for research → draft → polish.</span>
            </button>
            <button className={`ags-mode ${tdraft.mode === "manager" ? "on" : ""}`} onClick={() => setTdraft({ ...tdraft, mode: "manager" })}>
              <span className="ags-mode-top"><GitMerge size={15} /> Managed</span>
              <span className="ag-tool-note">A coordinator splits your mission into sub-tasks, assigns each agent its piece, then merges everything into one deliverable.</span>
            </button>
          </div>
        </div>

        <div className="ag-field" style={{ marginTop: 10 }}>
          <label>The line-up {tdraft.mode === "relay" ? "(order matters — work flows top to bottom)" : ""}</label>
          {memberObjs.length > 0 && (
            <div className="ags-lineup">
              {memberObjs.map((a, i) => (
                <div key={a.id} className="ags-lineup-row">
                  <span className="ags-lineup-n">{i + 1}</span>
                  <Face identity={a.identity || autoIdentity(a.id)} size={26} />
                  <span className="ags-lineup-name">{a.name}</span>
                  <span className="ags-lineup-role">{a.description}</span>
                  <span className="ags-lineup-acts">
                    {tdraft.mode === "relay" && <button className="btn ghost" title="Earlier" disabled={i === 0} onClick={() => moveMember(i, -1)}>↑</button>}
                    {tdraft.mode === "relay" && <button className="btn ghost" title="Later" disabled={i === memberObjs.length - 1} onClick={() => moveMember(i, 1)}>↓</button>}
                    <button className="btn ghost ag-del" title="Remove" onClick={() => toggleMember(a.id)}><Trash2 size={12} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="ag-hint" style={{ marginTop: memberObjs.length ? 8 : 0 }}>{memberObjs.length ? "Add more from your bench:" : "Pick who's on this team:"}</div>
          <div className="ags-crew-row" style={{ marginTop: 6 }}>
            {agents.filter((a) => !tdraft.members.includes(a.id)).map((a) => (
              <button key={a.id} className="ags-persona" onClick={() => toggleMember(a.id)}>
                <Face identity={a.identity || autoIdentity(a.id)} size={26} />
                <div>
                  <div className="ags-persona-name">{a.name || "Untitled"}</div>
                  <div className="ags-persona-role">{(a.description || "").slice(0, 44)}</div>
                </div>
                <Plus size={13} style={{ color: "var(--text-2)" }} />
              </button>
            ))}
            {!agents.length && <div className="ag-hint">No agents yet — build some in the Agents tab first.</div>}
          </div>
        </div>

        <div className="ag-hint" style={{ marginTop: 16 }}>
          Teams run in chat: brief them once, watch every agent work live in Mission Control, and get one finished deliverable. Up to 6 agents run per mission.
        </div>
      </div>
    );
  }

  // ---------------- studio (build-by-chat + live bench) ----------------
  return (
    <div className="ags-studio">
      {/* top bar: identity + name + actions */}
      <div className="ags-topbar">
        <button className="btn ghost ag-back" onClick={() => setView("list")}>← Studio</button>
        <button className="ags-face-btn" title="Change look" onClick={cycleIdentity}><Face identity={draft.identity} size={30} /></button>
        <input className="ags-name" value={draft.name} placeholder="Name your agent…" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <div className="ags-topbar-right">
          {saved && <span className="ag-saved"><Check size={12} /> Saved</span>}
          {saveErr && <span className="ag-err" style={{ margin: 0 }}>{saveErr}</span>}
          <span className="ags-mp"><ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} agenticOnly /></span>
          <button className="btn ghost" disabled={saveBusy} onClick={() => saveDraft(false)}>{saveBusy ? "Saving…" : "Save"}</button>
          <button className="btn primary" disabled={!canRun || saveBusy} onClick={launch}><Rocket size={13} /> Put to work</button>
        </div>
      </div>

      <div className="ags-split">
        {/* left — the designer */}
        <div className="ags-pane ags-designer">
          <div className="ags-pane-head"><Wand2 size={14} /> Designer <span className="ags-pane-sub">— shape the agent by talking</span></div>
          <div className="ags-chat scroll">
            {dMsgs.map((m, i) => (
              <div key={i} className={`ags-msg ${m.role === "user" ? "me" : ""}`}>{m.text}</div>
            ))}
            {dBusy && <div className="ags-msg"><Loader2 size={13} className="ag-spin" /> shaping…</div>}
            {dMsgs.length <= 1 && !draft.instructions && (
              <div className="ags-crew-inline">
                {PERSONAS.map((p) => (
                  <button key={p.persona} className="ags-persona sm" onClick={() => hirePersona(p)}>
                    <Face identity={autoIdentity(p.persona)} size={24} fontSize={12} />
                    <div>
                      <div className="ags-persona-name">{p.persona}</div>
                      <div className="ags-persona-role">{p.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div ref={dEndRef} />
          </div>
          <div className="ags-input">
            <input value={dInput} placeholder='e.g. "make it review code for security issues and report in a table"'
              onChange={(e) => setDInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") designerSend(); }} />
            <button className="ag-gen" aria-label="Send to designer" disabled={dBusy || !dInput.trim()} onClick={designerSend}><ArrowUp size={14} /></button>
          </div>

          {/* blueprint: the raw config, always one click away */}
          <button className="ags-bp-toggle" onClick={() => setBlueprintOpen((o) => !o)}><Hammer size={12} /> Blueprint {blueprintOpen ? "▾" : "▸"}</button>
          {blueprintOpen && (
            <div className="ags-bp scroll">
              <label>Purpose</label>
              <input value={draft.description} placeholder="One sentence" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <label>Instructions</label>
              <textarea rows={7} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
              <label>Capabilities</label>
              <div className="ags-bp-tools">
                {TOOL_DEFS.map((t) => {
                  const I = t.icon; const on = !!draft.tools[t.key];
                  return (
                    <button key={t.key} className={`ag-pill ags-bp-tool ${on ? "on" : ""}`} title={t.note}
                      onClick={() => setDraft({ ...draft, tools: { ...draft.tools, [t.key]: !on } })}>
                      <I size={11} /> {t.label}
                    </button>
                  );
                })}
              </div>
              <label>Knowledge ({(draft.knowledge || []).length}/8) — files this agent always knows</label>
              <div className="ags-kn">
                {(draft.knowledge || []).map((k, i) => (
                  <span key={i} className="ag-pill" title={`${Math.round((k.content || "").length / 1000)}k chars`}>
                    {k.name}
                    <button className="agent-chip-x" aria-label={`Remove ${k.name}`} onClick={() => removeKnowledge(i)}><Trash2 size={10} /></button>
                  </span>
                ))}
                <button className="ag-pill ags-bp-tool" onClick={() => knFileRef.current && knFileRef.current.click()}><Plus size={11} /> Add file</button>
                <input ref={knFileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.log,.yml,.yaml,.html,.xml,.js,.ts,.py" style={{ display: "none" }}
                  onChange={(e) => { addKnowledgeFiles(e.target.files); e.target.value = ""; }} />
              </div>
              <div className="ag-hint" style={{ margin: 0 }}>Text files (md, txt, csv, json…). For PDFs, add them to a Project instead — Projects parse PDF/Word.</div>
              <label>Pinned model</label>
              <div className="ag-model-row">
                <ModelPicker value={draft.model || undefined} groups={groups} onChange={(v) => setDraft({ ...draft, model: v })} onRefresh={onRefresh} agenticOnly />
                {draft.model
                  ? <button className="btn ghost" onClick={() => setDraft({ ...draft, model: "" })}>Unpin</button>
                  : <span className="ag-hint" style={{ margin: 0 }}>Unpinned — uses the live selector.</span>}
              </div>
              {(draft.tools.files || draft.tools.shell) && <div className="ag-hint">Works in a folder — you'll pick it when the real session starts.</div>}
            </div>
          )}
        </div>

        {/* right — the live bench */}
        <div className="ags-pane ags-bench">
          <div className="ags-pane-head">
            <FlaskConical size={14} /> Bench <span className="ags-pane-sub">— talk to {draft.name.trim() || "the agent"} right now</span>
            {tMsgs.length > 0 && <button className="ags-bench-reset" title="Reset bench" onClick={() => setTMsgs([])}><RotateCcw size={12} /></button>}
          </div>
          <div className="ags-chat scroll">
            {!draft.instructions.trim() && <div className="ags-bench-empty">Nothing to test yet — describe the agent to the designer first.</div>}
            {draft.instructions.trim() && tMsgs.length === 0 && (
              <div className="ags-bench-empty">
                <Face identity={draft.identity} size={40} />
                <div>{draft.name.trim() || "Your agent"} is live on the bench. Say something — instructions only here; files, terminal and connectors switch on in a real session.</div>
              </div>
            )}
            {tMsgs.map((m, i) => (
              m.role === "user"
                ? <div key={i} className="ags-msg me">{m.text}</div>
                : <div key={i} className="ags-bench-reply"><Face identity={draft.identity} size={22} fontSize={11} /><div className="ags-msg">{m.text}</div></div>
            ))}
            {tBusy && <div className="ags-bench-reply"><Face identity={draft.identity} size={22} fontSize={11} /><div className="ags-msg"><Loader2 size={13} className="ag-spin" /></div></div>}
            <div ref={tEndRef} />
          </div>
          <div className="ags-input">
            <input value={tInput} placeholder={canRun ? `Test ${draft.name.trim() || "the agent"}…` : "Build the agent first"} disabled={!canRun}
              onChange={(e) => setTInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") benchSend(); }} />
            <button className="ag-gen" aria-label="Send test message" disabled={tBusy || !tInput.trim() || !canRun} onClick={benchSend}><Send size={13} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
