// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Agents — build, configure, and run custom agents (Console-style 4-step builder).
// Agents are stored in settings.agents and run on the model from the model selector
// (optionally pinned per agent in step 4 — no separate API key, ever).
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Plus, Search, Sparkles, Trash2, Pencil, Play, ChevronRight, FolderOpen, TerminalSquare, Plug, Puzzle, Check, Loader2, ArrowUp, Cpu } from "lucide-react";
import { bridge } from "../bridge/index.js";
import ModelPicker from "./ModelPicker.jsx";

const STEPS = ["Create agent", "Configure environment", "Start session", "Integrate"];

const TOOL_DEFS = [
  { key: "files",      label: "Files & folders",  icon: FolderOpen,     note: "Read, write, edit and search files in a working folder." },
  { key: "shell",      label: "Terminal",         icon: TerminalSquare, note: "Run shell commands (desktop only — the browser has no terminal)." },
  { key: "connectors", label: "Connectors (MCP)", icon: Plug,           note: "Use your enabled MCP connectors (Gmail, GitHub, Slack…)." },
  { key: "skills",     label: "Skills",           icon: Puzzle,         note: "Load and follow your installed skills on demand." },
];

// Adapted Console template set — wired to BrainEdge capabilities.
const TEMPLATES = [
  { name: "Blank agent config", desc: "A blank starting point with the core toolset.",
    tools: { files: false, shell: false, connectors: true, skills: true }, instructions: "" },
  { name: "Deep researcher", desc: "Conducts multi-step research with source synthesis and citations.",
    tools: { files: false, shell: false, connectors: true, skills: true },
    instructions: "You are a deep researcher. Break the question into sub-questions, gather evidence step by step (use connectors such as fetch/search when available), cross-check claims across at least two sources, and synthesize a structured answer with inline citations. Flag low-confidence claims explicitly. Never fabricate sources." },
  { name: "Structured extractor", desc: "Parses unstructured text into a typed JSON schema.",
    tools: { files: true, shell: false, connectors: false, skills: false },
    instructions: "You convert unstructured text into clean, typed JSON. First infer or confirm the target schema, then extract strictly — no invented fields, null for missing values, ISO-8601 dates, numbers as numbers. Output ONLY the JSON unless asked otherwise. Validate the result against the schema before answering." },
  { name: "Field monitor", desc: "Scans sources for a topic and writes a what-changed brief.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You monitor a field/topic. Given a topic (and sources when provided), gather the latest developments, compare against what was previously known, and write a concise what-changed brief: 'New', 'Changed', 'Unchanged but notable'. Lead with the single most important development. Tip: schedule me weekly from the Scheduler." },
  { name: "Support agent", desc: "Answers customer questions from your docs and knowledge, and escalates when needed.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a customer-support agent. Answer ONLY from the provided docs/knowledge (files in the working folder or connected sources). Quote the relevant passage when helpful. If the answer is not in the docs, say so plainly and draft an escalation summary (issue, what was tried, customer impact) instead of guessing." },
  { name: "Incident commander", desc: "Triages an alert, drafts the incident ticket, and runs the war room.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You are an incident commander. Given an alert or report: 1) triage severity and likely blast radius, 2) draft an incident ticket (title, severity, impact, timeline, current hypothesis), 3) coordinate next actions as a checklist with owners, 4) keep a running war-room log. Use connectors (issue tracker, chat) when connected; otherwise produce the artifacts as text." },
  { name: "Contract tracker", desc: "Extracts clauses, deadlines and obligations from contracts and tracks them.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You analyze contracts. Extract parties, term, renewal/termination windows, payment terms, SLAs, liability caps and unusual clauses. Build an obligations table with due dates sorted soonest-first and flag anything within 30 days. Quote the exact clause text for every extracted item — never paraphrase a legal term without the quote." },
  { name: "Sprint retro facilitator", desc: "Pulls a closed sprint, synthesizes themes, and writes the retro doc.",
    tools: { files: true, shell: false, connectors: true, skills: true },
    instructions: "You facilitate sprint retros. Given sprint data (from a connected tracker or pasted/linked files), synthesize: what shipped vs planned, themes in what went well / what didn't, and 3-5 concrete action items with owners. Write the result as a clean retro doc. Be specific — name the tickets behind each theme." },
  { name: "Support-to-eng escalator", desc: "Reads a support conversation, reproduces the bug, and files a linked issue with repro steps.",
    tools: { files: true, shell: true, connectors: true, skills: false },
    instructions: "You turn support conversations into engineering-ready bug reports. Read the conversation, identify the defect, attempt to reproduce it (use the working folder/terminal when code is available), then file or draft an issue: title, environment, exact repro steps, expected vs actual, severity, and the support context link. Mark repro as confirmed/unconfirmed honestly." },
  { name: "Data analyst", desc: "Loads, explores and visualizes data; builds reports and answers questions from datasets.",
    tools: { files: true, shell: true, connectors: false, skills: true },
    instructions: "You are a data analyst. Load datasets from the working folder, profile them first (shape, types, missing values), then answer questions with real computed numbers — never estimates. Prefer scripts (run via the terminal on desktop) so results are reproducible. Present findings readably: key numbers first, method after, caveats last." },
];

