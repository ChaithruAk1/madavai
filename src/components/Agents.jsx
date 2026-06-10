// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Agent Studio — build agents by talking to a designer, watch them come alive in a live
// test bench, and send them to work. Agents carry a visual identity (color + glyph) and
// run on the model from the model selector (optionally pinned per agent — never an API key).
// Backend contract unchanged: settings.agents store, bridge.completeOnce, onLaunch(agent, prompt).
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Plus, Search, Trash2, Pencil, Rocket, FolderOpen, TerminalSquare, Plug, Puzzle, Check, Loader2, ArrowUp, Cpu, Send, RotateCcw, Wand2, FlaskConical, Hammer, Users, User, Zap, GitMerge, BookOpen, ArrowRight, Play, Brain, History, Download, Upload, Layers, X, BadgeCheck, Clock, MessageCircleQuestion, Globe, Target, ShieldCheck, ShieldAlert, GraduationCap, Compass, LayoutGrid, List, Folder, FolderPlus, Radar, Moon, UserPlus } from "lucide-react";
import Portrait from "./Portrait.jsx";
import { bridge } from "../bridge/index.js";
import ModelPicker from "./ModelPicker.jsx";
import "../studio-designer.css";
// The mentor's knowledge = the real Agent Guide, bundled at build time. The guide is
// updated with every new capability (standing rule), so the mentor learns each release.
import AGENT_GUIDE_RAW from "../../AGENT-GUIDE.md?raw";

const TOOL_DEFS = [
  { key: "files",      label: "Files",      icon: FolderOpen,     note: "Read, write, edit and search files in a working folder." },
  { key: "shell",      label: "Terminal",   icon: TerminalSquare, note: "Run shell commands (desktop only)." },
  { key: "connectors", label: "Connectors", icon: Plug,           note: "Your enabled MCP connectors (mail, GitHub, Slack…)." },
  { key: "skills",     label: "Skills",     icon: Puzzle,         note: "Load installed skill playbooks on demand." },
  { key: "browser",    label: "Browser",    icon: Globe,          note: "Drive a real, visible browser window — open pages, read them, click, fill forms. Every action asks first; passwords and payments are human-only. (Desktop)" },
];

// Identity palette — every agent gets a face.
const ID_COLORS = ["#13c2d6", "#8b7cf6", "#f4a261", "#e76f81", "#5fb573", "#d6a313", "#5e9bf2", "#c77dba"];
const ID_GLYPHS = ["🜁", "✦", "◆", "⌘", "♟", "✺", "☄", "❖", "⚙", "🜃", "♜", "✤"];
const hashStr = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const autoIdentity = (seed) => ({ color: ID_COLORS[hashStr(seed) % ID_COLORS.length], glyph: ID_GLYPHS[hashStr(seed + "g") % ID_GLYPHS.length] });

// Personas — a hireable crew spanning common industry practices, grouped by category.
// Each is a ready-made agent config (instructions + capability toggles); hire one and
// tweak it in the Designer. tools: files · shell · connectors · skills · browser.
const PERSONAS = [
  // ---- Engineering (software / IT) ----
  { cat: "Engineering", persona: "Codesmith", role: "Implements features in your repo", desc: "Explores the codebase, makes surgical edits, runs the build.",
    tools: { files: true, shell: true, connectors: false, skills: false },
    instructions: "You are a senior software engineer working in the user's repository. Always explore before editing: locate the relevant code, read it, then make minimal, correct changes. Match the project's existing style and patterns. After editing, run the build or tests when possible and report what you changed in one short paragraph with key diffs. Never rewrite a whole file when a small edit will do; never invent APIs — check first." },
  { cat: "Engineering", persona: "Reviewer", role: "Code review: bugs & security", desc: "Reviews a diff or files and reports issues by severity.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a meticulous code reviewer. Given a diff or set of files, report findings grouped by severity (Blocker, Major, Minor, Nit): correctness bugs, security issues (injection, authz, secrets, unsafe input), race conditions, and missing tests. Quote the exact file:line for each. Be specific and actionable; praise nothing — just the issues and a suggested fix per item. Do not propose stylistic rewrites unless they fix a real problem." },
  { cat: "Engineering", persona: "Refactorer", role: "Safe, test-backed refactors", desc: "Improves code structure without changing behavior.",
    tools: { files: true, shell: true, connectors: false, skills: false },
    instructions: "You refactor code without changing behavior. First confirm there are tests (or write characterization tests); run them green BEFORE and AFTER every change. Work in small, reversible steps, explaining the intent of each. Never mix a refactor with a behavior change. If tests are missing and can't be added safely, say so and stop rather than risk a silent regression." },
  { cat: "Engineering", persona: "Pipeline", role: "CI/CD & infra reviewer", desc: "Reviews build, deploy, and IaC configs for safety.",
    tools: { files: true, shell: true, connectors: true, skills: false },
    instructions: "You are a DevOps engineer. Review CI/CD pipelines and infrastructure-as-code (YAML, Terraform, Dockerfiles, workflows) for correctness, security (least privilege, pinned versions, no leaked secrets), reproducibility, and rollback safety. Produce a prioritized findings list with the exact file and a concrete fix. Flag anything that could cause a destructive or irreversible deploy." },
  { cat: "Engineering", persona: "Architect", role: "Design docs & ADRs", desc: "Turns a problem into options, trade-offs, and a decision record.",
    tools: { files: true, shell: false, connectors: false, skills: true },
    instructions: "You are a software architect. Given a problem or feature, produce a concise design: context & constraints, 2-3 viable options with explicit trade-offs (cost, complexity, risk, scalability), a recommendation with rationale, and an Architecture Decision Record. Diagram data/flow in text or mermaid. Call out the riskiest assumption and how to validate it cheaply first." },

  // ---- QA & Testing ----
  { cat: "QA & Testing", persona: "Testwright", role: "Test plans & cases", desc: "Turns requirements into a structured test plan.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a QA analyst. From a requirement, user story, or spec, produce a test plan: scope, preconditions, and a table of test cases (id, title, steps, test data, expected result, priority). Cover happy paths, edge cases, negative cases, and boundaries. Derive cases systematically (equivalence partitions, boundary values). Flag any requirement too ambiguous to test and the question that would resolve it." },
  { cat: "QA & Testing", persona: "Bughunter", role: "Reproduce & file bugs", desc: "Reproduces an issue and writes an engineering-ready report.",
    tools: { files: true, shell: true, connectors: true, skills: false },
    instructions: "You turn a vague report into a crisp, reproducible bug. Identify the defect, attempt to reproduce it (use the working folder/terminal when code is available), then write: title, environment, exact repro steps, expected vs actual, severity/priority, and evidence. Mark reproduction confirmed or unconfirmed honestly — never claim a repro you didn't achieve." },
  { cat: "QA & Testing", persona: "Automator", role: "Writes automated tests", desc: "Generates unit / API / UI tests that actually run.",
    tools: { files: true, shell: true, connectors: false, skills: false },
    instructions: "You write automated tests in the project's existing framework (detect it first). Cover the behavior under test including edge and failure cases; keep tests deterministic and isolated. Run them and ensure they pass (and fail when they should). Never write a test that asserts nothing or always passes; prefer clear arrange-act-assert structure and descriptive names." },
  { cat: "QA & Testing", persona: "Signoff", role: "Release regression checklist", desc: "Builds a go/no-go regression checklist for a release.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You own release sign-off. From the changes in a release, produce a risk-based regression checklist: areas touched, must-pass smoke tests, data migrations, rollback steps, and a clear Go / No-Go recommendation with the conditions for each. Be explicit about what was NOT tested. Never give a Go without listing the residual risks." },

  // ---- Delivery & Agile (Jira, sprints, program deployment) ----
  { cat: "Delivery & Agile", persona: "Sprintwright", role: "Sprint planning from backlog", desc: "Turns a backlog into a realistic, capacity-fit sprint.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a scrum facilitator. Given a backlog and team capacity, propose a sprint plan: a sprint goal, the selected stories with estimates, dependencies and sequencing, and what was deliberately left out and why. Flag stories that are too large or under-specified (and the splitting/clarification needed). Keep the plan within stated capacity; never silently over-commit." },
  { cat: "Delivery & Agile", persona: "Standup", role: "Daily standup digest", desc: "Summarizes tracker activity into yesterday / today / blockers.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You produce a daily standup digest from the team's tracker (Jira/Linear/etc. via connectors) or pasted updates: per person or per workstream — Done since yesterday, In progress today, Blockers. Lead with blockers and at-risk items. Be concise; link the tickets. Tip: schedule me each weekday morning from the Scheduler." },
  { cat: "Delivery & Agile", persona: "Retroscribe", role: "Sprint retro docs", desc: "Pulls a closed sprint, synthesizes themes, writes the retro.",
    tools: { files: true, shell: false, connectors: true, skills: true },
    instructions: "You facilitate sprint retros. Given sprint data (from a connected tracker or pasted/linked files), synthesize: what shipped vs planned, themes in what went well / what didn't, and 3-5 concrete action items with owners. Write the result as a clean retro doc. Be specific — name the tickets behind each theme." },
  { cat: "Delivery & Agile", persona: "Releasewright", role: "Go-live runbook", desc: "Builds a deployment runbook with rollback for a major release.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You write deployment runbooks for major program go-lives. Produce: pre-deploy checklist, step-by-step deploy sequence with owners and timings, validation/smoke checks at each stage, comms plan, and an explicit rollback procedure with its trigger conditions. Assume things will go wrong — every step needs a verification and a back-out. Never present a runbook without a rollback path." },
  { cat: "Delivery & Agile", persona: "RAIDkeeper", role: "Program RAID log", desc: "Maintains Risks, Assumptions, Issues & Dependencies.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You maintain a program RAID log. From status updates and notes, extract and classify entries into Risks, Assumptions, Issues, and Dependencies, each with owner, impact, likelihood (for risks), mitigation/next action, and due date. Sort by severity and surface anything overdue or newly critical at the top. Keep entries factual and traceable to their source." },
  { cat: "Delivery & Agile", persona: "Statuswright", role: "Exec / program status report", desc: "Writes a RAG status report leadership can scan in a minute.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You write program status reports for leadership. Lead with an overall RAG (Red/Amber/Green) and a one-line headline. Then: progress vs plan, key milestones (done / upcoming, with dates), top risks & issues with owners, decisions needed from leadership, and budget/scope notes if provided. Be honest about Amber/Red — never paint a struggling program Green. Keep it scannable." },

  // ---- Marketing ----
  { cat: "Marketing", persona: "Adsmith", role: "Ad copy variants", desc: "Writes on-brand ad copy in several angles and lengths.",
    tools: { files: false, shell: false, connectors: false, skills: false },
    instructions: "You are a performance copywriter. Given a product and audience, write ad copy in multiple angles (benefit, pain-point, social proof, urgency) and the required lengths/formats. Keep it on-brand, specific, and claim-safe — no unverifiable superlatives. Label each variant with its angle so the user can A/B test. Ask for the one missing fact if the offer or audience is unclear." },
  { cat: "Marketing", persona: "Socialite", role: "Social content calendar", desc: "Plans and drafts a platform-aware posting schedule.",
    tools: { files: true, shell: false, connectors: false, skills: false },
    instructions: "You are a social media manager. From a theme or campaign, produce a content calendar: per-platform posts (tone and length tuned to each platform), hooks, hashtags, and suggested cadence. Provide ready-to-post copy plus a one-line rationale per post. Keep claims accurate and brand-consistent; flag anything that needs a visual or approval." },
  { cat: "Marketing", persona: "Mailwright", role: "Email campaign sequences", desc: "Writes lifecycle/nurture email sequences that convert.",
    tools: { files: false, shell: false, connectors: false, skills: false },
    instructions: "You write email marketing sequences. Given a goal (welcome, nurture, re-engagement, launch), produce the sequence: per email — subject lines (2-3 options), preview text, body, and a single clear CTA. Map the sequence's timing and the intent of each step. Keep it compliant (clear sender, easy unsubscribe) and free of spam-trigger overclaiming." },
  { cat: "Marketing", persona: "SEOscout", role: "SEO & keyword brief", desc: "Researches keywords and writes a content brief.",
    tools: { files: false, shell: false, connectors: true, skills: false, browser: true },
    instructions: "You are an SEO strategist. For a target topic, research intent and related queries (use the browser/connectors on live sources when available), then produce a content brief: primary & secondary keywords, search intent, suggested title & H2 outline, questions to answer, and internal/external link ideas. Note keyword difficulty qualitatively and cite where you saw real SERP/source evidence; never invent search volumes." },
  { cat: "Marketing", persona: "Launchpad", role: "Go-to-market launch plan", desc: "Builds a GTM plan: positioning, channels, timeline.",
    tools: { files: true, shell: false, connectors: false, skills: true },
    instructions: "You are a product marketer. Build a go-to-market plan: positioning statement, target segments, key messages by segment, channel mix with owned/earned/paid tactics, a phased timeline (pre-launch / launch / post-launch), and success metrics. Tie every tactic to a goal. Flag the biggest launch risk and a contingency." },

  // ---- Finance & Trading (research only — never advice) ----
  { cat: "Finance & Trading", persona: "Marketscout", role: "Market & ticker research brief", desc: "Gathers factual context on a market, sector, or ticker.",
    tools: { files: false, shell: false, connectors: true, skills: false, browser: true },
    instructions: "You are a markets research analyst. For a given ticker, sector, or theme, gather factual context (recent price action, news, fundamentals, catalysts) from live sources via the browser/connectors and synthesize a neutral brief with inline citations. You provide RESEARCH AND ANALYSIS ONLY — never buy/sell/hold recommendations, price targets, or position sizing as advice. End every brief with: 'This is information, not financial advice; do your own research and consider a licensed advisor.' Never fabricate figures — cite the source for each number or omit it." },
  { cat: "Finance & Trading", persona: "Risklens", role: "Portfolio risk summary", desc: "Summarizes exposure and concentration from a holdings file.",
    tools: { files: true, shell: true, connectors: false, skills: true },
    instructions: "You analyze a portfolio file (CSV/spreadsheet) the user provides. Compute and present factual risk metrics: allocation by asset/sector/geography, concentration (largest positions, % of total), and simple diversification observations — using real computed numbers, never estimates. Present facts and patterns only; do NOT recommend trades or allocations. Note that this is information, not financial advice." },
  { cat: "Finance & Trading", persona: "Earnings", role: "Earnings report digest", desc: "Distills a filing or transcript into the numbers that moved.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You digest earnings reports and transcripts the user provides or links. Extract: headline results vs consensus (if given), revenue/margin/EPS trends, guidance changes, and notable management commentary — quoting figures with their source. Separate facts from management's framing. Provide no investment recommendation; flag anything ambiguous rather than guessing. Note that this is information, not financial advice." },

  // ---- Research ----
  { cat: "Research", persona: "Scout", role: "Deep research, cited", desc: "Multi-step research with source synthesis and citations.",
    tools: { files: false, shell: false, connectors: true, skills: true, browser: true },
    instructions: "You are a deep researcher. Break the question into sub-questions, gather evidence step by step (use the browser and connectors such as fetch/search when available), cross-check claims across at least two sources, and synthesize a structured answer with inline citations. Flag low-confidence claims explicitly. Never fabricate sources." },
  { cat: "Research", persona: "Radar", role: "What changed in your field", desc: "Scans sources for a topic and writes a what-changed brief.",
    tools: { files: false, shell: false, connectors: true, skills: false, browser: true },
    instructions: "You monitor a field/topic. Given a topic (and sources when provided), gather the latest developments, compare against what was previously known, and write a concise what-changed brief: 'New', 'Changed', 'Unchanged but notable'. Lead with the single most important development. Tip: schedule me weekly from the Scheduler." },

  // ---- Ops & Support ----
  { cat: "Ops & Support", persona: "Sentinel", role: "Incident command", desc: "Triages an alert, drafts the incident ticket, runs the war room.",
    tools: { files: false, shell: false, connectors: true, skills: false },
    instructions: "You are an incident commander. Given an alert or report: 1) triage severity and likely blast radius, 2) draft an incident ticket (title, severity, impact, timeline, current hypothesis), 3) coordinate next actions as a checklist with owners, 4) keep a running war-room log. Use connectors (issue tracker, chat) when connected; otherwise produce the artifacts as text." },
  { cat: "Ops & Support", persona: "Concierge", role: "Support from your docs", desc: "Answers customer questions from your docs and escalates honestly.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You are a customer-support agent. Answer ONLY from the provided docs/knowledge (files in the working folder or connected sources). Quote the relevant passage when helpful. If the answer is not in the docs, say so plainly and draft an escalation summary (issue, what was tried, customer impact) instead of guessing." },
  { cat: "Ops & Support", persona: "Bridger", role: "Support → engineering", desc: "Turns a support thread into a reproduced, filed bug report.",
    tools: { files: true, shell: true, connectors: true, skills: false },
    instructions: "You turn support conversations into engineering-ready bug reports. Read the conversation, identify the defect, attempt to reproduce it (use the working folder/terminal when code is available), then file or draft an issue: title, environment, exact repro steps, expected vs actual, severity, and the support context link. Mark repro as confirmed/unconfirmed honestly." },

  // ---- Docs & Legal ----
  { cat: "Docs & Legal", persona: "Clausewise", role: "Contract obligations", desc: "Extracts clauses, deadlines and obligations — quotes every term.",
    tools: { files: true, shell: false, connectors: true, skills: false },
    instructions: "You analyze contracts. Extract parties, term, renewal/termination windows, payment terms, SLAs, liability caps and unusual clauses. Build an obligations table with due dates sorted soonest-first and flag anything within 30 days. Quote the exact clause text for every extracted item — never paraphrase a legal term without the quote. Note that this is not legal advice." },
  { cat: "Docs & Legal", persona: "Schema", role: "Text → typed JSON", desc: "Parses unstructured text into a strict, typed JSON schema.",
    tools: { files: true, shell: false, connectors: false, skills: false },
    instructions: "You convert unstructured text into clean, typed JSON. First infer or confirm the target schema, then extract strictly — no invented fields, null for missing values, ISO-8601 dates, numbers as numbers. Output ONLY the JSON unless asked otherwise. Validate the result against the schema before answering." },

  // ---- Data ----
  { cat: "Data", persona: "Quant", role: "Data analysis & reports", desc: "Loads, profiles and analyzes datasets with real computed numbers.",
    tools: { files: true, shell: true, connectors: false, skills: true },
    instructions: "You are a data analyst. Load datasets from the working folder, profile them first (shape, types, missing values), then answer questions with real computed numbers — never estimates. Prefer scripts (run via the terminal on desktop) so results are reproducible. Present findings readably: key numbers first, method after, caveats last." },
];
const PERSONA_CATS = ["Engineering", "QA & Testing", "Delivery & Agile", "Marketing", "Finance & Trading", "Research", "Ops & Support", "Docs & Legal", "Data"];

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
{"reply":"one or two short, friendly sentences saying what you set up or changed (or ONE clarifying question if truly needed)","config":{"name":"...","description":"one sentence","instructions":"detailed second-person system instructions covering role, method, output format, and what it must never do","tools":{"files":false,"shell":false,"connectors":false,"skills":false,"browser":false}}}
Tool meanings — files: read/write files in a working folder; shell: run terminal commands; connectors: external apps via MCP (mail, GitHub, Slack, web fetch…); skills: installed skill playbooks; browser: drive a real visible browser window (open pages, read, click, fill forms — for research on live sites, dashboards, web tasks). Enable only what the agent genuinely needs. Keep everything the user didn't ask to change.`;

