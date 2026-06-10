# BrainEdge — Competitive Feature-Gap Research (June 2026)

**Scope:** Consumer feature sets of ChatGPT (OpenAI web/desktop/mobile), Google Gemini (gemini.google.com + app), and xAI Grok (grok.com + X integration), compared against BrainEdge as it ships today. Research date: 2026-06-10, based on official release notes, vendor announcements, and press coverage. Where a feature's current status could not be confirmed from a primary source, that uncertainty is flagged inline. BrainEdge's positioning is different from all three (bring-your-own-key, any model, local-first option, heavy agent/automation tooling), so some "gaps" are deliberate trade-offs rather than failures — the tables try to be honest about which is which.

**Legend:** Gap size ★☆☆☆☆ = cosmetic / nearly at parity … ★★★★★ = major missing category. Effort: S (days), M (1–3 weeks), L (1–2 months), XL (multi-month / new subsystem).

---

## 1. ChatGPT (OpenAI)

| Feature | What it does | BrainEdge today | Gap | Effort |
|---|---|---|---|---|
| **Cross-chat Memory (+ "dreaming")** | Auto-extracts facts/preferences from all chats; memories auto-revise as they go stale ("you went to Singapore in July 2026"); 2x capacity for paid tiers | Per-*agent* memory only; no global user memory across normal chats | ★★★★★ | M |
| **Temporary Chat** | Incognito chat: not saved to history, no memory read/write | No equivalent; all chats persist | ★★★☆☆ | S |
| **Advanced/realtime Voice Mode** | Full-duplex streaming voice (interruptible, emotive), now merged into normal chats; voice + vision | Push-to-talk STT in, OS TTS out — half-duplex, robotic by comparison | ★★★★☆ | L (needs realtime audio APIs; provider-dependent in BYOK model) |
| **Image generation (GPT Image)** | Native in-chat image gen and editing | Vision *input* only; no generation | ★★★★★ | M (route to provider image endpoints: OpenAI, NIM, OpenRouter, local SD) |
| **Sora video (in app + Sora feed)** | Text/image-to-video; social Sora app | None | ★★★☆☆ | L |
| **Canvas** | Side-by-side editable doc/code surface with targeted AI edits, versioning | Artifacts panel is *preview-only* (HTML/SVG/Mermaid/React) — can't co-edit with targeted AI revisions | ★★★★☆ | L |
| **Code Interpreter / Advanced Data Analysis** | Sandboxed Python in chat: run code, analyze CSV/XLSX, render charts, return files | Coding mode + file agent exist but operate on a real folder via permission modes; no zero-setup throwaway sandbox + auto chart rendering in chat | ★★★☆☆ | L (sandbox: Pyodide/WASM or container) |
| **Deep Research** | Multi-step autonomous web research producing long cited reports | Agent browser (text-mode Chromium) exists but no packaged "deep research" mode with citations/report output | ★★★★☆ | M (orchestration on top of existing browser + teams) |
| **Tasks (scheduled)** | Recurring/one-time scheduled prompts with notifications | **Parity-plus:** BrainEdge scheduler (cron-ish) + webhook triggers is arguably more capable; gap is only polish (natural-language scheduling, push notifications) | ★☆☆☆☆ | S |
| **Pulse (proactive daily briefs)** | Once-daily asynchronous research based on memory/chats, delivered proactively as visual cards (web + Atlas, Pro) | Nothing proactive/unprompted; scheduler is user-defined only | ★★★☆☆ | M (build on scheduler + Telegram push) |
| **Agent Mode (ex-Operator)** | Visual computer-use agent: operates a real browser GUI, fills forms, books things | Agent browser is text-mode only; file agent covers local files but not visual web GUI automation | ★★★☆☆ | XL |
| **ChatGPT Atlas (AI browser)** | Standalone Chromium browser with ChatGPT sidebar, browser memories, in-page agent actions | No AI-browser product (different category; desktop app + agent browser partially overlap) | ★★☆☆☆ | XL (likely out of scope) |
| **GPTs + GPT Store** | User-built custom bots, public store, discovery, revenue share | Custom Agents are roughly equivalent (identity/instructions/knowledge/pinned model — and add memory + run history, which GPTs lack); missing piece is *sharing/discovery/marketplace* | ★★☆☆☆ | M (share/export/import agents; gallery) |
| **Connectors (Drive, Gmail, SharePoint, GitHub…)** | One-click OAuth consumer connectors usable in chat + deep research | MCP connectors exist but desktop-only and require technical setup; no curated one-click consumer connectors on web | ★★★☆☆ | M |
| **Projects (shared, with Project Memory)** | Files + instructions + memory scoped to a project; now shareable with teammates | **Near-parity:** BrainEdge Projects (instructions, knowledge incl. PDF/docx, linked folder/GitHub) match or exceed; missing project-scoped auto-memory and multi-user sharing | ★☆☆☆☆ | M |
| **Study & Learn mode** | Socratic tutoring mode, quizzes, step-by-step pedagogy from your documents | None (could be shipped as a built-in Skill/Agent) | ★★☆☆☆ | S |
| **Shopping research / checkout** | Product comparison, deal-finding, memory-personalized suggestions; instant checkout with partners | None | ★★☆☆☆ | L (low strategic fit) |
| **Group chats** | Up to ~20 people in one shared chat with ChatGPT | None (Teams is agent-to-agent, not human-to-human) | ★★☆☆☆ | L |
| **Shared conversation links** | Public read-only link to a conversation | Conversation *export* only — no live share link | ★★★☆☆ | S–M |
| **Native mobile apps** | Full iOS/Android apps with voice, camera, widgets | Web app + Telegram remote ("Via Mobile") — workable but not a first-class mobile experience | ★★★☆☆ | XL (or M for PWA hardening) |
| **Parental controls** | Linked parent/teen accounts, quiet hours, feature disabling, content limits | None | ★★☆☆☆ | M (low priority for BYOK power-user audience) |
| **Search (quick answers with citations)** | Fast web-grounded answers with inline source citations in normal chat | Agent browser can fetch pages, but no lightweight inline search-with-citations toggle | ★★★☆☆ | M |

