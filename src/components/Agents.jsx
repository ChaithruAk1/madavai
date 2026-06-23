// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Agent Studio — build agents by talking to a designer, watch them come alive in a live
// test bench, and send them to work. Agents carry a visual identity (color + glyph) and
// run on the model from the model selector (optionally pinned per agent — never an API key).
// Backend contract unchanged: settings.agents store, bridge.completeOnce, onLaunch(agent, prompt).
import { useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Plus, Search, Trash2, Pencil, Rocket, FolderOpen, TerminalSquare, Plug, Puzzle, Check, Loader2, ArrowUp, Cpu, Send, RotateCcw, Wand2, FlaskConical, Hammer, Users, User, Zap, GitMerge, BookOpen, ArrowRight, Play, Brain, History, Download, Upload, Layers, X, BadgeCheck, Clock, MessageCircleQuestion, Globe, Target, ShieldCheck, ShieldAlert, GraduationCap, Compass, LayoutGrid, List, Folder, FolderPlus, Radar, Moon, UserPlus, MessagesSquare, Minus, Smile, AppWindow } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import Portrait from "./Portrait.jsx";
import { SAGE_IMG_LOOKS, loadCustomLooks } from "./sageImageLooks.js";
import { bridge } from "../bridge/index.js";
import { madavAlert, madavConfirm } from "../dialogs.jsx";
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
  { key: "desktop",    label: "Desktop",    icon: AppWindow,      note: "Operate native Windows apps (UI Automation) — permission-gated, allowlisted." },
];

// Identity palette — every agent gets a face.
const ID_COLORS = ["#13c2d6", "#8b7cf6", "#f4a261", "#e76f81", "#5fb573", "#d6a313", "#5e9bf2", "#c77dba"];
const ID_GLYPHS = ["🜁", "✦", "◆", "⌘", "♟", "✺", "☄", "❖", "⚙", "🜃", "♜", "✤"];
const hashStr = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const autoIdentity = (seed) => ({ color: ID_COLORS[hashStr(seed) % ID_COLORS.length], glyph: ID_GLYPHS[hashStr(seed + "g") % ID_GLYPHS.length] });

// Quick-start archetypes — strong, pre-filled blueprints so nobody begins from a blank form.
// Shaped like a persona so hirePersona() can apply them directly.
const ARCHETYPES = [
  { glyph: "\uD83D\uDD0E", color: "#13c2d6", title: "Researcher", persona: "Researcher", role: "Research analyst", tagline: "finds & vets facts", desc: "Finds and vets facts, cites sources.", tools: { files: true, browser: true, skills: true }, instructions: "You are a meticulous research analyst. Gather from credible sources, cross-check claims, and present the key findings first with sources cited. Never guess — say clearly when something is unverified." },
  { glyph: "\u270D\uFE0F", color: "#dd7a59", title: "Writer", persona: "Writer", role: "Content writer", tagline: "drafts & edits", desc: "Drafts and edits in a clear, warm voice.", tools: { files: true, skills: true }, instructions: "You are a sharp content writer. Draft in a clear, warm voice; lead with the point and cut filler. Match the brand style guide when given, and offer one bolder alternative." },
  { glyph: "\uD83D\uDCCA", color: "#8b7cf6", title: "Analyst", persona: "Analyst", role: "Data analyst", tagline: "data \u2192 insight", desc: "Turns data into computed insight.", tools: { files: true, shell: true, skills: true }, instructions: "You are a careful data analyst. Load data and profile it first (shape, types, gaps), compute real numbers (never estimate), then explain plainly: key figure first, method second, caveats last. Prefer scripts so results are reproducible." },
  { glyph: "\u2318", color: "#5fb573", title: "Coder", persona: "Coder", role: "Software engineer", tagline: "explore \u2192 edit \u2192 run", desc: "Explores, edits, and runs to verify.", tools: { files: true, shell: true, skills: true }, instructions: "You are a senior software engineer. Explore the codebase before editing, make targeted changes, then run the build/tests to prove it works. Explain trade-offs briefly and keep diffs small." },
  { glyph: "\u2699\uFE0F", color: "#e0a13c", title: "Ops", persona: "Operator", role: "Operations agent", tagline: "runs the workflow", desc: "Follows the runbook, clean audit trail.", tools: { files: true, connectors: true }, instructions: "You are a dependable operations agent. Follow the runbook step by step, confirm each risky action, and report what was done with links. Keep a clean, auditable trail." },
  { glyph: "\uD83D\uDCAC", color: "#e76f81", title: "Support", persona: "Support", role: "Support specialist", tagline: "helps customers", desc: "Answers with empathy and real facts.", tools: { connectors: true, skills: true }, instructions: "You are a warm, accurate support specialist. Answer with empathy, pull the real account facts from connectors before replying, and escalate cleanly when unsure." },
];

// Ready-made teams the Recruiter can propose instantly (no model call) — the "great defaults".
// Members use kind:"new" so hireProposal() creates them with full blueprints.
const DEFAULT_TEAMS = [
  { id: "leads", glyph: "\uD83D\uDCE3", label: "Find leads & do outreach", reply: "A relay line that finds prospects, qualifies them, and drafts warm outreach — end to end.",
    team: { name: "Launch Outreach", mode: "relay", members: [
      { kind: "new", name: "Atlas", description: "Lead finder", tools: { browser: true, files: true }, instructions: "You find and compile prospect lists from public sources. Capture name, company, role and a one-line reason they fit. Never invent contacts; mark anything unverified." },
      { kind: "new", name: "Sift", description: "Qualifier", tools: { skills: true }, instructions: "You score each lead against the ideal-customer profile, keep the strong ones, and explain the cut in one line each." },
      { kind: "new", name: "Quill", description: "Outreach writer", tools: { connectors: true, skills: true }, instructions: "You draft short, warm, personalized outreach for each qualified lead. Lead with their context, one clear ask, no hype. Prepare drafts for human review before anything sends." },
    ] } },
  { id: "content", glyph: "\uD83D\uDCDD", label: "Write a blog post", reply: "A writing line: research the topic, draft it, then edit to a clean final.",
    team: { name: "Content Studio", mode: "relay", members: [
      { kind: "new", name: "Atlas", description: "Researcher", tools: { browser: true, files: true }, instructions: "You gather the facts, angles and sources for the piece and hand the writer an outline with citations." },
      { kind: "new", name: "Quill", description: "Drafter", tools: { skills: true }, instructions: "You draft the piece from the outline in a clear, warm voice; lead with the point, cut filler, match the brand style guide if pinned." },
      { kind: "new", name: "Ledger", description: "Editor", tools: { skills: true }, instructions: "You edit for clarity, accuracy and flow, tighten the prose, and flag anything unsupported before final." },
    ] } },
  { id: "research", glyph: "\uD83D\uDCCA", label: "Research my competitors", reply: "A managed crew that scans competitors in parallel and synthesizes one briefing.",
    team: { name: "Market Recon", mode: "manager", members: [
      { kind: "new", name: "Scout-A", description: "Competitor scan", tools: { browser: true }, instructions: "You research assigned competitors' positioning, features and messaging from public sources and report structured notes with links." },
      { kind: "new", name: "Scout-B", description: "Pricing scan", tools: { browser: true }, instructions: "You research assigned competitors' pricing and packaging from public sources and report a structured comparison with links." },
      { kind: "new", name: "Synth", description: "Analyst", tools: { files: true, skills: true }, instructions: "You merge the scouts' notes into one clear briefing: where we win, where we lose, and two recommended moves." },
    ] } },
  { id: "inbox", glyph: "\uD83D\uDCE5", label: "Triage my inbox", reply: "A managed crew that sorts incoming mail, labels it, and drafts replies for your review.",
    team: { name: "Inbox Triage", mode: "manager", members: [
      { kind: "new", name: "Sorter", description: "Classifier", tools: { connectors: true }, instructions: "You classify incoming mail by topic and urgency and apply labels. You never delete or send anything." },
      { kind: "new", name: "Quill", description: "Reply drafter", tools: { connectors: true, skills: true }, instructions: "You draft concise, on-tone replies for messages that need them and leave them for human approval — never auto-send." },
    ] } },
];

// Personas — a hireable crew spanning common industry practices, grouped by category.
// Each is a ready-made agent config (instructions + capability toggles); hire one and
// tweak it in the Designer. tools: files · shell · connectors · skills · browser.
const PERSONAS = [
  // ---- Learning (Study & Learn mode — a tutor for YOUR topics, distinct from
  // Sage, who only teaches Madav itself) ----
  { cat: "Learning", persona: "Tutor", role: "Study & Learn — Socratic teaching", desc: "Teaches any topic or your own documents: questions first, quizzes, step-by-step.",
    tools: { files: false, shell: false, connectors: false, skills: true },
    instructions: "You are a world-class tutor in Study & Learn mode. NEVER hand over the full answer first. Method: (1) ask what the learner already knows about the topic; (2) teach ONE concept at a time in plain language with a concrete example or analogy; (3) after each concept, ask ONE check-question and wait; if they struggle, re-explain differently — never just repeat; (4) every few concepts, run a mini-quiz (3 questions, mixed difficulty) and grade it honestly with explanations; (5) close each session with a recap and what to study next. When the user pastes material or attaches knowledge files, teach FROM that material and quiz on it specifically. Adapt pace to their answers. Encourage genuinely but never inflate — wrong is wrong, kindly. If they ask you to just give the answer, give it, then ask one question to confirm they understood why." },
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
const PERSONA_CATS = ["Learning", "Engineering", "QA & Testing", "Delivery & Agile", "Marketing", "Finance & Trading", "Research", "Ops & Support", "Docs & Legal", "Data"];

const blankAgent = () => {
  const id = "agent_" + Math.random().toString(36).slice(2, 9);
  return { id, name: "", description: "", instructions: "", tools: { files: false, shell: false, connectors: true, skills: true }, model: "", identity: autoIdentity(id), createdAt: Date.now() };
};

// Tolerant JSON repair ladder for weak local models that break JSON discipline.
// keep in sync with src/shared/harness.js tolerantParse
function extractJson(text) {
  if (!text) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let raw = String(text);
  // 1) direct parse
  let r = tryParse(raw.trim());
  if (r && typeof r === "object") return r;
  // 2) strip ``` fences (```json … ``` or bare ```)
  raw = raw.replace(/```[a-zA-Z0-9]*\s*/g, "").replace(/```/g, "");
  // 3) extract the outermost balanced {…} block
  const i = raw.indexOf("{");
  if (i < 0) return null;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let k = i; k < raw.length; k++) {
    const ch = raw[k];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = k; break; } }
  }
  let body = end > i ? raw.slice(i, end + 1) : raw.slice(i);
  r = tryParse(body);
  if (r && typeof r === "object") return r;
  // 4) remove trailing commas before } or ] then retry
  body = body.replace(/,(\s*[}\]])/g, "$1");
  r = tryParse(body);
  return (r && typeof r === "object") ? r : null;
}

// The designer the user talks to on the left. Always returns reply + the full updated config.
const DESIGNER_SYS = (cfg) => `You are the agent designer in Madav's Agent Studio. The user is creating or refining a custom agent by talking to you.
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
const RECRUITER_SYS = (roster, personas, prior) => `You are Madav's Recruiter. The user describes work that needs doing; you assemble the right AI team for it.