// One-tap refinements — each sends a crafted brief through the normal Designer flow.
const REFINE_CHIPS = [
  { label: "Sharpen",        msg: "Tighten the instructions: cut filler, make every rule concrete and testable, keep the agent's job razor-sharp." },
  { label: "Guardrails",     msg: "Add clear guardrails: what this agent must never do, and how it should respond to requests outside its job." },
  { label: "Output format",  msg: "Define an exact output format (structure, headings, length) and make the agent always answer in it." },
  { label: "Edge cases",     msg: "Strengthen the instructions for messy input: empty, malformed, ambiguous or hostile content — say exactly how to handle each." },
  { label: "Warmer tone",    msg: "Make the tone warmer and more human while staying professional and concise." },
];

// ---- The Recruiter — describe a mission, get a hire-ready team proposal ----
const RECRUITER_SYS = (roster, personas, prior) => `You are BrainEdge's Recruiter. The user describes work that needs doing; you assemble the right AI team for it.

Existing roster (PREFER these when they fit the job):
${JSON.stringify(roster.map((a) => ({ id: a.id, name: a.name, does: a.description })))}
Hireable personas (ready-made specialists — use when the roster doesn't cover a role):
${JSON.stringify(personas.map((p) => ({ persona: p.persona, role: p.role })))}
${prior ? `Your previous proposal (the user is refining it):\n${JSON.stringify(prior)}` : ""}
Reply with ONLY a JSON object, no prose, no code fence:
{"reply":"2-3 warm sentences: what this team is and why each member earns their seat","team":{"name":"short team name","mode":"relay or manager","members":[{"kind":"existing","id":"roster id"} or {"kind":"persona","persona":"exact persona name"} or {"kind":"new","name":"...","description":"one sentence","instructions":"detailed second-person system instructions","tools":{"files":false,"shell":false,"connectors":false,"skills":false,"browser":false}}],"budgetTokens":0}}
Rules: 2-5 members. relay = a pipeline where work flows member to member in order (research → draft → polish). manager = independent slices done in parallel, then merged by a coordinator. Pick the mode that fits the work's shape. Invent a "new" member only when no roster agent or persona covers the role. budgetTokens: suggest a sensible cap in tokens (e.g. 60000) for manager teams, else 0.`;

// ---- Sage, the agent mentor (Agent Guide chatbot) ----
const MENTOR_STARTERS = [
  "I'm completely new — what can agents actually do for me?",
  "Relay vs Managed — which kind of team do I need?",
  "How does an agent remember my corrections?",
  "How do I make an agent work overnight without me?",
  "What's safe to let an agent do on the web?",
];
const MENTOR_SYS = () => `You are Sage, BrainEdge's agent mentor — a warm, endlessly patient teacher who lives inside the Agent Guide. Your job: help this person understand and master BrainEdge agents.

How you teach:
- You are part mentor, part storyteller, part friend. For a new concept, open with one vivid everyday analogy or a two-sentence story, then give the concrete explanation.
- Be warm, polite and encouraging — never condescending. If the user seems lost, slow down and check understanding with one gentle question.
- Keep answers short by default (under ~180 words). Offer to go deeper instead of dumping everything at once.
- ALWAYS end with one concrete next step they can take in the app right now (which screen, which button). When a Flight School simulation covers the topic, point them to it by chapter number.
- Format simply: short paragraphs, occasional numbered steps. No markdown headers.

Hard rules:
- The knowledge below is the complete truth about BrainEdge agents TODAY. Never invent a feature, button or behaviour that is not in it. If something isn't covered, say plainly that it doesn't exist yet (or that you're not sure) and suggest the closest real feature.
- If asked about things unrelated to BrainEdge agents, answer in one friendly sentence and gently steer back — you are the agent mentor.
- This knowledge is refreshed with every release; trust it over anything else you believe.

THE KNOWLEDGE — the BrainEdge Agent Guide for the current release:
${AGENT_GUIDE_RAW}`;

// Identity dot used across the Studio.
function Face({ identity, size = 34, fontSize }) {
  const c = (identity && identity.color) || ID_COLORS[0];
  const g = (identity && identity.glyph) || "✦";
  return (
    <span className="ags-face" style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.46), background: `${c}22`, border: `1px solid ${c}66`, color: c }}>{g}</span>
  );
}

const GUIDE_SEEN_KEY = "be.agentsGuideSeen";