*Uncertainty notes:* model naming ("GPT-5.4 Thinking" etc.) comes from third-party trackers and is plausible but not load-bearing here. Parental controls were confirmed shipped in late 2025; the Atlas-specific parental options were reported by press and appear current.

---

## 2. Google Gemini (gemini.google.com + app)

| Feature | What it does | BrainEdge today | Gap | Effort |
|---|---|---|---|---|
| **Personal context (cross-chat personalization)** | Learns from past chats by default; can also draw on Search history/Google apps (opt-in) | No cross-chat memory | ★★★★★ | M (same work item as ChatGPT Memory) |
| **Temporary Chat** | 72-hour ephemeral chats, excluded from history/personalization/training | None | ★★★☆☆ | S |
| **Gemini Live (realtime voice)** | Free-flowing full-duplex voice conversations | Push-to-talk + OS TTS | ★★★★☆ | L |
| **Live camera & screen share** | Point your camera or share your screen and talk about it live | None (vision works on uploaded images only) | ★★★☆☆ | L (depends on realtime multimodal APIs) |
| **Image generation (Imagen / "Nano Banana" line)** | In-chat image gen + conversational editing | None | ★★★★★ | M (same item as above) |
| **Video generation (Veo; "Gemini Omni" announced at I/O 2026)** | Text/image-to-video inside the chat | None | ★★★☆☆ | L |
| **Deep Research** | Agentic multi-source research; export to Google Docs / Gmail draft | No packaged equivalent | ★★★★☆ | M |
| **Canvas** | Interactive doc/code/prototype surface, editable with AI, shareable | Artifacts preview only | ★★★★☆ | L (same item as ChatGPT Canvas) |
| **Gems** | Lightweight custom assistants with instructions + files | **Parity-plus:** BrainEdge Agents do more (memory, run history, capabilities, pinned model); Gems are easier to create/share | ★☆☆☆☆ | S (polish: templates, one-click create) |
| **Scheduled Actions** | Recurring/one-off scheduled prompts ("summarize my inbox at 8am") | **Parity-plus:** BrainEdge scheduler + webhooks already exceed this; missing only Google-app data sources and push delivery | ★☆☆☆☆ | S |
| **Daily Brief / "Spark" 24/7 agent (I/O 2026)** | Proactive morning digest from Gmail/Calendar; always-on background agent | Nothing proactive; no consumer mail/calendar connectors | ★★★☆☆ | M–L |
| **Google Workspace integration (Gmail/Docs/Drive/Maps/YouTube "extensions")** | Chat can read/act on your Google data; export results to Docs/Gmail | MCP can theoretically reach these (desktop), but no turnkey consumer integration | ★★★☆☆ | M |
| **App connectors (OpenTable, Canva, Instacart — I/O 2026) + chat-history import from other AI apps** | Third-party actions in chat; one-click migration from competitors | None; import from ChatGPT/Gemini exports would be a cheap differentiator | ★★☆☆☆ | S–M (importer), M (actions) |
| **Agent Mode / Project Mariner-class web agent** | Visual browser automation (multi-task, teach-and-repeat), Ultra tier | Text-mode agent browser only | ★★★☆☆ | XL |
| **Gemini in Chrome** | Browser-level assistant on desktop and (late June 2026) Android | N/A — platform play BrainEdge can't replicate; nearest analog is the desktop app | ★☆☆☆☆ | — (out of scope) |
| **Guided Learning (study mode)** | Step-by-step Socratic tutoring | None | ★★☆☆☆ | S |
| **Audio Overviews / NotebookLM-style podcast generation** | Turn documents into a two-host audio discussion | OS TTS can read text aloud, but no produced audio-overview feature | ★★☆☆☆ | L |
| **Native mobile apps + Android system integration (assistant replacement, "Gemini Intelligence")** | Deep OS hooks, widgets, lockscreen, watch/TV/car | Web + Telegram only | ★★★☆☆ | XL (OS hooks impossible; native app M–XL) |
| **Free tier with generous limits** | Most features free with caps | Different model: BrainEdge is BYOK + Stripe subscription — already "free" if the user brings a free endpoint | ★☆☆☆☆ | — |