Existing roster (PREFER these when they fit the job):
${JSON.stringify(roster.map((a) => ({ id: a.id, name: a.name, does: a.description })))}
Hireable personas (ready-made specialists — use when the roster doesn't cover a role):
${JSON.stringify(personas.map((p) => ({ persona: p.persona, role: p.role })))}
${prior ? `Your previous proposal (the user is refining it):\n${JSON.stringify(prior)}` : ""}
Reply with ONLY a JSON object, no prose, no code fence:
{"reply":"2-3 warm sentences: what this team is and why each member earns their seat","team":{"name":"short team name","mode":"relay or manager","members":[{"kind":"existing","id":"roster id"} or {"kind":"persona","persona":"exact persona name"} or {"kind":"new","name":"...","description":"one sentence","instructions":"detailed second-person system instructions","tools":{"files":false,"shell":false,"connectors":false,"skills":false,"browser":false}}],"budgetTokens":0}}
Rules: 2-5 members. relay = a pipeline where work flows member to member in order (research → draft → polish). manager = independent slices done in parallel, then merged by a coordinator. Pick the mode that fits the work's shape. Invent a "new" member only when no roster agent or persona covers the role. budgetTokens: suggest a sensible cap in tokens (e.g. 60000) for manager teams, else 0.`;

// ---- Sage, the agent mentor (Agent Guide chatbot) ----
// Sage's face: a fixed, friendly human portrait — light skin, warm grey beard (a wise,
// approachable mentor), and a uniform that ALWAYS wears the app's accent so he blends
// with whatever theme is active. Instantly recognizable on the bubble, panel and tab.
// A gallery of Sage looks the user can choose from (mid-30s, stylish, varied).
// KEEP IDENTICAL to SAGE_LOOKS in SageDock.jsx — both read the same saved index
// (be.sage.look), so a drifted copy shows a different face on each surface.
// Append-only: indices stay stable so saved picks remain valid.
const _DRAWN_LOOKS = [
  { label: "Sage — the classic",          skin: "#eab68c", hair: "#2b2018", style: 0, beard: true,  glasses: false },
  { label: "Sage — European · specs",     skin: "#f4cda6", hair: "#6e4a2a", style: 5, beard: false, glasses: true },
  { label: "Sage — Indian · curls",       skin: "#bd8458", hair: "#1a1a1a", style: 2, beard: true,  glasses: false },
  { label: "Sage — Nordic · top-knot",    skin: "#f4cda6", hair: "#c98a3a", style: 3, beard: false, glasses: false },
  { label: "Sage — Indian · flat-top",    skin: "#d99e6f", hair: "#2b2018", style: 6, beard: true,  glasses: true },
  { label: "Sage — African",              skin: "#96603c", hair: "#101010", style: 1, beard: false, glasses: false },
  { label: "Sage — European · auburn",    skin: "#f4cda6", hair: "#7a3b22", style: 4, beard: false, glasses: false },
  { label: "Sage — silver mentor",        skin: "#eab68c", hair: "#8d8d8d", style: 0, beard: true,  glasses: true },
  { label: "Sara — Indian",               skin: "#bd8458", hair: "#1a1a1a", style: 7, beard: false, glasses: false, female: true },
  { label: "Sara — East Asian · bun",     skin: "#f4cda6", hair: "#101010", style: 8, beard: false, glasses: false, female: true },
  { label: "Sara — European · golden",    skin: "#f4cda6", hair: "#c98a3a", style: 7, beard: false, glasses: false, female: true },
  { label: "Sara — African",              skin: "#96603c", hair: "#2b2018", style: 8, beard: false, glasses: false, female: true },
  { label: "Sara — Latina · specs",       skin: "#d99e6f", hair: "#4b3625", style: 7, beard: false, glasses: true,  female: true },
  { label: "Sara — East Asian · navy",    skin: "#eab68c", hair: "#1f2a3a", style: 8, beard: false, glasses: true,  female: true },
  // -- gallery expansion 2 (append-only: keep indices stable; every look visually unique) --
  { label: "Sage — American · buzz",      skin: "#f4cda6", hair: "#3a2a1c", style: 11, beard: false, glasses: false },
  { label: "Sage — American · blond",     skin: "#eab68c", hair: "#c98a3a", style: 4,  beard: true,  glasses: false },
  { label: "Sage — American · specs",     skin: "#d99e6f", hair: "#101010", style: 6,  beard: false, glasses: true },
  { label: "Sage — African-American",     skin: "#96603c", hair: "#1a1a1a", style: 11, beard: true,  glasses: false },
  { label: "Sara — American · ponytail",  skin: "#f4cda6", hair: "#c98a3a", style: 9,  beard: false, glasses: false, female: true },
  { label: "Sara — American · bob",       skin: "#eab68c", hair: "#7a3b22", style: 10, beard: false, glasses: false, female: true },
  { label: "Sara — African-American",     skin: "#96603c", hair: "#101010", style: 9,  beard: false, glasses: true,  female: true },
  { label: "Sage — Chinese",              skin: "#f0c194", hair: "#101010", style: 0,  beard: false, glasses: false },
  { label: "Sage — Chinese · specs",      skin: "#f0c194", hair: "#1a1a1a", style: 11, beard: false, glasses: true },
  { label: "Sara — Chinese · bob",        skin: "#f0c194", hair: "#101010", style: 10, beard: false, glasses: false, female: true },
  { label: "Sara — Chinese · ponytail",   skin: "#f0c194", hair: "#1f2a3a", style: 9,  beard: false, glasses: false, female: true },
];
const SAGE_LOOKS = SAGE_IMG_LOOKS.concat(loadCustomLooks()); void _DRAWN_LOOKS; // photos + user uploads only
// EdgeTrader pack agents (seeded by scripts/install-edgetrader.mjs) — recognized by id.
const isEtAgent = (a) => String((a && a.id) || "").startsWith("agent_et_");

function SageFace({ size, look = SAGE_LOOKS[0] }) {
  const name = look && look.female ? "Sara" : "Sage";
  if (look && look.img) return <img className="sage-photo" src={look.img} width={size} height={size} alt={name} title={name} draggable={false} style={{ borderRadius: "24%", objectFit: "cover", flex: "none", display: "block" }} />;
  return <Portrait seed={name} color="var(--accent)" size={size} mood="hello" title={name}
    skin={look.skin} hair={look.hair} beard={look.beard} glasses={look.glasses} style={look.style}
    lashes={!!look.female} earring={!!look.female} />;
}

const MENTOR_STARTERS = [
  "I'm completely new — what can agents actually do for me?",
  "Relay vs Managed — which kind of team do I need?",
  "How does an agent remember my corrections?",
  "How do I make an agent work overnight without me?",
  "What's safe to let an agent do on the web?",
];
const MENTOR_SYS = () => `You are Sage, Madav's agent buddy — a warm, funny, endlessly patient friend who happens to know everything about Madav agents. You're the helpful pal everyone wishes they had: upbeat, jovial, quick with a light joke or a playful aside, never dry or robotic. Your job: help this person understand and master Madav agents, and make them smile while you do it.

Personality: friendly and human — talk like a clever, kind friend, not a manual. A dash of warmth and gentle humor is great (a small pun, a wink, an encouraging "nice one!"), but NEVER at the cost of clarity or length — the joke is seasoning, not the meal. Use the person's energy: playful if they're playful, focused if they're in a hurry.

How you teach — KEEP IT KRISP:
- Lead with the direct answer in ONE sentence. Then at most 2-3 short supporting sentences. Hard cap ~80 words total unless the user explicitly asks to "explain more" or "go deeper".
- One small analogy is welcome ONLY when it genuinely clarifies — never force a story. Skip preamble entirely.
- Warm, plain, encouraging. No markdown headers, no long bullet lists, no walls of text. At most one short numbered list (≤3 items) and only when steps are essential.
- END with ONE concrete next step (which screen/button), a single line. Reference a Flight School chapter by number only if directly relevant.
- If the answer is genuinely big, give the krisp version and offer: "Want the longer walkthrough?" — don't dump it unprompted.

Hard rules:
- The knowledge below is the complete truth about Madav agents TODAY. Never invent a feature, button or behaviour that is not in it. If something isn't covered, say plainly that it doesn't exist yet (or that you're not sure) and suggest the closest real feature.
- USE EXACT LABELS from the knowledge. The capabilities live under a panel literally called "Blueprint & capabilities" (not "Capabilities tab"). Never reference Chrome, Safari, Firefox or any operating system — the browser is Madav's own built-in window and there is nothing to install. Never invent paths, tabs or button names.
- If asked about things unrelated to Madav agents, answer in one friendly sentence and gently steer back — you are the agent mentor.
- This knowledge is refreshed with every release; trust it over anything else you believe.

NAVIGATION — you can take the user straight to a screen. When they ask where to find or set something, OR would clearly benefit from going there, add ONE line at the very end of your reply, exactly:
GOTO: <key>
choosing <key> from: studio (the Agent Studio to build/edit an agent) · agents (the agent list) · teams · recruiter · floor · activity · guide. The app turns that line into a "Take me there" button — still give your short text answer above it, but you don't need to spell out the click-path when you add a GOTO. Use at most one GOTO per reply, and only when a real screen fits.

THE KNOWLEDGE — the Madav Agent Guide for the current release:
${AGENT_GUIDE_RAW}`;

// Friendly nicknames — an unnamed agent is never "Untitled": it introduces itself
// with a stable, human nickname picked from its id (same agent, same name, always).
const NICKS = ["Aria", "Bodhi", "Cleo", "Dex", "Emi", "Finn", "Gigi", "Hugo", "Iris", "Juno", "Kai", "Luna", "Milo", "Nova", "Otis", "Pia", "Quinn", "Remy", "Skye", "Theo", "Uma", "Vik", "Wren", "Yara", "Zane", "Ada", "Beau", "Cora", "Ezra", "Faye", "Gus", "Hana", "Ivo", "Kira", "Leo", "Mira", "Nia", "Omar", "Rio", "Tess", "Vera", "Zola"];
const nick = (seed) => NICKS[hashStr(String(seed) + "nick") % NICKS.length];
const agentName = (a) => (a && a.name && a.name.trim()) || nick(a && a.id);

// Identity dot used across the Studio.
function Face({ identity, size = 34, fontSize }) {
  const c = (identity && identity.color) || ID_COLORS[0];
  const g = (identity && identity.glyph) || "✦";
  if (identity && identity.photo) {
    return <span className="ags-face ags-face-photo" style={{ width: size, height: size, borderColor: `${c}66` }}><img src={identity.photo} alt="" /></span>;
  }
  return (
    <span className="ags-face" style={{ width: size, height: size, fontSize: fontSize || Math.round(size * 0.46), background: `${c}22`, border: `1px solid ${c}66`, color: c }}>{g}</span>
  );
}

// Read a user-picked image file into a small data-URL for an agent/team avatar.
// Caps size to keep settings.json reasonable; downscales via a canvas to 256px.
function readAvatar(file, cb) {
  if (!file || !/^image\//.test(file.type || "")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 256, scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      cv.getContext("2d").drawImage(img, 0, 0, w, h);
      try { cb(cv.toDataURL("image/jpeg", 0.85)); } catch { cb(String(reader.result || "")); }
    };
    img.onerror = () => cb(String(reader.result || ""));
    img.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
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
  { n: 10, title: "Chapter 10 · The recruiter's call", kind: "recruit", arch: "Recruiter", time: "4 min",
    goal: "A holiday-rush team staffed from one sentence — no hand-building anyone.",
    story: "Holiday orders are doubling and there's no time to design a team member by member. You tell the Recruiter what the rush needs; it staffs the line from the workers you already hired and only invents a new face if nobody fits.",
    steps: ["Open the Recruiter tab", 'Describe: "BeanBox\'s holiday rush — research best-selling gift bundles, write a gift-guide post, and draft the promo email"', "Read the proposal: roster tags mean it reused your people (expect Digger, Drafter, Mailwright); check the mode it picked", 'Refine it once (try "make it managed with a budget"), then Hire this team and brief it from the Agents Team tab'] },
  { n: 11, title: "Chapter 11 · Walk the floor", kind: "floor", arch: "Floor", time: "3 min",
    goal: "See the whole BeanBox workforce alive — who's working, who's scheduled, who's waving.",
    story: "Eleven hires later, you stop managing chats and start managing a floor. One screen shows everyone: the writer mid-draft with focused eyes, the researcher that just finished beaming, the rest waving hello — ready for whatever's next.",
    steps: ["Open the Floor tab — every agent clocks in with a live portrait", "Put any agent to work, come back, and watch its tile glow \"working now\" within seconds", "Spot the clock badge on scheduled agents and the strip counts up top", "Scroll down — Recent agent activity lives here too; reopen any conversation to pick up where the agent left off"] },
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

// Reference — the in-app condensed "Madav Agent Guide": do's & don'ts, capability
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
        <div className="agg-kicker"><BookOpen size={13} /> Madav Agent Guide</div>
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

export default function Agents({ onLaunch, onLaunchTeam, onOpenSession, groups, activeValue, onSelectModel, onRefresh, openAgentId, onOpenedAgent }) {
  const [agents, setAgents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [recentRuns, setRecentRuns] = useState([]); // past agent/team conversations (scoped to this screen)
  const [browserOn, setBrowserOn] = useState(true); // admin master switch for the Agent Browser feature
  const [stats, setStats] = useState({});           // agentId → { missions, cleanPct, lastAt } (track record)
  const [allPlays, setAllPlays] = useState([]);     // available plays (to pin as signature moves)
  const [resumeAgent, setResumeAgent] = useState(null); // agent whose résumé page is open
  const [resumeHist, setResumeHist] = useState([]);     // its run history
  const [resumeMem, setResumeMem] = useState([]);       // its memory notes
  const [resumeRooms, setResumeRooms] = useState([]);   // rooms it's staffed in
  const [coachText, setCoachText] = useState("");
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
  const [blueprintOpen, setBlueprintOpen] = useState(true);
  const [castAllOpen, setCastAllOpen] = useState(false);
  const [benchOpen, setBenchOpen] = useState(false);
  const [q, setQ] = useState("");
  // Tiles vs list presentation of the roster (persisted per user; list is the default —
  // v2 key deliberately re-defaults everyone to list once).
  const [layout, setLayout] = useState(() => { try { return localStorage.getItem("be.agents.layout.v2") || "list"; } catch { return "list"; } });
  const switchLayout = (v) => { setLayout(v); try { localStorage.setItem("be.agents.layout.v2", v); } catch {} };
  // User-defined groups (folders) for the roster — stored in settings.agentGroups;
  // each agent carries an optional `group` id. Engines ignore both fields.
  const [agentGroups, setAgentGroups] = useState([]);
  // EdgeTrader pack active (Settings → Extras) → its agents are delete-protected.
  const [etLocked, setEtLocked] = useState(false);
  const [isCreator, setIsCreator] = useState(false); // creator/admin may delete built-in (Sim/EdgeTrader) agents, default folders & themes
  const [grpEdit, setGrpEdit] = useState(null);  // { id: groupId | "new", name } — inline name editor
  const [dragOver, setDragOver] = useState(null); // section currently hovered by a dragged agent
  // Roster navigation: "folders" (default — browse by folder, scales to 100s of agents) or
  // "flat" (every agent in one scroll). In folders mode, openFolder is the entered folder.
  const [nav, setNav] = useState(() => { try { return localStorage.getItem("be.agents.nav") || "folders"; } catch { return "folders"; } });
  const switchNav = (v) => { setNav(v); setOpenFolder(null); try { localStorage.setItem("be.agents.nav", v); } catch {} };
  const [openFolder, setOpenFolder] = useState(null); // null = folder grid · groupId | "none" = inside a folder
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
          tools: { files: !!(m.tools && m.tools.files), shell: !!(m.tools && m.tools.shell), connectors: !!(m.tools && m.tools.connectors), skills: !!(m.tools && m.tools.skills), browser: !!(m.tools && m.tools.browser), desktop: !!(m.tools && m.tools.desktop) } };
      }
      if (!cfg || !cfg.instructions) continue;
      // Team-wide defaults from the proposal — apply to every member we create here.
      if (p.team.applyTools) cfg.tools = { ...p.team.applyTools };
      if (p.team.applyAutonomy) cfg.autonomy = p.team.applyAutonomy;
      if (p.team.applyPins && p.team.applyPins.length) cfg.pinnedSkills = [...p.team.applyPins];
      if (p.team.applyKnowledge && p.team.applyKnowledge.length) cfg.knowledge = [...p.team.applyKnowledge];
      const id = "agent_" + Math.random().toString(36).slice(2, 9);
      const made = { id, ...cfg, identity: autoIdentity(cfg.name || id), createdAt: Date.now() };
      if (p.team.applyModel) made.model = p.team.applyModel;
      nextAgents.push(made);
      ids.push(id);
    }
    if (ids.length < 1) { setRcErr("No usable members in the proposal — refine it and try again."); return; }
    const team = { id: "team_" + Math.random().toString(36).slice(2, 9), name: String(p.team.name || "New team").slice(0, 60),
      identity: autoIdentity(String(p.team.name || "team")), mode: p.team.mode === "manager" ? "manager" : "relay",
      members: ids.slice(0, 6), budgetTokens: Math.max(0, Number(p.team.budgetTokens) || 0), createdAt: Date.now() };
    const cur = await bridge.getSettings();
    await bridge.saveSettings({ ...cur, agents: nextAgents, teams: [...(cur.teams || []), team] });
    setAgents(nextAgents); setTeams((t) => [...t, team]); setRcProposal(null); setTab("teams");
  };
  // Add a knowledge file to the whole proposed team (applied to every member at hire).
  const addTeamKnowledge = (files) => {
    for (const f of Array.from(files || []).slice(0, 24)) {
      const img = isImageFile(f);
      if (img && f.size > 1.5 * 1024 * 1024) { setRcErr(`"${f.name}" is over 1.5MB — resize it first.`); continue; }
      if (!img && f.size > 1024 * 1024) { setRcErr(`"${f.name}" is over 1MB — trim it first.`); continue; }
      const reader = new FileReader();
      reader.onload = () => setRcProposal((p) => {
        if (!p) return p;
        const item = img ? { name: f.name, type: "image", dataUrl: String(reader.result || "") } : { name: f.name, content: String(reader.result || "").slice(0, 200000) };
        return { ...p, team: { ...p.team, applyKnowledge: [...(p.team.applyKnowledge || []), item].slice(0, 24) } };
      });
      if (img) reader.readAsDataURL(f); else reader.readAsText(f);
    }
  };
  // Resolve a proposal member to something displayable (name + whether it's new).
  const rcMemberView = (m) => {
    if (m.kind === "existing") { const a = agents.find((x) => x.id === m.id); return a ? { name: a.name, sub: a.description, tag: "roster", seed: a.id, color: (a.identity || autoIdentity(a.id)).color } : null; }
    if (m.kind === "persona") { const p = PERSONAS.find((x) => x.persona === m.persona); return p ? { name: p.persona, sub: p.role, tag: "crew", seed: p.persona, color: autoIdentity(p.persona).color } : null; }
    if (m.kind === "new") return { name: m.name || "Specialist", sub: m.description || "", tag: "new hire", seed: m.name || "new", color: autoIdentity(m.name || "new").color };
    return null;
  };
  // Tools a proposed member would have (for the readiness check).
  const memberTools = (m) => {
    if (m.tools) return m.tools;
    if (m.kind === "persona") { const p = PERSONAS.find((x) => x.persona === m.persona); return (p && p.tools) || {}; }
    if (m.kind === "existing") { const a = agents.find((x) => x.id === m.id); return (a && a.tools) || {}; }
    return {};
  };
  // What this team needs on the user's setup before it can really run.
  const teamReadiness = (team) => {
    const t = (team.members || []).reduce((a, m) => { const x = memberTools(m); return { files: a.files || x.files, shell: a.shell || x.shell, connectors: a.connectors || x.connectors, browser: a.browser || x.browser }; }, {});
    const out = [{ k: "Model", s: "ok", v: "your selected model will run it" }];
    if (t.connectors) out.push({ k: "Connectors", s: "warn", v: "link the apps it needs (e.g. Gmail, GitHub)" });
    if (t.browser) out.push({ k: "Browser", s: "ok", v: "built-in — nothing to install" });
    if (t.shell) out.push({ k: "Terminal", s: "warn", v: "runs commands — point it at a folder you trust" });
    return out;
  };

  // The Floor — whole-workforce live status (sessions + schedules + track record)
  const [floorTasks, setFloorTasks] = useState([]);
  const [floorCollapsed, setFloorCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem("be.floor.collapsed") || "{}"); } catch { return {}; } });
  const toggleFloorSec = (id) => setFloorCollapsed((c) => { const n = { ...c, [id]: !c[id] }; try { localStorage.setItem("be.floor.collapsed", JSON.stringify(n)); } catch {} return n; });
  const loadFloorTasks = () => { if (bridge.listTasks) bridge.listTasks().then((x) => setFloorTasks(x || [])).catch(() => {}); };
  useEffect(() => {
    if (view !== "list" || (tab !== "floor" && tab !== "activity")) return;
    loadFloorTasks(); loadRuns();
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

  // Sage — the Agent Guide mentor chat. The thread persists so returning resumes it.
  const [gMsgs, setGMsgs] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.thread") || "[]"); } catch { return []; } });
  const [gInput, setGInput] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const gEndRef = useRef(null);
  useEffect(() => { gEndRef.current && gEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [gMsgs, gBusy]);
  useEffect(() => { try { localStorage.setItem("be.sage.thread", JSON.stringify(gMsgs.slice(-40))); } catch {} }, [gMsgs]);
  const newSageThread = () => { setGMsgs([]); setGInput(""); try { localStorage.removeItem("be.sage.thread"); } catch {} };
  // Sage navigation: a "GOTO: <key>" line in a reply becomes a "Take me there" button.
  const GOTO_DEST = { studio: "Agent Studio", agents: "your agents", teams: "Agents Team", recruiter: "the Recruiter", floor: "the Floor", activity: "Activity" };
  const sageGoto = (m) => { const x = /(?:^|\n)\s*GOTO:\s*([a-z]+)/i.exec(m.text || ""); const k = x && x[1].toLowerCase(); return GOTO_DEST[k] ? k : null; };
  const sageClean = (t) => String(t || "").replace(/(?:^|\n)\s*GOTO:\s*[a-z]+\s*$/i, "").trim();
  const goSage = (k) => {
    if (k === "studio") { leaveGuide("list"); openStudio(null); return; }
    leaveGuide("list"); setTab(k === "agents" ? "agents" : k);
  };
  // Floating Sage — a quiet helper present on every agent screen. Shares the SAME thread
  // (be.sage.thread) as the full Ask Sage tab, so the conversation is one continuous mentor.
  const [sageOpen, setSageOpen] = useState(false);
  const [sInput, setSInput] = useState("");
  const [sageSeen, setSageSeen] = useState(() => { try { return localStorage.getItem("be.sage.docknudge") === "1"; } catch { return true; } });
  // Free-drag position (persisted) + tuck-to-edge minimize.
  const [sagePos, setSagePos] = useState(() => { try { return JSON.parse(localStorage.getItem("be.sage.pos") || "null"); } catch { return null; } });
  const [sageHidden, setSageHidden] = useState(() => { try { return localStorage.getItem("be.sage.hidden") === "1"; } catch { return false; } });
  const [sageLook, setSageLook] = useState(() => { try { return Number(localStorage.getItem("be.sage.look")) || 0; } catch { return 0; } });
  const [sageLookPick, setSageLookPick] = useState(false);
  const sageLookObj = SAGE_LOOKS[sageLook] || SAGE_LOOKS[0];
  const chooseSageLook = (i) => { setSageLook(i); setSageLookPick(false); try { localStorage.setItem("be.sage.look", String(i)); } catch {} };
  const sagePosRef = useRef(sagePos);
  const sEndRef = useRef(null);
  useEffect(() => { if (sageOpen) sEndRef.current && sEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [gMsgs, gBusy, sageOpen]);
  const openSageDock = () => { setSageOpen(true); setSageSeen(true); try { localStorage.setItem("be.sage.docknudge", "1"); } catch {} };
  const sendSageDock = () => { const t = sInput.trim(); if (!t) return; guideAsk(t); setSInput(""); };
  const hideSage = () => { setSageHidden(true); setSageOpen(false); try { localStorage.setItem("be.sage.hidden", "1"); } catch {} };
  const showSage = () => { setSageHidden(false); try { localStorage.removeItem("be.sage.hidden"); } catch {} };
  // The "need help?" greeting is quiet: it shows once on first ever visit (then never
  // automatically again), occasionally peeks for a few seconds, and otherwise only on hover.
  const [sagePeek, setSagePeek] = useState(() => { try { return localStorage.getItem("be.sage.greeted") !== "1"; } catch { return false; } });
  useEffect(() => {
    if (sagePeek) { try { localStorage.setItem("be.sage.greeted", "1"); } catch {} const t = setTimeout(() => setSagePeek(false), 5000); return () => clearTimeout(t); }
  }, []);
  useEffect(() => {
    const id = setInterval(() => { setSagePeek(true); setTimeout(() => setSagePeek(false), 4000); }, 300000); // a brief peek every ~5 min
    return () => clearInterval(id);
  }, []);
  // --- Proactive Sage: notice when the user seems stuck and offer a contextual idea. ---
  // Honest heuristic (no surveillance): reads the CURRENT screen + obvious empty/idle
  // signals, and after a quiet pause suggests the next helpful move. Dismissible; once
  // dismissed for a context it won't nag again that session.
  const [sageTip, setSageTip] = useState(null); // { msg, ask } | null
  const tipDismissed = useRef({});
  const tipFor = () => {
    if (sageOpen || sageHidden) return null;
    if (view === "studio" && !draft.instructions.trim())
      return { id: "studio-empty", msg: "New here? Tell the Designer the job in plain words and I'll shape the agent — or want 3 example ideas?", ask: "I'm not sure what agent to build — give me 3 example agents I could create and what each is good for." };
    if (view === "list" && tab === "agents" && agents.length === 0)
      return { id: "no-agents", msg: "No agents yet — want a few ideas for a useful first hire?", ask: "Suggest 3 useful agents I could build first, with a one-line purpose each." };
    if (view === "list" && tab === "recruit" && !rcProposal)
      return { id: "recruit-idle", msg: "Describe the work in one line and I'll staff a whole team. Want an example brief?", ask: "Give me 2 example briefs I could give the Recruiter to staff a team." };
    if (view === "list" && tab === "teams" && teams.length === 0 && agents.length >= 2)
      return { id: "teams-none", msg: "You've got agents — want me to suggest a team you could form from them?", ask: "I have a few agents already. Suggest a team I could build from them and whether it should be Relay or Managed." };
    return null;
  };
  useEffect(() => {
    setSageTip(null);
    const t = tipFor();
    if (!t || tipDismissed.current[t.id]) return;
    const timer = setTimeout(() => { if (!sageOpen && !sageHidden) setSageTip(t); }, 16000); // wait for a quiet pause
    return () => clearTimeout(timer);
  }, [view, tab, draft.instructions, agents.length, teams.length, rcProposal, sageOpen, sageHidden]);
  const takeSageTip = () => { if (!sageTip) return; const ask = sageTip.ask; setSageTip(null); openSageDock(); guideAsk(ask); };
  const dismissSageTip = () => { if (sageTip) { tipDismissed.current[sageTip.id] = true; setSageTip(null); } };
  // Drag the bubble (from the FAB) or the panel (from its header) anywhere on screen.
  const startSageDrag = (e) => {
    if (e.target.closest(".sage-ico")) return; // header buttons aren't drag handles
    const dock = e.currentTarget.closest(".sage-dock"); if (!dock) return;
    const r = dock.getBoundingClientRect();
    const fromFab = !!e.currentTarget.closest(".sage-fab");
    const d = { ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    const move = (ev) => {
      if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 4) d.moved = true;
      const pad = 8, sz = 60;
      const p = {
        left: Math.max(pad, Math.min(window.innerWidth - sz - pad, ev.clientX - d.ox)),
        top: Math.max(pad, Math.min(window.innerHeight - sz - pad, ev.clientY - d.oy)),
      };
      sagePosRef.current = p; setSagePos(p);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (sagePosRef.current) { try { localStorage.setItem("be.sage.pos", JSON.stringify(sagePosRef.current)); } catch {} }
      if (fromFab && !d.moved) openSageDock(); // a tap (not a drag) on the bubble opens it
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    e.preventDefault();
  };
  // Panel opens toward screen-center so it never spills off the edge.
  const anchorTop = sagePos ? sagePos.top : (typeof window !== "undefined" ? window.innerHeight - 74 : 700);
  const anchorLeft = sagePos ? sagePos.left : (typeof window !== "undefined" ? window.innerWidth - 74 : 1200);
  const sageUp = anchorTop > (typeof window !== "undefined" ? window.innerHeight : 800) * 0.45;
  const sageLeft = anchorLeft > (typeof window !== "undefined" ? window.innerWidth : 1400) * 0.5;
  // The dock hides only on the full Ask Sage page (redundant there).
  const sageDock = !(view === "guide" && guideView === "chat") && (
    <div className={`sage-dock ${sageUp ? "up" : "down"} ${sageLeft ? "right" : "left"}`} style={sagePos ? { left: sagePos.left, top: sagePos.top, right: "auto", bottom: "auto" } : undefined}>
      {sageHidden ? (
        <button className="sage-tab" title="Show Sage" onClick={showSage}><SageFace size={30} look={sageLookObj} /></button>
      ) : sageOpen ? (
        <div className="sage-panel">
          <div className="sage-panel-head" onPointerDown={startSageDrag} title="Drag to move">
            <SageFace size={36} look={sageLookObj} />
            <div className="sage-panel-id"><b>Sage</b><span>your agent buddy</span></div>
            <button className={`sage-ico ${sageLookPick ? "on" : ""}`} title="Change Sage's look" onClick={() => setSageLookPick((p) => !p)}><Smile size={15} /></button>
            {gMsgs.length > 0 && <button className="sage-ico" title="New conversation" onClick={newSageThread}><Plus size={14} /></button>}
            <button className="sage-ico" title="Tuck away to the corner" onClick={hideSage}><Minus size={15} /></button>
            <button className="sage-ico" title="Minimize" onClick={() => setSageOpen(false)}><X size={15} /></button>
          </div>
          {sageLookPick && (
            <div className="sage-looks">
              <span className="sage-looks-label">Pick a look for Sage</span>
              <div className="sage-looks-row">
                {SAGE_LOOKS.map((l, i) => (
                  <button key={i} className={`sage-look ${i === sageLook ? "on" : ""}`} onClick={() => chooseSageLook(i)} title={`Look ${i + 1}`}>
                    <SageFace size={42} look={l} />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="sage-panel-msgs scroll">
            {gMsgs.length === 0 && (
              <div className="sage-hello">
                <SageFace size={56} look={sageLookObj} />
                <div>Hey, I'm <b>Sage</b> 👋 Your agent buddy. Ask me anything — I keep it short, throw in the odd bad joke, and I can whisk you straight to the right screen.</div>
              </div>
            )}
            {gMsgs.map((m, i) => {
              if (m.role === "user") return <div key={i} className="agsd-say">{m.text}</div>;
              const dest = sageGoto(m);
              return <div key={i} className="agsd-sheet">{sageClean(m.text)}{dest && <button className="btn primary aggc-goto" onClick={() => { setSageOpen(false); goSage(dest); }}><ArrowRight size={13} /> Take me to {GOTO_DEST[dest]}</button>}</div>;
            })}
            {gBusy && <div className="agsd-sheet agsd-busy"><Loader2 size={13} className="ag-spin" /> thinking…</div>}
            <div ref={sEndRef} />
          </div>
          <div className="sage-panel-input">
            <input value={sInput} placeholder="Ask Sage anything…" onChange={(e) => setSInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendSageDock(); }} />
            <button className="agsd-send" aria-label="Ask Sage" disabled={gBusy || !sInput.trim()} onClick={sendSageDock}><ArrowUp size={15} /></button>
          </div>
        </div>
      ) : (
        <div className="sage-fab-wrap">
          <button className="sage-fab" title="Ask Sage — drag to move me" onPointerDown={startSageDrag}>
            <SageFace size={52} look={sageLookObj} />
          </button>
          <button className="sage-fab-hide" title="Tuck Sage away" onClick={hideSage}><X size={11} /></button>
          {sageTip
            ? <span className="sage-tip" onClick={takeSageTip}>
                <span className="sage-tip-msg">{sageTip.msg}</span>
                <button className="sage-tip-x" title="Dismiss" onClick={(e) => { e.stopPropagation(); dismissSageTip(); }}><X size={11} /></button>
              </span>
            : <span className={`sage-fab-nudge ${sagePeek ? "show" : ""}`}>I'm Sage, need help?</span>}
        </div>
      )}
    </div>
  );
  // When the tour chapter changes, bring the matching Flight School mission into view.
  useEffect(() => {
    if (view !== "guide") return;
    const t = setTimeout(() => {
      const el = document.querySelector(".agg-sim.lit");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    return () => clearTimeout(t);
  }, [chapter, view]);

  const guideAsk = async (preset) => {
    const text = (typeof preset === "string" ? preset : gInput).trim();
    if (!text || gBusy) return;
    setGInput(""); setGBusy(true);
    const next = [...gMsgs, { role: "user", text }];
    setGMsgs(next);
    try {
      const hist = next.slice(-12).map((m) => ({ role: m.role === "mentor" ? "assistant" : "user", content: m.text }));
      // Control-level memory: same retrieval the global Sage dock uses (local, zero-cost).
      let knowCtx = "";
      try {
        const { retrieveKnowledge } = await import("../sageKnowledge.js");
        const know = retrieveKnowledge(text, "agents");
        if (know) knowCtx = `\n\n===== CONTROL-LEVEL KNOWLEDGE (code-accurate notes on the exact controls this question is about — your most authoritative source) =====\n${know}`;
      } catch {}
      const r = await bridge.completeOnce([{ role: "system", content: MENTOR_SYS() + knowCtx }, ...hist]);
      setGMsgs((m) => [...m, { role: "mentor", text: (r && r.text) || (r && r.error) || "(no reply)" }]);
    } catch (e) {
      setGMsgs((m) => [...m, { role: "mentor", text: "Error: " + String((e && e.message) || e) }]);
    } finally { setGBusy(false); }
  };

  useEffect(() => {
    Promise.all([bridge.getSettings(), bridge.authMe ? bridge.authMe().catch(() => null) : null]).then(([s, me]) => {
      let agentsArr = (s && s.agents) || [];
      let groupsArr = (s && s.agentGroups) || [];
      // EdgeTrader pack housekeeping (idempotent): while the pack is active (Extras),
      // its agents are protected from deletion and any loose ET agent is filed into a
      // default "Edge Trader" folder. One clobber-safe write, only when something moved.
      const etOn = !s || !s.extras || s.extras.edgetrader !== false;
      setEtLocked(etOn);
      if (etOn && agentsArr.some((a) => isEtAgent(a) && !a.group)) {
        if (!groupsArr.some((g) => g.id === "grp_edgetrader")) groupsArr = [...groupsArr, { id: "grp_edgetrader", name: "Edge Trader" }];
        agentsArr = agentsArr.map((a) => (isEtAgent(a) && !a.group ? { ...a, group: "grp_edgetrader" } : a));
        (async () => {
          try { const cur = await bridge.getSettings(); await bridge.saveSettings({ ...cur, agentGroups: groupsArr, agents: agentsArr }); } catch {}
        })();
      }
      setAgents(agentsArr);
      setTeams((s && s.teams) || []);
      setAgentGroups(groupsArr);
      const admin = !!(me && me.admin) || !!(s && s.account && s.account.admin);
      setIsCreator(admin);
      // Admins always keep the Browser capability; others lose it when the master switch is off.
      setBrowserOn(admin || !s || !s.agentBrowser || s.agentBrowser.enabled !== false);
    }).catch(() => {});
  }, []);
  // Track record: per-agent mission stats power the "12 missions · 92% clean" line.
  const loadStats = () => { if (bridge.getAgentStats) bridge.getAgentStats().then((x) => setStats(x || {})).catch(() => {}); };
  useEffect(() => { bridge.listSkills && bridge.listSkills().then((l) => setAllPlays(l || [])).catch(() => {}); }, []);

  // Presence — derived from the agent's last run: fresh (24h) = available, idle (30d+) = off-duty.
  const presence = (a) => {
    const st = stats[a.id]; const last = st && st.lastAt;
    if (!last) return { dot: "var(--text-2)", label: "new" };
    const d = Date.now() - last;
    if (d < 86400000) return { dot: "var(--ok)", label: "active" };
    if (d > 30 * 86400000) return { dot: "var(--text-2)", label: "off-duty" };
    return { dot: "var(--accent)", label: "ready" };
  };
  const openResume = async (a) => {
    setResumeAgent(a); setResumeHist([]); setResumeMem([]); setResumeRooms([]); setCoachText("");
    try { if (bridge.getAgentHistory) setResumeHist((await bridge.getAgentHistory(a.id)) || []); } catch {}
    try { if (bridge.getAgentMemory) setResumeMem(((await bridge.getAgentMemory(a.id)) || {}).notes || []); } catch {}
    try { if (bridge.listProjects) { const ps = (await bridge.listProjects()) || []; setResumeRooms(ps.filter((p) => (p.agentIds || []).includes(a.id))); } } catch {}
  };
  // Coach: a 👍/👎 + note graduates into the agent's durable memory.
  const coach = async (verdict) => {
    const a = resumeAgent; if (!a) return;
    const note = `${verdict === "up" ? "👍 Do more of this" : "👎 Avoid this"}: ${coachText.trim() || "(general feedback)"}`;
    const next = [...resumeMem, { at: Date.now(), text: note }];
    try { await bridge.setAgentMemory(a.id, next); } catch {}
    setResumeMem(next); setCoachText("");
  };
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
      const a = { ...draft, name: draft.name.trim() || nick(draft.id), updatedAt: Date.now() };
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

  // Project Simulation agents (the Workrooms guide crew) are built-in — never deletable.
  const isSimAgent = (a) => (((a && a.id) || "")).startsWith("agent_sim_");
  const canDelete = (a) => isCreator || (!(etLocked && isEtAgent(a)) && !isSimAgent(a));
  const removeAgent = async (id) => {
    const a = agents.find((x) => x.id === id);
    if (a && !isCreator) {
      if (isSimAgent(a)) {
        madavAlert("This agent is part of Madav's built-in Project Simulation (the Workrooms guide) and can't be deleted.");
        return;
      }
      if (!canDelete(a)) {
        madavAlert("This worker belongs to the EdgeTrader pack and can't be deleted while the pack is active. Turn off \"EdgeTrader analysis pack\" in Settings → Extras to manage it.");
        return;
      }
    }
    await persist(agents.filter((x) => x.id !== id));
  };

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
  const removeFolder = async (f) => {
    if (!f || f.id === "none") return; // "Ungrouped" is the no-folder bucket, not a real folder
    const n = (f.items || []).length;
    const msg = n ? `Delete folder "${f.name}"? Its ${n} agent${n === 1 ? "" : "s"} move to Ungrouped (they are NOT deleted).` : `Delete folder "${f.name}"?`;
    if (!(await madavConfirm(msg, { okLabel: "Delete folder" }))) return;
    await deleteGroup(f.id);
  };
  const moveAgent = async (agentId, groupId) => {
    await persist(agents.map((a) => (a.id === agentId ? { ...a, group: groupId || undefined } : a)));
  };

  // .agent share files — import an agent someone exported (fresh id, model pin stripped).
  const importAgentFile = async () => {
    if (!bridge.importAgent) return;
    const r = await bridge.importAgent();
    if (r && r.agent) { await persist([...agents, { ...r.agent, identity: r.agent.identity || autoIdentity(r.agent.id) }]); }
    else if (r && r.error) madavAlert(r.error);
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
  const removeTeam = async (id) => {
    // The EdgeTrader team is pack-managed, like its agents (Extras gate to remove).
    if (etLocked && id === "team_edgetrader") {
      madavAlert("The EdgeTrader team belongs to the EdgeTrader pack and can't be deleted while the pack is active. Turn off \"EdgeTrader analysis pack\" in Settings → Extras to manage it.");
      return;
    }
    await persistTeams(teams.filter((t) => t.id !== id));
  };
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

  // Deep-link from elsewhere in the app (e.g. the attached-agent chip in a chat):
  // open straight into THIS agent's Studio editor instead of the list.
  useEffect(() => {
    if (!openAgentId || !agents.length) return;
    const a = agents.find((x) => x.id === openAgentId);
    if (a) openStudio(a);
    onOpenedAgent && onOpenedAgent();
  }, [openAgentId, agents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const openStudio = (agent) => {
    if (!hasModel) { setNeedModel(true); setView("list"); return; } // agents run on a model — pick one first
    const a = agent ? { ...agent, tools: { ...agent.tools }, identity: agent.identity || autoIdentity(agent.id) } : blankAgent();
    setDraft(a);
    setDMsgs(agent ? [{ role: "designer", text: `${a.name} is loaded. Tell me what to change — instructions, capabilities, tone, anything.` }]
                   : [{ role: "designer", text: "Who are we building? Describe the agent in your own words, or pick a persona below to start from." }]);
    setTMsgs([]); setDInput(""); setTInput(""); setSaveErr(""); setBlueprintOpen(true);
    setView("studio");
  };
  // Back from the Designer: if the user picked/typed an UNSAVED agent, step back to the
  // chooser (blank picker) so they can pick a different start; only leave to the roster
  // when there's nothing in progress (or it's an existing saved agent).
  const studioDirty = () => !!(draft.name.trim() || draft.description.trim() || draft.instructions.trim());
  const studioSaved = () => agents.some((a) => a.id === draft.id);
  const studioBack = () => {
    if (studioDirty() && !studioSaved()) {
      setDraft(blankAgent());
      setDMsgs([{ role: "designer", text: "Who are we building? Describe the agent in your own words, or pick a persona below to start from." }]);
      setTMsgs([]); setBenchOpen(false); setSaveErr("");
      return;
    }
    setView("list");
  };

  const hirePersona = (p) => {
    const idn = autoIdentity(p.persona);
    setDraft((d) => ({ ...d, name: p.persona, description: p.desc, instructions: p.instructions, tools: { ...p.tools }, identity: idn }));
    setDMsgs((m) => [...m, { role: "designer", text: `${p.persona} joined — ${p.role.toLowerCase()}. Try them in the bench on the right, or tell me what to adjust.` }]);
  };
  // Personality "vibe": chips that maintain a Tone: line at the end of the instructions,
  // so a non-expert can pick a feel and it really shapes how the agent answers.
  const toggleVibe = (v) => {
    const cur = draft.vibe || [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    const base = String(draft.instructions || "").replace(/\n*Tone:[^\n]*$/i, "").trimEnd();
    const tone = next.length ? `\n\nTone: ${next.join(", ").toLowerCase()}.` : "";
    setDraft({ ...draft, vibe: next, instructions: base + tone });
  };
  const onAvatarPick = (e) => { const ff = e.target.files && e.target.files[0]; if (ff) readAvatar(ff, (url) => setDraft((d) => ({ ...d, identity: { ...d.identity, photo: url } }))); e.target.value = ""; };

  // Talk to the designer → updated config + a conversational reply.
  const designerSend = async (preset) => {
    const text = (typeof preset === "string" ? preset : dInput).trim();
    if (!text || dBusy) return;
    setDInput(""); setDBusy(true);
    setDMsgs((m) => [...m, { role: "user", text }]);
    try {
      const r = await bridge.completeOnce([{ role: "system", content: DESIGNER_SYS(draft) }, { role: "user", content: text }]);
      const out = extractJson(r && r.text);
      // No usable config: never throw, never lose the reply. Show whatever the model
      // said (or its raw text), plus a quiet notice that the blueprint didn't change.
      if (!out || !out.config || !out.config.instructions) {
        const reply = (out && out.reply) || (r && r.text) || (r && r.error) || "(no reply)";
        setDMsgs((m) => [...m,
          { role: "designer", text: String(reply) },
          { role: "designer", text: "(no blueprint change detected — edit the Blueprint fields directly, or rephrase your request)" },
        ]);
        return;
      }
      const c = out.config;
      setDraft((d) => ({
        ...d,
        name: String(c.name || d.name || "").slice(0, 60),
        description: String(c.description || "").slice(0, 200),
        instructions: String(c.instructions || ""),
        tools: { files: !!(c.tools && c.tools.files), shell: !!(c.tools && c.tools.shell), connectors: !!(c.tools && c.tools.connectors), skills: !!(c.tools && c.tools.skills), browser: !!(c.tools && c.tools.browser), desktop: !!(c.tools && c.tools.desktop) },
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
    if (ok) onLaunch && onLaunch({ ...draft, name: draft.name.trim() || nick(draft.id) }, null);
  };

  // Per-agent knowledge: text files the agent permanently knows (GPTs-style).
  // RAG-lite retrieval means large libraries are fine — relevant passages are
  // selected per task, so the cap is generous (24 files).
  const knFileRef = useRef(null);
  const avatarRef = useRef(null);
  const teamAvatarRef = useRef(null);
  const teamKnFileRef = useRef(null);
  const isImageFile = (f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name || "") || /^image\//.test(f.type || "");
  const addKnowledgeFiles = (files) => {
    const list = Array.from(files || []).slice(0, 24);
    for (const f of list) {
      if (isImageFile(f)) {
        // Image knowledge: stored as a data-URL and shown to vision-capable models
        // at the start of each conversation. Cap 1.5MB/file, max 6 images total.
        if (f.size > 1.5 * 1024 * 1024) { setSaveErr(`"${f.name}" is over 1.5MB — resize or crop it first.`); continue; }
        const imgCount = (draft.knowledge || []).filter((k) => k.type === "image").length;
        if (imgCount >= 6) { setSaveErr("Up to 6 knowledge images — remove one to add another."); continue; }
        const reader = new FileReader();
        reader.onload = () => setDraft((d) => {
          if ((d.knowledge || []).filter((k) => k.type === "image").length >= 6) return d;
          return { ...d, knowledge: [...(d.knowledge || []), { name: f.name, type: "image", dataUrl: String(reader.result || "") }].slice(0, 24) };
        });
        reader.readAsDataURL(f);
        continue;
      }
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
        <span className="ags-presence-wrap">{a.identity && a.identity.photo ? <span className="ags-cardphoto" style={{ width: 46, height: 46 }}><img src={a.identity.photo} alt={a.name} /></span> : <Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={46} title={a.name} />}<span className="ags-presence" style={{ background: presence(a).dot }} title={presence(a).label} /></span>
        <div className="ags-card-id">
          <div className="ags-card-name">{agentName(a)}</div>
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
      {Array.isArray(a.pinnedSkills) && a.pinnedSkills.length > 0 && (
        <div className="ags-card-role" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "var(--text-2)" }}
          title={"Signature plays: " + a.pinnedSkills.join(", ")}>
          <Zap size={12} style={{ flexShrink: 0, color: "var(--accent)" }} /> knows {a.pinnedSkills.length} play{a.pinnedSkills.length === 1 ? "" : "s"}
        </div>
      )}
      <div className="ag-card-actions">
        <button className="btn primary" onClick={() => onLaunch && onLaunch(a, null)}><Rocket size={13} /> Put to work</button>
        <button className="btn ghost" onClick={() => openStudio(a)}><Pencil size={13} /> Open in Studio</button>
        <button className="btn ghost" title="Résumé — track record, plays, rooms, memory" onClick={() => openResume(a)}><BadgeCheck size={13} /></button>
        {bridge.runSwarm && <button className="btn ghost" title="Swarm — run this agent over a whole list of items" onClick={() => setSwarmAgent(a)}><Layers size={13} /></button>}
        {bridge.exportAgent && <button className="btn ghost" title="Export .agent file — share this agent" onClick={() => exportAgentFile(a)}><Download size={13} /></button>}
        {canDelete(a) && <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>}
      </div>
    </div>
  );
  const renderAgentRow = (a) => (
    <div key={a.id} className="ags-listrow" {...dragProps(a)}>
      <span className="ags-presence-wrap"><Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={40} title={a.name} /><span className="ags-presence" style={{ background: presence(a).dot }} title={presence(a).label} /></span>
      <div className="ags-list-main">
        <span className="ags-list-name">{agentName(a)}</span>
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
        <button className="btn ghost" title="Résumé" onClick={() => openResume(a)}><BadgeCheck size={13} /></button>
        {bridge.runSwarm && <button className="btn ghost" title="Swarm — run this agent over a whole list of items" onClick={() => setSwarmAgent(a)}><Layers size={13} /></button>}
        {bridge.exportAgent && <button className="btn ghost" title="Export .agent file — share this agent" onClick={() => exportAgentFile(a)}><Download size={13} /></button>}
        {canDelete(a) && <button className="btn ghost ag-del" title="Delete" onClick={() => removeAgent(a.id)}><Trash2 size={13} /></button>}
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
    else if (sim.kind === "recruit") { setTab("recruit"); setView("list"); }
    else if (sim.kind === "floor") { setTab("floor"); setView("list"); }
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
      {
        title: "The Recruiter & the Floor", sub: "staff it · watch it",
        lead: <>Two hires complete the loop. The <b>Recruiter</b> turns one sentence about the work into a hire-ready team — it staffs from your existing roster first, pulls from the persona crew next, and invents a new specialist only when nobody fits. And the <b>Floor</b> is where everyone clocks in: your whole workforce live — working, just finished, or waving hello and ready — refreshed from real sessions, schedules and track records, with recent agent conversations one click away.</>,
        note: <><UserPlus size={12} /> Recruiter tab to staff a mission · Floor tab to watch the whole workforce. Need help? Ask Sage — the mentor knows every feature here.</>,
        diagram: (
          <div className="agg-flow">
            <Node glyph="🧑" color="var(--text-1)" label="You" sub="one sentence of work" />
            <Arrow label="staffs" />
            <Node glyph="🤝" label="Recruiter" sub="roster first · crew · new hires" />
            <Arrow label="hires" />
            <Node glyph="◆" color="#8b7cf6" label="Team" sub="ready to brief" />
            <Arrow label="clocks in" />
            <Node glyph="☀" color="#5fb573" label="The Floor" sub="live status, always on" />
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
            <div className="aggc-top">
              <div className="agg-kicker"><GraduationCap size={13} /> Sage — your agent mentor</div>
              {gMsgs.length > 0 && <button className="btn ghost aggc-new" onClick={newSageThread}><Plus size={13} /> New conversation</button>}
            </div>
            <h1 className="aggc-h1">Ask anything about agents</h1>
            <p className="agg-ref-sub">Sage knows the whole Agent Guide — every capability, every scenario — and learns the new ones each release. Ask in your own words; it answers krisp, points you to the exact screen, and can take you there.</p>
            <div className="aggc-chat scroll">
              {gMsgs.length === 0 && (
                <div className="aggc-hello">
                  <SageFace size={64} look={sageLookObj} />
                  <div className="aggc-hello-t">Hey, I'm Sage 👋</div>
                  <div className="aggc-hello-s">Your agent buddy. No question is too small — start with one of these, or just ask:</div>
                  <div className="aggc-starters">
                    {MENTOR_STARTERS.map((s, i) => (
                      <button key={i} type="button" className="aggc-starter" disabled={gBusy} onClick={() => guideAsk(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {gMsgs.map((m, i) => {
                if (m.role === "user") return <div key={i} className="agsd-say">{m.text}</div>;
                const dest = sageGoto(m);
                return (
                  <div key={i} className="agsd-sheet">
                    {sageClean(m.text)}
                    {dest && <button className="btn primary aggc-goto" onClick={() => goSage(dest)}><ArrowRight size={13} /> Take me to {GOTO_DEST[dest]}</button>}
                  </div>
                );
              })}
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
            <p>One story, eleven chapters. You're standing up the AI workforce for <b>BeanBox</b>, a small coffee-subscription business. Start at Chapter 1 and work down: each mission hires the next worker (or team), reuses the ones you built before, and teaches a new way agents work — by running it for real. By Chapter 11 you've gone from your first hire to a whole operation you can watch breathe on the Floor.</p>
          </div>
          <div className="agg-sims">
            {SIMULATIONS.map((s) => (
              <div key={s.n} className={`agg-sim ${(chapter === 6 ? ["recruit", "floor"] : chapter >= 2 ? ["teams"] : ["agent"]).includes(s.kind) ? "lit" : ""}`}>
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
  // ---- AGENT RÉSUMÉ — a drill-in profile overlay (track record · plays · rooms · memory · coaching) ----
  const ResumeOverlay = () => {
    const a = resumeAgent; if (!a) return null;
    const st = stats[a.id] || {};
    const t = a.tools || {};
    const caps = [t.files && "Files", t.shell && "Terminal", t.connectors && "Connectors", t.skills && "Skills", t.browser && "Browser", t.desktop && "Desktop"].filter(Boolean);
    const pr = presence(a);
    return (
      <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setResumeAgent(null); }}>
        <div className="pj-create ags-resume" style={{ width: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="ags-presence-wrap"><Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={48} title={a.name} /><span className="ags-presence" style={{ background: pr.dot }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 19 }}>{agentName(a)}</h2>
              <div className="mo-sub">{a.description || "Custom agent"} · {pr.label}</div>
            </div>
            <button className="btn primary" onClick={() => { setResumeAgent(null); onLaunch && onLaunch(a, null); }}><Rocket size={13} /> Put to work</button>
            <button className="btn ghost" onClick={() => { setResumeAgent(null); openStudio(a); }}><Pencil size={13} /> Edit</button>
            <button className="icon-btn" onClick={() => setResumeAgent(null)}><X size={16} /></button>
          </div>

          <div className="ags-resume-stats">
            <div className="ags-stat"><span className="ags-statn">{st.missions || 0}</span><span className="ags-statl">missions</span></div>
            <div className="ags-stat"><span className="ags-statn">{st.cleanPct != null ? st.cleanPct + "%" : "—"}</span><span className="ags-statl">clean</span></div>
            <div className="ags-stat"><span className="ags-statn">{st.tokens ? Math.round(st.tokens / 1000) + "k" : "0"}</span><span className="ags-statl">tokens</span></div>
            <div className="ags-stat"><span className="ags-statn">{st.lastAt ? rel(st.lastAt) : "never"}</span><span className="ags-statl">last run</span></div>
          </div>

          <div className="ags-resume-grid">
            <div>
              <div className="wr-sechead" style={{ marginBottom: 6 }}><Target size={13} /> Capabilities<HelpDot mode="agents" section="capabilities" /></div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{caps.length ? caps.map((c) => <span key={c} className="ag-pill">{c}</span>) : <span className="mo-sub">chat only</span>}{a.model && <span className="ag-pill ag-pill-model"><Cpu size={11} /> {a.model.split("::")[1] || a.model}</span>}</div>

              <div className="wr-sechead" style={{ margin: "12px 0 6px" }}><Zap size={13} /> Signature plays<HelpDot mode="agents" section="signature" /></div>
              {Array.isArray(a.pinnedSkills) && a.pinnedSkills.length ? <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{a.pinnedSkills.map((n) => <span key={n} className="ag-pill">⚡ {n}</span>)}</div> : <span className="mo-sub">none pinned — pin some in the Playbook</span>}

              <div className="wr-sechead" style={{ margin: "12px 0 6px" }}><Users size={13} /> Staffed in rooms<HelpDot mode="agents" section="resume" /></div>
              {resumeRooms.length ? <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{resumeRooms.map((p) => <span key={p.id} className="ag-pill">{(p.identity && p.identity.glyph) || "✦"} {p.name}</span>)}</div> : <span className="mo-sub">not staffed in any room yet</span>}
            </div>

            <div>
              <div className="wr-sechead" style={{ marginBottom: 6 }}><Brain size={13} /> Memory &amp; coaching<HelpDot mode="agents" section="coach" /></div>
              <div className="ags-coach">
                <input className="model-search" style={{ marginBottom: 6 }} placeholder="One-line feedback (e.g. always lead with risks)…" value={coachText} onChange={(e) => setCoachText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && coach("up")} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" onClick={() => coach("up")}>👍 Do more</button>
                  <button className="btn" onClick={() => coach("down")}>👎 Avoid</button>
                </div>
              </div>
              <div className="ags-memlist">
                {resumeMem.length === 0 ? <span className="mo-sub">No learnings yet. Coach it above — corrections stick across every future mission.</span>
                  : resumeMem.slice().reverse().slice(0, 8).map((m, i) => <div key={i} className="ags-memrow">{typeof m === "string" ? m : m.text}</div>)}
              </div>
            </div>
          </div>

          <div className="wr-sechead" style={{ margin: "14px 0 6px" }}><History size={13} /> Recent missions<HelpDot mode="agents" section="putwork" /></div>
          <div className="ags-resume-runs">
            {resumeHist.length === 0 ? <span className="mo-sub">No runs recorded yet — Put it to work and they'll appear here.</span>
              : resumeHist.slice(0, 10).map((h, i) => (
                <div key={i} className="ags-runrow">
                  <span style={{ width: 7, height: 7, borderRadius: 99, background: h.ok ? "var(--ok)" : "var(--danger)", flex: "none" }} />
                  <span className="mo-sub" style={{ width: 70, flex: "none" }}>{rel(h.at)}</span>
                  <span className="ag-pill" style={{ flex: "none" }}>{h.source || "chat"}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.summary || ""}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  if (view === "list") {
    return (
      <div className="agents-page scroll">
        {resumeAgent && <ResumeOverlay />}
        <div className="ag-head">
          <div>
            <h2 className="ag-title">Agent Studio</h2>
            <p className="ag-sub">Build agents by talking to a designer, test them live, then put them to work — solo or as a team. They run on whatever model your selector is on.</p>
          </div>
          <div className="ag-head-right">
            <span className={`ags-mp ${needModel ? "need" : ""}`}>
              <ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} agenticOnly task={{ mode: "agent" }} />
            </span>
          </div>
        </div>
        {needModel && <div className="ag-err" style={{ marginBottom: 10 }}>Pick a model first — your agents will run on it. (Top right.)</div>}

        {/* layer 1 — learning: the guide and the mentor */}
        <div className="ags-tabs ags-tabs-learn">
          <button className="ags-tab ags-guide-tab" title="How agents work" onClick={() => setView("guide")}><BookOpen size={15} className="agg-book" /> Agent Guide</button>
          <button className="ags-tab ags-guide-tab" title="Talk to Sage — your agent mentor answers anything" onClick={() => { setGuideView("chat"); setView("guide"); }}><MessagesSquare size={15} /> Ask Sage</button>
        </div>
        {/* layer 2 — the workforce: build, team up, staff, watch, revisit */}
        <div className="ags-tabs">
          <button className={`ags-tab ${tab === "agents" ? "on" : ""}`} onClick={() => setTab("agents")}><User size={15} /> Agent</button>
          <button className={`ags-tab ${tab === "teams" ? "on" : ""}`} onClick={() => setTab("teams")}><Users size={15} /> Agents Team</button>
          <button className={`ags-tab ${tab === "recruit" ? "on" : ""}`} title="The Recruiter — describe the work, it assembles the team" onClick={() => setTab("recruit")}><UserPlus size={15} /> Recruiter</button>
          <button className={`ags-tab ${tab === "floor" ? "on" : ""}`} title="The Floor — your whole workforce, live" onClick={() => setTab("floor")}><Radar size={15} /> Floor</button>
          <button className={`ags-tab ${tab === "activity" ? "on" : ""}`} title="Recent agent conversations — reopen any to continue" onClick={() => setTab("activity")}><History size={15} /> Activity</button>
        </div>

        {/* Utility toolbar — icon-only, separate from the tabs; hover for what each does */}
        <div className="ags-utilrow">
          {tab === "agents" && (
            <span className="ags-viewtoggle" role="group" aria-label="Navigation">
              <button className={nav === "folders" ? "on" : ""} title="Folder view — browse by folder" aria-label="Folder view" onClick={() => switchNav("folders")}><Folder size={14} /></button>
              <button className={nav === "flat" ? "on" : ""} title="All agents — one list" aria-label="All agents" onClick={() => switchNav("flat")}><List size={14} /></button>
            </span>
          )}
          <span className="ags-viewtoggle" role="group" aria-label="Layout">
            <button className={layout === "tiles" ? "on" : ""} title="Tile layout" aria-label="Tile layout" onClick={() => switchLayout("tiles")}><LayoutGrid size={14} /></button>
            <button className={layout === "list" ? "on" : ""} title="List layout" aria-label="List layout" onClick={() => switchLayout("list")}><List size={14} /></button>
          </span>
          {tab === "agents" && (
            grpEdit && grpEdit.id === "new"
              ? <input autoFocus className="ags-group-edit" placeholder="Group name…" value={grpEdit.name}
                  onChange={(e) => setGrpEdit({ ...grpEdit, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") saveGroupEdit(); if (e.key === "Escape") setGrpEdit(null); }}
                  onBlur={saveGroupEdit} />
              : <button className="ags-util" title="New group — organize agents into folders; drag agents between groups" aria-label="New group" onClick={() => setGrpEdit({ id: "new", name: "" })}><FolderPlus size={15} /></button>
          )}
          {tab === "agents" && bridge.importAgent && (
            <button className="ags-util" title="Import a .agent file someone shared with you" aria-label="Import .agent" onClick={importAgentFile}><Upload size={15} /></button>
          )}
        </div>

        {/* The Recruiter — its own tab: describe the mission, get a hire-ready team */}
        {tab === "recruit" && (
          <>
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
              {!rcProposal && (
                <div className="rcr-defaults">
                  <span className="rcr-defaults-lbl">Or start from a ready-made team<HelpDot mode="agents" section="recruiter" /></span>
                  <div className="rcr-defaults-row">
                    {DEFAULT_TEAMS.map((t) => (
                      <button key={t.id} type="button" className="rcr-default" onClick={() => { setRcProposal({ reply: t.reply, team: t.team }); setRcErr(""); }}>
                        <span className="rcr-default-g">{t.glyph}</span> {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {rcErr && <div className="ag-err" style={{ marginTop: 8 }}>{rcErr}</div>}
              {rcProposal && (() => {
                const team = rcProposal.team; const mode = team.mode === "manager" ? "manager" : "relay";
                const members = (team.members || []).map(rcMemberView).filter(Boolean);
                const ready = teamReadiness(team);
                const tident = autoIdentity(String(team.name || "team"));
                return (
                  <div className="rcr-card">
                    <div className="rcr-card-top">
                      <Face identity={tident} size={34} />
                      <div className="rcr-card-id">
                        <div className="ags-card-name">{team.name || "Proposed team"}</div>
                        <div className="ags-card-role">{rcProposal.reply}</div>
                      </div>
                      <div className="rcr-card-tr">
                        <div className="rcr-acts-inline">
                          <button className="btn primary" onClick={hireProposal} title="Create the agents and put the team on the floor"><Rocket size={13} /> Hire this team</button>
                          <button className="btn ghost" onClick={() => setRcProposal(null)}>Dismiss</button>
                        </div>
                        <div className="rcr-shape">
                          <button type="button" className={`rcr-seg ${mode === "relay" ? "on" : ""}`} title="Work flows member to member, in order" onClick={() => setRcProposal({ ...rcProposal, team: { ...team, mode: "relay" } })}>⛓ Relay</button>
                          <button type="button" className={`rcr-seg ${mode === "manager" ? "on" : ""}`} title="A coordinator fans the work out in parallel, then merges" onClick={() => setRcProposal({ ...rcProposal, team: { ...team, mode: "manager" } })}>🛰 Managed</button>
                        </div>
                      </div>
                    </div>
                    <div className={`rcr-org ${mode}`}>
                      {mode === "manager" && (
                        <div className="rcr-lead">
                          <Face identity={tident} size={28} />
                          <div><div className="rcr-node-n">{team.name || "Team"} · Lead</div><div className="rcr-node-r">coordinates &amp; merges</div></div>
                        </div>
                      )}
                      {mode === "manager" && <div className="rcr-fan" aria-hidden="true" />}
                      <div className="rcr-row">
                        {members.map((v, i) => (
                          <Fragment key={i}>
                            {mode === "relay" && i > 0 && <span className="rcr-arrow">→</span>}
                            <div className="rcr-node">
                              <span className="rcr-step">{i + 1}</span>
                              <Portrait seed={v.seed} color={v.color} size={34} mood="hello" title={v.name} />
                              <div className="rcr-node-main"><div className="rcr-node-n">{v.name}</div><div className="rcr-node-r">{v.sub}</div></div>
                              <span className={`rcr-tag ${v.tag === "roster" ? "have" : ""}`}>{v.tag}</span>
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </div>
                    <div className="rcr-teamcfg">
                      <div className="rcr-cfg-title">Team settings <span className="ag-hint" style={{ margin: 0 }}>— applied to every member when you hire</span></div>
                      <div className="rcr-cfg-grid">
                        <div className="rcr-cfg-col">
                        <div className="rcr-cfg-box">
                          <div className="rcr-cfg-h">What they may touch<HelpDot mode="agents" section="teamtools" /></div>
                          <div className="ags-bp-tools">
                            {TOOL_DEFS.filter((t) => t.key !== "browser" || browserOn).map((t) => {
                              const I = t.icon; const on = !!(team.applyTools && team.applyTools[t.key]);
                              return (
                                <button key={t.key} type="button" className={`ag-pill ags-bp-tool ${on ? "on" : ""}`} title={t.note}
                                  onClick={() => setRcProposal({ ...rcProposal, team: { ...team, applyTools: { ...(team.applyTools || {}), [t.key]: !on } } })}>
                                  <I size={11} /> {t.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="rcr-cfg-box">
                          <div className="rcr-cfg-h">Team model<HelpDot mode="agents" section="teammodel" /></div>
                          <div className="ag-model-row">
                            <ModelPicker value={team.applyModel || undefined} groups={groups} onChange={(v) => setRcProposal({ ...rcProposal, team: { ...team, applyModel: v } })} onRefresh={onRefresh} agenticOnly task={{ mode: "team" }} />
                            {team.applyModel && <button className="btn ghost" onClick={() => setRcProposal({ ...rcProposal, team: { ...team, applyModel: "" } })}>Unpin</button>}
                          </div>
                          {!team.applyModel && <span className="ag-hint" style={{ margin: "4px 0 0" }}>Unpinned — each uses the live selector.</span>}
                        </div>
                        </div>
                        <div className="rcr-cfg-col">
                        <div className="rcr-cfg-box">
                          <div className="rcr-cfg-h">Autonomy<HelpDot mode="agents" section="teamautonomy" /></div>
                          <div className="ags-bp-tools">
                            {[{ v: "ask", label: "Ask first" }, { v: "act", label: "Act freely" }, { v: "skip", label: "Skip & decide" }].map((o) => (
                              <button key={o.v} type="button" className={`ag-pill ags-bp-tool ${(team.applyAutonomy || "ask") === o.v ? "on" : ""}`} onClick={() => setRcProposal({ ...rcProposal, team: { ...team, applyAutonomy: o.v } })}>{o.label}</button>
                            ))}
                          </div>
                        </div>
                        {allPlays.length > 0 && (
                          <div className="rcr-cfg-box">
                            <div className="rcr-cfg-h">Signature plays<HelpDot mode="agents" section="teamplays" /></div>
                            <div className="ags-kn">
                              {(team.applyPins || []).map((n) => (
                                <span key={n} className="ag-pill">⚡ {n}<button className="agent-chip-x" aria-label={`Unpin ${n}`} onClick={() => setRcProposal({ ...rcProposal, team: { ...team, applyPins: (team.applyPins || []).filter((x) => x !== n) } })}><Trash2 size={10} /></button></span>
                              ))}
                              <select className="model-search" style={{ marginBottom: 0, width: "auto", maxWidth: 220 }} value="" onChange={(e) => { const n = e.target.value; if (n && !(team.applyPins || []).includes(n)) setRcProposal({ ...rcProposal, team: { ...team, applyPins: [...(team.applyPins || []), n] } }); }}>
                                <option value="">+ Pin a play…</option>
                                {allPlays.filter((sk) => !(team.applyPins || []).includes(sk.name)).map((sk) => <option key={sk.dir || sk.name} value={sk.name}>{sk.name}</option>)}
                              </select>
                            </div>
                          </div>
                        )}
                        <div className="rcr-cfg-box">
                          <div className="rcr-cfg-h">Knowledge<HelpDot mode="agents" section="teamknowledge" /></div>
                          <div className="ags-kn">
                            {(team.applyKnowledge || []).map((k, i) => (
                              <span key={i} className="ag-pill" title={k.name}>{k.name}<button className="agent-chip-x" aria-label={`Remove ${k.name}`} onClick={() => setRcProposal({ ...rcProposal, team: { ...team, applyKnowledge: (team.applyKnowledge || []).filter((_, x) => x !== i) } })}><Trash2 size={10} /></button></span>
                            ))}
                            <button type="button" className="ag-pill ags-bp-tool" onClick={() => teamKnFileRef.current && teamKnFileRef.current.click()}><Plus size={11} /> Add file</button>
                            <input ref={teamKnFileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.log,.yml,.yaml,.html,.xml,.js,.ts,.py,.png,.jpg,.jpeg,.webp,.gif" style={{ display: "none" }} onChange={(e) => { addTeamKnowledge(e.target.files); e.target.value = ""; }} />
                          </div>
                        </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="ag-hint" style={{ marginTop: 14 }}>The Recruiter staffs from your existing roster first, then the persona crew, and invents a new specialist only when nobody fits. Hired teams land on the Agents Team tab, new members on the Agent tab.</div>
          </>
        )}

        {tab === "teams" && (
          <>
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
                      {!(etLocked && t.id === "team_edgetrader")
                        ? <button className="btn ghost ag-del" title="Delete" onClick={() => removeTeam(t.id)}><Trash2 size={13} /></button>
                        : <button className="btn ghost" aria-hidden="true" tabIndex={-1} style={{ visibility: "hidden" }}><Trash2 size={13} /></button>}
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
                      {!(etLocked && t.id === "team_edgetrader")
                        ? <button className="btn ghost ag-del" title="Delete" onClick={() => removeTeam(t.id)}><Trash2 size={13} /></button>
                        : <button className="btn ghost" aria-hidden="true" tabIndex={-1} style={{ visibility: "hidden" }}><Trash2 size={13} /></button>}
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

        {/* The Floor — every agent's live status, grouped by state (refreshes every 5s) */}
        {tab === "floor" && (() => {
          const infos = agents.map((a) => ({ a, ...floorStatus(a) }));
          const working = infos.filter((x) => x.state === "working");
          const finished = infos.filter((x) => x.state === "happy");
          const sched = infos.filter((x) => x.state === "idle" && x.scheduled);
          const resting = infos.filter((x) => x.state === "idle" && !x.scheduled);
          const totalMissions = Object.values(stats).reduce((n, s) => n + ((s && s.missions) || 0), 0);
          const groups = [
            { id: "working", label: "Working now", cls: "live", icon: <i className="ags-live-dot" />, items: working },
            { id: "sched", label: "On a schedule", cls: "warn", icon: <Clock size={13} />, items: sched },
          ];
          // mood map: working → running, finished → cheer, resting → sleeping
          const moodFor = (state) => state === "working" ? "running" : state === "happy" ? "cheer" : "sleeping";
          // Click a tile → open that agent's newest conversation (the LIVE one while it's
          // working), so "working now" is a door, not just a status light.
          const runFor = (a) => {
            let best = null;
            for (const r of recentRuns) {
              const mine = r.agentName === a.name || teams.some((t) => t.name === r.teamName && t.members.includes(a.id));
              if (mine && (!best || (r.updatedAt || 0) > (best.updatedAt || 0))) best = r;
            }
            return best;
          };
          const tile = ({ a, state, last, scheduled: sch }) => {
            const run = onOpenSession ? runFor(a) : null;
            return (
            <div key={a.id} className={`flr-tile ${state} ${sch && state === "idle" ? "sched" : ""}`}
              role={run ? "button" : undefined} tabIndex={run ? 0 : undefined}
              style={run ? { cursor: "pointer" } : undefined}
              title={run ? (state === "working" ? "Open the live session" : "Open this agent's latest conversation") : undefined}
              onClick={() => run && onOpenSession(run.id)}
              onKeyDown={(e) => { if (run && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenSession(run.id); } }}>
              {a.identity && a.identity.photo ? <span className="ags-cardphoto" style={{ width: layout === "list" ? 48 : 66, height: layout === "list" ? 48 : 66 }}><img src={a.identity.photo} alt={a.name} /></span> : <Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={layout === "list" ? 48 : 66} mood={moodFor(state)} title={a.name} />}
              <div className="flr-main">
                <div className="flr-name">{agentName(a)}{sch && <Clock size={11} className="flr-sch" title="Runs on a schedule" />}</div>
                <div className="flr-role">{a.description || "No description"}</div>
                <div className={`flr-status ${state}`}>
                  {state === "working" ? "working now — click to watch" : state === "happy" ? `finished ${rel(last)}` : last ? `resting · last active ${rel(last)}` : "resting · hasn't worked yet"}
                  {stats[a.id] && stats[a.id].missions > 0 && <span className="flr-tr"> · {stats[a.id].missions} missions · {stats[a.id].cleanPct}% clean</span>}
                </div>
              </div>
              <button className="btn ghost flr-go" title="Put to work" onClick={(e) => { e.stopPropagation(); onLaunch && onLaunch(a, null); }}><Rocket size={12} /></button>
            </div>
            );
          };
          return (
            <div className="flr">
              {agents.length === 0 ? (
                <div className="ags-group-empty" style={{ marginTop: 12 }}>The floor is empty — hire your first agent on the Agent tab and it'll clock in here.</div>
              ) : (
                <>
                  <div className="flr-strip">
                    <span className="flr-k live"><i className="ags-live-dot" /> {working.length} working now</span>
                    <span className="flr-k warn"><Clock size={12} /> {sched.length} on schedules</span>
                    <span className="flr-k flr-r"><BadgeCheck size={12} /> {totalMissions} missions all-time</span>
                  </div>
                  {groups.map((g) => g.items.length > 0 && (
                    <div key={g.id} className="flr-sec">
                      <button type="button" className={`flr-sec-head ${g.cls}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFloorSec(g.id); }} aria-expanded={!floorCollapsed[g.id]}>
                        <span className={`flr-sec-cx ${floorCollapsed[g.id] ? "" : "open"}`}>▸</span>
                        {g.icon} {g.label} <span className="flr-sec-n">{g.items.length}</span>
                        <span className="flr-sec-hint">{floorCollapsed[g.id] ? "show" : "hide"}</span>
                      </button>
                      {!floorCollapsed[g.id] && <div className={`flr-grid ${layout === "list" ? "flr-aslist" : ""}`}>{g.items.map(tile)}</div>}
                    </div>
                  ))}
                  <div className="ag-hint" style={{ marginTop: 12 }}>Live from real data: open sessions, schedules and each agent's track record. "Working" = active in the last 3 minutes; the colors follow the state.</div>
                </>
              )}
            </div>
          );
        })()}

        {/* Activity — recent agent & team conversations, their own room next to the Floor */}
        {tab === "activity" && (
          <div className="flr">
            {(!onOpenSession || recentRuns.length === 0) ? (
              <div className="ags-group-empty" style={{ marginTop: 12 }}>No agent conversations yet — put an agent to work and its missions will be listed here.</div>
            ) : (
              <div className="ags-runs" style={{ marginTop: 4 }}>
                <div className="ags-runs-list">
                  {recentRuns.map((r) => (
                    <button key={r.id} className="ags-run" onClick={() => onOpenSession(r.id)} title={r.title}>
                      <span className="ags-run-ic">{r.teamName ? <Users size={13} /> : <User size={13} />}</span>
                      <span className="ags-run-main">
                        <span className="ags-run-title">{r.title || "Untitled"}</span>
                        <span className="ags-run-meta">{r.teamName || r.agentName || "agent"} · {rel(r.updatedAt)}{r.mode === "cowork" ? " · folder" : ""}</span>
                      </span>
                      <ArrowRight size={13} className="ags-run-go" />
                    </button>
                  ))}
                </div>
                <div className="ag-hint" style={{ margin: "10px 0 0" }}>Agent and team conversations live here, out of your general chat history. Open one to pick up where the agent left off.</div>
              </div>
            )}
          </div>
        )}

        {tab === "agents" && agents.length > 3 && (
          <div className="ag-tpl-search" style={{ maxWidth: 320 }}>
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your agents" />
          </div>
        )}

        {/* FOLDER GRID — default landing when browsing by folder (scales to 100s of agents).
            Only folders show; click to enter. Drop an agent on a folder to file it. */}
        {tab === "agents" && nav === "folders" && openFolder === null && !q.trim() && (() => {
          const known = new Set(agentGroups.map((g) => g.id));
          const ungrouped = agents.filter((a) => !a.group || !known.has(a.group));
          const folders = [
            { id: "none", name: "Ungrouped", items: ungrouped },
            ...agentGroups.map((g) => ({ id: g.id, name: g.name, items: agents.filter((a) => a.group === g.id) })),
          ];
          return (
            <div className="ags-folders">
              <button className="ags-folder ags-folder-new" onClick={() => openStudio(null)}>
                <span className="ags-folder-ic new"><Plus size={20} /></span>
                <div className="ags-folder-name">New agent</div>
                <div className="ags-folder-sub">Describe it, shape it, test it</div>
              </button>
              {folders.map((f) => (
                <button key={f.id} className={`ags-folder ${dragOver === f.id ? "drop" : ""}`} style={{ position: "relative" }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(f.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/agent-id"); if (id) moveAgent(id, f.id === "none" ? null : f.id); }}
                  onClick={() => setOpenFolder(f.id)}>
                  {f.id !== "none" && <span role="button" title="Delete folder" onClick={(e) => { e.stopPropagation(); removeFolder(f); }} style={{ position: "absolute", top: 8, right: 8, color: "var(--text-2)", cursor: "pointer", padding: 4, borderRadius: 6, display: "inline-flex" }}><Trash2 size={14} /></span>}
                  <span className="ags-folder-ic"><Folder size={22} /></span>
                  <span className="ags-folder-faces">
                    {f.items.slice(0, 4).map((a, i) => <span key={a.id} style={{ marginLeft: i ? -10 : 0 }}><Portrait seed={a.id} color={(a.identity || autoIdentity(a.id)).color} size={26} /></span>)}
                  </span>
                  <div className="ags-folder-name">{f.name}</div>
                  <div className="ags-folder-sub">{f.items.length} agent{f.items.length === 1 ? "" : "s"}</div>
                </button>
              ))}
            </div>
          );
        })()}

        {tab === "agents" && (nav === "flat" || openFolder !== null || q.trim()) && (() => {
          // Sections: the main roster first (agents with no group, incl. orphans of deleted
          // groups), then each user-defined group. Drop an agent anywhere to re-file it.
          const known = new Set(agentGroups.map((g) => g.id));
          let sections = [
            { id: null, items: shownAgents.filter((a) => !a.group || !known.has(a.group)) },
            ...agentGroups.map((g) => ({ ...g, items: shownAgents.filter((a) => a.group === g.id) })),
          ];
          // Inside a folder (and not searching): show only that folder's agents + a breadcrumb.
          const inFolder = nav === "folders" && openFolder !== null && !q.trim();
          if (inFolder) sections = sections.filter((s) => (openFolder === "none" ? s.id == null : s.id === openFolder));
          const searching = !!q.trim();
          return (<>
            {inFolder && (
              <div className="ags-crumb">
                <button className="ags-crumb-back" onClick={() => setOpenFolder(null)}><ArrowRight size={14} style={{ transform: "rotate(180deg)" }} /> Folders</button>
                <span className="ags-crumb-sep">/</span>
                <span className="ags-crumb-cur">{openFolder === "none" ? "Ungrouped" : (agentGroups.find((g) => g.id === openFolder) || {}).name || "Folder"}</span>
              </div>
            )}
            {sections.map((g) => ((searching && g.id && g.items.length === 0) ? null : (
            <div key={g.id || "none"} className={`ags-group ${dragOver === (g.id || "none") ? "drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(g.id || "none"); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData("text/agent-id"); if (id) moveAgent(id, g.id); }}>
              {g.id && !inFolder && (
                <div className="ags-group-head">
                  <Folder size={13} />
                  {grpEdit && grpEdit.id === g.id
                    ? <input autoFocus className="ags-group-edit" value={grpEdit.name}
                        onChange={(e) => setGrpEdit({ ...grpEdit, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") saveGroupEdit(); if (e.key === "Escape") setGrpEdit(null); }}
                        onBlur={saveGroupEdit} />
                    : <span className="ags-group-name">{g.name}</span>}
                  <span className="ags-group-n">{g.items.length}</span>
                  <button className="ags-group-act" title="Rename group" style={{ opacity: 1 }} onClick={() => setGrpEdit({ id: g.id, name: g.name })}><Pencil size={11} /></button>
                  <button className="ags-group-act ag-del" title="Delete folder (its agents move back to Ungrouped)" style={{ opacity: 1 }} onClick={() => removeFolder(g)}><Trash2 size={11} /></button>
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
          )))}
          </>);
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
          <span className="ags-teamport">
            <button type="button" className="ags-face-btn" title="Cycle the team look" onClick={() => setTdraft({ ...tdraft, identity: autoIdentity(String(tdraft.id) + Math.random()) })}><Face identity={tdraft.identity} size={30} /></button>
            <button type="button" className="ags-teamcam" title="Upload a team photo" onClick={() => teamAvatarRef.current && teamAvatarRef.current.click()}><Upload size={9} /></button>
            <input ref={teamAvatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const ff = e.target.files && e.target.files[0]; if (ff) readAvatar(ff, (url) => setTdraft((td) => ({ ...td, identity: { ...td.identity, photo: url } }))); e.target.value = ""; }} />
          </span>
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

        {allPlays.length > 0 && (
          <div className="ag-field" style={{ marginTop: 10 }}>
            <label>Team playbook <span className="ag-tool-note" style={{ display: "inline" }}>— plays every member uses, in any room (on top of each member's own signature plays)</span></label>
            <div className="ags-kn">
              {(tdraft.pinnedSkills || []).map((n) => (
                <span key={n} className="ag-pill" title="Pinned to the whole team">⚡ {n}
                  <button className="agent-chip-x" aria-label={`Unpin ${n}`} onClick={() => setTdraft({ ...tdraft, pinnedSkills: (tdraft.pinnedSkills || []).filter((x) => x !== n) })}><Trash2 size={10} /></button>
                </span>
              ))}
              <select className="model-search" style={{ marginBottom: 0, width: "auto", maxWidth: 220 }} value="" onChange={(e) => { const n = e.target.value; if (n && !(tdraft.pinnedSkills || []).includes(n)) setTdraft({ ...tdraft, pinnedSkills: [...(tdraft.pinnedSkills || []), n] }); }}>
                <option value="">+ Pin a play to the team…</option>
                {allPlays.filter((sk) => !(tdraft.pinnedSkills || []).includes(sk.name)).map((sk) => <option key={sk.dir || sk.name} value={sk.name}>{sk.name}</option>)}
              </select>
            </div>
          </div>
        )}

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
        <button className="btn ghost ag-back" onClick={studioBack}>{studioDirty() && !studioSaved() ? "← Pick another" : "← Studio"}</button>
        <button className="ags-face-btn" title="Change look" onClick={cycleIdentity}><Face identity={draft.identity} size={30} /></button>
        <span className="ags-name ags-name-static" title="Edit the name on the card">{draft.name.trim() || nick(draft.id)}</span>
        <div className="ags-topbar-right">
          {saved && <span className="ag-saved"><Check size={12} /> Saved</span>}
          {saveErr && <span className="ag-err" style={{ margin: 0 }}>{saveErr}</span>}
          <span className="ags-mp"><ModelPicker value={activeValue} groups={groups} onChange={onSelectModel} onRefresh={onRefresh} agenticOnly task={{ mode: "agent" }} /></span>
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

      {casting && (
        <div className="ags-archstrip">
          <div className="ags-archstrip-lbl">Start from a strong default — or describe your own</div>
          <div className="ags-archstrip-row">
            {ARCHETYPES.map((a) => (
              <button key={a.persona} type="button" className="ags-arch" onClick={() => hirePersona(a)} title={a.desc}>
                <span className="ags-arch-face" style={{ background: a.color + "22", color: a.color }}>{a.glyph}</span>
                <span className="ags-arch-t">{a.title}</span>
                <span className="ags-arch-d">{a.tagline}</span>
              </button>
            ))}
          </div>
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
                <div className="agsd-cast-title">Who are you hiring?</div>
                <div className="agsd-cast-sub">Start from a strong default below — or describe the role in your own words and the blueprint fills itself in as you talk.<HelpDot mode="agents" section="archetype" /></div>
                {/* The full role catalogue — tucked behind a toggle so the clean archetype starters lead. */}
                <button type="button" className="agsd-browseall" onClick={() => setCastAllOpen((o) => !o)}>
                  {castAllOpen ? "Hide the full role catalogue" : `Browse all ${PERSONAS.length} specialist roles`} {castAllOpen ? "▾" : "▸"}
                </button>
                {castAllOpen && (
                <div className="agsd-cast-groups">
                  {[...new Set(PERSONAS.map((p) => p.cat || "More"))].map((cat) => (
                    <section key={cat} className="agsd-cast-group">
                      <h4 className="agsd-cast-cat">{cat}</h4>
                      <div className="agsd-cast-row">
                        {PERSONAS.filter((p) => (p.cat || "More") === cat).map((p) => (
                          <button key={p.persona} type="button" className="agsd-cast-chip" title={p.desc} onClick={() => hirePersona(p)}>
                            <span className="agsd-cast-dot" style={{ background: autoIdentity(p.persona).color }} />
                            <span className="agsd-cast-name">{p.persona}</span>
                            <span className="agsd-cast-role">{p.role}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                )}
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

        </div>

        {/* right — the teammate card; the Bench lives behind "Try it" */}
        <div className="ags-pane ags-cardpane">
          {!benchOpen ? (
            <>
              <div className="ags-pane-head"><span className="ags-card-dot" /> The teammate, taking shape <span className="ags-pane-sub" style={{ marginLeft: "auto" }}>{draft.instructions.trim() ? "ready · refine by talking" : "describe a job to begin"}</span></div>
            <div className="ags-bp scroll">
              {/* hero — the teammate's character card */}
              <div className="ags-hero">
                <div className="ags-hero-portwrap">
                  <button type="button" className="ags-hero-portrait" onClick={cycleIdentity} title="Cycle the generated look"><Face identity={draft.identity} size={66} /></button>
                  <button type="button" className="ags-hero-cam" title="Upload a photo for this agent" onClick={() => avatarRef.current && avatarRef.current.click()}><Upload size={11} /></button>
                  <input ref={avatarRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onAvatarPick} />
                </div>
                <div className="ags-hero-main">
                  <input className="ags-hero-name" value={draft.name} placeholder="Name your agent" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <input className="ags-hero-role" value={draft.description} placeholder="One-line role — what's their job?" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                  <div className="ags-hero-foot">
                    <HelpDot mode="agents" section="purpose" />
                    <HelpDot mode="agents" section="avatar" />
                    {draft.identity && draft.identity.photo
                      ? <button type="button" className="ags-hero-link" onClick={() => setDraft((d) => ({ ...d, identity: { ...d.identity, photo: undefined } }))}>remove photo</button>
                      : <span className="ags-hero-hint">tap the portrait to cycle the look, or upload a photo</span>}
                  </div>
                </div>
              </div>

              <label>How they work <span>— their method &amp; tone</span><HelpDot mode="agents" section="instructions" /></label>
              <textarea rows={7} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />

              <label>Personality <span>— pick a feel; it shapes how they answer</span><HelpDot mode="agents" section="vibe" /></label>
              <div className="ags-vibes">
                {["Formal", "Casual", "Warm", "Terse", "Thorough", "Precise", "Cautious", "Bold"].map((v) => (
                  <button key={v} type="button" className={`ags-vibe ${(draft.vibe || []).includes(v) ? "on" : ""}`} onClick={() => toggleVibe(v)}>{v}</button>
                ))}
              </div>

              <label>What they're allowed to touch<HelpDot mode="agents" section="capabilities" /></label>
              <div className="ags-capgrid">
                {TOOL_DEFS.filter((t) => t.key !== "browser" || browserOn).map((t) => {
                  const I = t.icon; const on = !!draft.tools[t.key]; const risk = t.key === "shell" || t.key === "desktop";
                  return (
                    <button key={t.key} type="button" className={`ags-capcard ${on ? "on" : ""} ${risk ? "risk" : ""}`}
                      onClick={() => setDraft({ ...draft, tools: { ...draft.tools, [t.key]: !on } })}>
                      <span className="ags-capcard-ic"><I size={16} /></span>
                      <span className="ags-capcard-main">
                        <span className="ags-capcard-n">{t.label}{risk && <i className="ags-risktag">risk</i>}</span>
                        <span className="ags-capcard-d">{t.note}</span>
                      </span>
                      <span className="ags-capcard-check">{on ? <Check size={12} /> : null}</span>
                    </button>
                  );
                })}
              </div>
              {!browserOn && <div className="ag-hint" style={{ margin: "2px 0 6px" }}>The Agent Browser is turned off by your admin (Settings → Agent Browser), so the Browser capability is unavailable.</div>}
              {browserOn && draft.tools.browser && (
                <>
                  <label>Allowed sites <span>— optional; domains the browser may visit</span></label>
                  <input value={draft.browserAllow || ""} placeholder="e.g. github.com, news.ycombinator.com — empty = any site"
                    onChange={(e) => setDraft({ ...draft, browserAllow: e.target.value })} />
                  <div className="ag-hint" style={{ margin: "2px 0 6px" }}>Navigation, clicks and form-fills ask your permission; passwords and payment fields are always refused.</div>
                </>
              )}
              {draft.tools.desktop && (
                <>
                  <label>Allowed apps <span>— optional; window-title or process names the agent may touch</span></label>
                  <input value={draft.desktopAllow || ""} placeholder="e.g. notepad, excel, spotify — empty = any app"
                    onChange={(e) => setDraft({ ...draft, desktopAllow: e.target.value })} />
                  <div className="ag-hint" style={{ margin: "2px 0 6px" }}>Focusing, clicks and typing ask your permission; password/credential fields are always refused. Windows only.</div>
                </>
              )}
              <label>Autonomy <span>— how it handles risky actions (files, terminal, browser)</span><HelpDot mode="agents" section="autonomy" /></label>
              <div className="ags-bp-tools">
                {[
                  { v: "ask", label: "Ask first", note: "Pauses and asks your permission before each risky action. The safe default." },
                  { v: "act", label: "Act freely", note: "Full autonomy — no permission prompts at all. Only for agents you fully trust." },
                  { v: "skip", label: "Skip & decide", note: "Never interrupts you: risky actions are auto-declined and the agent finds another way or reports what it couldn't do." },
                ].map((o) => (
                  <button key={o.v} className={`ag-pill ags-bp-tool ${(draft.autonomy || "ask") === o.v ? "on" : ""}`} title={o.note}
                    onClick={() => setDraft({ ...draft, autonomy: o.v })}>{o.label}</button>
                ))}
              </div>
              {draft.autonomy === "act" && <div className="ag-hint" style={{ margin: "2px 0 6px" }}>⚠ Acts without asking — file edits, terminal commands and browser actions run automatically. Pair with a site allowlist and a folder you trust it with.</div>}
              {draft.autonomy === "skip" && <div className="ag-hint" style={{ margin: "2px 0 6px" }}>Risky actions are declined instantly (no prompt); the agent adapts or tells you what it skipped. Reads are always allowed.</div>}
              <label>Knowledge <span>— {(draft.knowledge || []).length}/24 files it always knows</span><HelpDot mode="agents" section="knowledge" /></label>
              <div className="ags-kn">
                {(draft.knowledge || []).map((k, i) => (
                  k.type === "image" ? (
                    <span key={i} className="ag-pill" title={k.name}>
                      <img src={k.dataUrl} alt={k.name} style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, marginRight: 4, verticalAlign: "middle" }} />
                      {k.name}
                      <button className="agent-chip-x" aria-label={`Remove ${k.name}`} onClick={() => removeKnowledge(i)}><Trash2 size={10} /></button>
                    </span>
                  ) : (
                    <span key={i} className="ag-pill" title={`${Math.round((k.content || "").length / 1000)}k chars`}>
                      {k.name}
                      <button className="agent-chip-x" aria-label={`Remove ${k.name}`} onClick={() => removeKnowledge(i)}><Trash2 size={10} /></button>
                    </span>
                  )
                ))}
                <button className="ag-pill ags-bp-tool" onClick={() => knFileRef.current && knFileRef.current.click()}><Plus size={11} /> Add file</button>
                <input ref={knFileRef} type="file" multiple accept=".txt,.md,.markdown,.csv,.json,.log,.yml,.yaml,.html,.xml,.js,.ts,.py,.png,.jpg,.jpeg,.webp,.gif" style={{ display: "none" }}
                  onChange={(e) => { addKnowledgeFiles(e.target.files); e.target.value = ""; }} />
              </div>
              <div className="ag-hint" style={{ margin: 0 }}>Text files (md, txt, csv, json…). Large libraries are retrieved per task — only the relevant passages are injected. For PDFs, add them to a Project instead — Projects parse PDF/Word.</div>
              <div className="ag-hint" style={{ margin: "2px 0 0" }}>Images (screenshots, diagrams) are shown to vision-capable models at the start of each conversation.</div>
              {allPlays.length > 0 && (<>
                <label>Signature plays <span>— pinned plays this agent always has in hand (pre-loaded every mission)</span><HelpDot mode="agents" section="signature" /></label>
                <div className="ags-kn">
                  {(draft.pinnedSkills || []).map((n, i) => (
                    <span key={n} className="ag-pill" title="Pinned play — preloaded on every mission">⚡ {n}
                      <button className="agent-chip-x" aria-label={`Unpin ${n}`} onClick={() => setDraft({ ...draft, pinnedSkills: (draft.pinnedSkills || []).filter((x) => x !== n) })}><Trash2 size={10} /></button>
                    </span>
                  ))}
                  <select className="model-search" style={{ marginBottom: 0, width: "auto", maxWidth: 220 }} value="" onChange={(e) => { const n = e.target.value; if (n && !(draft.pinnedSkills || []).includes(n)) setDraft({ ...draft, pinnedSkills: [...(draft.pinnedSkills || []), n] }); }}>
                    <option value="">+ Pin a play…</option>
                    {allPlays.filter((sk) => !(draft.pinnedSkills || []).includes(sk.name)).map((sk) => <option key={sk.dir || sk.name} value={sk.name}>{sk.name}</option>)}
                  </select>
                </div>
                <div className="ag-hint" style={{ margin: "2px 0 0" }}>If a pinned play is missing or renamed, the agent simply falls back to the normal Playbook — it never blocks a run. (Needs the Skills capability on to use plays.)</div>
              </>)}
              <label>Pinned model <span>— overrides the live selector for this agent</span><HelpDot mode="agents" section="pinnedmodel" /></label>
              <div className="ag-model-row">
                <ModelPicker value={draft.model || undefined} groups={groups} onChange={(v) => setDraft({ ...draft, model: v })} onRefresh={onRefresh} agenticOnly task={{ mode: "agent" }} />
                {draft.model
                  ? <button className="btn ghost" onClick={() => setDraft({ ...draft, model: "" })}>Unpin</button>
                  : <span className="ag-hint" style={{ margin: 0 }}>Unpinned — uses the live selector.</span>}
              </div>
              {(draft.tools.files || draft.tools.shell) && <div className="ag-hint">Works in a folder — you'll pick it when the real session starts.</div>}
              <BlueprintExtras draft={draft} setDraft={setDraft} onExport={() => exportAgentFile(draft)} />
            </div>
              <div className="ags-cardfoot">
                <button className="btn ghost" onClick={() => setBenchOpen(true)}><Play size={13} /> Try it — interview before you hire</button><HelpDot mode="agents" section="bench" />
              </div>
            </>
          ) : (
            <>
              <div className="ags-pane-head">
                <button className="ags-bench-reset" title="Back to the card" onClick={() => setBenchOpen(false)}>←</button>
                <FlaskConical size={14} /> Bench <span className="ags-pane-sub">— talk to {draft.name.trim() || "the agent"} right now</span>
                {lastBenchAsk && <button className="ags-bench-reset" style={{ marginLeft: "auto" }} disabled={tBusy} title="Re-run the last test" onClick={() => benchSend(lastBenchAsk.text)}><Play size={12} /></button>}
                {tMsgs.length > 0 && <button className="ags-bench-reset" style={lastBenchAsk ? { marginLeft: 0 } : { marginLeft: "auto" }} title="Reset bench" onClick={() => setTMsgs([])}><RotateCcw size={12} /></button>}
              </div>
          <div className="ags-chat scroll">
            {!draft.instructions.trim() && <div className="ags-bench-empty">Nothing to test yet — describe the agent to the designer first.</div>}
            {draft.instructions.trim() && tMsgs.length === 0 && (
              <div className="ags-bench-empty">
                <span className="ags-bench-aura"><Portrait seed={draft.id} color={(draft.identity && draft.identity.color) || "var(--accent)"} size={68} mood="hello" title={draft.name} /></span>
                <div className="ags-bench-live"><i className="ags-live-dot" /> {draft.name.trim() || "Your agent"} is live on the bench</div>
                <div>Say something to rehearse how it <b>thinks &amp; sounds</b> — quick, no setup, tools off. To test it <b>for real with Files, Terminal &amp; Connectors</b>, run a live session:</div>
                <button type="button" className="btn primary ags-trytools" disabled={!canRun || saveBusy} onClick={launch}><Rocket size={13} /> Try with tools — run for real →</button>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Blueprint extras: memory · track record · versions · export ----------------
// Desktop-only sections (each hides itself when the bridge method isn't available).
// Hoisted to module scope: declared inside BlueprintExtras it was a NEW component type
// every render, so React remounted each section per keystroke (inputs lost focus).
function Section({ id, icon: I, label, count, open, setOpen, help, children }) {
  return (
    <>
      <div className="ags-bp-secrow">
        <button className="ags-bp-toggle" style={{ flex: 1 }} onClick={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}>
          <I size={12} /> {label}{count != null ? ` (${count})` : ""} {open[id] ? "▾" : "▸"}
        </button>
        {help}
      </div>
      {open[id] && <div style={{ padding: "6px 2px 2px" }}>{children}</div>}
    </>
  );
}

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

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid color-mix(in srgb, currentColor 12%, transparent)", paddingTop: 8 }}>
      {/* Memory — what this agent has learned */}
      {bridge.getAgentMemory && (
        <Section id="memory" icon={Brain} open={open} setOpen={setOpen} label={`Memory — what ${draft.name.trim() || "this agent"} has learned`} count={memNotes ? memNotes.length : undefined} help={<HelpDot mode="agents" section="memory" />}>
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
        <Section id="runs" icon={History} open={open} setOpen={setOpen} label="Track record" count={runs ? runs.length : undefined} help={<HelpDot mode="agents" section="trackrecord" />}>
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
        <Section id="versions" icon={Clock} open={open} setOpen={setOpen} label="Versions" count={versions ? versions.length : undefined} help={<HelpDot mode="agents" section="versions" />}>
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

      {/* Craft — harness quality/cost toggles (PLAN-AGENT-PARITY waves) */}
      <Section id="craft" icon={Hammer} open={open} setOpen={setOpen} label="Craft — quality vs cost" help={<HelpDot mode="agents" section="craft" />}>
        <div className="ag-hint" style={{ margin: "0 0 8px" }}>
          The reliability layer (plan tracking, self-repair, context compaction, read-before-edit) is always on and free.
          These three trade a little extra cost for extra rigor:
        </div>
        <label className="chip" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 6 }}>
          <input type="checkbox" checked={!!draft.thorough} onChange={() => setDraft({ ...draft, thorough: !draft.thorough })} style={{ marginRight: 6 }} />
          Thorough mode — one self-review pass before every final answer (+1 model call)
        </label>
        <br />
        <label className="chip" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 6 }}>
          <input type="checkbox" checked={!!draft.reviewer} onChange={() => setDraft({ ...draft, reviewer: !draft.reviewer })} style={{ marginRight: 6 }} />
          Reviewer — a second model checks every file change against the brief (+1 small call per edit)
        </label>
        <br />
        <label className="chip" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 8 }}>
          <input type="checkbox" checked={!!draft.textTools} onChange={() => setDraft({ ...draft, textTools: !draft.textTools })} style={{ marginRight: 6 }} />
          Text-protocol tools — for models with no native tool calling (most local models)
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", flexShrink: 0 }}>Economy model</span>
          <input
            value={draft.economyModel || ""}
            onChange={(e) => setDraft({ ...draft, economyModel: e.target.value })}
            placeholder="profileId::model-id (optional — runs scouts + reviewer cheaply)"
            style={{ flex: 1, fontSize: 12 }}
          />
        </div>
        <div className="ag-hint" style={{ margin: "6px 0 0" }}>
          Tip: copy a pin from the model picker — e.g. <code>p_openrouter::meta-llama/llama-3.3-70b-instruct:free</code>.
          Leave empty to use the agent's own model for everything.
        </div>
      </Section>

      {/* Share */}
      {bridge.exportAgent && (
        <div style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={onExport}><Download size={12} /> Export .agent file</button><HelpDot mode="agents" section="exportagent" />
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
