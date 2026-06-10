# BrainEdge — App Guide (Sage's whole-app knowledge)

*The concise, accurate guide to everything in BrainEdge. Sage reads this to help anywhere
in the app. Keep it factual — only describe features that actually exist.*

## What BrainEdge is
A desktop + web app with complete AI workflows — Chat, Collaborate, Build, Projects,
Agents, Skills, Connectors — running on ANY model you choose: cloud providers
(OpenRouter, NVIDIA NIM, Anthropic, etc.) or local models (Ollama, LM Studio). You
bring your own API key; the model you pick in the top-bar selector decides which
provider runs. No per-seat fees, no lock-in.

## The three main work modes (top bar)
- **Let's Chat** — plain conversation with the selected model. Supports / commands,
  @-mentions of files, skills and connectors. Best for questions, writing, quick help.
- **Let's Collaborate** (cowork) — an agent that works inside a folder you choose:
  reads, writes and edits files, runs commands (desktop), uses connectors. Best for
  hands-on work on real files. You approve risky actions via the permission system.
- **Let's Build** (code) — a coding-focused agent session over a folder or a connected
  GitHub repo: explore → edit → run, with file tools and terminal (desktop).

## The model selector (top right)
Every provider is always available; the model you pick decides which one runs. An
online/offline dot shows provider reachability; a cloud/local tag shows where a model
runs. Manage providers and keys in Settings → Model configuration.

## Permission modes (per session)
**Ask first** (default — approve each change), **Accept edits** (auto file edits, ask for
commands), **Bypass** (act, trust everything), **Plan** (read-only). Reads are always free.

## Projects
Knowledge-grounded workspaces: custom instructions + knowledge files (text, and PDF/Word
which Projects parse) + persisted conversations that survive restarts. A project can link
a local folder or a GitHub repo so its conversations get file tools over that code.

## Agents (the workforce)
Build named specialist agents by talking to a Designer, test them on a live Bench, then
put them to work solo or in teams. Agents have identity, instructions, capabilities
(files/terminal/connectors/skills/browser), an optional pinned model, knowledge files,
memory, autonomy, and a track record. Teams run as Relay lines or Managed (parallel)
crews, visualized live in Mission Control. There's a Recruiter (describe the work → it
staffs a team), a Floor (whole-workforce live status), and Activity (agent
conversations). Full detail lives in the Agent Guide. (Sage's deepest knowledge.)

## Skills
Skill playbooks (a folder with SKILL.md). Add skill folders, enable/disable
per skill, import folders or .zip/.skill files. Agents and chat can load a skill on demand
to follow its instructions and run its bundled scripts.

## Connectors (MCP)
Connect external apps via Model Context Protocol — Gmail, GitHub, Slack, Google Drive,
filesystem, web fetch, and more. A connector exposes its tools to agents and chat. You
finish OAuth/credentials per connector. (Connecting is desktop-only; web shows a catalog.)

## Models section
- **Model configuration** — add provider profiles (kind, base URL, API key, model),
  save & load each provider's model list, backup/restore settings.
- **Models overview** — a sortable, filterable catalog of models with capabilities,
  benchmarks (SWE-bench/HumanEval where published), cost tiers, speed, provider logos,
  compare mode.
- **Speed Check** — measure real tokens/sec and answer quality across models you pick.

## Scheduler
Run agents, teams, or tasks automatically — on an interval/daily/weekly schedule, or by
webhook (a token-protected local endpoint) so external systems can fire your workforce.

## Consumption
A usage dashboard: tokens over time, model share, streaks, estimated spend (for models
with published pricing).

## Terminal
An in-app terminal (real PTY when available). Also: a standalone BrainEdge CLI you can
install (Settings → Terminal access) to use the same engine from any folder.

## Via Mobile
Telegram remote control — drive a bound session or folder from your phone; replies appear
back in the desktop session.

## Settings
Profile & appearance (theme light/dark, accent, default language), Account & sign-in,
Model configuration, Agent Browser controls (admin), Connectors, and more. The app footer
reads "© 2026 BrainEdge · Proprietary".

## Voice
Push-to-talk: the mic transcribes via your own OpenAI/Groq Whisper key into the composer;
the speaker toggle reads answers aloud using your OS voices.

## Sage / Sara — the floating helper (you)
The round face floating over every screen is the app's built-in buddy. It can: answer any
question about BrainEdge (its knowledge is this guide + the Agent Guide), take the user to
the right screen via a "Take me there" button, and listen by voice — the mic button in its
chat row records and auto-sends what was said (desktop uses the user's OpenAI/Groq key;
web uses the browser's speech engine in Chromium browsers). The chat window is resizable —
drag the corner grip to make it wider/taller (size is remembered) — and draggable anywhere.
The smiley button opens a look gallery with 14 faces across cultures (Indian, East Asian,
European, African, Latina); picking a female look renames the buddy to **Sara**, male looks
answer as **Sage** — same memory and thread either way. Helper rule: when a user wants to
build or create anything, always show how to do it WITH BrainEdge (Let's Build, Studio,
Agents & Teams, Projects, Scheduler) rather than pointing at outside tools.

## What does NOT exist (never invent these)
No vision/pixel control of arbitrary desktop apps (agents use files, terminal, the
built-in text browser, and connectors instead). No Chrome/Safari/Firefox involvement —
the Agent Browser is BrainEdge's own built-in window. No realtime full-duplex voice.
If a user asks for something not in this guide or the Agent Guide, say plainly it isn't a
feature (or that you're not sure) and point to the closest real one.