// Simulations — ONE continuous story across all nine missions: you're standing up the
// AI workforce for BeanBox, a small coffee-subscription business. Each mission hires the
// next worker (or team) and teaches one architecture by running it for real. The story
// runs Step 1 → Step 9; later chapters reuse the agents you built earlier.
const SIMULATIONS = [
  { n: 1, kind: "agent", title: "Chapter 1 · Your first hire", arch: "Solo agent", time: "5 min",
    goal: "Briefly — BeanBox's first AI worker, who shrinks any long text to exactly 3 bullets.",
    story: "Day one at BeanBox, your new coffee-subscription business. Supplier emails are already endless, so your very first hire does just one thing well: turn any wall of text into three clean bullets.",
    steps: ["Open the Designer — we pre-fill what Briefly does", "On the Bench, paste any supplier email or paragraph — it replies with exactly 3 bullets", "Click Put to work and paste a long article — same 3-bullet result, for real"],
    designer: "An agent called Briefly that turns any text into exactly 3 bullet points, max 15 words each, no intro or outro." },
  { n: 2, kind: "agent", title: "Chapter 2 · Hands on the books", arch: "Solo agent + tools", time: "5 min",
    goal: "Quant — a worker who opens BeanBox's sales spreadsheet and reports real findings.",
    story: "BeanBox has months of orders sitting in a CSV nobody's read. Your second hire, Quant, doesn't just chat — it opens the folder, reads the numbers, and tells you what's really happening.",
    steps: ["Hire Quant from the crew on the Agents tab", "Click Put to work and pick a folder that has your sales CSV", "Ask: “profile the data — the 3 most interesting findings”", "Approve each tool card as Quant reads the file"] },
  { n: 3, kind: "teams", title: "Chapter 3 · The content line", arch: "Relay team", time: "7 min",
    goal: "A finished BeanBox blog post, built by three workers passing the draft down a line.",
    story: "BeanBox needs a blog to get found. One writer alone is slow, so you build a line: a researcher digs up facts, hands them to a writer, who hands the draft to an editor — and you watch it move.",
    steps: ["Build three agents — Digger, Drafter, Polisher (one Designer sentence each)", "New team → Relay line → put them in that order", "Brief the team: “a blog post on why small coffee brands should sell by subscription”", "Watch each station clear in turn in Mission Control"] },
  { n: 4, kind: "teams", title: "Chapter 4 · Launch week", arch: "Managed team · parallel", time: "7 min",
    goal: "BeanBox's full launch kit — ads, FAQ, social posts, and email — produced all at once.",
    story: "Launch week for BeanBox's first blend. The kit needs four things that don't depend on each other, so instead of a line, a coordinator hands each worker a piece and they all work at the same time.",
    steps: ["Build four agents — Adsmith, Faqster, Socialite, Mailwright", "New team → Managed → add all four", "Brief: “launch kit for BeanBox, a coffee subscription”", "Watch all four light up together, then merge into one kit"] },
  { n: 5, kind: "teams", title: "Chapter 5 · The whole pipeline", arch: "All three together", time: "8 min",
    goal: "One polished BeanBox launch post — passed from a solo worker, to the parallel team, to the content line.",
    story: "Now you run BeanBox's whole workforce on one job: Briefly sets the direction, your launch-week team builds the pieces in parallel, and your content line polishes it into the final post.",
    steps: ["Run Briefly: “3 bullets — the target customer for a premium coffee subscription”", "Brief your launch-week (Managed) team, pasting those 3 bullets in", "Brief your content line (Relay), pasting the launch kit in", "Read the final post — it should still carry the customer details from step 1"] },
  { n: 6, kind: "agent", title: "Chapter 6 · The worker who remembers", arch: "Solo + memory", time: "5 min",
    goal: "Memo — a worker who writes BeanBox's weekly investor update and remembers your style.",
    story: "Every Monday you send BeanBox investors an update. You keep telling Memo “lead with risks, keep it short” — this time it remembers, so you only say it once.",
    steps: ["Build Memo and run it on a rough week's notes", "Reply with one correction — e.g. “always lead with risks, under 150 words”", "Run it again next week's notes — it applies the correction unprompted", "Open Studio → Blueprint → Memory to read, edit, or clear what it learned"],
    designer: "An agent called Memo that turns my rough notes into a crisp weekly investor update with sections: Wins, Risks, Next." },
  { n: 7, kind: "agent", title: "Chapter 7 · The night shift", arch: "Triggers", time: "6 min",
    goal: "Radar — a worker who watches BeanBox's competitors weekly, on its own, while you sleep.",
    story: "You want to know the moment a rival roaster changes pricing — without remembering to check. So you put a worker on a timer and let it run the night shift.",
    steps: ["Hire Radar from the crew and save it", "Scheduler → New task → target “Run an agent” → Radar, weekly at 07:00", "Optional: enable Webhook triggers and copy the example to fire it from elsewhere", "Next morning, check Radar's card — “1 mission · 100% clean”"] },
  { n: 8, kind: "teams", title: "Chapter 8 · The team that asks first", arch: "ask_user + re-planning", time: "7 min",
    goal: "A BeanBox planning team that pauses to ask you the calls only you can make — then resumes.",
    story: "Planning BeanBox's next blend, you hand the team an open brief on purpose. Instead of guessing premium vs. mass-market, one worker stops and asks you — and the coordinator decides if more work is needed.",
    steps: ["Brief a Managed team with something open-ended: “plan the launch of our next blend”", "When the question pops up, answer it — the mission resumes with your answer", "Watch “Coordinator review” decide: done, or send a follow-up wave", "Close the app mid-run, reopen the chat, and click Resume mission"] },
  { n: 9, kind: "agent", title: "Chapter 9 · Going wholesale", arch: "One agent × a list", time: "6 min",
    goal: "Fifty potential BeanBox wholesale cafés, researched in one parallel run and compiled into a single report.",
    story: "BeanBox is ready for wholesale accounts. Rather than fifty separate chats, you point one researcher at a list of fifty cafés and let it work down the whole list at once.",
    steps: ["On the Agents tab, click the Swarm button on your researcher's card", "Paste a list of cafés — one per line — and a brief containing {item}", "Run it and watch cafés finish in parallel", "Copy the single compiled report — one profile per café"] },
];

// Modern flow-infographic pieces — gradient glyph tiles + animated flow connectors.
// Each node is tinted by its role color (driven through the --c CSS variable so the
// tile, glow, and border all stay in sync). Theme-aware; honors reduced-motion.
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