*Uncertainty notes:* "Gemini Omni," "Neural Expressive" redesign, Daily Brief, and Gemini 3.5 Flash were announced at Google I/O (May 2026) and are rolling out gradually — exact availability varies by region/tier as of June 2026. The "Spark" agent name comes from press coverage (9to5Google) of I/O 2026.

---

## 3. xAI Grok (grok.com + X)

| Feature | What it does | BrainEdge today | Gap | Effort |
|---|---|---|---|---|
| **Real-time X data integration** | Live search over X posts/trends, citations from the firehose | Nothing equivalent (BrainEdge has Telegram *control*, not X *data*) — unreplicable without xAI's access; partial via web search | ★★☆☆☆ | — (platform moat) |
| **DeepSearch / DeeperSearch** | Agentic real-time research over web + X with synthesized cited reports | No packaged research mode | ★★★★☆ | M (same item) |
| **Grok Imagine (image + video gen, Agent Mode infinite canvas)** | Image gen/edit, 10s 720p video with audio (Imagine 1.0, Feb 2026); May 2026 "Imagine Agent Mode" beta stitches clips into short films on an infinite canvas | None | ★★★★☆ | M for images, L–XL for video/canvas |
| **Grok Voice + Custom Voices** | Realtime voice mode (public rollout June 2026); voice cloning from a short clip via TTS/Voice-Agent APIs | Push-to-talk + OS TTS | ★★★★☆ | L |
| **Companions (Ani, Rudi, Valentine…)** | Animated 3D persona characters with voice and personality | Agents have identity/instructions but no avatar/animation layer | ★★☆☆☆ | L (low strategic fit) |
| **Workspaces / Projects** | Folders with files, custom instructions, sharing; team workspaces in Grok Business | **Near-parity:** BrainEdge Projects cover this; multi-user/team sharing is the missing piece | ★☆☆☆☆ | M |
| **Tasks (grok.com/tasks)** | Scheduled/automated recurring prompts | **Parity-plus:** BrainEdge scheduler + webhooks are stronger | ★☆☆☆☆ | — |
| **Connectors (SharePoint, Outlook, OneDrive, Google Workspace, Notion, GitHub, Linear)** | One-click web connectors in chat | MCP desktop-only equivalent; no curated web connectors | ★★★☆☆ | M (same item) |
| **Grok Studio** | Collaborative artifact/canvas surface (docs, code, browser-executed snippets) | Artifacts preview only; no co-editing, no in-artifact code execution | ★★★☆☆ | L |
| **Agent Tools API (code execution, web/X search, doc retrieval)** | Server-side tool belt for builders | BrainEdge effectively *is* this for end users (MCP, skills, file agent); not a consumer gap | ★☆☆☆☆ | — |
| **Code execution in chat** | Remote sandboxed code run | Coding mode runs on the user's real machine — more powerful, less safe/zero-setup | ★★☆☆☆ | L (sandbox, same item as code interpreter) |
| **X / Tesla distribution** | Built into X apps and Tesla vehicles | N/A — distribution moat, not a feature to copy | — | — |
| **Unhinged/NSFW & persona modes** | Adjustable personality dial | Not present; deliberate non-goal for most products | ★☆☆☆☆ | — |

