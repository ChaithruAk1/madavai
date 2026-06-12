import { useEffect, useState } from "react";
import { Plus, Trash2, Play, Clock, FolderInput, Loader2, Search, ArrowUpDown, ChevronDown, X, Sparkles, Settings2, Coffee, ListChecks, Timer, Webhook, Copy, Check, LayoutGrid, List } from "lucide-react";
import { bridge } from "../bridge/index.js";
import ModelPicker from "./ModelPicker.jsx";

const DEFAULT_MODEL = "__default__";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleText(sc) {
  if (!sc || !sc.mode || sc.mode === "off") return "Manual";
  if (sc.mode === "interval") return `Every ${sc.everyMinutes || 60} min`;
  if (sc.mode === "daily") return `Daily at ${sc.time || "09:00"}`;
  if (sc.mode === "weekly") return `Weekly · ${WEEKDAYS[sc.weekday ?? 1]} ${sc.time || "09:00"}`;
  return "Manual";
}
function rel(ts) {
  if (!ts) return "never run";
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return new Date(ts).toLocaleDateString();
}
// Lightweight natural-language → schedule for the smart-create flow.
function parseTime(t) {
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] || "00";
  if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0;
  return String(h).padStart(2, "0") + ":" + min;
}
function parseSchedule(text) {
  const t = text.toLowerCase(); let m;
  if ((m = t.match(/every\s+(\d+)\s*(?:min|minute)/))) return { mode: "interval", everyMinutes: Number(m[1]) };
  if (/hourly|every hour/.test(t)) return { mode: "interval", everyMinutes: 60 };
  if ((m = t.match(/every\s+(mon|tue|wed|thu|fri|sat|sun)/))) { const wd = WEEKDAYS.findIndex((d) => d.toLowerCase().startsWith(m[1])); return { mode: "weekly", weekday: wd < 0 ? 1 : wd, time: parseTime(t) || "09:00" }; }
  if (/daily|every day|each day|every morning|each morning/.test(t)) return { mode: "daily", time: parseTime(t) || "09:00" };
  return { mode: "off" };
}

const BLANK = { name: "", description: "", prompt: "", target: { type: "chat" }, schedule: { mode: "off" }, model: "", permission: "ask" };

