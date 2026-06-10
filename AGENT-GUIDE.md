# BrainEdge Agent Guide

*The complete guide to the agent engine — what every capability does, when to reach for it, and nine hands-on scenarios. Updated June 2026 with the Wave A/B/C engine: memory, triggers, track record, handoffs, mid-mission questions, coordinator re-planning, durable missions, .agent share files, RAG-lite knowledge, cost guardrails, and swarms.*

---

## 1. The building blocks

| Block | What it is | Where |
|---|---|---|
| **Agent** | A named specialist: identity + instructions + capabilities (files / terminal / connectors / skills) + optional pinned model + knowledge files | Agents → Agent |
| **Team** | Agents working together: **Relay line** (in order, work flows down) or **Managed** (a coordinator splits, runs everyone in parallel, merges) | Agents → Agents Team |
| **Mission Control** | The live floor view of a running team: stations light up, clear, and stamp their output | Opens beside chat when a team runs |
| **Memory** | Durable learnings each agent keeps across missions | Studio → Blueprint → Memory |
| **Track record** | Persisted run history per agent ("12 missions · 92% clean") | Agent card + Blueprint → Track record |
| **Triggers** | Schedules and webhooks that run agents/teams headless | Scheduler |
| **Swarm** | One agent over a whole list, in parallel | ⧉ button on the agent card |

No code, no API keys per agent — agents run on whatever model your selector points at, or a model pinned per agent.

## 2. The engine capabilities

### Memory — agents that learn
After every successful mission the agent extracts up to three *durable* learnings — your preferences ("lead with risks", "150 words max"), corrections you made, stable domain facts — and applies them on the next mission automatically. Mission content itself is never stored; one-off details age out by design.

- **View / edit / clear:** Studio → Blueprint → *Memory — what this agent has learned*. It's your data; rewrite it freely.
- **Turn off:** untick *Learn across missions* in the same section.
- Memory works everywhere the agent runs: chat, teams, schedules, webhooks.

### Triggers — agents that run while you sleep
Two kinds:

1. **Schedules** — Scheduler → New task → target **"Run an agent"** or **"Run an agent team"**. Interval / daily / weekly. Agents with file tools can be given an optional working folder. Results land in the task's run history, the agent's track record, and its memory.
2. **Webhooks** — enable *Webhook triggers* at the bottom of the Scheduler page. BrainEdge runs a token-protected local HTTP listener:

```
POST http://127.0.0.1:8765/hook/agent/<agent-id>
Authorization: Bearer <token>
{ "prompt": "Triage this: <pasted alert>" }
```

Routes: `/hook/agent/<id>`, `/hook/team/<id>`, `/hook/task/<id>` (+ `GET /hook/ping`). Anything that can POST — a mail rule, Zapier, CI, a cron box — can now fire your workforce. Local-only by default; the token is a password, treat it like one.

### Track record — accountability per agent
Every run is recorded: when, source (chat / team / scheduled / webhook / handoff / swarm), clean or failed, estimated tokens, and a summary of the deliverable. Agent cards show the headline ("12 missions · 92% clean · last 2h ago"); the Blueprint shows the run list.

### Handoffs — `call_agent`
Any solo agent (and chat, when an agent is attached) can delegate a focused sub-task to another roster agent mid-task and use the answer. Interactive handoffs run inside *your* session — the called agent's tool use and permission prompts surface in your UI. One level deep, so no infinite chains. In Managed teams, the **coordinator review** (below) is the team-shaped version of this.

### Mid-mission questions — `ask_user`
When an agent hits a genuine decision it can pause with one question (optionally with suggested answers). A modal appears; your answer becomes the tool result and the mission resumes. Works for solo agents and every team member. On headless runs (schedule/webhook/swarm) the agent is told no user is available and to proceed with its best judgment, stating the assumption.

### Coordinator re-planning — conditional flows v1
In Managed missions, after the parallel wave the coordinator *reviews* the results and decides: done, or up to two follow-up waves of new sub-tasks ("Scout found nothing → send Radar"). It can recruit agents from your whole bench, not just the fixed line-up. This delivers most of a branching-workflow engine with none of the node-graph complexity.

### Durable missions — crash → resume
Team missions checkpoint after every member completes. If the app dies (or you close it) mid-mission, reopening that conversation shows **"Mission interrupted — N steps already done"** with a *Resume mission* button. Completed stations are restored from the checkpoint; only the remaining ones run.