*Uncertainty notes:* Grok feature names/limits shift frequently; "Grok 4.20," workspace-vs-project naming, and exact voice rollout dates come from a mix of xAI pages and third-party trackers — treat specifics as approximate. The June 4 voice "public rollout" date is from a third-party changelog.

---

## Top 10 recommended (ranked)

1. **Cross-chat user memory (with viewer/editor UI)** — the single biggest UX gap vs. all three competitors; BrainEdge already has agent memory infrastructure to generalize.
2. **Image generation, provider-routed** — table-stakes in 2026; BYOK makes this cheap (OpenAI Images, OpenRouter, NIM, local SD/Flux all behind one "generate" action).
3. **Deep Research mode** — package the existing agent browser + teams orchestration into a one-click "research this, return a cited report" flow; high perceived value, mostly orchestration work.
4. **Realtime voice (full-duplex)** — push-to-talk feels a generation behind ChatGPT AVM / Gemini Live / Grok Voice; start with OpenAI Realtime-compatible endpoints and keep OS TTS as fallback.
5. **Editable Canvas (upgrade the artifacts panel)** — preview-only artifacts vs. Canvas/Studio co-editing is the most visible daily-driver gap for writing/coding users.
6. **Sandboxed code interpreter (in-chat Python + auto charts)** — zero-setup data analysis on uploaded CSVs; Pyodide/WASM keeps it local-first, on-brand.
7. **Temporary chat** — small effort, large trust signal; expected by anyone coming from ChatGPT/Gemini.
8. **One-click web connectors (Gmail/Drive/Calendar/Notion/GitHub)** — bring the desktop MCP power to the web tier with curated OAuth connectors; unlocks Daily-Brief-style automations.
9. **Shareable conversation/artifact links + agent sharing** — export exists, live links don't; also the missing piece that turns custom Agents into a GPT-Store-style ecosystem.
10. **Proactive daily brief ("Pulse-lite")** — build on the existing scheduler + Telegram push to deliver a morning digest; differentiator: user-controlled, BYOK, no data leaves chosen providers.

Honorable mentions: native mobile app (or hardened PWA), study/learn mode (ship as a built-in Skill — near-zero cost), chat-history importer from ChatGPT/Gemini exports, video generation (wait for cheaper APIs).

---

## Already at (or beyond) parity — be honest about strengths