export default function Scheduler() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [modelGroups, setModelGroups] = useState([]);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [menuOpen, setMenuOpen] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [editing, setEditing] = useState(null);   // draft task in modal, or null
  const [busyRun, setBusyRun] = useState(null);    // task id running now
  const [runsFor, setRunsFor] = useState(null);    // { task, runs } — the Run history modal
  const [layout, setLayout] = useState((() => { try { return localStorage.getItem("be.sched.layout") || "rows"; } catch { return "rows"; } })()); // rows | tiles

  // Run history: the engine keeps each task's last 20 runs (status + full output).
  const openRuns = async (t) => {
    const runs = (bridge.getRuns ? await bridge.getRuns(t.id) : []) || [];
    setRunsFor({ task: t, runs });
  };

  const load = async () => setTasks(await bridge.listTasks());
  useEffect(() => {
    load();
    bridge.listProjects().then(setProjects);
    bridge.getSettings().then((s) => {
      setAgents(s.agents || []);
      setTeams(s.teams || []);
      const groups = [{ group: "Default", items: [{ id: DEFAULT_MODEL, name: "Default model", prov: "" }] }];
      for (const p of Object.values(s.profiles || {})) {
        const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
        if (ids.length) groups.push({ group: p.name, items: ids.map((id) => ({ id: `${p.id}::${id}`, name: id, prov: p.name })) });
      }
      setModelGroups(groups);
      const ka = !!s.keepAwake; setKeepAwake(ka); bridge.setKeepAwake && bridge.setKeepAwake(ka);
    });
  }, []);

  const toggleKeepAwake = async () => {
    const next = !keepAwake; setKeepAwake(next);
    bridge.setKeepAwake && bridge.setKeepAwake(next);
    const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, keepAwake: next });
  };

  const openNew = (draft) => { setMenuOpen(false); setEditing({ ...BLANK, ...draft }); };
  const openEdit = (t) => setEditing({ ...BLANK, ...t });
  const closeModal = () => setEditing(null);

  const saveTask = async () => {
    const d = editing;
    if (!(d.name || "").trim() || !(d.description || "").trim()) return;
    const patch = { name: d.name.trim(), description: d.description.trim(), prompt: d.prompt, target: d.target, schedule: d.schedule, model: d.model, permission: d.permission };
    if (d.id) await bridge.updateTask(d.id, patch);
    else { const t = await bridge.createTask(); await bridge.updateTask(t.id, patch); }
    closeModal(); load();
  };
  const del = async (id) => { await bridge.deleteTask(id); load(); };
  const runNow = async (id) => {
    setBusyRun(id);
    try {
      await bridge.runTaskNow(id); load();
      const t = tasks.find((x) => x.id === id);
      if (t) openRuns(t); // surface the fresh output immediately — no hunting for it
    } finally { setBusyRun(null); }
  };

  const shown = tasks
    .filter((t) => !q || (t.name + " " + (t.description || "")).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sortBy === "recent" ? ((b.lastRun || 0) - (a.lastRun || 0)) : (a.name || "").localeCompare(b.name || ""));

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <div className="sched-wrap">
      <div className="pj-head">
        <div>
          <h1 className="pj-title">Scheduled tasks</h1>
          <p style={{ color: "var(--text-2)", fontSize: 13, margin: "4px 0 0" }}>Run tasks on a schedule or whenever you need them.</p>
        </div>
        <div className="pj-actions">
          <button className="icon-btn" title={layout === "rows" ? "Tile view" : "List view"} onClick={() => { const v = layout === "rows" ? "tiles" : "rows"; setLayout(v); try { localStorage.setItem("be.sched.layout", v); } catch {} }}>
            {layout === "rows" ? <LayoutGrid size={15} /> : <List size={15} />}
          </button>
          <button className="icon-btn" title={`Sort by ${sortBy === "name" ? "recent" : "name"}`} onClick={() => setSortBy((s) => s === "name" ? "recent" : "name")}><ArrowUpDown size={15} /></button>
          <div className="pj-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" /></div>
          <div className="plus-wrap" style={{ position: "relative" }}>
            <button className="btn primary" onClick={() => setMenuOpen((o) => !o)}><Plus size={15} /> New task <ChevronDown size={13} /></button>
            {menuOpen && (
              <div className="plus-menu" style={{ right: 0, left: "auto", top: "calc(100% + 6px)", bottom: "auto" }}>
                <button className="plus-item" onClick={() => openNew({ _wizard: true })}><Sparkles size={15} /> Create with Madav</button>
                <button className="plus-item" onClick={() => openNew({})}><Settings2 size={15} /> Set up manually</button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="acc-card" style={{ maxWidth: 1000, display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16 }}>
        <Clock size={15} style={{ color: "var(--text-2)" }} />
        <span style={{ fontSize: 13 }}>Scheduled tasks only run while your computer is awake.</span>
        <span style={{ flex: 1 }} />
        <label className="chip" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={keepAwake} onChange={toggleKeepAwake} style={{ marginRight: 6 }} /> Keep awake
        </label>
      </div>

      <div style={{ maxWidth: 1000 }}>
        {shown.length === 0 ? (
          <div className="sched-empty">
            <Timer size={56} strokeWidth={1.2} style={{ color: "var(--text-2)" }} />
            <div className="sched-empty-title">Create your first scheduled task</div>
            <div className="sched-empty-chips">
              <button className="btn" onClick={() => openNew({ name: "daily-brief", description: "Summarize my day", prompt: "Summarize my calendar and unread emails for today, and highlight anything urgent.", schedule: { mode: "daily", time: "09:00" } })}>
                <Coffee size={14} /> Daily brief
              </button>
              <button className="btn" onClick={() => openNew({ name: "weekly-review", description: "Weekly summary", prompt: "Review what happened this week and summarize the key items, decisions, and next steps.", schedule: { mode: "weekly", weekday: 1, time: "09:00" } })}>
                <ListChecks size={14} /> Weekly review
              </button>
            </div>
          </div>
        ) : layout === "tiles" ? (
          <div className="sched-tiles">
            {shown.map((t) => (
              <div key={t.id} className="sched-tile" onClick={() => openEdit(t)}>
                <div className="sched-name">{t.name}{t.schedule && t.schedule.mode !== "off" && <Clock size={12} style={{ marginLeft: 7, color: "var(--accent)", verticalAlign: "-1px" }} />}</div>
                <div className="mo-sub" style={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.description || t.prompt || "No description"}</div>
                <div className="mo-sub">{scheduleText(t.schedule)} · {rel(t.lastRun)}</div>
                <div className="sched-tile-btns">
                  <button className="btn" title="Run history & output" onClick={(e) => { e.stopPropagation(); openRuns(t); }} style={{ padding: "4px 8px" }}><ListChecks size={13} /></button>
                  <button className="btn" onClick={(e) => { e.stopPropagation(); runNow(t.id); }} disabled={busyRun === t.id} style={{ padding: "4px 8px" }}>
                    {busyRun === t.id ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button className="btn ghost danger" onClick={(e) => { e.stopPropagation(); del(t.id); }} style={{ padding: "4px 7px" }}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : shown.map((t) => (
          <div key={t.id} className="sched-row" onClick={() => openEdit(t)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sched-name">{t.name}{t.schedule && t.schedule.mode !== "off" && <Clock size={12} style={{ marginLeft: 7, color: "var(--accent)", verticalAlign: "-1px" }} />}</div>
              <div className="mo-sub" style={{ marginTop: 2 }}>{t.description || t.prompt || "No description"}</div>
            </div>
            <span className="sched-freq">{scheduleText(t.schedule)}</span>
            <span className="mo-sub" style={{ width: 90, textAlign: "right" }}>{rel(t.lastRun)}</span>
            <button className="btn" title="Run history & output" onClick={(e) => { e.stopPropagation(); openRuns(t); }} style={{ padding: "5px 9px" }}><ListChecks size={13} /></button>
            <button className="btn" onClick={(e) => { e.stopPropagation(); runNow(t.id); }} disabled={busyRun === t.id} style={{ padding: "5px 9px" }}>
              {busyRun === t.id ? <Loader2 size={13} className="spin" /> : <Play size={13} />}
            </button>
            <button className="btn ghost danger" onClick={(e) => { e.stopPropagation(); del(t.id); }} style={{ padding: "5px 8px" }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <WebhooksCard agents={agents} teams={teams} tasks={tasks} />
      </div>

      {runsFor && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setRunsFor(null); }}>
          <div className="pj-create" style={{ width: 680 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <h2 style={{ flex: 1, margin: 0, fontSize: 18 }}>Run history — {runsFor.task.name}</h2>
              <button className="icon-btn" onClick={() => setRunsFor(null)}><X size={16} /></button>
            </div>
            {runsFor.runs.length === 0 ? (
              <div className="mo-sub" style={{ margin: "14px 0" }}>No runs yet — press ▶ on the task to run it now.</div>
            ) : runsFor.runs.map((r, i) => (
              <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", margin: "10px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: r.status === "success" ? "var(--ok)" : "var(--danger)", flex: "none" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{r.status === "success" ? "Success" : "Error"}</span>
                  <span className="mo-sub">{rel(r.at)}</span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 240, overflow: "auto" }}>{r.output || "(no output)"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (editing._wizard
        ? <WizardModal draft={editing} setDraft={setEditing} projects={projects} agents={agents} onSave={saveTask} onClose={closeModal} />
        : <TaskModal draft={editing} setDraft={setEditing} projects={projects} agents={agents} teams={teams} modelGroups={modelGroups} onSave={saveTask} onClose={closeModal} />
      )}
    </div>
  );
}

// Webhook triggers — let ANY external system (Zapier, mail filter, CI, cron) fire an
// agent, a team, or a task: POST /hook/agent/<id> with a prompt. Desktop only.
function WebhooksCard({ agents, teams, tasks }) {
  const [cfg, setCfg] = useState(null);
  const [st, setSt] = useState(null);
  const [kind, setKind] = useState("agent");
  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bridge.getSettings().then((s) => setCfg(s.webhooks || { enabled: false, port: 8765, token: "" })).catch(() => {});
    bridge.webhookStatus && bridge.webhookStatus().then(setSt).catch(() => {});
  }, []);
  if (!cfg || !bridge.applyWebhooks) return null; // web build — webhooks need the desktop app

  const saveApply = async (next) => {
    setCfg(next);
    const s = await bridge.getSettings();
    await bridge.saveSettings({ ...s, webhooks: next });
    try { setSt(await bridge.applyWebhooks()); } catch {}
  };
  const toggle = async () => {
    const next = { ...cfg, enabled: !cfg.enabled };
    if (next.enabled && !next.token && bridge.newWebhookToken) next.token = await bridge.newWebhookToken();
    await saveApply(next);
  };
  const list = kind === "agent" ? agents : kind === "team" ? teams : tasks;
  const id = target || (list[0] && list[0].id) || "<id>";
  const curl = `curl -X POST http://127.0.0.1:${cfg.port || 8765}/hook/${kind}/${id} -H "Authorization: Bearer ${cfg.token || "<token>"}" -H "Content-Type: application/json" -d "{\\"prompt\\":\\"your mission here\\"}"`;
  const copy = async () => { try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  return (
    <div className="acc-card" style={{ padding: "14px 16px", marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Webhook size={15} style={{ color: cfg.enabled && st && st.running ? "var(--accent)" : "var(--text-2)" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Webhook triggers</div>
          <div className="mo-sub">Let other systems fire your agents — mail rules, Zapier, CI, cron. POST a prompt; the agent runs headless and replies with its result.</div>
        </div>
        {cfg.enabled && <span className="mo-sub">{st && st.running ? `listening on :${st.port}` : (st && st.error) ? `error: ${st.error}` : "starting…"}</span>}
        <label className="chip" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={!!cfg.enabled} onChange={toggle} style={{ marginRight: 6 }} /> Enabled
        </label>
      </div>
      {cfg.enabled && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="mo-sub">Port</span>
            <input className="model-search" type="number" style={{ marginBottom: 0, width: 90 }} value={cfg.port || 8765}
              onChange={(e) => saveApply({ ...cfg, port: Number(e.target.value) || 8765 })} />
            <span className="mo-sub" style={{ marginLeft: 8 }}>Fire a</span>
            <select className="model-search" style={{ marginBottom: 0, width: "auto" }} value={kind} onChange={(e) => { setKind(e.target.value); setTarget(""); }}>
              <option value="agent">Agent</option>
              <option value="team">Team</option>
              <option value="task">Scheduled task</option>
            </select>
            <select className="model-search" style={{ marginBottom: 0, width: "auto", maxWidth: 220 }} value={target} onChange={(e) => setTarget(e.target.value)}>
              {list.length === 0 && <option value="">none yet</option>}
              {list.map((x) => <option key={x.id} value={x.id}>{x.name || "Untitled"}</option>)}
            </select>
            <button className="btn" onClick={copy} style={{ marginLeft: "auto" }}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy example"}</button>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary className="mo-sub" style={{ cursor: "pointer" }}>Show the raw command (for the technically inclined — "Copy example" gives you the same thing)</summary>
            <div className="mo-sub" style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 11, wordBreak: "break-all", userSelect: "all" }}>{curl}</div>
          </details>
          <div className="mo-sub" style={{ marginTop: 6 }}>Token-protected, local-only by default (127.0.0.1). Anyone with the token can run your agents — treat it like a password.</div>
        </div>
      )}
    </div>
  );
}

function TaskModal({ draft, setDraft, projects, agents = [], teams = [], modelGroups, onSave, onClose }) {
  const d = draft;
  const set = (p) => setDraft({ ...d, ...p });
  const setTarget = (p) => set({ target: { ...d.target, ...p } });
  const setSchedule = (p) => set({ schedule: { ...d.schedule, ...p } });
  const sc = d.schedule || {};
  const pickFolder = async () => { const dir = await bridge.chooseFolder(); if (dir) setTarget({ type: "folder", folder: dir }); };

  // Smart create: infer name + schedule from the description as you type it in.
  const applySmart = () => {
    const text = (d.prompt || d.description || "").trim();
    if (!text) return;
    const schedule = parseSchedule(text);
    const name = d.name || text.split(/\s+/).slice(0, 5).join(" ").slice(0, 40);
    set({ name, description: d.description || text.slice(0, 80), schedule });
  };

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pj-create" style={{ width: 620 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ flex: 1 }}>{d.id ? "Edit scheduled task" : "Create scheduled task"}</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <label>Name <span style={{ color: "var(--danger)" }}>*</span></label>
        <input className="model-search" autoFocus value={d.name} placeholder="daily-briefing" onChange={(e) => set({ name: e.target.value })} />

        <label>Description <span style={{ color: "var(--danger)" }}>*</span></label>
        <input className="model-search" value={d.description} placeholder="Summarize my calendar and inbox for the day" onChange={(e) => set({ description: e.target.value })} />

        <textarea className="model-search" rows={4} style={{ resize: "vertical", fontFamily: "inherit" }}
          value={d.prompt} placeholder="What should Madav do each run?" onChange={(e) => set({ prompt: e.target.value })} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "2px 0 6px" }}>
          <select className="model-search" style={{ marginBottom: 0, width: "auto" }} value={d.target?.type || "chat"} onChange={(e) => setTarget({ type: e.target.value })}>
            <option value="chat">Let's Chat (plain)</option>
            <option value="project">Work in a project</option>
            <option value="folder">Let's Collaborate (folder)</option>
            <option value="agent">Run an agent</option>
            <option value="team">Run an agent team</option>
            <option value="brief">Daily brief (your activity digest)</option>
          </select>
          {d.target?.type === "brief" && (
            <span className="ag-hint" style={{ margin: 0 }}>Summarizes recent conversations, agent work and today's schedules each run — set it daily at your morning time. The prompt field adds extra topics to cover.</span>
          )}
          {d.target?.type === "project" && (
            <>
              <select className="model-search" style={{ marginBottom: 0, width: "auto", flex: 1 }} value={d.target?.projectId || ""} onChange={(e) => setTarget({ projectId: e.target.value })}>
                <option value="">Select workroom…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {/* Workrooms combo: optionally a crew agent runs the task inside the room
                  (room brief + knowledge + folder; the run lands in the room's track record). */}
              <select className="model-search" style={{ marginBottom: 0, width: "auto", flex: 1 }} value={d.target?.agentId || ""} onChange={(e) => setTarget({ agentId: e.target.value || undefined })}>
                <option value="">Run as: the room itself</option>
                {(() => {
                  const crewIds = (projects.find((p) => p.id === d.target?.projectId)?.agentIds) || [];
                  const crew = agents.filter((a) => crewIds.includes(a.id));
                  const rest = agents.filter((a) => !crewIds.includes(a.id));
                  return [...crew.map((a) => <option key={a.id} value={a.id}>{a.name || "Untitled agent"} · crew</option>),
                          ...rest.map((a) => <option key={a.id} value={a.id}>{a.name || "Untitled agent"}</option>)];
                })()}
              </select>
            </>
          )}
          {d.target?.type === "agent" && (
            <>
              <select className="model-search" style={{ marginBottom: 0, width: "auto", flex: 1 }} value={d.target?.agentId || ""} onChange={(e) => setTarget({ agentId: e.target.value })}>
                <option value="">Select agent…</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name || "Untitled agent"}</option>)}
              </select>
              <button className="btn" title="Optional working folder (for agents with file tools)" onClick={async () => { const dir = await bridge.chooseFolder(); if (dir) setTarget({ folder: dir }); }}>
                <FolderInput size={13} /> {d.target?.folder ? "Folder ✓" : "Folder (optional)"}
              </button>
            </>
          )}
          {d.target?.type === "team" && (
            <select className="model-search" style={{ marginBottom: 0, width: "auto", flex: 1 }} value={d.target?.teamId || ""} onChange={(e) => setTarget({ teamId: e.target.value })}>
              <option value="">Select team…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name || "Untitled team"}</option>)}
            </select>
          )}
          {d.target?.type === "folder" && (
            <button className="btn" onClick={pickFolder}><FolderInput size={13} /> {d.target?.folder ? "Change" : "Choose folder"}</button>
          )}
          <select className="model-search" style={{ marginBottom: 0, width: "auto" }} value={d.permission || "ask"} onChange={(e) => set({ permission: e.target.value })}>
            <option value="ask">Ask before changes</option>
            <option value="auto">Auto-approve</option>
          </select>
          <span style={{ flex: 1 }} />
          <ModelPicker value={d.model || DEFAULT_MODEL} groups={modelGroups}
            onChange={(v) => set({ model: v === DEFAULT_MODEL ? "" : v })} />
        </div>
        {d.target?.type === "folder" && d.target?.folder && <div className="mo-sub" style={{ marginBottom: 6, fontFamily: "var(--mono)" }}>{d.target.folder}</div>}

        <label>Frequency</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select className="model-search" style={{ marginBottom: 0, width: 160 }} value={sc.mode || "off"} onChange={(e) => setSchedule({ mode: e.target.value })}>
            <option value="off">Manual</option>
            <option value="interval">Every N minutes</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          {sc.mode === "interval" && (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>every
              <input className="model-search" type="number" min="1" style={{ marginBottom: 0, width: 80 }} value={sc.everyMinutes || 60} onChange={(e) => setSchedule({ everyMinutes: Number(e.target.value) })} /> min</span>
          )}
          {sc.mode === "weekly" && (
            <select className="model-search" style={{ marginBottom: 0, width: 110 }} value={sc.weekday ?? 1} onChange={(e) => setSchedule({ weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d2, i) => <option key={i} value={i}>{d2}</option>)}
            </select>
          )}
          {(sc.mode === "daily" || sc.mode === "weekly") && (
            <input className="model-search" type="time" style={{ marginBottom: 0, width: 120 }} value={sc.time || "09:00"} onChange={(e) => setSchedule({ time: e.target.value })} />
          )}
          {d._smart && <button className="btn" onClick={applySmart}><Sparkles size={13} /> Infer from description</button>}
        </div>

        <div className="pj-create-btns">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={onSave} disabled={!(d.name || "").trim() || !(d.description || "").trim()}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Opt({ n, label, sub, active, onClick }) {
  return (
    <button className={`wiz-opt ${active ? "on" : ""}`} onClick={onClick}>
      <span className="wiz-n">{n}</span>
      <span className="wiz-opt-text"><span className="wiz-opt-label">{label}</span>{sub && <span className="wiz-opt-sub">{sub}</span>}</span>
    </button>
  );
}

// Guided, conversational-style task builder (Madav's "Create with Madav").
function WizardModal({ draft, setDraft, projects, agents = [], onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [adaptive, setAdaptive] = useState(true); // chat-driven setup is the default
  const d = draft;
  const set = (p) => setDraft({ ...d, ...p });
  const setSchedule = (p) => set({ schedule: { ...(d.schedule || {}), ...p } });
  const setTarget = (p) => set({ target: { ...(d.target || {}), ...p } });
  const sc = d.schedule || {}; const tg = d.target || { type: "chat" };
  const needWhen = sc.mode === "daily" || sc.mode === "weekly" || sc.mode === "interval";
  const order = ["describe", "frequency", ...(needWhen ? ["when"] : []), "target", "review"];
  const cur = order[Math.min(step, order.length - 1)];
  const next = () => setStep((s) => Math.min(order.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const pickFolder = async () => { const dir = await bridge.chooseFolder(); if (dir) setTarget({ type: "folder", folder: dir }); };

  const canNext = cur === "describe" ? !!(d.prompt || "").trim()
    : cur === "review" ? !!(d.name || "").trim() && !!(d.description || "").trim()
    : true;
  const isLast = cur === "review";

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pj-create" style={{ width: 600 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 style={{ flex: 1 }}>Create with Madav</h2>
          <label className="chip" style={{ cursor: "pointer", marginRight: 10 }} title="Let Madav ask follow-up questions to set it up">
            <input type="checkbox" checked={adaptive} onChange={(e) => setAdaptive(e.target.checked)} style={{ marginRight: 6 }} /> Ask me adaptively
          </label>
          {!adaptive && <span className="mo-sub" style={{ marginRight: 10 }}>Step {step + 1} of {order.length}</span>}
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {adaptive && <AdaptivePanel d={d} setDraft={setDraft} onSave={onSave} onClose={onClose} />}

        {!adaptive && (<>
        {cur === "describe" && (
          <>
            <div className="wiz-q">What do you want Madav to do?</div>
            <textarea className="model-search" rows={4} autoFocus style={{ resize: "vertical", fontFamily: "inherit" }}
              value={d.prompt} placeholder="e.g. Check my files and the web, then write a short daily briefing of what's important."
              onChange={(e) => set({ prompt: e.target.value })} />
            <div className="wiz-opts">
              <Opt n="1" label="Daily briefing" sub="Summarize calendar, inbox, and what's important" active={false}
                onClick={() => set({ prompt: "Write a short daily briefing: summarize my unread emails, today's calendar, and anything urgent.", name: d.name || "daily-briefing", description: d.description || "Daily briefing" })} />
              <Opt n="2" label="Weekly review" sub="Summarize the week and next steps" active={false}
                onClick={() => set({ prompt: "Review what happened this week and summarize key items, decisions, and next steps.", name: d.name || "weekly-review", description: d.description || "Weekly review" })} />
            </div>
          </>
        )}

        {cur === "frequency" && (
          <>
            <div className="wiz-q">How often should it run?</div>
            <div className="wiz-opts">
              <Opt n="1" label="Manual only" sub="Run on demand" active={sc.mode === "off" || !sc.mode} onClick={() => setSchedule({ mode: "off" })} />
              <Opt n="2" label="Hourly" active={sc.mode === "interval" && sc.everyMinutes === 60} onClick={() => setSchedule({ mode: "interval", everyMinutes: 60 })} />
              <Opt n="3" label="Daily" active={sc.mode === "daily"} onClick={() => setSchedule({ mode: "daily", time: sc.time || "09:00" })} />
              <Opt n="4" label="Weekly" active={sc.mode === "weekly"} onClick={() => setSchedule({ mode: "weekly", weekday: sc.weekday ?? 1, time: sc.time || "09:00" })} />
              <Opt n="5" label="Every N minutes" active={sc.mode === "interval" && sc.everyMinutes !== 60} onClick={() => setSchedule({ mode: "interval", everyMinutes: sc.everyMinutes && sc.everyMinutes !== 60 ? sc.everyMinutes : 30 })} />
            </div>
          </>
        )}

        {cur === "when" && (sc.mode === "daily" || sc.mode === "weekly") && (
          <>
            {sc.mode === "weekly" && (
              <>
                <div className="wiz-q">Which day?</div>
                <div className="wiz-opts" style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {WEEKDAYS.map((dn, i) => <Opt key={i} n={i + 1} label={dn} active={(sc.weekday ?? 1) === i} onClick={() => setSchedule({ weekday: i })} />)}
                </div>
              </>
            )}
            <div className="wiz-q">What time each run?</div>
            <div className="wiz-opts">
              {["06:00", "07:00", "08:00", "09:00"].map((t, i) => <Opt key={t} n={i + 1} label={t} active={sc.time === t} onClick={() => setSchedule({ time: t })} />)}
            </div>
            <label style={{ marginTop: 8 }}>Custom time</label>
            <input className="model-search" type="time" style={{ width: 140 }} value={sc.time || "09:00"} onChange={(e) => setSchedule({ time: e.target.value })} />
          </>
        )}
        {cur === "when" && sc.mode === "interval" && (
          <>
            <div className="wiz-q">Run every how many minutes?</div>
            <input className="model-search" type="number" min="1" style={{ width: 140 }} value={sc.everyMinutes || 30} onChange={(e) => setSchedule({ everyMinutes: Number(e.target.value) })} />
          </>
        )}

        {cur === "target" && (
          <>
            <div className="wiz-q">Where should it run?</div>
            <div className="wiz-opts">
              <Opt n="1" label="Let's Chat" sub="Plain chat — no file access" active={tg.type === "chat"} onClick={() => setTarget({ type: "chat" })} />
              <Opt n="2" label="Work in a project" sub="Use a project's knowledge & instructions" active={tg.type === "project"} onClick={() => setTarget({ type: "project" })} />
              <Opt n="3" label="Let's Collaborate" sub="Cowork on a folder (file & shell access)" active={tg.type === "folder"} onClick={() => setTarget({ type: "folder" })} />
            </div>
            {tg.type === "project" && (
              <>
                <select className="model-search" style={{ marginTop: 10 }} value={tg.projectId || ""} onChange={(e) => setTarget({ projectId: e.target.value })}>
                  <option value="">Select workroom…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="model-search" style={{ marginTop: 8 }} value={tg.agentId || ""} onChange={(e) => setTarget({ agentId: e.target.value || undefined })}>
                  <option value="">Run as: the room itself</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name || "Untitled agent"}</option>)}
                </select>
              </>
            )}
            {tg.type === "folder" && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                <button className="btn" onClick={pickFolder}><FolderInput size={14} /> {tg.folder ? "Change folder" : "Choose folder"}</button>
                {tg.folder && <span className="mo-sub" style={{ fontFamily: "var(--mono)" }}>{tg.folder}</span>}
              </div>
            )}
          </>
        )}

        {cur === "review" && (
          <>
            <div className="wiz-q">Name &amp; confirm</div>
            <label>Name</label>
            <input className="model-search" autoFocus value={d.name} placeholder="daily-briefing" onChange={(e) => set({ name: e.target.value })} />
            <label>Description</label>
            <input className="model-search" value={d.description} placeholder="Short summary" onChange={(e) => set({ description: e.target.value })} />
            <div className="wiz-summary">
              <div><b>Runs:</b> {scheduleText(d.schedule)}</div>
              <div><b>Where:</b> {tg.type === "folder" ? `Cowork · ${tg.folder || "(choose a folder)"}` : tg.type === "project" ? `Workroom${tg.agentId ? " · run by a crew agent" : ""}` : "Plain chat"}</div>
              <div style={{ color: "var(--text-2)", marginTop: 4, whiteSpace: "pre-wrap" }}>{d.prompt}</div>
            </div>
          </>
        )}

        <div className="pj-create-btns">
          {step > 0 && <button className="btn" onClick={back}>Back</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          {isLast
            ? <button className="btn primary" onClick={onSave} disabled={!canNext}>Create task</button>
            : <button className="btn primary" onClick={next} disabled={!canNext}>Next</button>}
        </div>
        </>)}
      </div>
    </div>
  );
}

const WIZ_SYS = "You help the user set up a scheduled task in Madav. Ask ONE short, friendly follow-up question at a time to determine: (1) exactly what the task should do, (2) how often it runs (manual, hourly, daily, weekly, or every N minutes), (3) the time/day if relevant, (4) where it runs (plain chat, a project, or a folder for file access). Keep each question to one line. When you have enough, reply with ONLY one line beginning with TASK_JSON: followed by minified JSON of shape {\"name\":\"short-id\",\"description\":\"one line\",\"prompt\":\"the full instruction\",\"schedule\":{\"mode\":\"off|interval|daily|weekly\",\"everyMinutes\":30,\"time\":\"HH:MM\",\"weekday\":1},\"target\":{\"type\":\"chat|project|folder\"}} and nothing else.";

function AdaptivePanel({ d, setDraft, onSave, onClose }) {
  const [convo, setConvo] = useState([]); // {role, text}
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  const ask = async (history) => {
    setThinking(true); setErr("");
    const r = await bridge.completeOnce(history).catch(() => ({ error: "request failed" }));
    setThinking(false);
    if (r.error) { setErr(r.error); return; }
    const text = (r.text || "").trim();
    const m = text.match(/TASK_JSON:\s*(\{[\s\S]*\})/);
    if (m) {
      try {
        const spec = JSON.parse(m[1]);
        setDraft({ ...d, name: spec.name || d.name, description: spec.description || d.description, prompt: spec.prompt || d.prompt, schedule: spec.schedule || { mode: "off" }, target: spec.target || { type: "chat" } });
        setConvo((c) => [...c, { role: "assistant", text: "All set — review the details below and create the task." }]);
        setReady(true);
        return;
      } catch {}
    }
    setConvo((c) => [...c, { role: "assistant", text }]);
  };

  const submit = async () => {
    const v = input.trim();
    if (!v || thinking) return;
    const nc = [...convo, { role: "user", text: v }];
    setConvo(nc); setInput("");
    await ask([{ role: "system", content: WIZ_SYS }, ...nc.map((m) => ({ role: m.role, content: m.text }))]);
  };

  return (
    <div>
      <div className="wiz-chat">
        {convo.length === 0 && <div className="wiz-q" style={{ marginTop: 4 }}>Describe what you want to schedule — I'll ask a couple of questions.</div>}
        {convo.map((m, i) => <div key={i} className={`wiz-msg ${m.role}`}>{m.text}</div>)}
        {thinking && <div className="wiz-msg assistant">…</div>}
        {err && <div style={{ color: "var(--danger)", fontSize: 12, marginTop: 6 }}>{err}</div>}
      </div>

      {!ready ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input className="model-search" style={{ marginBottom: 0, flex: 1 }} value={input} autoFocus
            placeholder={convo.length ? "Your answer…" : "e.g. a daily news briefing at 7am using web search"}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <button className="btn primary" onClick={submit} disabled={thinking || !input.trim()}>Send</button>
        </div>
      ) : (
        <>
          <label>Name</label>
          <input className="model-search" value={d.name} onChange={(e) => setDraft({ ...d, name: e.target.value })} />
          <label>Description</label>
          <input className="model-search" value={d.description} onChange={(e) => setDraft({ ...d, description: e.target.value })} />
          <div className="wiz-summary">
            <div><b>Runs:</b> {scheduleText(d.schedule)}</div>
            <div><b>Where:</b> {d.target?.type === "folder" ? "Cowork folder" : d.target?.type === "project" ? "Project" : "Plain chat"}</div>
            <div style={{ color: "var(--text-2)", marginTop: 4, whiteSpace: "pre-wrap" }}>{d.prompt}</div>
          </div>
          <div className="pj-create-btns">
            <button className="btn" onClick={() => setReady(false)}>Back</button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={onSave} disabled={!(d.name || "").trim() || !(d.description || "").trim()}>Create task</button>
          </div>
        </>
      )}
    </div>
  );
}
