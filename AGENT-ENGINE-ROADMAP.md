# Agent Engine Roadmap — Making BrainEdge's Agents Best-in-Class
*Researched June 2026 against OpenAI (AgentKit/Agents SDK), Anthropic (Agent SDK/Skills), Google (Gemini Enterprise/ADK/A2A), Microsoft Copilot Studio, Lindy, Relevance AI, CrewAI, LangGraph. Plain-English advice; no code changed yet.*

---

## Where BrainEdge already competes

Solo agents with identity/instructions/knowledge/tool toggles · build-by-chat Designer + live Bench (OpenAI's best UX, matched) · Relay + Managed teams with **parallel fan-out** (matches Lindy swarm-lite, CrewAI crews) · Mission Control live visualization (almost nobody has this for consumers) · per-member pinned models (rare!) · MCP connectors · skills · permission modes (real HITL for tools) · agents re-attach to conversations · model-selector economics (no per-seat agent pricing). The foundation is genuinely strong.

## The gap table (what the market has that BrainEdge lacks)

| # | Capability | Who has it | BrainEdge today | Impact |
|---|---|---|---|---|
| 1 | **Persistent agent memory** (learns across sessions) | Everyone — OpenAI Sessions, Claude memory tool, Google Memory Bank, CrewAI unified memory | None — every mission starts amnesiac | ★★★★★ |
| 2 | **Triggers** — agents run on schedule/events (email arrives, webhook fires) | Lindy/Relevance/Copilot Studio built their businesses on this | Scheduler exists but can't run agents/teams | ★★★★★ |
| 3 | **Agent-as-tool / handoffs** (agents call each other mid-task) | OpenAI handoffs, Claude subagents, A2A protocol | Teams are fixed line-ups; no dynamic delegation | ★★★★ |
| 4 | **Per-agent run history & analytics** (success rate, cost, traces) | OpenAI Evals, Google dashboards, LangSmith | Mission Control is live-only; nothing persists per agent | ★★★★ |
| 5 | **Workflow branching/loops/conditions** (if-this-then-that-agent) | CrewAI Flows, LangGraph, Lindy, OpenAI Agent Builder canvas | Only straight relay or parallel fan-out | ★★★★ |
| 6 | **Mid-mission "ask the human"** (agent pauses with a question, resumes with your answer) | LangGraph interrupts, Relevance confidence-escalation | Permissions gate tools, but agents can't ask decisions | ★★★★ |
| 7 | **Durable missions** (checkpoint every step; crash → resume, not restart) | LangGraph (gold standard), CrewAI Flow persistence | A killed mission is gone | ★★★ |
| 8 | **RAG retrieval for knowledge** (find relevant passages, not stuff whole files) | Everyone with vector stores | Knowledge = whole files crammed into the prompt (caps at ~8 docs) | ★★★ |
| 9 | **Agent versioning + single-agent share file** (.agent export, rollback) | OpenAI Agent Builder versions, Skills API, LangGraph Assistants | All-or-nothing settings backup only | ★★★ |
| 10 | **Agents exposed as API/webhook** (other systems call your agent) | All enterprise platforms; Relevance embeds | Telegram only (Via Mobile) | ★★★ |
| 11 | **Cost budget per agent/mission** (stop at $X) | Copilot capacity packs, LangSmith cost tracking | Usage stats exist, no caps | ★★ |
| 12 | **Browser/computer use** (agent drives a real browser) | OpenAI Operator, Claude computer use, Mariner, Lindy Autopilot | web_fetch on web cowork only | ★★ (huge but heavy) |
| 13 | **Agent swarms** (100 instances of one agent over a task list) | Lindy Swarms, Mariner concurrent | One instance per mission | ★★ |
| 14 | **Voice agents** | OpenAI Realtime, Gemini Live, Lindy phone | Mic button stub | ★ |

## The advice: three waves to the best agent engine

### Wave A — "Agents that remember and act on their own" (the productivity multiplier)
1. **Agent memory** — each agent gets a memory file (auto-summarized learnings after each mission, injected next time; user-viewable/editable in Blueprint — "what Scout has learned"). Claude's memory-tool pattern, fits your storage today.
2. **Triggers** — wire the existing Scheduler to agents & teams (target: agent/team + schedule), then add **webhook triggers** via the auth server (`/hook/<agent-id>` → runs the agent headless, emails/stores the result). This single wave turns agents from chat companions into a workforce that works while you sleep — it's why Lindy and Relevance exist.
3. **Per-agent run history** — persist every mission (when, what, outcome, tokens, duration) on the agent; agent cards show "12 missions · 92% clean"; click → past deliverables. (Your usage-store + sessions-store already capture most of this — it needs joining, not inventing.)

### Wave B — "Agents that collaborate intelligently" (the scale unlock)
4. **call_agent handoffs** — any agent (and chat) can invoke roster agents as tools mid-task; the Coordinator can recruit beyond the fixed line-up. This was already on your roadmap; the market confirms it's table stakes.
5. **Mid-mission questions** — an `ask_user` tool: the mission pauses, Mission Control shows the question, your answer resumes it. Pairs perfectly with your permission system.
6. **Conditional flows v1** — no visual canvas yet; just let the Managed coordinator re-plan after each member returns ("if Scout found nothing, send Radar; else go to Drafter"). 80% of branching value, 5% of a workflow engine's complexity.
7. **Durable missions** — checkpoint after every member completes (you already snapshot outputs in memory; persist them); reopening a crashed mission offers "Resume from step 3". LangGraph made this its moat; for long multi-agent runs it's the difference between toy and tool.

### Wave C — "Agents as a platform" (the 100k-user differentiators)
8. **.agent share files + versioning** — export/import one agent (with knowledge); keep last N versions with rollback. Prerequisite for any community/marketplace story.
9. **RAG-lite knowledge** — chunk knowledge files and retrieve only relevant passages per task (start with smart keyword/heading retrieval; embeddings later via the user's own provider). Lifts the 8-file cap to "drop a whole folder of docs on an agent."
10. **Cost guardrails** — per-mission token budget; Mission Control shows a live meter; hard-stop + ask when exceeded.
11. **Agent swarms** — run one agent over a list (CSV/lines) with your existing parallel pool; Mission Control already visualizes concurrency.
12. *(Later, heavy)* browser/computer use and voice — wait for your user demand signal; they're months of work each and the above waves out-earn them.

## What NOT to copy
- **Visual node-graph builders** (OpenAI canvas, Copilot Studio) — your Designer-chat + plain-language teams are *more* non-developer-friendly than node spaghetti; conditional flows v1 covers the need without the complexity tax.
- **A2A protocol** — cross-vendor agent federation matters at enterprise scale, not at your stage; revisit at real traction.
- **Hosted eval suites** — your Test Center already covers the QA story at the right size.

## Sequencing recommendation
Wave A first (memory → triggers → history): smallest builds, largest daily-felt difference, and every demo writes itself — "my agent remembered, ran overnight, and here's its track record." Then B4 (call_agent) and B5 (ask_user) together — they share plumbing. Everything else follows demand.

*Full platform research (with sources) preserved in the session notes; this document is the decision layer.*

---

## ✅ Shipped — June 2026 (Waves A, B & C)

All three waves are implemented. See **AGENT-GUIDE.md** for the user-facing guide with nine scenarios.

| # | Capability | Where it lives |
|---|---|---|
| A1 | Agent memory (learn/view/edit/clear, per-agent toggle) | `electron/agent-memory.cjs` · Studio Blueprint → Memory |
| A2 | Triggers — Scheduler runs agents & teams; webhook server (`/hook/agent|team|task/<id>`, token-protected) | `electron/webhook-server.cjs`, `task-runner.cjs` · Scheduler page |
| A3 | Per-agent run history ("12 missions · 92% clean" on cards; run list in Blueprint) | `electron/agent-history.cjs` |
| B4 | `call_agent` handoffs (solo agents + chat; coordinator recruits from the bench) | `electron/agent-openai.cjs`, `session-manager.cjs` |
| B5 | `ask_user` mid-mission questions (modal pauses/resumes the mission) | `agent-openai.cjs` · App question modal |
| B6 | Conditional flows v1 — coordinator review + follow-up waves after the parallel fan-out | `session-manager.cjs` `_teamTurn` |
| B7 | Durable missions — per-member checkpoints, "Resume mission" banner | `electron/mission-store.cjs` |
| C8 | .agent export/import + last-10 version history with restore | `electron/agent-files.cjs` |
| C9 | RAG-lite knowledge retrieval (cap 8 → 24 files; per-task passage selection) | `electron/knowledge-retrieval.cjs` |
| C10 | Cost guardrails — per-team token budget, live meter in Mission Control, hard-stop | `session-manager.cjs` · TeamOps meter |
| C11 | Swarms — one agent × a list, parallel pool, compiled report | `electron/mission-runner.cjs` · ⧉ on agent cards |
| 12* | **Agent Browser** (scoped) — agents drive a real visible Chromium window, text-mode (any model, no vision); permission-gated, per-agent site allowlist, credential/payment fields human-only, untrusted-content framing | `electron/agent-browser.cjs` · Browser capability in the Studio |
| 14* | **Voice** (scoped) — push-to-talk via the user's own Whisper key (OpenAI/Groq); spoken replies via OS speech synthesis | `electron/voice.cjs` · mic + speaker toggle |

*12 and 14 are deliberately scoped: vision-pixel control (Operator-class) and realtime full-duplex voice remain unbuilt pending user demand — both are months of provider-locked work the scoped versions out-earn.*

Deliberately not built (per the research): visual node-graph builder, A2A protocol, hosted eval suites, vision-driven computer use, realtime voice.