- **Scheduled tasks/automations** — BrainEdge's cron-style scheduler **plus webhook triggers** exceeds ChatGPT Tasks, Gemini Scheduled Actions, and Grok Tasks (none of the three expose webhooks to consumers).
- **Projects** — instructions + knowledge files (PDF/docx) + linked folder/GitHub repo matches ChatGPT Projects/Grok Workspaces; only *multi-user sharing* and *project-scoped memory* lag.
- **Custom Agents vs. GPTs/Gems** — BrainEdge agents have memory, run history, capabilities, and pinned models; GPTs/Gems are shallower. The gap is distribution (store/sharing), not capability.
- **Multi-provider / any-model choice** — none of the three offer it at all; with model catalog, benchmarks, and speed test on top.
- **Local/offline operation** — Ollama/LM Studio support beats all three outright (ChatGPT/Gemini/Grok have zero offline story).
- **Multi-agent orchestration** — Teams (relay + managed-parallel, coordinator re-planning, mission control, budgets, checkpoints) and swarms have no consumer equivalent anywhere.
- **File agent over a real folder with permission modes**; **coding mode + standalone CLI** (competitors' equivalents — Codex, Jules, Grok Code — are separate products or dev-only).
- **MCP connectors (desktop)** — ahead of Gemini, comparable to ChatGPT/Claude desktop ecosystems.
- **Telegram remote control**, **usage/cost dashboard**, **backup/restore**, **global search**, **conversation export** — none are standard across the three competitors.
- **Artifacts preview** (HTML/SVG/Mermaid/React) — at parity with basic Canvas *rendering*; the gap is editing, not display.

---

## Note on Groq (the inference company — not Grok)

Groq, Inc. runs LPU-based inference hardware and a cloud API (GroqCloud) serving open-weight models (Llama, Qwen, GPT-OSS, etc.) plus Whisper for speech-to-text, all behind an **OpenAI-compatible endpoint**. BrainEdge therefore already supports Groq today with zero code changes — a user pastes `https://api.groq.com/openai/v1` and a key. **Recommendation:** no integration work needed beyond (a) adding Groq as a named preset in the provider catalog and (b) optionally wiring Groq Whisper as an alternative STT backend for the voice feature. Its main value to BrainEdge is marketing-adjacent: Groq's raw token speed makes the model speed-test feature look great in demos. Do not confuse with xAI's Grok; a one-line disambiguation in the provider picker UI would prevent user confusion.

---

## Sources

- ChatGPT Release Notes (OpenAI Help Center): https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- ChatGPT Pricing/Plans: https://chatgpt.com/pricing/
- Introducing ChatGPT Atlas (OpenAI): https://openai.com/index/introducing-chatgpt-atlas/
- TechCrunch — "ChatGPT: everything you need to know": https://techcrunch.com/2025/12/22/chatgpt-everything-to-know-about-the-ai-chatbot/
- OpenAI updates tracker (third-party): https://releasebot.io/updates/openai/chatgpt
- ChatGPT updates timeline (third-party): https://appscribed.com/chatgpt-updates-list/
- Gemini Apps release notes (Google): https://gemini.google/release-notes/
- Google blog — Gemini app becomes more agentic (Daily Brief, I/O 2026): https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/
- Google blog — Temporary Chats & personal context: https://blog.google/products/gemini/temporary-chats-privacy-controls/
- Google blog — Gemini Intelligence on Android: https://blog.google/products-and-platforms/platforms/android/gemini-intelligence/
- 9to5Google — Gemini app at I/O 2026 (Neural Expressive, 3.5 Flash, Spark, Daily Brief): https://9to5google.com/2026/05/19/gemini-app-google-io-2026/
- Google AI Pro & Ultra subscriptions: https://gemini.google/subscriptions/
- xAI — Grok product page: https://x.ai/grok
- xAI — Grok 4.1 Fast & Agent Tools API: https://x.ai/news/grok-4-1-fast
- Grok Imagine: https://grok.com/imagine
- Grok tasks page: https://grok.com/tasks
- Grok Business / workspaces docs: https://docs.x.ai/grok/user-guide
- xAI updates tracker (third-party): https://releasebot.io/updates/xai
- Grok changelog (third-party): https://clickup.com/learn/topic/ai/tools/grok/news/
- DataStudios — Grok real-time search & X integration: https://www.datastudios.org/post/grok-real-time-search-how-x-integration-live-web-retrieval-citations-and-agent-tools-turn-xai-s
- TestingCatalog — xAI workspace sharing: https://www.testingcatalog.com/xai-preps-workspace-sharing-as-grok-3-5-model-timeline-shifts/

*Caveat: third-party trackers (releasebot, clickup, blogs) were used for recency triangulation; anything load-bearing above was cross-checked against an official vendor page where possible. Features announced at Google I/O 2026 (May) may still be in staged rollout as of June 10, 2026.*