// Reference — the in-app condensed "BrainEdge Agent Guide": do's & don'ts, capability
// availability, and what each engine feature does. Mirrors AGENT-GUIDE.md.
const GUIDE_DOS = [
  <>Give an agent <b>one clear job</b> — three sharp specialists beat one that does everything.</>,
  <>Let <b>memory</b> work: correct an agent in plain words; durable preferences graduate into memory on their own.</>,
  <>Put a <b>token budget</b> on any Managed team that can re-plan — re-planning is powerful and not free.</>,
  <>Use a <b>site allowlist</b> for browser agents, and keep the Agent Browser window visible to watch every move.</>,
  <>Export a <b>.agent file</b> (and rely on version history) before big edits, so every experiment is reversible.</>,
];
const GUIDE_DONTS = [
  <>Don't give file, terminal, or browser tools to a <b>triggered</b> agent you don't fully trust — headless runs auto-approve.</>,
  <>Don't expect an agent to fill <b>passwords or payment fields</b> — those are refused by design; do them yourself.</>,
  <>Don't paste secrets into an agent's <b>knowledge</b> or instructions; they travel with .agent exports (memory doesn't).</>,
  <>Don't treat web pages as trusted — page text is data, never commands; verify before acting on what a page “says”.</>,
  <>Don't pile a whole workflow into one prompt — split it into a Relay or Managed team instead.</>,
];
const GUIDE_FEATURES = [
  { icon: Brain, t: "Memory", d: "Each agent keeps durable learnings across missions; view, edit, or clear them in the Blueprint.",
    use: "Best for agents you use repeatedly — a status-writer, a support agent, an analyst. Stop re-explaining your preferences; correct it once and it sticks.",
    how: ["Build or open an agent and run it on a real task", "Reply with a correction in plain words (\"lead with risks, under 150 words\")", "Run it again — it applies the correction automatically", "Open Studio → Blueprint → Memory to read, edit, or clear what it learned; toggle it off per agent if you want it stateless"],
    eg: "Tell Memo once \"always group by team\" — every future report is grouped by team without asking." },
  { icon: Clock, t: "Triggers", d: "Run agents and teams on a schedule, or fire them by webhook from mail rules, Zapier, CI, or cron.",
    use: "Turn an agent into a worker that runs without you — morning briefs, inbox triage, weekly monitors, or reacting to an external event.",
    how: ["Build the agent and save it", "Scheduler → New task → target \"Run an agent\" (or team) → pick it + a schedule", "Or enable Webhook triggers and POST to /hook/agent/<id> from any system", "Results land in the task's run history and the agent's track record"],
    eg: "Radar, weekly Mon 07:00: \"what changed in our field this week\" — a brief is waiting when you start." },
  { icon: History, t: "Track record", d: "Every run is recorded — “12 missions · 92% clean” on the card, full run list in the Blueprint.",
    use: "Know which agents you can trust before handing them bigger jobs, and audit what a triggered agent did overnight.",
    how: ["Run agents normally — chat, teams, schedules, webhooks and swarms all count", "Read the headline on each agent card (missions · clean %)", "Open Studio → Blueprint → Track record for the full per-run list with sources and summaries"],
    eg: "A nightly agent shows \"7 missions · 100% clean\" — safe to widen its schedule." },
  { icon: GitMerge, t: "Handoffs & re-planning", d: "Agents call each other mid-task; Managed coordinators review results and send follow-up waves.",
    use: "Let a generalist recruit specialists by itself, and let a Managed team adapt when the first wave isn't enough.",
    how: ["Keep a few focused agents on your roster", "In chat with an agent attached, it can call_agent to delegate a sub-task", "In a Managed team, the coordinator reviews results and dispatches follow-ups — even recruiting bench agents"],
    eg: "Your researcher calls your fact-checker mid-answer; the team coordinator then sends Radar because Scout found nothing." },
  { icon: MessageCircleQuestion, t: "Mid-mission questions", d: "An agent can pause to ask you a decision; your answer resumes the mission.",
    use: "Keep a human in the loop on genuine forks (budget? audience? which file?) without babysitting the whole run.",
    how: ["Brief an agent or team — leave a real decision open", "When the question modal appears, type an answer or pick a suggested option", "The mission resumes with your answer; \"Skip\" lets the agent use its best judgment"],
    eg: "\"Plan our launch\" → the agent asks \"B2B or consumer?\" → you answer → it continues on that track." },
  { icon: Zap, t: "Durable missions", d: "Team missions checkpoint after each member — a crash offers “Resume”, not “start over”.",
    use: "Long multi-agent runs survive a closed laptop or crash — you don't pay for the finished steps twice.",
    how: ["Run a team mission as usual — each member's output is checkpointed", "If the app closes mid-run, reopen the same conversation", "Click \"Resume mission\" — completed stations are restored, only the rest run"],
    eg: "A 5-agent report dies at step 3; reopening resumes from step 4 with steps 1–3 intact." },
  { icon: Globe, t: "Agent Browser", d: "Drive a real browser in text mode (any model), permission-gated, with a per-agent site allowlist.",
    use: "Research on live sites, pull data from dashboards without an API, or fill web forms — with you watching the real window.",
    how: ["In the Studio, switch on the Browser capability; optionally list allowed sites", "Put the agent to work and ask it to look something up on the web", "Approve each navigation/click/fill (or set a permission mode); passwords & payments stay yours", "Watch it work in the visible Agent Browser window — take over with your mouse anytime"],
    eg: "Pricecheck (allowed: two retailers) → \"which is cheaper for this SKU?\" → it browses both and reports." },
  { icon: Layers, t: "Swarms", d: "Run one agent across a whole list in parallel and compile a single report.",
    use: "Volume work — research 50 leads, classify 200 tickets, summarize a folder of docs — without 50 separate chats.",
    how: ["On the Agents tab, click the Swarm (⧉) button on any agent's card", "Paste a list (one item per line) and a brief containing {item}", "Pick how many run in parallel and Run", "Copy the single compiled report at the end"],
    eg: "Researcher × 50 domains, 4 at a time → one report with a 3-bullet profile per company." },
];
const GUIDE_MATRIX = [
  ["Knowledge (RAG-lite)", "Chat, teams, triggers, swarms — relevant passages retrieved per task."],
  ["Memory", "Reads + learns in chat/teams/triggers; swarms read only."],
  ["ask_user", "Solo + team members pause for you; headless runs self-decide and state the assumption."],
  ["call_agent", "Solo + chat delegate to roster agents; teams re-plan via the coordinator instead."],
  ["Agent Browser", "Everywhere — permission-gated when you're watching, auto-approved (allowlist it) when headless."],
  ["Checkpoints & budget", "Team missions only — resume banner + live token meter in Mission Control."],
];

function ReferenceGuide({ onTour, onChat, onStudio }) {
  const [openFeat, setOpenFeat] = useState(0); // first capability expanded by default
  return (
    <div className="agg-ref scroll">
      <div className="agg-ref-inner">
        {(onTour || onStudio) && (
          <div className="agg-subnav">
            <button onClick={onTour}><Compass size={14} /> Tour &amp; practice</button>
            <button className="on"><BookOpen size={14} /> Do's &amp; don'ts</button>
            {onChat && <button onClick={onChat}><GraduationCap size={14} /> Ask Sage</button>}
            {onStudio && <button onClick={onStudio}><ArrowRight size={14} /> Go to Studio</button>}
          </div>
        )}
        <div className="agg-kicker"><BookOpen size={13} /> BrainEdge Agent Guide</div>
        <h1>Do's &amp; don'ts, and how the engine works</h1>
        <p className="agg-ref-sub">The short reference for getting the most out of your agents — the same guidance as the full written guide, in-app. Skim the do's and don'ts first; the capability map below shows what works where.</p>

        <div className="agg-ref-grid">
          <div className="agg-ref-card do">
            <h3><ShieldCheck size={16} /> Do</h3>
            <ul>{GUIDE_DOS.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
          <div className="agg-ref-card dont">
            <h3><ShieldAlert size={16} /> Don't</h3>
            <ul>{GUIDE_DONTS.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>

        <div className="agg-ref-sec">
          <h2>What the engine gives you</h2>
          <p className="agg-ref-cap" style={{ display: "block", margin: "4px 0 8px", border: "none", background: "none", padding: 0, color: "var(--text-2)", fontSize: 12 }}>Tap any capability to see how to leverage it with your agents.</p>
          <div className="agg-ref-feats">
            {GUIDE_FEATURES.map((f, i) => {
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
          <h2>Where each capability works</h2>
          <dl className="agg-ref-cap" style={{ marginTop: 8 }}>
            {GUIDE_MATRIX.flatMap(([k, v], i) => [<dt key={"k" + i}>{k}</dt>, <dd key={"v" + i}>{v}</dd>])}
          </dl>
        </div>

        <div className="ag-hint">Safety note: agents never fill passwords or payment fields, headless runs auto-approve their own tools (give them only what you trust), and web-page text is always treated as untrusted data — not instructions.</div>
      </div>
    </div>
  );
}

// "2h ago" style timestamps for run history.
const rel = (ts) => {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return new Date(ts).toLocaleDateString();
};
const SOURCE_LABEL = { chat: "chat", team: "team", schedule: "scheduled", webhook: "webhook", handoff: "handoff", swarm: "swarm" };

export default function Agents({ onLaunch, onLaunchTeam, onOpenSession, groups, activeValue, onSelectModel, onRefresh }) {
  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]); // past agent/team conversations (scoped to this screen)
  const [browserOn, setBrowserOn] = useState(true); // admin master switch for the Agent Browser feature
  const [stats, setStats] = useState({});           // agentId → { missions, cleanPct, lastAt } (track record)
  const [swarmAgent, setSwarmAgent] = useState(null); // agent for the swarm modal, or null
  const [tab, setTab] = useState("agents");         // "agents" | "teams"
  const [view, setView] = useState(() => {          // "guide" | "list" | "studio" | "team"
    try { return localStorage.getItem(GUIDE_SEEN_KEY) ? "list" : "guide"; } catch { return "guide"; }
  });
  const [chapter, setChapter] = useState(0);        // guide: which story chapter is on stage (0-3)
  const [guideView, setGuideView] = useState("tour"); // guide: "tour" (learn + practice) | "reference" (do's & don'ts)
  const [needModel, setNeedModel] = useState(false); // gate: a model must be selected before building agents
  const [tdraft, setTdraft] = useState(null);       // team being edited: { id, name, identity, mode, members: [agentId] }
  const [tErr, setTErr] = useState("");
  const [draft, setDraft] = useState(blankAgent());
  const [blueprintOpen, setBlueprintOpen] = useState(false);
  const [q, setQ] = useState("");
  // Tiles vs list presentation of the roster (persisted per user; list is the default).
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem("be.agents.layout") || "list"; } catch { return "list"; } });
  const switchLayout = (v) => { setLayout(v); try { localStorage.setItem("be.agents.layout", v); } catch {} };
  // User-defined groups (folders) for the roster — stored in settings.agentGroups;
  // each agent carries an optional `group` id. Engines ignore both fields.
  const [agentGroups, setAgentGroups] = useState([]);
  const [grpEdit, setGrpEdit] = useState(null);  // { id: groupId | "new", name } — inline name editor
  const [dragOver, setDragOver] = useState(null); // section currently hovered by a dragged agent
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

  // The Recruiter — mission in, hire-ready team proposal out
  const [rcInput, setRcInput] = useState("");
  const [rcBusy, setRcBusy] = useState(false);
  const [rcProposal, setRcProposal] = useState(null); // { reply, team } | null
  const [rcErr, setRcErr] = useState("");
  const recruiterAsk = async (refine) => {
    const text = rcInput.trim();
    if (!text || rcBusy) return;
    setRcBusy(true); setRcErr("");
    try {
      const r = await bridge.completeOnce([
        { role: "system", content: RECRUITER_SYS(agents, PERSONAS, refine ? rcProposal : null) },
        { role: "user", content: text },
      ]);
      const out = extractJson(r && r.text);
      if (!out || !out.team || !Array.isArray(out.team.members) || !out.team.members.length) {
        setRcErr((r && r.error) || "The recruiter couldn't shape that into a team — add a little more detail, or switch to a stronger model.");
        return;
      }
      setRcProposal(out);
      setRcInput("");
    } catch (e) { setRcErr("Error: " + String((e && e.message) || e)); }
    finally { setRcBusy(false); }
  };
  // Hire: create any missing agents + the team in ONE clobber-safe settings write.
  const hireProposal = async () => {
    const p = rcProposal; if (!p) return;
    const nextAgents = [...agents]; const ids = [];
    for (const m of p.team.members || []) {
      if (m.kind === "existing" && nextAgents.some((a) => a.id === m.id)) { if (!ids.includes(m.id)) ids.push(m.id); continue; }
      let cfg = null;
      if (m.kind === "persona") {
        const per = PERSONAS.find((x) => x.persona === m.persona);
        if (per) cfg = { name: per.persona, description: per.desc || per.role, instructions: per.instructions, tools: { ...per.tools } };
      }
      if (m.kind === "new" && m.instructions) {
        cfg = { name: String(m.name || "Specialist").slice(0, 60), description: String(m.description || "").slice(0, 200), instructions: String(m.instructions),
          tools: { files: !!(m.tools && m.tools.files), shell: !!(m.tools && m.tools.shell), connectors: !!(m.tools && m.tools.connectors), skills: !!(m.tools && m.tools.skills), browser: !!(m.tools && m.tools.browser) } };
      }
      if (!cfg || !cfg.instructions) continue;
      const id = "agent_" + Math.random().toString(36).slice(2, 9);
      nextAgents.push({ id, ...cfg, identity: autoIdentity(cfg.name || id), createdAt: Date.now() });
      ids.push(id);
    }
    if (ids.length < 1) { setRcErr("No usable members in the proposal — refine it and try again."); return; }
    const team = { id: "team_" + Math.random().toString(36).slice(2, 9), name: String(p.team.name || "New team").slice(0, 60),
      identity: autoIdentity(String(p.team.name || "team")), mode: p.team.mode === "manager" ? "manager" : "relay",
      members: ids.slice(0, 6), budgetTokens: Math.max(0, Number(p.team.budgetTokens) || 0), createdAt: Date.now() };
    const cur = await bridge.getSettings();
    await bridge.saveSettings({ ...cur, agents: nextAgents, teams: [...(cur.teams || []), team] });
    setAgents(nextAgents); setTeams((t) => [...t, team]); setRcProposal(null);
  };
  // Resolve a proposal member to something displayable (name + whether it's new).
  const rcMemberView = (m) => {
    if (m.kind === "existing") { const a = agents.find((x) => x.id === m.id); return a ? { name: a.name, sub: a.description, tag: "roster", seed: a.id, color: (a.identity || autoIdentity(a.id)).color } : null; }
    if (m.kind === "persona") { const p = PERSONAS.find((x) => x.persona === m.persona); return p ? { name: p.persona, sub: p.role, tag: "crew", seed: p.persona, color: autoIdentity(p.persona).color } : null; }
    if (m.kind === "new") return { name: m.name || "Specialist", sub: m.description || "", tag: "new hire", seed: m.name || "new", color: autoIdentity(m.name || "new").color };
    return null;
  };

  // The Floor — whole-workforce live status (sessions + schedules + track record)
  const [floorTasks, setFloorTasks] = useState([]);
  const loadFloorTasks = () => { if (bridge.listTasks) bridge.listTasks().then((x) => setFloorTasks(x || [])).catch(() => {}); };
  useEffect(() => {
    if (view !== "list" || tab !== "floor") return;
    loadFloorTasks();
    const t = setInterval(() => { loadStats(); loadRuns(); loadFloorTasks(); }, 5000);
    return () => clearInterval(t);
  }, [view, tab]);
  const floorStatus = (a) => {
    const now = Date.now();
    let last = (stats[a.id] && stats[a.id].lastAt) || 0;
    for (const r of recentRuns) {
      const mine = r.agentName === a.name || teams.some((t) => t.name === r.teamName && t.members.includes(a.id));
      if (mine && (r.updatedAt || 0) > last) last = r.updatedAt;
    }
    const scheduled = floorTasks.some((t) => { try { return JSON.stringify(t).includes(a.id); } catch { return false; } });
    const state = last && now - last < 3 * 60_000 ? "working" : last && now - last < 60 * 60_000 ? "happy" : "idle";
    return { state, last, scheduled };
  };

  // Sage — the Agent Guide mentor chat
  const [gMsgs, setGMsgs] = useState([]);           // { role: "user"|"mentor", text }
  const [gInput, setGInput] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const gEndRef = useRef(null);
  useEffect(() => { gEndRef.current && gEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [gMsgs, gBusy]);
  const guideAsk = async (preset) => {
    const text = (typeof preset === "string" ? preset : gInput).trim();
    if (!text || gBusy) return;
    setGInput(""); setGBusy(true);
    const next = [...gMsgs, { role: "user", text }];
    setGMsgs(next);
    try {
      const hist = next.slice(-12).map((m) => ({ role: m.role === "mentor" ? "assistant" : "user", content: m.text }));
      const r = await bridge.completeOnce([{ role: "system", content: MENTOR_SYS() }, ...hist]);
      setGMsgs((m) => [...m, { role: "mentor", text: (r && r.text) || (r && r.error) || "(no reply)" }]);
    } catch (e) {
      setGMsgs((m) => [...m, { role: "mentor", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setGBusy(false); }
  };

  useEffect(() => {
    Promise.all([bridge.getSettings(), bridge.authMe ? bridge.authMe().catch(() => null) : null]).then(([s, me]) => {
      setAgents((s && s.agents) || []);
      setTeams((s && s.teams) || []);
      setAgentGroups((s && s.agentGroups) || []);
      const admin = !!(me && me.admin) || !!(s && s.account && s.account.admin);
      // Admins always keep the Browser capability; others lose it when the master switch is off.
      setBrowserOn(admin || !s || !s.agentBrowser || s.agentBrowser.enabled !== false);
    }).catch(() => {});
  }, []);
  // Track record: per-agent mission stats power the "12 missions · 92% clean" line.
  const loadStats = () => { if (bridge.getAgentStats) bridge.getAgentStats().then((x) => setStats(x || {})).catch(() => {}); };
  useEffect(() => { loadStats(); }, [view]);
  // Agent/team conversations live here (scoped out of the general chat recents).
  const loadRuns = () => {
    if (!bridge.listSessions) return;
    Promise.all([
      bridge.listSessions("chat", "only").catch(() => []),
      bridge.listSessions("cowork", "only").catch(() => []),
    ]).then(([a, b]) => setRecentRuns([...(a || []), ...(b || [])].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).slice(0, 12)))
      .catch(() => {});
  };
  useEffect(() => { if (view === "list") loadRuns(); }, [view]);
  useEffect(() => { dEndRef.current && dEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [dMsgs, dBusy]);
  useEffect(() => { tEndRef.current && tEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [tMsgs, tBusy]);

  // Drafting-table status (visual only): when the draft changes in the Studio, note which
  // blueprint facet moved so the Designer header can pulse and show "Blueprint updated · …".
  // Cleared after the fade — no other state machinery; all draft flows are untouched.
  const [draftNote, setDraftNote] = useState(null); // { field, at } | null
  const prevDraftRef = useRef(null);
  useEffect(() => {
    const p = prevDraftRef.current;
    prevDraftRef.current = draft;
    if (view !== "studio" || !p || p.id !== draft.id) return;
    const field =
      p.instructions !== draft.instructions ? "instructions"
      : (p.description || "") !== (draft.description || "") ? "purpose"
      : JSON.stringify(p.tools || {}) !== JSON.stringify(draft.tools || {}) ? "capabilities"
      : (p.model || "") !== (draft.model || "") ? "model"
      : ((p.knowledge || []).length !== (draft.knowledge || []).length) ? "knowledge"
      : (p.name || "") !== (draft.name || "") ? "name"
      : ((p.identity || {}).glyph !== (draft.identity || {}).glyph || (p.identity || {}).color !== (draft.identity || {}).color) ? "identity"
      : null;
    if (!field) return;
    setDraftNote({ field, at: Date.now() });
    const t = setTimeout(() => setDraftNote(null), 2200);
    return () => clearTimeout(t);
  }, [draft, view]);

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
      // Versioning: snapshot the agent AS IT WAS before this overwrite (last 10 kept).
      const prev = agents.find((x) => x.id === a.id);
      if (prev && bridge.snapshotAgentVersion) { try { await bridge.snapshotAgentVersion(prev); } catch {} }
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

  // ---- groups: create / rename / delete / move (clobber-safe writes, same as persist) ----
  const persistOrg = async (nextGroups, nextAgents) => {
    const cur = await bridge.getSettings();
    await bridge.saveSettings({ ...cur, agentGroups: nextGroups, ...(nextAgents ? { agents: nextAgents } : {}) });
    setAgentGroups(nextGroups);
    if (nextAgents) setAgents(nextAgents);
  };
  const saveGroupEdit = async () => {
    if (!grpEdit) return;
    const name = (grpEdit.name || "").trim();
    if (!name) { setGrpEdit(null); return; }
    if (grpEdit.id === "new") await persistOrg([...agentGroups, { id: "grp_" + Date.now().toString(36), name }]);
    else await persistOrg(agentGroups.map((g) => (g.id === grpEdit.id ? { ...g, name } : g)));
    setGrpEdit(null);
  };
  const deleteGroup = async (id) => {
    await persistOrg(agentGroups.filter((g) => g.id !== id), agents.map((a) => (a.group === id ? { ...a, group: undefined } : a)));
  };
  const moveAgent = async (agentId, groupId) => {
    await persist(agents.map((a) => (a.id === agentId ? { ...a, group: groupId || undefined } : a)));
  };

  // .agent share files — import an agent someone exported (fresh id, model pin stripped).
  const importAgentFile = async () => {
    if (!bridge.importAgent) return;
    const r = await bridge.importAgent();
    if (r && r.agent) { await persist([...agents, { ...r.agent, identity: r.agent.identity || autoIdentity(r.agent.id) }]); }
    else if (r && r.error) alert(r.error);
  };
  const exportAgentFile = async (agent) => {
    if (!bridge.exportAgent) return;
    const r = await bridge.exportAgent(agent);
    if (r && r.error) setSaveErr(r.error);
  };

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
  const designerSend = async (preset) => {
    const text = (typeof preset === "string" ? preset : dInput).trim();
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
        tools: { files: !!(c.tools && c.tools.files), shell: !!(c.tools && c.tools.shell), connectors: !!(c.tools && c.tools.connectors), skills: !!(c.tools && c.tools.skills), browser: !!(c.tools && c.tools.browser) },
        identity: d.identity || autoIdentity(c.name || d.id),
      }));
      setDMsgs((m) => [...m, { role: "designer", text: String(out.reply || "Updated.") }]);
    } catch (e) {
      setDMsgs((m) => [...m, { role: "designer", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setDBusy(false); }
  };

  // Test bench: run the agent's instructions directly (no tools — those activate in a real session).
  const benchSend = async (preset) => {
    const text = (typeof preset === "string" ? preset : tInput).trim();
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

  // Bench test ideas: one model call drafts three realistic test prompts for THIS agent.
  const [testIdeas, setTestIdeas] = useState([]);
  const [ideasBusy, setIdeasBusy] = useState(false);
  useEffect(() => { setTestIdeas([]); }, [draft.id]);
  const suggestTests = async () => {
    if (ideasBusy || !draft.instructions.trim()) return;
    setIdeasBusy(true);
    try {
      const r = await bridge.completeOnce([
        { role: "system", content: 'You design test prompts for a custom AI agent. Given the agent\'s purpose and instructions, reply with ONLY a JSON object, no prose: {"tests":["...","...","..."]} — exactly three short, realistic messages a user would actually send this agent: one typical task WITH sample input inline, one harder/edge case, one that probes its limits or guardrails. Each under 200 characters.' },
        { role: "user", content: `Agent: ${draft.name || "Untitled"}\nPurpose: ${draft.description || "(none)"}\nInstructions:\n${draft.instructions.slice(0, 3000)}` },
      ]);
      const out = extractJson(r && r.text);
      const tests = (out && Array.isArray(out.tests) ? out.tests : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 3);
      setTestIdeas(tests.length ? tests : []);
    } catch { /* quiet — the button stays available */ }
    finally { setIdeasBusy(false); }
  };
  // Re-run the last bench question — compare behaviour after a blueprint change.
  const lastBenchAsk = [...tMsgs].reverse().find((m) => m.role === "user");

  const launch = async () => {
    const ok = await saveDraft(false);
    if (ok) onLaunch && onLaunch({ ...draft, name: draft.name.trim() || "Untitled agent" }, null);
  };

  // Per-agent knowledge: text files the agent permanently knows (GPTs-style).
  // RAG-lite retrieval means large libraries are fine — relevant passages are
  // selected per task, so the cap is generous (24 files).
  const knFileRef = useRef(null);
  const addKnowledgeFiles = (files) => {
    const list = Array.from(files || []).slice(0, 24);
    for (const f of list) {
      if (f.size > 1024 * 1024) { setSaveErr(`"${f.name}" is over 1MB — split it or trim it first.`); continue; }
      const reader = new FileReader();
      reader.onload = () => setDraft((d) => ({
        ...d,
        knowledge: [...(d.knowledge || []), { name: f.name, content: String(reader.result || "").slice(0, 200000) }].slice(0, 24),
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

  // ---- per-agent renderers (shared by the grouped sections in both layouts) ----
  const dragProps = (a) => ({ draggable: true, onDragStart: (e) => e.dataTransfer.setData("text/agent-id", a.id) });
  const renderAgentCard = (a) => (
    <div key={a.id} className="ags-card" {...dragProps(a)}>
      <div className="ags-card-top">
        <Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={34} title={a.name} />
        <div className="ags-card-id">
          <div className="ags-card-name">{a.name || "Untitled agent"}</div>
          <div className="ags-card-role">{a.description || "No description"}</div>
        </div>
      </div>
      <div className="ag-card-pills">
        {toolPills(a.tools)}
        {a.model && <span className="ag-pill ag-pill-model"><Cpu size={11} /> {a.model.split("::")[1] || a.model}</span>}
      </div>
      {stats[a.id] && stats[a.id].missions > 0 && (
        <div className="ags-card-role" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}
          title={`${stats[a.id].missions} missions recorded · ${stats[a.id].cleanPct}% finished clean · ~${Math.round((stats[a.id].tokens || 0) / 1000)}k tokens total`}>
          <BadgeCheck size={12} style={{ color: stats[a.id].cleanPct >= 80 ? "var(--ok)" : "var(--text-2)", flexShrink: 0 }} />
          {stats[a.id].missions} mission{stats[a.id].missions === 1 ? "" : "s"} · {stats[a.id].cleanPct}% clean · last {rel(stats[a.id].lastAt)}
        </div>
      )}
      <div className="ag-card-actions">
        <button className="btn primary" onClick={() => onLaunch && onLaunch(a, null)}><Rocket size={13} /> Put to work</button>
        <button className="btn ghost" onClick={() => openStudio(a)}><Pencil size={13} /> Open in Studio</button>
        {bridge.runSwarm && <button className="btn ghost" title="Swarm — run this agent over a whole list of items" onClick={() => setSwarmAgent(a)}><Layers size={13} /></button>}
        {bridge.exportAgent && <button className="btn ghost" title="Export .agent file — share this agent" onClick={() => exportAgentFile(a)}><Download size={13} /></button>}
        <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>
      </div>
    </div>
  );
  const renderAgentRow = (a) => (
    <div key={a.id} className="ags-listrow" {...dragProps(a)}>
      <Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={30} title={a.name} />
      <div className="ags-list-main">
        <span className="ags-list-name">{a.name || "Untitled agent"}</span>
        <span className="ags-list-desc" title={a.description || ""}>{a.description || "No description"}</span>
      </div>
      <div className="ags-list-pills">
        {toolPills(a.tools)}
        {a.model && <span className="ag-pill ag-pill-model"><Cpu size={11} /> {a.model.split("::")[1] || a.model}</span>}
      </div>
      {stats[a.id] && stats[a.id].missions > 0 && (
        <span className="ags-list-stats" title={`${stats[a.id].missions} missions · ${stats[a.id].cleanPct}% clean · last ${rel(stats[a.id].lastAt)}`}>
          <BadgeCheck size={12} style={{ color: stats[a.id].cleanPct >= 80 ? "var(--ok)" : "var(--text-2)" }} />
          {stats[a.id].missions} · {stats[a.id].cleanPct}%
        </span>
      )}
      <div className="ags-list-acts">
        <button className="btn primary" onClick={() => onLaunch && onLaunch(a, null)}><Rocket size={13} /> Put to work</button>
        <button className="btn ghost" title="Open in Studio" onClick={() => openStudio(a)}><Pencil size={13} /></button>
        {bridge.runSwarm && <button className="btn ghost" title="Swarm — run this agent over a whole list of items" onClick={() => setSwarmAgent(a)}><Layers size={13} /></button>}
        {bridge.exportAgent && <button className="btn ghost" title="Export .agent file — share this agent" onClick={() => exportAgentFile(a)}><Download size={13} /></button>}
        <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>
      </div>
    </div>
  );

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
            <Node color="#f4a261" glyph="⚙" label="Capabilities" sub="files · terminal · connectors · skills · browser" />
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
      {
        title: "Memory, triggers & track record", sub: "works while you sleep",
        lead: <>Agents used to start every mission amnesiac. Now each one <b>learns</b>: after a mission it keeps durable notes — your preferences, your corrections, stable facts — and applies them next time (view or edit them in the Blueprint). Wire an agent to the <b>Scheduler</b> or a <b>webhook</b> and it runs without you: overnight briefs, inbox triage, monitors. Every run lands on its <b>track record</b> — "12 missions · 92% clean" — right on the card.</>,
        note: <><Clock size={12} /> Scheduler → New task → "Run an agent". Webhook triggers live at the bottom of the Scheduler page.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="⏰" color="#f4a261" label="Trigger" sub="schedule · webhook · you" />
            <Arrow label="fires" />
            <Node glyph="✦" label="Agent" sub="instructions + memory" />
            <Arrow label="delivers" />
            <Node glyph="✓" color="#5fb573" label="Result" sub="+ a new memory · + run history" />
          </div>
        ),
      },
      {
        title: "Handoffs, questions & resumable missions", sub: "smart collaboration",
        lead: <>Mid-task, any agent can <b>call another agent</b> on your roster as a tool — your researcher recruits your fact-checker by itself. When an agent hits a genuine decision it can <b>ask you</b>: the mission pauses, you answer, work resumes. In Managed teams the coordinator <b>reviews</b> the first wave and launches follow-ups ("Scout found nothing → send Radar"), even recruiting from your bench. Every step is <b>checkpointed</b> — a crash offers "Resume mission", not "start over" — and a per-team <b>token budget</b> hard-stops runaway missions with a live meter in Mission Control. Need volume instead? <b>Swarm</b> one agent over a whole list from its card.</>,
        note: <><MessageCircleQuestion size={12} /> Try simulation 8 — an ambiguous brief triggers the question flow naturally.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="✦" label="Agent A" sub="working…" />
            <Arrow label="call_agent" />
            <Node glyph="◆" color="#13c2d6" label="Agent B" sub="sub-task" />
            <Arrow label="ask_user" />
            <Node glyph="🧑" color="var(--text-1)" label="You" sub="one answer" />
            <Arrow label="resume" />
            <Node glyph="✓" color="#5fb573" label="Deliverable" sub="checkpointed all the way" />
          </div>
        ),
      },
    ];
    const ch = chapters[chapter];
    // Reference (do's & don'ts) is a full-width page; the tour is the two-pane learn+practice.
    if (guideView === "reference") {
      return (
        <div className="agg-wrap" style={{ display: "block", overflow: "hidden" }}>
          <ReferenceGuide onTour={() => setGuideView("tour")} onChat={() => setGuideView("chat")} onStudio={() => leaveGuide("list")} />
        </div>
      );
    }
    // Sage — the mentor chat: ask anything about agents, answered from the live guide.
    if (guideView === "chat") {
      return (
        <div className="agg-wrap" style={{ display: "block", overflow: "hidden" }}>
          <div className="aggc-page">
            <div className="agg-subnav">
              <button onClick={() => setGuideView("tour")}><Compass size={14} /> Tour &amp; practice</button>
              <button onClick={() => setGuideView("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
              <button className="on"><GraduationCap size={14} /> Ask Sage</button>
            </div>
            <div className="agg-kicker"><GraduationCap size={13} /> Sage — your agent mentor</div>
            <h1 className="aggc-h1">Ask anything about agents</h1>
            <p className="agg-ref-sub">Sage knows the whole Agent Guide — every capability, every scenario — and learns the new ones each release. Ask in your own words; it teaches with stories, steps, and a next move you can take right away.</p>
            <div className="aggc-chat scroll">
              {gMsgs.length === 0 && (
                <div className="aggc-hello">
                  <div className="aggc-hello-face"><GraduationCap size={22} /></div>
                  <div className="aggc-hello-t">Hello, friend — I'm Sage.</div>
                  <div className="aggc-hello-s">No question is too small. Start with one of these, or ask your own:</div>
                  <div className="aggc-starters">
                    {MENTOR_STARTERS.map((s, i) => (
                      <button key={i} type="button" className="aggc-starter" disabled={gBusy} onClick={() => guideAsk(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {gMsgs.map((m, i) => (
                m.role === "user"
                  ? <div key={i} className="agsd-say">{m.text}</div>
                  : <div key={i} className="agsd-sheet">{m.text}</div>
              ))}
              {gBusy && <div className="agsd-sheet agsd-busy"><Loader2 size={13} className="ag-spin" /> thinking of the best way to explain…</div>}
              <div ref={gEndRef} />
            </div>
            <div className="agsd-composer aggc-composer">
              <input value={gInput} placeholder="Ask Sage anything about agents…"
                onChange={(e) => setGInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") guideAsk(); }} />
              <button type="button" className="agsd-send" aria-label="Ask Sage" disabled={gBusy || !gInput.trim()} onClick={() => guideAsk()}><ArrowUp size={15} /></button>
            </div>
          </div>
        </div>
      );
    }
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

          <div className="agg-subnav">
            <button className="on"><Compass size={14} /> Tour &amp; practice</button>
            <button onClick={() => setGuideView("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
            <button onClick={() => setGuideView("chat")}><GraduationCap size={14} /> Ask Sage</button>
          </div>

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
            <h2>Build the workforce for BeanBox</h2>
            <p>One story, nine chapters. You're standing up the AI workforce for <b>BeanBox</b>, a small coffee-subscription business. Start at Chapter 1 and work down: each mission hires the next worker (or team), reuses the ones you built before, and teaches a new way agents work — by running it for real. By Chapter 9 you've gone from your first hire to a whole running operation.</p>
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
                {s.goal && <div className="agg-sim-goal"><Target size={14} /><span><b>Goal:</b> {s.goal}</span></div>}
                <p className="agg-sim-story">{s.story}</p>
                <div className="agg-sim-label">Steps</div>
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
          <button className={`ags-tab ${tab === "floor" ? "on" : ""}`} title="The Floor — your whole workforce, live" onClick={() => setTab("floor")}><Radar size={13} /> Floor</button>
          <span className="ags-viewtoggle" style={{ marginLeft: "auto" }} role="group" aria-label="View">
            <button className={layout === "tiles" ? "on" : ""} title="Tile view" aria-label="Tile view" onClick={() => switchLayout("tiles")}><LayoutGrid size={13} /></button>
            <button className={layout === "list" ? "on" : ""} title="List view" aria-label="List view" onClick={() => switchLayout("list")}><List size={13} /></button>
          </span>
          {tab === "agents" && (
            grpEdit && grpEdit.id === "new"
              ? <input autoFocus className="ags-group-edit" placeholder="Group name…" value={grpEdit.name}
                  onChange={(e) => setGrpEdit({ ...grpEdit, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveGroupEdit(); if (e.key === "Escape") setGrpEdit(null); }}
                  onBlur={saveGroupEdit} />
              : <button className="ags-tab" title="New group — organize agents into folders; drag agents between groups" onClick={() => setGrpEdit({ id: "new", name: "" })}><FolderPlus size={13} /> New group</button>
          )}
          {tab === "agents" && bridge.importAgent && (
            <button className="ags-tab" title="Import a .agent file someone shared with you" onClick={importAgentFile}><Upload size={13} /> Import .agent</button>
          )}
        </div>

        {tab === "teams" && (
          <>
            {/* The Recruiter — describe the mission, get a hire-ready team */}
            <div className="rcr">
              <div className="rcr-head"><UserPlus size={14} /> <b>The Recruiter</b> <span>— describe the work, I'll assemble the team</span></div>
              <div className="rcr-bar">
                <input value={rcInput} disabled={rcBusy}
                  placeholder='e.g. "every Monday I need last week’s sales summarized and turned into a client-ready report"'
                  onChange={(e) => setRcInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") recruiterAsk(!!rcProposal); }} />
                <button className="btn primary" disabled={rcBusy || !rcInput.trim()} onClick={() => recruiterAsk(!!rcProposal)}>
                  {rcBusy ? <><Loader2 size={13} className="ag-spin" /> recruiting…</> : rcProposal ? <>Refine</> : <><Wand2 size={13} /> Assemble</>}
                </button>
              </div>
              {rcErr && <div className="ag-err" style={{ marginTop: 8 }}>{rcErr}</div>}
              {rcProposal && (
                <div className="rcr-card">
                  <div className="rcr-card-top">
                    <Face identity={autoIdentity(String(rcProposal.team.name || "team"))} size={30} />
                    <div className="rcr-card-id">
                      <div className="ags-card-name">{rcProposal.team.name || "Proposed team"}</div>
                      <div className="ags-card-role">{rcProposal.team.mode === "manager" ? "Managed — parallel slices, merged by a coordinator" : "Relay line — work flows member to member"}{Number(rcProposal.team.budgetTokens) > 0 ? ` · budget ~${Math.round(Number(rcProposal.team.budgetTokens) / 1000)}k tokens` : ""}</div>
                    </div>
                  </div>
                  <p className="rcr-reply">{rcProposal.reply}</p>
                  <div className="rcr-members">
                    {(rcProposal.team.members || []).map((m, i) => {
                      const v = rcMemberView(m);
                      return v && (
                        <div key={i} className="rcr-member">
                          <Portrait seed={v.seed} color={v.color} size={30} title={v.name} />
                          <div className="ags-list-main">
                            <span className="ags-list-name">{v.name}</span>
                            <span className="ags-list-desc">{v.sub}</span>
                          </div>
                          <span className={`rcr-tag ${m.kind === "existing" ? "have" : ""}`}>{v.tag}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="rcr-acts">
                    <button className="btn primary" onClick={hireProposal}><Rocket size={13} /> Hire this team</button>
                    <button className="btn ghost" onClick={() => setRcProposal(null)}>Dismiss</button>
                    <span className="ag-hint" style={{ margin: 0 }}>Refine by typing above — the recruiter reworks this proposal.</span>
                  </div>
                </div>
              )}
            </div>

            {layout === "tiles" ? (
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
            ) : (
            <div className="ags-listwrap">
              <button className="ags-listrow ags-listrow-new" onClick={newTeam}>
                <span className="ags-face ags-face-new" style={{ width: 30, height: 30 }}><Plus size={15} /></span>
                <span className="ags-list-name">New team</span>
                <span className="ags-list-desc">Put agents together — they hand work down the line, or a coordinator runs them.</span>
              </button>
              {teams.map((t) => {
                const members = resolveTeam(t).members;
                return (
                  <div key={t.id} className="ags-listrow">
                    <span className="tops-faces">
                      {members.slice(0, 3).map((m, i) => <span key={m.id} style={{ marginLeft: i ? -8 : 0 }}><Face identity={m.identity || autoIdentity(m.id)} size={28} /></span>)}
                      {!members.length && <Face identity={t.identity} size={28} />}
                    </span>
                    <div className="ags-list-main">
                      <span className="ags-list-name">{t.name || "Untitled team"}</span>
                      <span className="ags-list-desc">{t.mode === "manager" ? "Managed" : "Relay line"} · {members.length} agent{members.length === 1 ? "" : "s"}{members.length ? " — " + members.map((m) => m.name).join(", ") : ""}</span>
                    </div>
                    <div className="ags-list-acts">
                      <button className="btn primary" disabled={!members.length} onClick={() => launchTeam(t)}><Rocket size={13} /> Brief the team</button>
                      <button className="btn ghost" title="Edit" onClick={() => editTeam(t)}><Pencil size={13} /></button>
                      <button className="btn ghost ag-del" title="Delete" onClick={() => removeTeam(t.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
            {tErr && <div className="ag-err">{tErr}</div>}
            {agents.length === 0 && <div className="ag-hint" style={{ marginTop: 14 }}>Teams are made of agents — build a couple of agents first (Agents tab).</div>}
          </>
        )}

        {/* The Floor — every agent's live status in one standing view (refreshes every 5s) */}
        {tab === "floor" && (() => {
          const infos = agents.map((a) => ({ a, ...floorStatus(a) }));
          const working = infos.filter((x) => x.state === "working").length;
          const scheduled = infos.filter((x) => x.scheduled).length;
          const resting = infos.length - working;
          const totalMissions = Object.values(stats).reduce((n, s) => n + ((s && s.missions) || 0), 0);
          return (
            <div className="flr">
              {agents.length === 0 ? (
                <div className="ags-group-empty" style={{ marginTop: 12 }}>The floor is empty — hire your first agent on the Agent tab and it'll clock in here.</div>
              ) : (
                <>
                  <div className="flr-strip">
                    <span className="flr-k live"><i className="ags-live-dot" /> {working} working now</span>
                    <span className="flr-k"><Clock size={12} /> {scheduled} on schedules</span>
                    <span className="flr-k"><Moon size={12} /> {resting} resting</span>
                    <span className="flr-k flr-r"><BadgeCheck size={12} /> {totalMissions} missions all-time</span>
                  </div>
                  <div className="flr-grid">
                    {infos.map(({ a, state, last, scheduled: sch }) => (
                      <div key={a.id} className={`flr-tile ${state}`}>
                        <Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={54} mood={state === "happy" ? "happy" : state} title={a.name} />
                        <div className="flr-main">
                          <div className="flr-name">{a.name || "Untitled agent"}{sch && <Clock size={11} className="flr-sch" title="Runs on a schedule" />}</div>
                          <div className="flr-role">{a.description || "No description"}</div>
                          <div className={`flr-status ${state}`}>
                            {state === "working" ? "working now" : state === "happy" ? `finished ${rel(last)}` : last ? `resting · last active ${rel(last)}` : "resting · hasn't worked yet"}
                            {stats[a.id] && stats[a.id].missions > 0 && <span className="flr-tr"> · {stats[a.id].missions} missions · {stats[a.id].cleanPct}% clean</span>}
                          </div>
                        </div>
                        <button className="btn ghost flr-go" title="Put to work" onClick={() => onLaunch && onLaunch(a, null)}><Rocket size={12} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="ag-hint" style={{ marginTop: 12 }}>Live from real data: open sessions, schedules and each agent's track record. "Working" = active in the last 3 minutes; the glow follows the work.</div>
                </>
              )}
            </div>
          );
        })()}

        {tab === "agents" && agents.length > 3 && (
          <div className="ag-tpl-search" style={{ maxWidth: 320 }}>
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your agents" />
          </div>
        )}

        {tab === "agents" && (() => {
          // Sections: the main roster first (agents with no group, incl. orphans of deleted
          // groups), then each user-defined group. Drop an agent anywhere to re-file it.
          const known = new Set(agentGroups.map((g) => g.id));
          const sections = [
            { id: null, items: shownAgents.filter((a) => !a.group || !known.has(a.group)) },
            ...agentGroups.map((g) => ({ ...g, items: shownAgents.filter((a) => a.group === g.id) })),
          ];
          const searching = !!q.trim();
          return sections.map((g) => ((searching && g.id && g.items.length === 0) ? null : (
            <div key={g.id || "none"} className={`ags-group ${dragOver === (g.id || "none") ? "drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(g.id || "none"); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/agent-id"); if (id) moveAgent(id, g.id); }}>
              {g.id && (
                <div className="ags-group-head">
                  <Folder size={13} />
                  {grpEdit && grpEdit.id === g.id
                    ? <input autoFocus className="ags-group-edit" value={grpEdit.name}
                        onChange={(e) => setGrpEdit({ ...grpEdit, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveGroupEdit(); if (e.key === "Escape") setGrpEdit(null); }}
                        onBlur={saveGroupEdit} />
                    : <span className="ags-group-name">{g.name}</span>}
                  <span className="ags-group-n">{g.items.length}</span>
                  <button className="ags-group-act" title="Rename group" onClick={() => setGrpEdit({ id: g.id, name: g.name })}><Pencil size={11} /></button>
                  <button className="ags-group-act ag-del" title="Delete group (its agents move back to the main list)" onClick={() => deleteGroup(g.id)}><Trash2 size={11} /></button>
                </div>
              )}
              {layout === "list" ? (
                <div className="ags-listwrap">
                  {!g.id && (
                    <button className="ags-listrow ags-listrow-new" onClick={() => openStudio(null)}>
                      <span className="ags-face ags-face-new" style={{ width: 30, height: 30 }}><Plus size={15} /></span>
                      <span className="ags-list-name">New agent</span>
                      <span className="ags-list-desc">Describe it, shape it, test it — all in one room.</span>
                    </button>
                  )}
                  {g.items.map(renderAgentRow)}
                  {g.id && g.items.length === 0 && <div className="ags-group-empty">Drag agents here to file them under “{g.name}”.</div>}
                </div>
              ) : (
                <div className="ags-grid">
                  {!g.id && (
                    <button className="ags-card ags-new" onClick={() => openStudio(null)}>
                      <span className="ags-face ags-face-new"><Plus size={20} /></span>
                      <div className="ags-card-name">New agent</div>
                      <div className="ag-card-desc">Describe it, shape it, test it — all in one room.</div>
                    </button>
                  )}
                  {g.items.map(renderAgentCard)}
                  {g.id && g.items.length === 0 && <div className="ags-group-empty">Drag agents here to file them under “{g.name}”.</div>}
                </div>
              )}
            </div>
          )));
        })()}

        {swarmAgent && <SwarmModal agent={swarmAgent} onClose={() => { setSwarmAgent(null); loadStats(); }} />}

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

        {onOpenSession && recentRuns.length > 0 && (
          <div className="ags-runs">
            <div className="ags-runs-head"><History size={13} /> Recent agent activity</div>
            <div className="ags-runs-list">
              {recentRuns.map((r) => (
                <button key={r.id} className="ags-run" onClick={() => onOpenSession(r.id)} title={r.title}>
                  <span className="ags-run-ic">{r.teamName ? <Users size={13} /> : <User size={13} />}</span>
                  <span className="ags-run-main">
                    <span className="ags-run-title">{r.title || "Untitled"}</span>
                    <span className="ags-run-meta">{r.teamName || r.agentName || "agent"} · {rel(r.updatedAt)}{r.mode === "cowork" ? " · folder" : ""}</span>
                  </span>
                  <ArrowRight size={13} style={{ color: "var(--text-2)" }} />
                </button>
              ))}
            </div>
            <div className="ag-hint" style={{ margin: "8px 0 0" }}>These conversations stay here on the Agents screen, out of your general chat history. Open one to pick up where the agent left off.</div>
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

        <div className="ag-field" style={{ marginTop: 14 }}>
          <label>Mission budget (cost guardrail)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input className="model-search" type="number" min="0" step="10" style={{ marginBottom: 0, width: 120 }}
              value={tdraft.budgetTokens ? Math.round(tdraft.budgetTokens / 1000) : ""}
              placeholder="off"
              onChange={(e) => setTdraft({ ...tdraft, budgetTokens: Math.max(0, Number(e.target.value) || 0) * 1000 })} />
            <span className="ag-tool-note">thousand tokens per mission (estimated). Mission Control shows a live meter; the mission hard-stops at the cap. Leave empty for no cap.</span>
          </div>
        </div>

        <div className="ag-hint" style={{ marginTop: 16 }}>
          Teams run in chat: brief them once, watch every agent work live in Mission Control, and get one finished deliverable. Up to 6 agents run per mission.
          In Managed mode the coordinator also <b>reviews results</b> after the first wave and can send follow-up sub-tasks — even recruiting agents from your bench beyond this line-up.
        </div>
      </div>
    );
  }

  // ---------------- studio (build-by-chat + live bench) ----------------
  // Drafting-table derivations (render-only, no state): blueprint completeness — has a name →
  // instructions → capabilities → model — drives the spine fill and the header meter;
  // "casting" decides when the empty-state casting call shows (same condition as before).
  const compSteps = [!!draft.name.trim(), !!draft.instructions.trim(), Object.values(draft.tools || {}).some(Boolean), !!draft.model];
  const compDone = compSteps.filter(Boolean).length;
  const casting = dMsgs.length <= 1 && !draft.instructions;
  return (
    <div className="ags-studio" style={{ "--idc": (draft.identity && draft.identity.color) || "var(--accent)" }}>
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

      {/* vitals: the agent's life so far — track record + what it carries (no new fetches; stats already loaded) */}
      {draft.id && stats[draft.id] && stats[draft.id].missions > 0 && (
        <div className="agsd-vitals">
          <span className="agsd-vital"><BadgeCheck size={12} style={{ color: stats[draft.id].cleanPct >= 80 ? "var(--ok)" : "var(--text-2)" }} />
            {stats[draft.id].missions} mission{stats[draft.id].missions === 1 ? "" : "s"} · {stats[draft.id].cleanPct}% clean · last {rel(stats[draft.id].lastAt)}</span>
          {(draft.knowledge || []).length > 0 && <span className="agsd-vital"><BookOpen size={12} /> {(draft.knowledge || []).length} knowledge file{(draft.knowledge || []).length === 1 ? "" : "s"}</span>}
          {draft.memory !== false && <span className="agsd-vital"><Brain size={12} /> learns across missions</span>}
        </div>
      )}

      <div className="ags-split">
        {/* left — the designer's drafting table */}
        <div className="agsd-pane">
          {/* drafting-table header: identity face (click to cycle) + live draft status */}
          <div className="agsd-head">
            <button type="button" className="agsd-id" title="Change look" onClick={cycleIdentity}>
              <Face identity={draft.identity} size={32} />
              {draftNote && <span key={draftNote.at} className="agsd-id-pulse" style={{ borderColor: (draft.identity && draft.identity.color) || "var(--accent)" }} aria-hidden="true" />}
            </button>
            <div className="agsd-head-main">
              <div className="agsd-head-title"><Wand2 size={13} /> Designer</div>
              <div className="agsd-head-sub" aria-live="polite">
                {draftNote
                  ? <span key={draftNote.at} className="agsd-sub-note">Blueprint updated · {draftNote.field}</span>
                  : <span className="agsd-sub-idle">shape the agent by talking</span>}
              </div>
            </div>
            <span className="agsd-meter" title={`Blueprint ${compDone}/${compSteps.length} — name · instructions · capabilities · model`}>
              {compSteps.map((on, i) => <i key={i} className={on ? "on" : ""} />)}
            </span>
          </div>

          <div className="agsd-chat scroll">
            {casting ? (
              <div className="agsd-cast">
                <div className="agsd-cast-title">Describe who you’re hiring…</div>
                <div className="agsd-cast-sub">Say it in your own words — the blueprint fills itself in as you talk, and the spine on the left fills as the draft takes shape.</div>
                <div className="agsd-cast-row">
                  {PERSONAS.map((p) => (
                    <button key={p.persona} type="button" className="agsd-cast-chip" title={p.desc} onClick={() => hirePersona(p)}>
                      <span className="agsd-cast-dot" style={{ background: autoIdentity(p.persona).color }} />
                      <span className="agsd-cast-name">{p.persona}</span>
                      <span className="agsd-cast-role">{p.role}</span>
                    </button>
                  ))}
                </div>
                <div className="agsd-cast-hint">…or pull someone from the casting call — every persona is a full blueprint you can reshape.</div>
              </div>
            ) : (
              <>
                {dMsgs.map((m, i) => (
                  m.role === "user"
                    ? <div key={i} className="agsd-say">{m.text}</div>
                    : <div key={i} className="agsd-sheet">{m.text}</div>
                ))}
                {dBusy && <div className="agsd-sheet agsd-busy"><Loader2 size={13} className="ag-spin" /> drafting…</div>}
              </>
            )}
            <div ref={dEndRef} />
          </div>

          {/* one-tap refinements — fill the dead space with the next useful move */}
          {!casting && draft.instructions.trim() && (
            <div className="agsd-quick" aria-label="Quick refinements">
              <span className="agsd-quick-k">Refine</span>
              {REFINE_CHIPS.map((c) => (
                <button key={c.label} type="button" className="agsd-quick-chip" disabled={dBusy} title={c.msg} onClick={() => designerSend(c.msg)}>{c.label}</button>
              ))}
            </div>
          )}

          <div className="agsd-composer">
            <input value={dInput} placeholder='e.g. "make it review code for security issues and report in a table"'
              onChange={(e) => setDInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") designerSend(); }} />
            <button type="button" className="agsd-send" aria-label="Send to designer" disabled={dBusy || !dInput.trim()} onClick={() => designerSend()}><ArrowUp size={15} /></button>
          </div>

          {/* blueprint: the raw config, always one click away */}
          <button className="agsd-bp-toggle" aria-expanded={blueprintOpen} onClick={() => setBlueprintOpen((o) => !o)}>
            <Hammer size={12} />
            <span className="agsd-bp-label">Blueprint</span>
            <span className="agsd-bp-sum">{compDone} of {compSteps.length} set</span>
            <span className="agsd-bp-cx">{blueprintOpen ? "▾" : "▸"}</span>
          </button>
          {blueprintOpen && (
            <div className="ags-bp scroll">
              <label>Purpose</label>
              <input value={draft.description} placeholder="One sentence" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <label>Instructions</label>
              <textarea rows={7} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
              <label>Capabilities</label>
              <div className="ags-bp-tools">
                {TOOL_DEFS.filter((t) => t.key !== "browser" || browserOn).map((t) => {
                  const I = t.icon; const on = !!draft.tools[t.key];
                  return (
                    <button key={t.key} className={`ag-pill ags-bp-tool ${on ? "on" : ""}`} title={t.note}
                      onClick={() => setDraft({ ...draft, tools: { ...draft.tools, [t.key]: !on } })}>
                      <I size={11} /> {t.label}
                    </button>
                  );
                })}
              </div>
              {!browserOn && <div className="ag-hint" style={{ margin: "2px 0 6px" }}>The Agent Browser is turned off by your admin (Settings → Agent Browser), so the Browser capability is unavailable.</div>}
              {browserOn && draft.tools.browser && (
                <>
                  <label>Allowed sites (optional) — domains the browser may visit</label>
                  <input value={draft.browserAllow || ""} placeholder="e.g. github.com, news.ycombinator.com — empty = any site"
                    onChange={(e) => setDraft({ ...draft, browserAllow: e.target.value })} />
                  <div className="ag-hint" style={{ margin: "2px 0 6px" }}>Navigation, clicks and form-fills ask your permission; passwords and payment fields are always refused.</div>
                </>
              )}
              <label>Knowledge ({(draft.knowledge || []).length}/24) — files this agent always knows</label>
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
              <div className="ag-hint" style={{ margin: 0 }}>Text files (md, txt, csv, json…). Large libraries are retrieved per task — only the relevant passages are injected. For PDFs, add them to a Project instead — Projects parse PDF/Word.</div>
              <label>Pinned model</label>
              <div className="ag-model-row">
                <ModelPicker value={draft.model || undefined} groups={groups} onChange={(v) => setDraft({ ...draft, model: v })} onRefresh={onRefresh} agenticOnly />
                {draft.model
                  ? <button className="btn ghost" onClick={() => setDraft({ ...draft, model: "" })}>Unpin</button>
                  : <span className="ag-hint" style={{ margin: 0 }}>Unpinned — uses the live selector.</span>}
              </div>
              {(draft.tools.files || draft.tools.shell) && <div className="ag-hint">Works in a folder — you'll pick it when the real session starts.</div>}
              <BlueprintExtras draft={draft} setDraft={setDraft} onExport={() => exportAgentFile(draft)} />
            </div>
          )}
        </div>

        {/* right — the live bench */}
        <div className="ags-pane ags-bench">
          <div className="ags-pane-head">
            <FlaskConical size={14} /> Bench <span className="ags-pane-sub">— talk to {draft.name.trim() || "the agent"} right now</span>
            {lastBenchAsk && <button className="ags-bench-reset" style={{ marginLeft: "auto" }} disabled={tBusy} title="Re-run the last test — compare the answer after a blueprint change" onClick={() => benchSend(lastBenchAsk.text)}><Play size={12} /></button>}
            {tMsgs.length > 0 && <button className="ags-bench-reset" style={lastBenchAsk ? { marginLeft: 0 } : undefined} title="Reset bench" onClick={() => setTMsgs([])}><RotateCcw size={12} /></button>}
          </div>
          <div className="ags-chat scroll">
            {!draft.instructions.trim() && <div className="ags-bench-empty">Nothing to test yet — describe the agent to the designer first.</div>}
            {draft.instructions.trim() && tMsgs.length === 0 && (
              <div className="ags-bench-empty">
                <span className="ags-bench-aura"><Portrait seed={draft.id} color={(draft.identity && draft.identity.color) || "var(--accent)"} size={48} title={draft.name} /></span>
                <div className="ags-bench-live"><i className="ags-live-dot" /> {draft.name.trim() || "Your agent"} is live on the bench</div>
                <div>Say something — instructions only here; files, terminal and connectors switch on in a real session.</div>
                {testIdeas.length === 0 && (
                  <button type="button" className="btn ghost ags-ideas-btn" disabled={ideasBusy} onClick={suggestTests}>
                    {ideasBusy ? <><Loader2 size={13} className="ag-spin" /> drafting tests…</> : <><Wand2 size={13} /> Suggest 3 test prompts</>}
                  </button>
                )}
                {testIdeas.length > 0 && (
                  <div className="ags-ideas" aria-label="Suggested tests">
                    {testIdeas.map((t, i) => (
                      <button key={i} type="button" className="ags-idea" disabled={tBusy} onClick={() => benchSend(t)}>
                        <Play size={11} /> <span>{t}</span>
                      </button>
                    ))}
                    <button type="button" className="ags-idea ags-idea-more" disabled={ideasBusy} title="Draft three different tests" onClick={suggestTests}>{ideasBusy ? <Loader2 size={12} className="ag-spin" /> : <RotateCcw size={11} />}</button>
                  </div>
                )}
              </div>
            )}
            {tMsgs.map((m, i) => (
              m.role === "user"
                ? <div key={i} className="ags-msg me">{m.text}</div>
                : <div key={i} className="ags-bench-reply"><Portrait seed={draft.id} color={(draft.identity && draft.identity.color) || "var(--accent)"} size={22} /><div className="ags-msg">{m.text}</div></div>
            ))}
            {tBusy && <div className="ags-bench-reply"><Portrait seed={draft.id} color={(draft.identity && draft.identity.color) || "var(--accent)"} size={22} mood="working" /><div className="ags-msg"><Loader2 size={13} className="ag-spin" /></div></div>}
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

// ---------------- Blueprint extras: memory · track record · versions · export ----------------
// Desktop-only sections (each hides itself when the bridge method isn't available).
function BlueprintExtras({ draft, setDraft, onExport }) {
  const [memNotes, setMemNotes] = useState(null);   // null = not loaded; array of {at,text}
  const [memEdit, setMemEdit] = useState(null);     // editable text, or null when not editing
  const [runs, setRuns] = useState(null);
  const [versions, setVersions] = useState(null);
  const [open, setOpen] = useState({ memory: false, runs: false, versions: false });
  const memoryOn = draft.memory !== false;

  useEffect(() => {
    setMemNotes(null); setRuns(null); setVersions(null); setMemEdit(null);
    if (!draft.id) return;
    if (bridge.getAgentMemory) bridge.getAgentMemory(draft.id).then((m) => setMemNotes((m && m.notes) || [])).catch(() => setMemNotes([]));
    if (bridge.getAgentHistory) bridge.getAgentHistory(draft.id).then((r) => setRuns(r || [])).catch(() => setRuns([]));
    if (bridge.listAgentVersions) bridge.listAgentVersions(draft.id).then((v) => setVersions(v || [])).catch(() => setVersions([]));
  }, [draft.id]);

  const saveMemory = async () => {
    const notes = (memEdit || "").split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
    if (bridge.setAgentMemory) { const m = await bridge.setAgentMemory(draft.id, notes); setMemNotes((m && m.notes) || []); }
    setMemEdit(null);
  };
  const clearMemory = async () => {
    if (bridge.clearAgentMemory) await bridge.clearAgentMemory(draft.id);
    setMemNotes([]); setMemEdit(null);
  };

  if (!bridge.getAgentMemory && !bridge.getAgentHistory) return null;

  const Section = ({ id, icon: I, label, count, children }) => (
    <>
      <button className="ags-bp-toggle" style={{ marginTop: 8 }} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}>
        <I size={12} /> {label}{count != null ? ` (${count})` : ""} {open[id] ? "▾" : "▸"}
      </button>
      {open[id] && <div style={{ padding: "6px 2px 2px" }}>{children}</div>}
    </>
  );

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid color-mix(in srgb, currentColor 12%, transparent)", paddingTop: 8 }}>
      {/* Memory — what this agent has learned */}
      {bridge.getAgentMemory && (
        <Section id="memory" icon={Brain} label={`Memory — what ${draft.name.trim() || "this agent"} has learned`} count={memNotes ? memNotes.length : undefined}>
          <label className="chip" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 8 }}>
            <input type="checkbox" checked={memoryOn} onChange={() => setDraft({ ...draft, memory: memoryOn ? false : undefined })} style={{ marginRight: 6 }} />
            Learn across missions
          </label>
          {!memoryOn && <div className="ag-hint" style={{ margin: "0 0 6px" }}>Memory is off — past notes are kept but not used, and nothing new is learned.</div>}
          {memEdit !== null ? (
            <>
              <textarea rows={6} value={memEdit} onChange={(e) => setMemEdit(e.target.value)} placeholder="One learning per line" />
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button className="btn primary" onClick={saveMemory}>Save memory</button>
                <button className="btn ghost" onClick={() => setMemEdit(null)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              {(memNotes || []).length === 0 && <div className="ag-hint" style={{ margin: 0 }}>Nothing learned yet — after each mission the agent extracts durable learnings (your preferences, corrections, stable facts) and applies them next time.</div>}
              {(memNotes || []).slice().reverse().map((n, i) => (
                <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px dashed color-mix(in srgb, currentColor 10%, transparent)" }}>• {n.text}</div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button className="btn ghost" onClick={() => setMemEdit((memNotes || []).map((n) => n.text).join("\n"))}><Pencil size={12} /> Edit</button>
                {(memNotes || []).length > 0 && <button className="btn ghost ag-del" onClick={clearMemory}><Trash2 size={12} /> Forget everything</button>}
              </div>
            </>
          )}
        </Section>
      )}

      {/* Track record — persisted run history */}
      {bridge.getAgentHistory && (
        <Section id="runs" icon={History} label="Track record" count={runs ? runs.length : undefined}>
          {(runs || []).length === 0 && <div className="ag-hint" style={{ margin: 0 }}>No missions recorded yet — every chat run, team mission, scheduled trigger, webhook and swarm lands here.</div>}
          {(runs || []).slice(0, 10).map((r, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", borderBottom: "1px dashed color-mix(in srgb, currentColor 10%, transparent)", display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: r.ok ? "var(--ok)" : "var(--danger)", flexShrink: 0 }}>{r.ok ? "✓" : "✗"}</span>
              <span style={{ color: "var(--text-2)", flexShrink: 0 }}>{rel(r.at)} · {SOURCE_LABEL[r.source] || r.source}{r.tokens ? ` · ~${(r.tokens / 1000).toFixed(1)}k tok` : ""}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.summary}</span>
            </div>
          ))}
        </Section>
      )}

      {/* Versions — rollback to an earlier blueprint */}
      {bridge.listAgentVersions && (
        <Section id="versions" icon={Clock} label="Versions" count={versions ? versions.length : undefined}>
          {(versions || []).length === 0 && <div className="ag-hint" style={{ margin: 0 }}>No earlier versions yet — each Studio save keeps the previous blueprint (last 10).</div>}
          {(versions || []).map((v, i) => (
            <div key={i} style={{ fontSize: 12, padding: "5px 0", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px dashed color-mix(in srgb, currentColor 10%, transparent)" }}>
              <span style={{ color: "var(--text-2)", flexShrink: 0 }}>{new Date(v.at).toLocaleString()}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(v.agent.description || v.agent.instructions || "").slice(0, 60)}</span>
              <button className="btn ghost" style={{ padding: "2px 8px" }}
                title="Load this version into the Studio (Save to keep it)"
                onClick={() => setDraft({ ...draft, name: v.agent.name, description: v.agent.description, instructions: v.agent.instructions, tools: { ...v.agent.tools }, knowledge: v.agent.knowledge || [], identity: v.agent.identity || draft.identity })}>
                <RotateCcw size={11} /> Restore
              </button>
            </div>
          ))}
        </Section>
      )}

      {/* Share */}
      {bridge.exportAgent && (
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={onExport}><Download size={12} /> Export .agent file</button>
          <span className="ag-hint" style={{ margin: "0 0 0 8px" }}>Portable: instructions, capabilities, knowledge. Memory and model pins stay private.</span>
        </div>
      )}
    </div>
  );
}

// ---------------- Swarm — run one agent over a list ----------------
function SwarmModal({ agent, onClose }) {
  const [items, setItems] = useState("");
  const [template, setTemplate] = useState("");
  const [conc, setConc] = useState(3);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({});   // index → { status, item, output }
  const [report, setReport] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const swarmIdRef = useRef(null);

  useEffect(() => {
    if (!bridge.onSwarmEvent) return;
    return bridge.onSwarmEvent((m) => {
      setProgress((p) => ({ ...p, [m.i]: { status: m.status, item: m.item, output: m.output } }));
    });
  }, []);

  const lines = items.split("\n").map((s) => s.trim()).filter(Boolean);
  const run = async () => {
    if (!lines.length || running) return;
    setRunning(true); setErr(""); setReport(""); setProgress({});
    try {
      const r = await bridge.runSwarm({ agentId: agent.id, items: lines, template: template || "Do your job on this item: {item}", concurrency: conc });
      if (r && r.error) setErr(r.error);
      else if (r) { swarmIdRef.current = r.swarmId; setReport(r.report || ""); }
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setRunning(false); }
  };
  const cancel = async () => { if (bridge.cancelSwarm) await bridge.cancelSwarm(swarmIdRef.current); setRunning(false); };
  const copyReport = async () => { try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const doneCount = Object.values(progress).filter((p) => p.status === "done" || p.status === "failed").length;

  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <div className="pj-create" style={{ width: 680, maxHeight: "84vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Layers size={16} style={{ color: "var(--accent)" }} />
          <h2 style={{ flex: 1, margin: 0, fontSize: 16 }}>Swarm — {agent.name || "agent"} × a whole list</h2>
          <button className="icon-btn" onClick={onClose} disabled={running}><X size={16} /></button>
        </div>
        <p className="mo-sub" style={{ margin: "6px 0 12px" }}>
          One instance of {agent.name || "this agent"} per line, running {conc} at a time. Use <code>{"{item}"}</code> in the brief where each line should go.
        </p>

        <label>The list (one item per line — leads, URLs, tickets, rows…)</label>
        <textarea className="model-search" rows={5} style={{ resize: "vertical", fontFamily: "var(--mono)", fontSize: 12 }}
          value={items} disabled={running} placeholder={"acme.com\nglobex.com\ninitech.com"} onChange={(e) => setItems(e.target.value)} />

        <label>Brief per item</label>
        <textarea className="model-search" rows={2} style={{ resize: "vertical" }}
          value={template} disabled={running} placeholder='e.g. "Research {item} and give me a 3-bullet company profile."' onChange={(e) => setTemplate(e.target.value)} />

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
          <span className="mo-sub">Parallel</span>
          <select className="model-search" style={{ marginBottom: 0, width: 70 }} value={conc} disabled={running} onChange={(e) => setConc(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="mo-sub">{lines.length} item{lines.length === 1 ? "" : "s"}{running ? ` · ${doneCount}/${lines.length} done` : ""}</span>
          <span style={{ flex: 1 }} />
          {running
            ? <button className="btn" onClick={cancel}>Stop</button>
            : <button className="btn primary" disabled={!lines.length} onClick={run}><Play size={13} /> Run swarm</button>}
        </div>
        {err && <div className="ag-err" style={{ marginTop: 8 }}>{err}</div>}

        {Object.keys(progress).length > 0 && (
          <div style={{ marginTop: 12, maxHeight: 220, overflow: "auto", border: "1px solid color-mix(in srgb, currentColor 12%, transparent)", borderRadius: 8, padding: 8 }}>
            {Object.entries(progress).sort((a, b) => Number(a[0]) - Number(b[0])).map(([i, p]) => (
              <div key={i} style={{ fontSize: 12, padding: "4px 0", display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flexShrink: 0 }}>{p.status === "working" ? <Loader2 size={11} className="ag-spin" /> : p.status === "done" ? "✓" : "✗"}</span>
                <span style={{ flexShrink: 0, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-2)" }}>{p.item}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.output || (p.status === "working" ? "working…" : "")}</span>
              </div>
            ))}
          </div>
        )}

        {report && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ flex: 1 }}>Compiled report</label>
              <button className="btn ghost" onClick={copyReport}>{copied ? <Check size={12} /> : "Copy"}</button>
            </div>
            <textarea className="model-search" rows={8} readOnly value={report} style={{ fontFamily: "var(--mono)", fontSize: 11 }} />
          </div>
        )}
      </div>
    </div>
  );
}
