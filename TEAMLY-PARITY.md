# Teamly / Teamily parity review — what they have, what BrainEdge lacks, and whether to build it

*Researched 2026-06-10 from live sites. Closes the standing rider from the Wave A/B/C sessions
("review teamly.ai's agent approach and confirm whether BrainEdge has equivalent functionality").
Report only — nothing implemented.*

## Disambiguation (matters — three products share the name)

| Domain | Product | Relevant? |
|---|---|---|
| **teamly.to** | "Teamly — Your AI Agents, Managed in the Cloud": hire an AI team (Coordinator, Dev, Designer, Analyst, Writer, Researcher, Manager), watch them work in a real-time "Pixel Department," per-agent pricing with credits, runs on Anthropic Sonnet/Opus on THEIR infrastructure | **Yes — this is the workforce-metaphor product the rider meant** |
| **teamily.ai** | "Teamily — Social AI Agent OS": AI-native instant messenger where humans and AI agents share group chats; global memory across chats; personal AI avatar; Gmail/Slack/Notion/GitHub/X integrations; open source | Partially — different category (messenger), a few transferable ideas |
| teamly.ai (domain itself) / teamly.com | Dead JS shell; directory listings point to an old remote-team-bonding SaaS and a PM tool | No |

## Where BrainEdge already has parity or better

Hire-a-team metaphor (personas, crew, Bench, "Put to work") · Relay + Managed teams with real
parallel fan-out · Mission Control live floor (Teamly's Pixel Department is the same idea with
character art) · per-agent memory, triggers (schedule + webhook), track record, handoffs,
mid-mission questions, durable missions, budgets, swarms · **any model, incl. free/local —
Teamly locks you to their hosted Sonnet/Opus and meters it with credits** · user's own keys, no
markup · browser capability · .agent share files. On engine capability, BrainEdge is ahead of
both products.

## The gap table

| # | Capability they have, BrainEdge lacks | Who | Build it? | Reasoning |
|---|---|---|---|---|
| 1 | **Always-on cloud-hosted agents** — agents live on managed infrastructure and work even when the user's machine is off | Teamly | **No (defer; revisit at traction)** | This is their entire business (it IS the product — hosting + credits). BrainEdge's locked-in principle is local-first, user's own keys, no cloud compute backend (§11t decision: don't fake a cloud tier). Building it = real infra, metering, abuse handling, margin management — months. The honest path later: evolve the auth server into an optional paid hosted-runner tier. Not before launch. |
| 2 | **Coordinator concierge** — "tell the coordinator what team you need" and it assembles the team conversationally | Teamly | **YES — highest-value include** | BrainEdge's Designer builds one agent by chat; the team builder is manual. Extending the Designer to propose a whole team (members, mode, line-up, budget) from one sentence reuses existing plumbing (completeOnce + JSON contract, persona library as building blocks). Small build, big "wow," fits the workforce story perfectly. |
| 3 | **Animated agent characters** with working/happy states (webm avatars) | Teamly | **Lightweight version only** | Full character art is an asset pipeline BrainEdge doesn't need. But animated identity states (working pulse, happy flash on clean finish) on the existing glyph Faces in Mission Control/cards is cheap CSS and adds the same liveliness. Skip the pixel-art office; keep the glyph system. |
| 4 | **Persistent global floor view** — one place where the WHOLE workforce's live status is always visible (not per-mission) | Teamly | **Maybe — small version** | Mission Control is per-mission; the Agents screen shows static stats. A compact "what's running now / next scheduled / last finished" board on the Agents screen (data already exists in track record + scheduler + sessions) would cover it. Worth doing after launch-blocking work. |
| 5 | **Per-agent slot + credit pricing** | Teamly | **No** | BrainEdge's BYO-key, any-model economics is the differentiator (their $/agent + credits is strictly worse for the user). Keep subscription + own keys. |
| 6 | **Multi-human group chats with agents as participants** (multiplayer) | Teamily | **No (post-launch question)** | Real-time sync, presence, multi-user permissions — a platform pivot, not a feature. Single-user-with-workforce is BrainEdge's shape. Revisit only if paying teams demand it. |
| 7 | **Global cross-chat memory / auto-built knowledge base** spanning all conversations | Teamily | **Maybe later** | BrainEdge has per-agent memory + global content search, which covers most value with better predictability/privacy. A user-level memory shared across agents is a coherent future add; design carefully (what's injected where, and how the user audits it). Not now. |
| 8 | **Personal AI avatar that learns your style and represents you** | Teamily | **No** | Gimmick relative to BrainEdge's use case; per-agent memory already learns preferences where it matters. |
| 9 | **Public agent sharing / discovery network** | Teamily | **Roadmap (post-launch)** | .agent export/import was explicitly built as the prerequisite for a community story. A public gallery needs moderation + hosting; sequence it after revenue. |

## Bottom line

BrainEdge does not trail either product on agent capability — it trails Teamly on **where agents
run** (their cloud vs your machine) and on **presentation charm** (characters, office view), and
trails Teamily only on **multiplayer/social** dimensions that are out of scope for the current
product shape. The single recommendation worth acting on soon is **#2, the team-assembling
coordinator** — small, differentiating, and it deepens the existing Designer rather than adding a
new subsystem. #3-light and #4-light are cheap polish candidates behind it. Everything else is
either off-strategy (#1, #5, #6, #8) or properly sequenced after launch (#7, #9).

*Sources: teamly.to landing (how-it-works, Pixel Department, pricing/credits, Sonnet/Opus);
teamily.ai about + aiagentsdirectory.com listing (messenger, global memory, avatar, integrations,
open source); serchen.com listing (the unrelated teamly.ai SaaS).*