const blankAgent = () => ({ id: "agent_" + Math.random().toString(36).slice(2, 9), name: "", description: "", instructions: "", tools: { files: false, shell: false, connectors: true, skills: true }, model: "", createdAt: Date.now() });

// Tolerant JSON extraction for model output (handles fences/preamble).
function parseAgentJson(text) {
  if (!text) return null;
  const i = text.indexOf("{"); const j = text.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(text.slice(i, j + 1)); } catch { return null; }
}

const GEN_SYS = `You design agent configurations for BrainEdge, an LLM workbench. Given the user's description of an agent, reply with ONLY a JSON object (no prose, no code fence) of this exact shape:
{"name":"Short Agent Name","description":"One sentence describing what it does.","instructions":"Detailed system instructions for the agent, written in second person ('You are…'). Cover its role, method, output format, and what it must never do.","tools":{"files":false,"shell":false,"connectors":false,"skills":false}}
Tool meanings — files: read/write files in a working folder; shell: run terminal commands; connectors: external apps via MCP (mail, GitHub, Slack, web fetch…); skills: load installed skill playbooks. Enable only the tools the agent genuinely needs.`;

export default function Agents({ onLaunch, groups, activeValue, onSelectModel, onRefresh }) {
  const [agents, setAgents] = useState([]);
  const [view, setView] = useState("list");     // "list" | "builder"
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(blankAgent());
  const [desc, setDesc] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState("");
  const [q, setQ] = useState("");
  const [firstMsg, setFirstMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const savedTimer = useRef(null);

  useEffect(() => { bridge.getSettings().then((s) => setAgents((s && s.agents) || [])).catch(() => {}); }, []);

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
    } catch (e) {
      setSaveErr("Save failed: " + String((e && e.message) || e));
      return false;
    } finally { setSaveBusy(false); }
  };

  const removeAgent = async (id) => { await persist(agents.filter((a) => a.id !== id)); };

  const openBuilder = (agent) => {
    setDraft(agent ? { ...agent, tools: { ...agent.tools } } : blankAgent());
    setDesc(""); setGenErr(""); setFirstMsg("");
    setStep(agent ? 1 : 0);
    setView("builder");
  };

  const useTemplate = (t) => {
    setDraft((d) => ({ ...d, name: t.name === "Blank agent config" ? "" : t.name, description: t.desc, instructions: t.instructions, tools: { ...t.tools } }));
    setStep(1);
  };

  const generate = async () => {
    const text = desc.trim();
    if (!text || genBusy) return;
    setGenBusy(true); setGenErr("");
    try {
      const r = await bridge.completeOnce([{ role: "system", content: GEN_SYS }, { role: "user", content: text }]);
      const cfg = parseAgentJson(r && r.text);
      if (!cfg || !cfg.instructions) { setGenErr((r && r.error) || "The model didn't return a valid config — try rephrasing, or pick a template."); return; }
      setDraft((d) => ({
        ...d,
        name: String(cfg.name || "").slice(0, 60) || d.name,
        description: String(cfg.description || "").slice(0, 200),
        instructions: String(cfg.instructions || ""),
        tools: { files: !!(cfg.tools && cfg.tools.files), shell: !!(cfg.tools && cfg.tools.shell), connectors: !!(cfg.tools && cfg.tools.connectors), skills: !!(cfg.tools && cfg.tools.skills) },
      }));
      setStep(1);
    } catch (e) {
      setGenErr(String((e && e.message) || e));
    } finally { setGenBusy(false); }
  };

  const launch = async () => {
    await saveDraft(false);
    onLaunch && onLaunch({ ...draft, name: draft.name.trim() || "Untitled agent" }, firstMsg.trim() || null);
  };

  const shownTemplates = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? TEMPLATES.filter((t) => (t.name + " " + t.desc).toLowerCase().includes(k)) : TEMPLATES;
  }, [q]);

  const toolPills = (tools) => TOOL_DEFS.filter((t) => tools && tools[t.key]).map((t) => {
    const I = t.icon;
    return <span key={t.key} className="ag-pill"><I size={11} /> {t.label}</span>;
  });

  const canConfigure = true;
  const canRun = !!draft.instructions.trim();

  // ---------- list view ----------
  if (view === "list") {
    return (
      <div className="agents-page scroll">
        <div className="ag-head">
          <div>
            <h2 className="ag-title"><Bot size={20} /> Agents</h2>
            <p className="ag-sub">Reusable agents with their own instructions and tools. They run on the model from your model selector — no extra keys.</p>
          </div>
          <div className="ag-head-right">
            <ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} />
            <button className="btn primary" onClick={() => openBuilder(null)}><Plus size={15} /> Create agent</button>
          </div>
        </div>

        {agents.length === 0 ? (
          <div className="ag-empty">
            <Bot size={28} />
            <div className="ag-empty-t">No agents yet</div>
            <div className="ag-empty-s">Describe what you want to build, or start from a template.</div>
            <button className="btn primary" onClick={() => openBuilder(null)}><Plus size={15} /> Create your first agent</button>
          </div>
        ) : (
          <div className="ag-grid">
            {agents.map((a) => (
              <div key={a.id} className="ag-card">
                <div className="ag-card-name">{a.name || "Untitled agent"}</div>
                <div className="ag-card-desc">{a.description || "No description."}</div>
                <div className="ag-card-pills">
                  {toolPills(a.tools)}
                  {a.model && <span className="ag-pill ag-pill-model"><Cpu size={11} /> {a.model.split("::")[1] || a.model}</span>}
                </div>
                <div className="ag-card-actions">
                  <button className="btn primary" onClick={() => onLaunch && onLaunch(a, null)}><Play size={13} /> Run</button>
                  <button className="btn ghost" onClick={() => openBuilder(a)}><Pencil size={13} /> Edit</button>
                  <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---------- builder ----------
  return (
    <div className="agents-page scroll">
      {/* stepper */}
      <div className="ag-stepper">
        <button className="btn ghost ag-back" onClick={() => setView("list")}>← Agents</button>
        {STEPS.map((label, i) => (
          <div key={label} className="ag-step-wrap">
            <button className={`ag-step ${step === i ? "on" : ""} ${step > i ? "done" : ""}`} onClick={() => setStep(i)}>
              <span className="ag-step-n">{step > i ? <Check size={11} /> : i + 1}</span> {label}
            </button>
            {i < STEPS.length - 1 && <span className="ag-step-line" />}
          </div>
        ))}
        <div className="ag-stepper-right">
          {saved && <span className="ag-saved"><Check size={12} /> Saved</span>}
          {saveErr && <span className="ag-err" style={{ margin: 0 }}>{saveErr}</span>}
          <ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} />
          <button className="btn ghost" disabled={saveBusy} onClick={() => saveDraft(true)}>{saveBusy ? "Saving…" : "Save & close"}</button>
        </div>
      </div>

      {/* step 1 — create */}
      {step === 0 && (
        <div className="ag-create">
          <div className="ag-create-left">
            <div className="ag-hero">
              <h1>What do you want to build?</h1>
              <p>Describe your agent or start with a template.</p>
            </div>
            <div className="ag-describe">
              <textarea
                value={desc}
                placeholder="Describe your agent…  e.g. “Reads my repo, reviews new code for security issues, and writes a findings report”"
                onChange={(e) => setDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } }}
                rows={3}
              />
              <button className="ag-gen" disabled={genBusy || !desc.trim()} onClick={generate} title="Generate agent">
                {genBusy ? <Loader2 size={15} className="ag-spin" /> : <ArrowUp size={15} />}
              </button>
            </div>
            {!genBusy && <div className="ag-hint" style={{ marginTop: 8 }}>Generation runs on the selected model ({(activeValue || "").split("::")[1] || "none selected"}) — switch it in the picker above.</div>}
            {genBusy && <div className="ag-genline"><Sparkles size={13} /> Designing your agent with the selected model…</div>}
            {genErr && <div className="ag-err">{genErr}</div>}
            <button className="ag-skip" onClick={() => setStep(1)}>Configure manually <ChevronRight size={13} /></button>
          </div>
          <div className="ag-create-right">
            <div className="ag-tpl-head">Browse templates</div>
            <div className="ag-tpl-search">
              <Search size={13} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" />
            </div>
            <div className="ag-tpl-grid">
              {shownTemplates.map((t) => (
                <button key={t.name} className="ag-tpl" onClick={() => useTemplate(t)}>
                  <div className="ag-tpl-name">{t.name}</div>
                  <div className="ag-tpl-desc">{t.desc}</div>
                  <div className="ag-tpl-pills">{toolPills(t.tools)}</div>
                </button>
              ))}
              {shownTemplates.length === 0 && <div className="ag-empty-s" style={{ padding: 12 }}>No matching templates.</div>}
            </div>
          </div>
        </div>
      )}

      {/* step 2 — configure environment */}
      {step === 1 && (
        <div className="ag-pane">
          <div className="ag-field">
            <label>Name</label>
            <input value={draft.name} placeholder="e.g. Deep researcher" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="ag-field">
            <label>Description</label>
            <input value={draft.description} placeholder="One sentence — what does this agent do?" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="ag-field">
            <label>Instructions</label>
            <textarea className="ag-instructions" rows={10} value={draft.instructions}
              placeholder="System instructions the agent always follows. Be specific: role, method, output format, what it must never do."
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
          </div>
          <div className="ag-field">
            <label>Capabilities</label>
            <div className="ag-tools">
              {TOOL_DEFS.map((t) => {
                const I = t.icon;
                const on = !!draft.tools[t.key];
                return (
                  <button key={t.key} className={`ag-tool ${on ? "on" : ""}`} onClick={() => setDraft({ ...draft, tools: { ...draft.tools, [t.key]: !on } })}>
                    <span className="ag-tool-top"><I size={15} /> <span>{t.label}</span> <span className={`ag-tool-sw ${on ? "on" : ""}`} /></span>
                    <span className="ag-tool-note">{t.note}</span>
                  </button>
                );
              })}
            </div>
            {(draft.tools.files || draft.tools.shell) && <div className="ag-hint">This agent works in a folder — you'll pick the working folder when the session starts.</div>}
          </div>
          {saveErr && <div className="ag-err">{saveErr}</div>}
          <div className="ag-foot">
            <button className="btn ghost" onClick={() => setStep(0)}>← Back</button>
            <button className="btn ghost" disabled={saveBusy} onClick={() => saveDraft(false)}>{saveBusy ? "Saving…" : saved ? "Saved ✓" : "Save"}</button>
            <button className="btn primary" disabled={!canRun} onClick={() => setStep(2)}>Continue <ChevronRight size={13} /></button>
          </div>
        </div>
      )}

      {/* step 3 — start session */}
      {step === 2 && (
        <div className="ag-pane">
          <div className="ag-summary">
            <div className="ag-summary-name"><Bot size={17} /> {draft.name.trim() || "Untitled agent"}</div>
            {draft.description && <div className="ag-card-desc">{draft.description}</div>}
            <div className="ag-card-pills">
              {toolPills(draft.tools)}
              <span className="ag-pill ag-pill-model"><Cpu size={11} /> {draft.model ? (draft.model.split("::")[1] || draft.model) : "Current selector model"}</span>
            </div>
          </div>
          <div className="ag-field">
            <label>First message (optional)</label>
            <textarea rows={3} value={firstMsg} placeholder="Kick the session off with a task — or leave empty to just open the session."
              onChange={(e) => setFirstMsg(e.target.value)} />
          </div>
          <div className="ag-foot">
            <button className="btn ghost" onClick={() => setStep(1)}>← Back</button>
            <button className="btn ghost" onClick={() => setStep(3)}>Integrate <ChevronRight size={13} /></button>
            <button className="btn primary" disabled={!canRun} onClick={launch}><Play size={13} /> Start session</button>
          </div>
        </div>
      )}

      {/* step 4 — integrate (model binding) */}
      {step === 3 && (
        <div className="ag-pane">
          <div className="ag-summary">
            <div className="ag-summary-name"><Cpu size={17} /> Model</div>
            <div className="ag-card-desc">
              Agents run on a model from your model selector — exactly like chat, no separate API key.
              Pin a model here and every session with this agent switches to it; leave it unpinned to use whatever the selector is on.
            </div>
            <div className="ag-model-row">
              <ModelPicker value={draft.model || undefined} groups={groups} onChange={(v) => setDraft({ ...draft, model: v })} onRefresh={onRefresh} />
              {draft.model
                ? <button className="btn ghost" onClick={() => setDraft({ ...draft, model: "" })}>Unpin (use selector)</button>
                : <span className="ag-hint" style={{ margin: 0 }}>Currently unpinned — uses the selector ({(activeValue || "").split("::")[1] || "no model selected"}).</span>}
            </div>
          </div>
          <div className="ag-summary">
            <div className="ag-summary-name"><Sparkles size={17} /> Use it everywhere</div>
            <div className="ag-card-desc">
              Run it from the Agents list any time, or start a session right now. Scheduled/background runs via the Scheduler and CLI access are next on the roadmap.
            </div>
          </div>
          <div className="ag-foot">
            <button className="btn ghost" onClick={() => setStep(2)}>← Back</button>
            <button className="btn ghost" onClick={() => saveDraft(true)}>Save & close</button>
            <button className="btn primary" disabled={!canRun} onClick={launch}><Play size={13} /> Start session</button>
          </div>
        </div>
      )}
    </div>
  );
}