### Cost guardrails — token budgets
Set a per-mission budget on a team (team builder → *Mission budget*), or a global default (`missionTokenBudget` in settings). Mission Control shows a live meter; at the cap the mission hard-stops cleanly, delivers what exists, and tells you how to raise the cap and resume. Tokens are estimated (~4 chars/token), the same basis as the Consumption view.

### RAG-lite knowledge — drop a folder of docs on an agent
Knowledge files are no longer crammed whole into the prompt. Small libraries are included verbatim (unchanged behavior); large ones are chunked along headings/paragraphs and only the passages relevant to *this* task are retrieved. The cap rises from 8 files to 24, and large files stop crowding out instructions. No embeddings, no index, no extra cost.

### Agent Browser — agents that drive a real browser
Switch on the **Browser** capability and the agent gets a real, visible Chromium window (BrainEdge's own — no extra install). It browses in *text mode*: pages come back as readable text plus a numbered list of interactive elements, so **any model works — no vision required**. Tools: `browse_open`, `browse_read`, `browse_click [n]`, `browse_fill [n]`, `browse_back`.

Safety, because web pages are hostile input: reading is free, but every navigation, click, and form-fill goes through your permission system; an optional **per-agent site allowlist** confines it (redirects off-list are blocked too); **password and payment fields are always refused** — the agent must hand those to you; and page text is wrapped in an UNTRUSTED marker so instructions embedded in webpages are treated as data, not commands. The window is visible the whole time — you watch every move, and you can take over with your own mouse whenever you like.

What it's NOT: vision-driven pixel control of arbitrary apps (Operator/Mariner class). That remains deliberately unbuilt — flaky, model-restricted, and months of work for marginal gain at this stage.

### Voice — push-to-talk in, spoken replies out
The mic button records while active; click again to stop, and the audio is transcribed through **your own** Whisper-capable key (OpenAI or Groq — auto-detected from your profiles) straight into the composer. The speaker toggle next to the model picker reads final answers aloud using your OS's built-in voices — free, offline, works everywhere. Realtime full-duplex voice (OpenAI Realtime / Gemini Live) is deliberately not built: provider-locked plumbing that fights BrainEdge's any-model design.

### .agent share files + versions
- **Export:** Studio → Blueprint → *Export .agent file*. Portable JSON: instructions, capabilities, knowledge, identity. Memory and model pins deliberately stay private.
- **Import:** Agents tab → *Import .agent*. Imported agents get a fresh id.
- **Versions:** every Studio save snapshots the previous blueprint (last 10). Blueprint → *Versions* → Restore loads any of them back into the Studio.

### Swarms — one agent × a whole list
The ⧉ button on an agent card opens the swarm runner: paste a list (one item per line), write a brief with `{item}` in it, pick parallelism (1–6), run. Each item is a full headless mission; progress streams live; the result is one compiled report. Swarm runs count toward the agent's track record.

---

## 3. Scenarios — the playbook

### Scenario 1 · Your first hire (5 min)
Build **Briefly**, a summarizer, by typing one sentence to the Designer: *"An agent called Briefly that turns any text into exactly 3 bullet points, max 15 words each."* Interview it on the Bench, then *Put to work* and paste a long article.
**What you learn:** the Designer→Bench→work loop.

### Scenario 2 · Hands on the files (5 min)
Hire **Quant** from the crew, *Put to work*, pick a folder with a CSV, ask: *"profile the data — 3 most interesting findings."* Approve its file/terminal moves as they appear.
**What you learn:** capabilities and the permission system.

### Scenario 3 · The assembly line (7 min)
Relay team **Digger → Drafter → Polisher**; brief: *"a blog post on why small businesses should adopt AI agents."* Watch stations clear in order in Mission Control.
**What you learn:** relay chaining — each agent builds on the last.

### Scenario 4 · The factory floor (7 min)
Managed team **Adsmith, Faqster, Socialite, Mailwright**; brief: *"launch kit for BeanBox, a coffee subscription."* All four glow at once; the coordinator merges one launch kit.
**What you learn:** parallel fan-out and synthesis.

### Scenario 5 · The grand finale (8 min)
Chain all three architectures by hand: Briefly profiles the customer → the Launch Crew builds the kit from those bullets → the Blog Line turns the kit into a post.
**What you learn:** outputs of one architecture feed the next.

### Scenario 6 · The agent that remembers (5 min) — *memory*
Build **Memo** (*"turns my rough notes into a weekly status update: Wins, Risks, Next"*). Run it; then correct it: *"always lead with risks, keep it under 150 words."* Tomorrow, run it on new notes — it leads with risks, under 150 words, unprompted. Open Blueprint → Memory and you'll see the learning verbatim; edit or clear it at will.
**What you learn:** corrections become permanent without re-engineering instructions.

### Scenario 7 · The overnight worker (6 min) — *triggers + track record*
Hire **Radar** (what-changed briefs). Scheduler → New task → *Run an agent* → Radar → weekly, Monday 07:00, prompt: *"What changed in AI agent platforms this week?"* Then enable **Webhook triggers**, copy the curl example, and fire it once from a terminal to prove the loop. Next morning Radar's card reads "2 missions · 100% clean."
**What you learn:** the same agent serves schedules, webhooks, and chat — and its history accumulates across all of them.

### Scenario 8 · The team that asks first (7 min) — *ask_user + re-planning + resume*
Brief a Managed team with something deliberately ambiguous: *"plan our product launch."* Expect: (1) a member pauses with a question — budget? audience? — answer it in the modal and watch work resume; (2) after the wave, **Coordinator review** either declares done or dispatches a follow-up wave; (3) kill the app mid-mission, reopen the conversation, click **Resume mission** — completed stations restore from the checkpoint.
**What you learn:** human-in-the-loop decisions, conditional follow-ups, and durability.

### Scenario 9 · Swarm the list (6 min) — *swarms + budgets*
Take any researcher agent, click ⧉ on its card, paste 20 company domains, brief: *"Research {item} and produce a 3-bullet profile: what they do, size, one recent move."* Parallel 4. Watch the pool chew through the list; copy the compiled report. For teams doing big missions, set a *Mission budget* first and watch the meter in Mission Control.
**What you learn:** volume work and cost discipline.

### Scenario 10 · The web runner (7 min) — *agent browser*
Build **Pricecheck** (*"compares product prices and summarizes the best option"*), switch on **Browser**, and set Allowed sites to a couple of retailer domains. Brief it: *"Find the current price of the Logitech MX Master 3S on these sites and tell me which is cheapest."* Watch the Agent Browser window open beside you: it navigates (asking your permission), reads each page as text, clicks through to product pages, and reports back with the numbers. Try asking it to log into something — it will refuse the password field and hand the window to you.
**What you learn:** permission-gated browsing, allowlists, and the human-only credential rule.

### Scenario 11 · Hands-free briefing (3 min) — *voice*
Turn on the speaker toggle next to the model picker. Click the mic, say *"give me a two-paragraph summary of what my agents did this week,"* click again — the transcript lands in the composer; send it and the answer is read back aloud. Needs any OpenAI or Groq key for the transcription half; the speech half is your OS, free.
**What you learn:** the full voice loop without a single new account.

---

## 4. Good practice

- **One job per agent.** "Researches and writes and posts" makes a worse agent than three sharp ones on a relay.
- **Let memory work.** Correct the agent in plain words instead of editing instructions for one-off preferences; durable ones graduate into memory automatically.
- **Headless = bypass.** Scheduled/webhook/swarm runs auto-approve their own tools (there is nobody to ask). Only give file/terminal capabilities to triggered agents you trust with the chosen folder.
- **Budget the big ones.** Any Managed team that can re-plan deserves a token budget — re-planning is powerful and not free.
- **Export before big edits.** A .agent file plus the version history makes every experiment reversible.

## 5. Capability availability matrix

| Capability | Chat / solo | Team member | Scheduled / webhook | Swarm |
|---|---|---|---|---|
| Knowledge (RAG-lite) | ✓ | ✓ | ✓ | ✓ |
| Agent Browser | ✓ (permission-gated) | ✓ (permission-gated) | ✓ (auto-approved — allowlist it) | ✓ (auto-approved — allowlist it) |
| Memory (read + learn) | ✓ | ✓ | ✓ | read only |
| ask_user | ✓ | ✓ | told to self-decide | told to self-decide |
| call_agent | ✓ | — (coordinator re-plans instead) | ✓ (one level) | ✓ (one level) |
| Track record | ✓ | ✓ | ✓ | ✓ |
| Checkpoints / resume | — | ✓ (team missions) | — | — |
| Token budget meter | — | ✓ (team missions) | — | — |

*Note: ask_user and call_agent run on the self-built tool loop (OpenAI-compatible providers — NIM, OpenRouter, local, DeepSeek, Gemini…). On Anthropic-SDK sessions the Agent SDK's own subagent machinery applies instead.*
