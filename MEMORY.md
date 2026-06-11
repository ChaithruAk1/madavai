# BrainEdge — Project Memory

> Resume file. If the chat is lost, read this first to pick up exactly where we left off.
> Last updated: 2026-06-08 — auth + monetization, full WEB app, provider proxy, web folder access,
>   default language, code obfuscation, deploy config, reusable auth-kit skill. **Section 11 (bottom) is
>   now the most current authoritative state.**
> NOTE: Sections 1–9 below are older. **Section 10/11 (bottom) is the current authoritative state** and
> corrects stale facts (app is now "BrainEdge" not "Chai"; bridge is `window.brainedge`; the "Dispatch"
> feature was renamed; copyright owner is Samskruthi Harish). Read Section 10 first.
>
> ⚡ NEWEST STATE: see **§14 (very bottom)** — 2026-06-11: full code review (CODE-REVIEW-2026-06-11.md) +
> ALL findings fixed (5 high / 12 med / 14 low + error boundary) + project-scoped Let's Collaborate
> (categorized project Chats/Tasks, "Start work in Let's Collaborate"). Still ONE big uncompiled diff.
> Older context: §13 — 2026-06-10/11 sessions. After the user committed the
> HARNESS batch, ONE large uncommitted diff added: 6 competitive-gap features (cross-chat memory,
> in-chat office files, selector image-gen, Study&Learn tutor, editable canvas, daily brief) + Sage
> rounds (Windows mic, walkthrough mode, scope-lock, learning memory, multicultural looks/Sara) +
> chat humanization (tool cards, command translation, WorkStrip) + attachment/Excel parsing + browser
> page-trim perf + agent-picker fix + many UI fixes. **GATES: `npm install` (done) → `npm run build`
> → FULL restart → commit. NOTHING compile-checked (sandbox down all arc).** Standing QUEUE: Deep
> Research mode, Shareable links, screenshots-in-agent-knowledge, Designer-follow-up robustness,
> local-model capability registry, minimize-but-full-speed browser toggle, Save-button bug (console
> output still owed). Standing rules: Sage = app-only/no-web; every new tool needs a ToolCard
> describe() entry; styles.css targeted edits only; single-writer; web+desktop parity.

---

## 1. What BrainEdge is

A desktop app (Electron + React + Vite) that **replicates Claude Desktop's functionality — Chat,
Cowork, Code, Projects, Skills, Connectors — but runs on ANY LLM** (Anthropic, external cloud like
OpenRouter/NIM, or local Ollama/LM Studio). Built by Chaithrodaya Sukruth (chaithru@gmail.com).

Two guiding principles:
1. Match Claude Cowork's features.
2. Simple, efficient, flexible use of Anthropic + external + local models — **no proxy required**.

Origin: inspired by `free-claude-code` (a CLI proxy). We deliberately did NOT use a proxy — BrainEdge
talks to providers directly and runs its own agent loop.

## 2. Locations / run / commit

- Repo (local): `C:\Projects\ClaudeCodeUI\BrainEdge`
- GitHub remote: `https://github.com/chaithruak/brainedge.git` (branch `main`)
- Settings file at runtime: `%APPDATA%\brainedge\chai-settings.json`
- Run (browser UI, mock data): `npm install` then `npm run dev` (http://localhost:5174)
- Run (full desktop app): `npm run electron:dev`
- **Build the Windows installer (after changes):** `npm run electron:build` → outputs NSIS setup + portable .exe to `release/` (electron-builder --win). Bump `package.json` "version" first.
- **Main-process changes (electron/*.cjs) require a FULL restart** (Ctrl+C then `npm run electron:dev`);
  renderer changes (src/**) hot-reload.
- Commit (PowerShell 5 has NO `&&` — separate lines):
  ```
  git add -A
  git commit -m "message"
  git push
  ```
- `.gitignore` excludes node_modules/dist/release. NEVER commit node_modules (electron.exe + claude.exe
  are >100MB and GitHub rejects them).

## 3. Architecture

```
React UI (src/) ──IPC── Electron main (electron/) ── providers / agent loops ── LLM + MCP + skills
```

- **Bridge**: renderer talks to main via `window.chai` (electron/preload.cjs), abstracted in
  `src/bridge/index.js` (= window.chai, or mockBridge in a plain browser). The contract is in
  `src/bridge/contract.js`. All UI events flow as normalized `UiEvent`s (kinds: init, assistant_delta,
  assistant_message, tool_use, tool_result, permission_request, permission_denied, result, error).
- **Provider profiles**: each profile = { id, name, kind ("openai"|"anthropic"), baseUrl, apiKey, model }.
  `kind` picks the wire format; baseUrl picks destination. Stored in settings.profiles; one is active.
- **Modes** (one engine, different presets):
  - `chat` → plain streaming (providers.streamChat). If skills/connectors configured AND profile is
    openai-kind, routed through the tool loop (skills + connectors, no file/shell, streaming on).
  - `code` / `cowork` / `project` → agent loop with file/shell tools.
- **Two agent transports**, routed by profile kind in session-manager `_agentTurn`:
  - openai-kind → `electron/agent-openai.cjs` (BrainEdge's OWN tool-calling loop — this is the main path
    for external models, the user's objective).
  - anthropic-kind → `electron/agent-transport.cjs` (Claude Agent SDK, for Anthropic or a proxy).
- **Permission modes** (user-selectable in top bar): `default` (ask before changes), `acceptEdits`
  (auto edits, ask for bash), `bypassPermissions` (act, trust all), `plan` (read-only). Enforced in
  both transports. Reads + load_skill are always auto.
- **Connectors (MCP)**: `electron/mcp-manager.cjs` connects stdio MCP servers, exposes their tools as
  OpenAI function schemas (`mcp__<server>__<tool>`), routes calls back. MCP tools always ask unless bypass.
- **Skills** (Claude-style progressive disclosure): `electron/skills-manager.cjs` recursively scans one
  or more skill folders for SKILL.md (frontmatter name/description). The lightweight index is injected
  into the system prompt every turn (real-time); the agent calls a `load_skill` tool to pull full
  instructions, then runs bundled scripts via run_bash. Works in ALL modes.

## 4. Phase status

- **Phase 1 — DONE**: multi-provider chat, streaming, live model discovery via /v1/models, provider
  profiles, Settings panel.
- **Phase 2 — DONE**: Cowork/Code agent on external models (own loop), permission modes, Cowork-style
  tool cards + permission modal, folder picker.
- **Phase 3 — IN PROGRESS**:
  - DONE: Connectors (MCP) — manager, agent integration, IPC, Connectors UI. (Tested: works.)
  - DONE: Skills — manager, progressive disclosure across chat/code/cowork/project, Skills UI. (Tested: works.)
  - DONE: multi skill folders + recursive discovery + real-time index refresh + import (folder +
    .zip/.skill) + per-skill enable/disable toggle + delete. (Pending test on user's machine.)
  - DONE: **Projects** (Claude-Projects style) — persisted projects with custom instructions + knowledge
    (text + file import) + persisted conversations (survive restart, resume). `project` mode is a
    knowledge-grounded CHAT workspace. Conversations use skills/connectors too.
    Files: electron/projects-store.cjs, ProjectsBrowser.jsx, session-manager._projectTurn.
  - DONE: **Project file source** — link a local folder OR a GitHub repo (cloned via `git clone --depth 1`
    to userData/projects-data/repos/<projectId>). When linked, project conversations get file tools over
    that folder (cwd). IPC: linkProjectFolder/linkGithub/pullGithub/unlinkProjectSource.
  - DONE: **Gmail/OneDrive (+GitHub/Slack/GDrive) connector presets** in Connectors; project detail has a
    "Connections" quick-connect that adds the MCP connector (user still finishes OAuth/creds in Connectors).
  - DONE: **Dispatch** = background + scheduled tasks. electron/dispatch-store.cjs (tasks+runs),
    dispatch-runner.cjs (headless turn, permMode "bypass"), main.cjs scheduler (setInterval 60s, isDue:
    interval/daily/weekly), Dispatch.jsx panel (target chat/project/folder, schedule, Run now, run history).
    Sidebar "Dispatch" entry. This also covers the Claude-style "Scheduled" tasks request.
  - NOT STARTED: conversation search, polish (real edit diffs, stop button, markdown/code rendering),
    installer (electron-builder), OS-keychain key storage. File/knowledge is TEXT only (no PDF/docx parse).
  - DONE (autonomous batch while user away): 
    * Claude Code: added search_text (grep) + find_files (glob) tools + walkFiles; code-mode system prompt
      (explore→edit, surgical). agent-openai.cjs.
    * DESIGN: full restyle to "Aurora Noir" — near-black + electric-iris(#6e7bff)/cyan(#38e8d0) accent,
      hairline borders, glass topbar, glow accents. styles.css fully rewritten.
    * Sidebar: bold glossy redesign — gradient "new session" button, glossy mode tiles with gradient icon
      chips + active glow, real recent projects (bridge.listProjects), bottom tools rail. Sidebar.jsx + CSS.
    * Settings improvements: removed free-cc proxy (default + migration deletes p_proxy); model picker is the
      single source of truth (all providers always available, picked model decides provider); online/offline
      ping dot in topbar (providers.ping + chai:pingProvider, re-pings every 30s); cloud/local tag per model
      and in topbar (isLocal = localhost test).
    * Connect your apps: Connectors.jsx rebuilt as an app gallery (Gmail/OneDrive/GDrive/GitHub/Slack/
      Filesystem/Fetch cards, one-click add) + manual MCP + per-connector creds/test. Cloud apps still need
      OAuth/tokens (verify exact npm package names — some may be wrong/renamed).
    * Live Artifacts: src/artifacts.js (extractArtifacts/artifactSrcDoc), ArtifactPanel.jsx (Preview iframe
      sandbox + Code tabs), Message.jsx shows "Open artifact" pill, App splits chat | artifact (.work-split).
  - ALL OF THE ABOVE is PENDING TEST — written without a clean build (degraded sandbox mount). First
    `npm run electron:dev` is the real test.

## 5. File map

electron/ (main process, CommonJS .cjs):
- `main.cjs` — BrowserWindow, all IPC handlers (start/sendInput/interrupt/permission, settings, models,
  chooseFolder, testConnector, listSkills/createSkill/importSkillFolder/importSkillZip).
- `preload.cjs` — exposes window.chai.
- `session-manager.cjs` — per-session state; routes modes to chat / chat-with-tools / agent transports;
  permission resolve/interrupt; passes connectors + skillsDirs.
- `providers.cjs` — streamChat (OpenAI + Anthropic SSE), streamChatTools (OpenAI tool-calling stream),
  listModels.
- `agent-openai.cjs` — the self-built tool loop (file/shell tools, MCP, skills, permissions). MAIN path.
- `agent-transport.cjs` — Claude Agent SDK wrapper (anthropic-kind only).
- `mcp-manager.cjs` — MCP client (connect/openAiTools/callTool/testServer/disconnectAll).
- `skills-manager.cjs` — discover (recursive, multi-dir)/indexText/loadSkill/createStarter.
- `settings.cjs` — load/save/activeProfile; DEFAULTS (profiles, connectors, skillsDirs, disabledSkills);
  migrates skillsDir→skillsDirs.
- `projects-store.cjs` — projects + conversations + knowledge persisted to userData/projects-data/;
  CRUD + projectSystem() (instructions+knowledge → system prompt). Projects can link a folder or a GitHub
  repo (cloned to projects-data/repos/<id>) → conversations get file tools over it.
- `task-store.cjs` + `task-runner.cjs` (RENAMED from dispatch-store/dispatch-runner) — background/
  scheduled tasks (tasks+runs persisted in `task-data/`; headless runner uses permMode bypass; runner
  now also accepts `history`+`systemOverride` so a session can be continued from Telegram). main.cjs has
  a 60s scheduler (interval/daily/weekly), event `brainedge:taskRun`.
- `viamobile-log.cjs` (RENAMED from dispatch-log.cjs) — log of remote "Via Mobile" requests; add/list/
  remove/clear; persisted to `brainedge-viamobile-log.json` (keeps last 2000).
- `telegram-bot.cjs` — Telegram Bot API long-poll remote control; reuses task-runner; honours a mobile
  link to continue a Let's Collaborate session and write replies back; `/start` and `/unlink`.
- `mobile-link.cjs` — binds ONE cowork session `{sessionId,title,cwd}` to the bot (get/set/clear).
- `providers.cjs` also exports `ping(profile)` for the online/offline indicator.

src/ (renderer, React):
- `App.jsx` — top-level state, UiEvent reducer → timeline, mode routing, model picker, permission change.
- `bridge/{contract.js,index.js,mockBridge.js}`.
- `components/`: Sidebar, Topbar (+ ModelPicker + PermissionPicker), Message, ToolCard (Cowork-style),
  PermissionModal, Composer, Settings (providers), Connectors (MCP), Skills (folders/import/toggle/
  delete), ProjectsBrowser (projects list + instructions + knowledge + conversations).
- App.jsx: `projectCtx` state drives Projects — Projects sidebar item shows ProjectsBrowser; opening a
  conversation loads its saved messages into the timeline and binds sends to {mode:"project",projectId,
  conversationId}. `backToProjects()` returns to the browser. `artifact` state + ArtifactPanel split.
- More components: Dispatch.jsx (tasks/schedule/runs), ArtifactPanel.jsx, src/artifacts.js.
- Sidebar.jsx redesigned (glossy mode tiles + tool rail). Topbar shows online dot + cloud/local tag.
- `styles.css` — dark terracotta theme.

Docs: `ARCHITECTURE.md` (Session Manager spec — note it predates BrainEdge rename, still says "Chai" in
places), `ROADMAP.md` (3-phase plan), `README.md`, this `MEMORY.md`.

## 6. Key decisions & gotchas

- App display name = **Chai** (tea theme; boiling tea-cup logo in Sidebar brand). IMPORTANT: the
  *visible* name is Chai but the internal package id / userData folder stays **brainedge** (package.json
  name + build.appId unchanged) so settings/projects/conversations are NOT orphaned. Do not change
  package.json "name" or you'll move %APPDATA%\brainedge and lose data.
- Settings is now 3 sections: Profile, Account & sign-in (Google PKCE OAuth via main.cjs chai:googleSignIn
  — needs a user-supplied Google Client ID; Anthropic account link = flag + `claude login`), Model
  configuration (the providers). account/{name,email,avatar,googleLinked,anthropicLinked} + googleClientId/
  Secret live in settings.
- Settings clobber bug (FIXED): App and Settings panels both wrote settings; the model picker overwrote
  the file with a stale copy, wiping providers/keys. Fix: every write re-reads from disk first
  (App.selectModel does `bridge.getSettings()` before saving). Keep this pattern for any new writer.
- Agent claimed "Created folder" BEFORE approval (FIXED): in agent-openai, pre-tool assistant text is
  suppressed; only the FINAL answer (no tool calls) is shown. Chat streams live (no mutating tools).
- Weak models dump raw JSON / don't list results: system prompt tells them to present results readably
  but never paste JSON; Message.jsx `cleanAssistant` also strips a leading JSON blob. Quality tracks the
  model — use tool-capable models (DeepSeek, Qwen-Coder, Kimi, Llama-instruct) for agent/skill inference.
- Agent (cowork/code) needs an openai-kind profile for external models, OR anthropic-kind for the SDK
  path. Pure NIM/OpenRouter are openai-kind → use the self-built loop.

## 7. ENVIRONMENT QUIRKS (important when working via the sandbox)

- The bash workspace mount frequently serves **truncated reads** → `node --check` shows false-positive
  syntax errors (blank/cut lines, `node:fs:440` EIO). The host files (via Read/Write tools) are the
  source of truth and are fine. Verify suspicious files by Reading them on the host, not by trusting
  bash node --check.
- The user is on Windows + **PowerShell 5** (no `&&`). Give commands as separate lines.
- Electron + the Agent SDK bundle large native binaries that download on install; if blocked, set a
  mirror or extract manually (we hit this — see git history).

## 8. Next steps (pick up here)

1. TEST the unverified batch on the user's machine (`npm run electron:dev`, FULL restart):
   - Skills: toggle on/off, delete, import folder/zip, add 2nd folder (e.g. Claude's skills dir).
   - Projects: Projects tab → create project → set instructions + add knowledge (text + files) →
     New conversation → chat → close app → reopen → conversation + context persisted.
2. Likely follow-ups: conversation SEARCH, PDF/docx knowledge parsing (currently text-only), markdown/code
   rendering in chat bubbles (currently plain text — artifacts panel covers HTML/SVG/code preview),
   installer (electron-builder), OS-keychain key storage.
3. KNOWN RISK: a LOT of new code (Projects, Dispatch, Connect-apps, Artifacts, full restyle) written
   without a successful build (degraded sandbox mount). First run is the real test — watch the [ELECTRON]
   terminal for require/runtime errors. Most likely failure points: a wrong MCP package name in a connector
   preset (just edit it), or a renderer import typo (Vite will show it in the [VITE] terminal).
4. VERIFY exact npm package names for Gmail/OneDrive/GDrive/GitHub/Slack MCP servers — presets are
   best-guess and may need correction.

## 9. Commit checkpoints so far

- "BrainEdge: chat + Cowork on external models, permission modes, Cowork-style UI"
- "Phase 3: MCP connectors working"
- "Phase 3: Skills across chat, code, cowork, projects"
- (pending push) multi-folder skills + import + toggle/delete + real-time index refresh
- (pending push) Projects: persisted workspaces (instructions + knowledge + conversations)

---

## 10. CURRENT STATE — 2026-06-07 (authoritative; supersedes stale details above)

### Identity / ownership / legal
- App name is **BrainEdge** (the earlier "Chai" tea theme was reverted). UI footer: "© 2026 BrainEdge · Proprietary".

---

## 11. ADDENDUM — 2026-06-08 (continued; newest authoritative state)

### Web storage — FIXED properly (IndexedDB)
- **Chat history now lives in IndexedDB**; **settings + API keys stay in localStorage** so a full history can never crowd out the keys (the root cause of the NVIDIA `401 "No cookie auth credentials"`). One-time auto-migration on first load moves old history to IndexedDB + frees localStorage. Touches `persistSession`, `start` resume, history accessors, `getUsage` in the web bridge. NOTE: a duplicate IndexedDB block was introduced and removed during the edit — if the web bundle ever fails to build, check for re-duplicated `idb`/`IDB_NAME`/`HISTORY_KEY`. Takes effect after `npm run build` + re-saving the key once.

### Web chat now streams live
- Web chat previously buffered the whole reply then dumped it (felt slow). Now **streams tokens live** like desktop; history writes are non-blocking/background. Standing speed rule: always stream, go direct browser→provider when allowed (OpenRouter), parallel speed tests. Irreducible: model gen time + the proxy hop required for browser-blocked providers (NVIDIA/OpenAI).

### Natural-tone / no-recital safeguard (web + desktop)
- Every message now carries a built-in rule: reply naturally/human, never recite or describe the instructions, just follow them. Fixes weak models parroting the user's custom-instruction block. Applied web-side (chat + collaborate, defined once) and desktop-side (`withLang`, covers agent modes). Backend instructions still govern answer substance.

### Standing rule
- **Every improvement must land on BOTH web and desktop** (desktop `electron/*` + `session-manager`; web `webBridge.js` / `shared/providers.js`; shared logic in `src/shared`). Only exception: browser-impossible actions (terminal, arbitrary files, MCP spawn) stay desktop-only and are called out.

### Go-live
- **`GO-LIVE-FINAL.md`** is the authoritative production runbook. Stack decisions: **Render** (always-on $7/mo), **Supabase Postgres**, **web-first launch** (desktop fast-follow), **launch with 7-day trial active + Stripe wired live within first week**, host URL day one + custom domain later. Code already production-ready for web (dev login off by default, dev sign-in only in dev builds, obfuscated bundle, Postgres built in). `release/setup.exe` is **stale** until `npm run electron:build`.

### Open items
- **Before launch (user's accounts):** rotate the Google/GitHub OAuth secrets pasted during testing; enable **2FA** on Google/GitHub/Stripe/host (admin = whoever logs in as owner email).
- **Optional code, not yet done:** Redis-ready rate limiting (multi-server scale); remove the desktop Anthropic "use my subscription" toggle before shipping the desktop installer.
- **Still unfixed:** the **model determination / selector** issue (active chat model left on a NIM model after Speed Check).
- User is mid **top-to-bottom re-test** of the full app before going live (started at Profile & Settings).
- **Copyright owner: Samskruthi Harish** (contact chaithru@gmail.com). Source files carry the header
  `// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.`
- Legal files added: `LICENSE` (proprietary), `TERMS.md`, `TRADEMARKS.md`; `package.json` `"license":"UNLICENSED"`,
  author "Samskruthi Harish <chaithru@gmail.com>".

### Security hardening (done)
- **Secrets encrypted at rest** via Electron `safeStorage` (OS keychain), prefix `enc:v1:` — applies to
  provider apiKey, `messaging.telegramToken`, `googleClientSecret`. settings.cjs load() decrypts, save() encrypts.
- **Strict CSP** injected on the renderer via `session.defaultSession.webRequest.onHeadersReceived`
  (script-src 'self' in prod; eval+ws relaxed only in dev). `img-src 'self' data: https:`.

### Bridge / settings (corrections to older sections)
- Bridge global is **`window.brainedge`** (preload.cjs); IPC channels are `brainedge:*`. (Older notes say `window.chai`/`chai:*` — stale.)
- Settings file: `%APPDATA%\brainedge\brainedge-settings.json`. DEFAULTS shallow-merged over the saved file.
- Anthropic is back as a provider INCLUDING the subscription/OAuth path — **TESTING ONLY, REMOVE BEFORE
  PUBLISHING** (subscription use breaches Anthropic ToS). Commercial API-key access is the legit path.

### "dispatch" term removed (rename map)
- Via Mobile feature → `viamobile`: `ViaMobile.jsx`, `viamobile-log.cjs`, mode id `"viamobile"`, IPC
  `listViaMobile`/`removeViaMobile`/`clearViaMobile`.
- Scheduler internals → `task`/`scheduler`: `Scheduler.jsx`, `task-store.cjs`, `task-runner.cjs`,
  main var `taskStore`, event `brainedge:taskRun`, data dir `task-data/`.
- Generic tool router `dispatch()` → `runTool()` (agent-openai.cjs). Only DOM `dispatchEvent` + undici
  `setGlobalDispatcher` remain.

### Via Mobile (Telegram remote control) — current
- Sidebar INTERFACE group has **Via Mobile** (`ViaMobile.jsx`). Page: intro, Bot setup (enable, masked
  token/user-ids, run target chat|folder, Apply), collapsible help, **Open in Telegram** t.me deep-link
  button, and the Requests history (persisted, per-item delete + Clear-all). Bot username is masked in
  status chips via `maskBot()`.
- **Telegram → Cowork handoff** ("Continue on phone"): `mobile-link.cjs` binds ONE cowork session; the
  bot continues that session (last ~30 turns + its folder) and **writes replies back into the session**
  so they appear on the desktop. Commands `/start`, `/unlink`.
- **Auto-continue** (`messaging.autoContinue`, default ON): when in a cowork session AND the bot is online,
  App auto-binds the current session (polls bot status every 5s). Folder bar shows a status chip; manual
  "Continue on phone" / Unlink available when auto is off.
- QR code was tried (`qrcode` npm) but REMOVED — Vite couldn't resolve the dep through the degraded mount;
  the dependency-free t.me button covers the need. If re-adding, vendor a self-contained encoder (no dep).

### Models Overview — current
- "Best for" cell shows full text on hover (`title`); row click opens detail card.
- Download is a **source chooser popup** (Hugging Face / Ollama / LM Studio) instead of always Hugging Face.

### Next steps (pick up here)
1. **Before publishing: remove the Anthropic subscription/OAuth path** (keep API-key only).
2. Build the Windows installer: `npm run electron:build` (electron-builder --win; nsis + portable).
3. brainedge.ai web version; review "Let's Build" to behave like Claude Code.
4. Optional: vendor a local QR encoder for Via Mobile; PWA + E2E relay only if leaving Telegram.

### Environment quirk (still true)
- The sandbox bash mount serves **truncated reads** of long files → false `node --check`/grep failures and
  npm JSON-parse errors on package.json. Trust the host Read/Write/Edit tools, not bash reads, for long files.

---

## 11. CURRENT STATE — 2026-06-08 (authoritative; supersedes Section 10 where they differ)

Version bumped to **0.3.0**. Big theme this round: **accounts + monetization, and a full web version
with feature parity**.

### Accounts + monetization (auth server)
- Standalone zero-dependency auth server: `server/auth-server.mjs` (Node ≥18), store in `server/store.mjs`
  (JSON file default; **Postgres** when `DATABASE_URL` set). Loads `server/.env` automatically (mini dotenv).
- Login = **Google/GitHub OAuth** (secrets stay on the server). Session token = HMAC, 24h, re-validated
  online. **7-day free trial → mandatory Stripe subscription.** Status model: trialing|active|expired|suspended.
- Endpoints: `/auth/:provider/start|callback`, `/me`, `/auth/logout`, `/auth/dev/start` (ALLOW_DEV_LOGIN=1),
  `/billing/checkout|portal|webhook`, `/admin/users/:id/(suspend|unsuspend|comp|uncomp)`, `/admin/users`,
  `/admin/stats`, `/events`, `/proxy/chat`, `/proxy/models`, `/health`, + static serving of `dist/`.
- **Admin** = email in `server/admin-emails.txt` or `ADMIN_EMAILS`. **Free access** = `server/free-emails.txt`
  or `FREE_EMAILS`, or per-user `/comp`. Admin endpoints accept the admin's session OR `x-admin-key`.
- Analytics: signup/signin/subscribed events + last-seen; `/admin/stats` = counts, 7-day funnel, recent events.
- Client gate: `src/auth/AuthGate.jsx` wraps the app (always-online). Account UI: `AccountCard.jsx`,
  `AdminPanel.jsx`. Desktop IPC in `electron/auth.cjs` + main.cjs; web in `webBridge`.
- Docs: `AUTH.md`, `OAUTH-SETUP.md`, `DEPLOY.md`, `PRIVACY.md`. Run: `node server/auth-server.mjs`.

### WEB app (browser build of the same UI) — NEW
- `src/bridge/index.js` now picks `window.brainedge` (desktop) **or `webBridge`** (browser); exports `isWeb`.
- `src/bridge/webBridge.js` implements the WHOLE contract in the browser: auth/billing/admin via the auth
  server; settings/history/projects/saved/tasks in **localStorage** (keys stay on device); chat streams
  **browser→provider** via `src/shared/providers.js` (ESM mirror of providers.cjs).
- The **auth server also serves the built `dist/`** so the web app + API share one origin (no CORS, clean
  OAuth redirect with `?token=`). Run: `npm run build` then `node server/auth-server.mjs` → http://127.0.0.1:8787/.
- **Provider proxy** (`/proxy/chat`,`/proxy/models`): web tries direct first; if the browser blocks it (CORS,
  e.g. NVIDIA/OpenAI) it auto-falls back to the server proxy. OpenRouter etc. stay direct.
- **Web folder access** ("Let's Collaborate" on web): `src/bridge/webfs.js` uses the **File System Access API
  (Chrome/Edge only)**; `webBridge` runs a browser file-tool agent (list/read/write/edit, NO terminal). Folder
  stays local; only files the model reads are sent to the provider. Folder bar shows a Chrome/Edge notice.
- Doc: `WEB.md`. Deploy: `render.yaml` + `GO-LIVE.md` (Supabase + Render). Added `pg` to root deps.

### Other changes this round
- **Default language** setting (Settings → Profile → Appearance): `responseLanguage` ("model" or a language)
  injected into the system prompt on BOTH web (`webBridge.systemPrompt`/`coworkSystem`) and desktop
  (`session-manager.withLang`). settings.cjs default added.
- **Code obfuscation** on production builds only: `rollup-obfuscator` in `vite.config.js` (apply:"build",
  conservative settings). Install: `npm install -D rollup-obfuscator`. Source stays readable; dev unaffected.
- **Sidebar bottom = Profile** (name + photo) with a trial/upgrade box above it; opens Settings. The old
  floating trial banner + top-right account menu were removed (now in the sidebar).
- **Admin Analytics is its own Settings section** (admins only) — moved out of the Profile page.
- **Profile page cleaned up**: removed the manual Account fields (name/email/avatar) + the "Link your profile"
  OAuth-client-id block (real auth is via sign-in now).
- **Kept the Anthropic Agent SDK** (it powers the desktop Claude-Code-grade agent + future Anthropic features);
  only scrubbed obvious "Claude Agent SDK" naming from comments. Decided hiding it isn't worth the feature loss.

### Reusable auth-kit "skill" — NEW (`auth-kit/`)
- Universal, plug-and-play login+trial+subscription+analytics for FUTURE projects. Files: `auth-kit/SKILL.md`,
  `README.md`, `server/auth-server.mjs` (generalized via `APP_NAME`), `server/store.mjs`, `server/.env.example`,
  `client/auth-client.js` (framework-agnostic browser client). Packaged installable: `auth-paywall.skill`.
- Everything per-business is env (APP_NAME, TRIAL_DAYS, STRIPE_PRICE_ID, ADMIN_EMAILS, FREE_EMAILS, DATABASE_URL).

### Security guidance given to user (not code)
- Real protection = secrets stay server-side (done) + obfuscation + license; turn on **2FA** on
  Google/GitHub/Stripe/host. Admin-account-hijack blast radius is limited (no money/keys/DB/code from the
  panel; all actions reversible). Offered (not yet built): admin **audit log** + **revoke-all-sessions** kill switch.

### Pending / queue (pick up here)
1. **Server-move (secret sauce):** move the speed-check **quiz grading** (QUIZ answer key + `scoreQuiz`) to the
   auth server behind an API; client sends model answers, server returns scores. (Runs once/test → no perf hit.)
2. **Consumption** section → world-class interactive analytics dashboard.
3. **Model Speed Check results** → world-class analytics dashboard (no perf impact).
4. Before launch: rotate the OAuth secrets exposed during testing; remove the Anthropic subscription path.

### How to run (quick ref)
- Web: `npm run build` → `node server/auth-server.mjs` → http://127.0.0.1:8787/ (needs `server/.env` with OAuth).
- Desktop: `node server/auth-server.mjs` (window 1) + `npm run electron:dev` (window 2).
- Free the port if EADDRINUSE: `Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`

### 11b. Update — 2026-06-08 (later, after Section 11)
- **Consumption dashboard** rebuilt: KPI cards, interactive activity area chart, GitHub-style contribution heatmap, model token-share donut, highlights. webBridge.getUsage now computes byDay/models/streaks/peakHour from history (persistSession records model). Pure SVG, no deps. CSS: `.cons-*` in styles.css.
- **Admin Analytics** is now its OWN section in Settings (admins only) — moved out of the Profile page. Profile page also had its manual Account fields + "Link your profile" OAuth-id block removed.
- **Default language** dropdown (Settings → Profile → Appearance): `responseLanguage` → injected into system prompt on web (`coworkSystem`/`systemPrompt`) and desktop (`session-manager.withLang`).
- **Web speed test fixed**: was a stub → now real. Runs models in a **parallel pool of 6**, streams **partial results** (webBridge keeps `_lastSpeed`/`_speedRunning`; UI `startPoll` shows partials every 1.2s), 45s per-call timeout. Quiz graded server-side via `/score-quiz`.
- **Connectors on web**: 25-item curated catalog (gallery preview; actually connecting MCP is desktop-only).
- Reminder: with the answer-quality quiz ON, web speed test makes ~20 calls/model — pick few models.

### 11c. KNOWN OPEN ITEMS
- ~~Speed Check **results** still need the world-class dashboard polish (match Consumption).~~ DONE — see 11d.
- Connector **icons** may not render on web for catalog items (Connectors.jsx maps known names → icons; unknowns blank) — minor.
- Rotate exposed OAuth secrets; remove Anthropic subscription path before launch.

### 11d. Update — 2026-06-08 (later)
- **Speed Check results dashboard DONE**: restyled to match Consumption — summary cards polished with the **winner card highlighted**, and each KPI panel changed from a plain list to a **ranked mini bar-chart** (rank badge + inline bar + value). Visual layer only; rankings/data unchanged. (Clears the 11c open item.)
- **Web settings storage-full bug FIXED**: symptom was settings "not stored after save" and chat returning NVIDIA `401 "No cookie auth credentials found"`. Root cause: browser **localStorage full** (chat history, esp. after the web folder agent stores file contents) → `Save & load models` silently failed to persist the API key → chat sent no key → 401. Fix (web bridge): settings now **save even when storage is full** (evicts old chat history as a last resort so keys always stick) + **chat history is capped** so it can't crowd out settings. Effective only after `npm run build` + re-saving the key. Web settings are per-browser (separate from desktop).
- **DECISION (pending build):** proper long-term fix = move **chat history to IndexedDB** (hundreds of MB–GB) while keeping settings/keys in localStorage, so keys can never be crowded out. Rejected server-side key storage (breaks keys-stay-on-device). Awaiting user go-ahead.
- **Housekeeping:** scheduled task **"update-brainedge-docs"** created — auto-refreshes Chat.md + MEMORY.md every 30 min.

### 11e. NEW OPEN ITEMS
- ~~Implement the **IndexedDB chat-history migration** (decided above) once user approves.~~ DONE — see 11f.
- User flagged **"model determination and selector"** — active chat model gets left on a NIM model after exploring models in Speed Check, causing the 401 confusion. Needs diagnosis: likely the model picker should not repoint the active chat profile during Speed Check exploration, or should restore the prior selection afterward. **STILL OPEN.**

### 11f. Update — 2026-06-08 (later — IndexedDB migration, web streaming, no-recital safeguard)
- **IndexedDB chat-history migration DONE** (clears the 11e item): web **chat history now lives in IndexedDB**, while **settings + API keys stay in localStorage** — bulky history can no longer crowd out the keys (the NVIDIA 401 root cause). Auto-migrates existing history to IndexedDB on first load and frees old localStorage. Caught + removed a **duplicate IndexedDB block** in `webBridge.js` (two copies of `idb`/`IDB_NAME`/`HISTORY_KEY` + `histPut/histGet` name mismatch) that would have broken the web build. Activate via `npm run build` + hard-refresh + re-Save the NVIDIA key once.
- **Web chat live streaming**: web chat was buffering the whole reply; now streams **token-by-token** like desktop. Unavoidable costs remain: model generation time + the proxy hop for browser-blocked providers (NVIDIA/OpenAI = browser→server→provider; OpenRouter etc. stay direct).
- **Natural-tone / no-recital safeguard (web + desktop)**: weak models were reciting the custom-instructions system prompt verbatim ("response coming like a machine"). Added a safeguard, defined once, applied on **web** (chat + collaborate system-prompt builders) **and desktop** (`session-manager.withLang`): reply naturally/human and **never recite/describe the instructions, just follow them**. Backend instructions still govern answer substance.
- **STANDING RULE (locked in by user):** every improvement must land on **BOTH web and desktop** — touch the desktop path (`electron/*` + `session-manager`) and the web path (`webBridge.js` / `shared/providers.js`); put shared logic in `src/shared` so they can't drift. Only true browser-physical limits (terminal, arbitrary file access, spawning MCP processes) stay desktop-only, and must be called out explicitly when they do.

### 11g. STILL-OPEN ITEMS
- **Model determination / selector** bug (carried from 11e): active chat model gets stranded on a NIM model after Speed Check exploration → 401 confusion. Not yet diagnosed/fixed.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only).
- Still queued from 11/11d: Consumption + Speed Check polish are done; server-move of quiz grading is done. Remaining product polish per backlog as needed.

### 11h. Update — 2026-06-08 (later — Profile & Settings redesign + account menu)
Pre-launch top-to-bottom re-test began at **Profile & Settings**. All edits here are shared code → web + desktop.
- **Profile page redesigned**: flat list → **card layout with section icons** (Appearance, Instructions). "Account server URL (advanced)" moved into a collapsible **Advanced** section. **Accent picker reduced to Default + Custom only** (other preset swatches removed).
- **New Claude-style account menu** at the sidebar bottom (own design, replaces the "View profile & settings" button): email header; **Settings · Language · Get help**; **Manage subscription / View plans** (item chosen by subscription status); **Log out**; footer with avatar/name/plan. The trigger now shows the **plan label** ("Complimentary", "Trial · Nd left").
- **Default language moved** off the Profile page into the menu's **functional Language submenu**.
- Removed the **empty duplicate "Manage subscription"** button from the Profile account card (working one is in the menu).
- Files touched: Sidebar (account menu + state + handlers), the Profile/Settings section component, `AccountCard.jsx`, and Profile-card CSS in styles.css.

### 11i. STILL-OPEN ITEMS (carried forward)
- **Model determination / selector** bug — still open (unchanged from 11g/11e).
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path.
- Re-test in progress, screen by screen (started at Profile & Settings).

### 11j. Update — 2026-06-09 (Admin Analytics + visitor tracking, top-nav/account-menu restyle, collapsible nav, artifacts upgrade in progress)
Re-test continued. All edits shared code → web + desktop.
- **Admin Analytics redesigned + visitor tracking added.** New anonymous **`/visit`** endpoint (one stable id per browser), logged on every web load; `/admin/stats` extended with visitor metrics + a **14-day series**. Dashboard now has an Audience row (Visits 7d/today, Unique visitors, Signups, Visitor→signup conversion %, Active 24h), a **Traffic & signups trend chart** (14d), an Accounts row, a **Conversion funnel** (visitors→signed up→subscribed), user table + activity feed. Server changed → restart `node server/auth-server.mjs` + `npm run build`.
- **Recent Activity feed fixed**: shows **email** (not internal id) + only real account events (Signed up/in/Subscribed) via a friendly event-name map; view/visit events still recorded quietly for counts.
- **Profile/account-menu**: fixed a **double profile** (removed menu footer dupe); **restored "Manage subscription"** on the Profile card. Restyle "like Claude": account menu = **lighter elevated panel** with accent-highlighted items; account bar = **distinct shaded card**.
- **Top-nav redesign**: toggle moved **far left next to logo**; logo+name **hide when collapsed**; collapsed sidebar is now a **thin ~60px icon rail** (nav icons + avatar; account menu pops out right) instead of fully hidden.
- **Collapsible nav groups**: Interface & Models groups **collapsed by default**, open on click, **auto-collapse on navigating away**.
- **Artifacts upgrade — IN PROGRESS.** BrainEdge already had a working artifacts panel (Preview/Code, HTML/SVG/code, "Open artifact" pill). Building the Claude-parity gap: **toolbar** (Copy/Download/Open-in-new-tab/Refresh), **Mermaid**, **Markdown** doc rendering, **React/JSX** live render (in-browser transpile). Detector + per-type preview builder + panel/toolbar upgraded; CSS + remaining wiring still landing. NOT yet built/verified.

### 11k. STILL-OPEN ITEMS (carried forward)
- **Artifacts upgrade** (toolbar + Mermaid + Markdown + React/JSX) mid-flight — finish CSS/wiring, then build + verify on web and desktop.
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path.
- Re-test continues screen by screen.

### 11l. Update — 2026-06-09 (artifacts finished + Studio launcher + dynamic New labels + hidden tools + Claude-Code Build screen)
Re-test continued. All edits shared code → web + desktop.
- **Artifacts upgrade FINISHED** (clears the 11k open item): preview engine now renders **HTML, SVG, Mermaid, Markdown, and React/JSX** (Tailwind + hooks, in-browser transpile) with a real **toolbar** (Preview/Code, Copy, Download, Open-in-new-tab, Refresh). Mermaid/React/Markdown load small libs from CDN inside the sandboxed preview frame — bundle locally if any desktop preview shows blank (preview frame isn't under the app's strict CSP).
- **Studio** — new sidebar launcher (under Projects, `Shapes` icon), its **own** design (gradient title, cyan accent-gradient icon tiles, hover-glow, dashed "Blank canvas"). Categories: Apps & sites, Documents, Games, Tools, Visuals, Diagrams, Quizzes, Blank canvas. Picking a tile **seeds a fresh chat** with a tailored build prompt. Now a **two-step chip form** (option chips + details box) so the model builds directly without a question wall. De-"Claude'd" preview labels → **Web page / Diagram / Document / Component / Graphic** (no "artifacts" wording).
- **Studio fresh-chat fix**: was restoring the cached chat (everything piled into one conversation) → now clears the cached chat before seeding so each idea gets its own new chat.
- **Dynamic "New" label per mode**: **New chat** (Let's Chat) / **New task** (Let's Collaborate) / **New session** (Let's Build); `/new` command + Composer button match. Per-mode Recents history was already correct (list filters by mode).
- **Hidden internal tools**: added a hidden-tools list so `load_skill`-style internal chatter no longer shows in the chat.
- **Let's Build → Claude-Code feel**: task-oriented input ("Describe a coding task…") + a Claude-Code-style **"Choose a folder"** empty state for Build/Collaborate on **both** platforms. File agent (read/write/edit/search + permission modes) identical web/desktop. **Irreducible limit:** running terminal commands (npm/git/tests) is **desktop-only** (browser can't run a shell); web does all file work and says when a command needs desktop.

### 11m. STILL-OPEN ITEMS (carried forward)
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only).
- Possible next: multi-file edits, file-tree view, real edit **diffs** in tool cards (all web-compatible). Re-test continues screen by screen.

> NOTE for the sandbox: the bash mount served a **truncated/stale tail of Chat.md** this run (showed the file ending ~6 sessions early). Confirmed via host Read/Grep — those are source of truth. Use host file tools, not bash tail, to find the true end of these docs.

### 11n. Update — 2026-06-09 (later — GitHub connect fix, agent diffs/file tools, standalone CLI)
- **GitHub repo connect FIXED**: "Connect a GitHub repo" was a no-op because `window.prompt()` is disabled in Electron → replaced with an **in-app input modal** (web + desktop). Desktop clones via a new clone endpoint and sets the repo as the working folder; web (no in-browser clone) instructs download + Choose folder. Entry point moved to the **+ menu**.
- **Agent file tools expanded** (clears the "real edit diffs" possible-next from 11m): added **search-across-files, list-all-files, delete, and real colored edit diffs** in the tool cards.
- **Folder-card revert** (user pref): removed the big connect-folder card; **"Choose folder" stays only as a chip in the chat input bar**; greeting empty state restored.
- **NEW: BrainEdge CLI — third surface** (`cli/brainedge.mjs`, 198 lines, zero deps; `cli/README.md`). Standalone terminal coding agent like Claude Code on the **same engine**; `cd` into any folder + run `brainedge` (full power incl. shell — a real local program, unlike the browser). Tools: read/write/edit/search/list/**run_command**/load_skill. Slash: `/model` `/clear` `/skills` `/reload` `/init` (writes `BRAINEDGE.md`, auto-read like `CLAUDE.md`) `/cwd` `/cost` `/auto` `/help` `/exit`. Skills from `.brainedge/skills` or `~/.brainedge/skills`. Permission prompts unless `--yes`. Config `~/.brainedge/config.json` {baseUrl,apiKey,model,kind} or env. `bin: brainedge` in package.json; `npm link` to install. Parses clean. Transport is **openai-kind** today — **anthropic wire format extension queued**. Could later be auth-server/subscription-gated like the apps; distributable as npm package or `.exe`.

### 11o. STILL-OPEN ITEMS (carried forward)
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only).
- **CLI:** add anthropic wire format; optional subscription/account gating + npm/`.exe` distribution.
- Chat.md was behind MEMORY.md — this run appended the 2026-06-09 CLI session to Chat.md; interim sessions remain summarized in §11e–11m.

### 11p. Update — 2026-06-09 (later — CLI subscription gating + one-click "Enable terminal access")
- **CLI is now subscription-gated** (advances the §11o "optional subscription/account gating" item): server gained `signCli` + **`/cli/token`** + **`/cli/verify`** in `server/auth-server.mjs`. A provisioned CLI carries a long-lived token and calls `/cli/verify` **on every startup** — refuses to run if the subscription is cancelled/expired or the user is banned; **offline = warn but don't block**; a self-configured CLI with no token stays **ungated**.
- **One-click "Enable terminal access"** (desktop, **Settings → Terminal access**): detects Node, **reuses the provider + API key already in Settings** (no re-entry), mints the subscription-bound token, writes `~/.brainedge/config.json`, and puts a `brainedge` command on **PATH** without admin/npm (Windows: launcher in a user bin dir + User PATH via PowerShell; macOS/Linux: shim in `~/.local/bin`). New `electron/cli-install.cjs`; IPC + preload wiring; `auth.cjs` `cliToken`; `src/components/CliAccess.jsx` card (+ web fallback); `package.json` bundles the CLI into the packaged app via **`extraResources`**.
- **Security note:** the CLI token lasts ~a year but is **re-validated online each launch** (revocation bites within one start). It is stored **plaintext** in `~/.brainedge/config.json` — a plain Node CLI can't use the OS keychain (the desktop session token still is encrypted). Acceptable for a per-user token; flagged.
- Verification caveat: `cli-install.cjs` parses clean; larger edited files (server, main/preload) couldn't be fully checked via the sandbox (truncated reads) → confirm with a local `npm run build` + restart of the app **and** the auth server (new endpoints). Test: Settings → Terminal access → Enable → fresh terminal → `brainedge`; suspend your own user in Admin and relaunch to prove the gate refuses.

### 11q. STILL-OPEN ITEMS (carried forward)
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only).
- **CLI:** add the anthropic wire format; npm/`.exe` distribution.
- Visible UI still to surface: **file-tree view** + **undo/checkpoint buttons** in the chat.

### 11r. Update — 2026-06-09 (later — in-app terminal PTY upgrade + CLI rewrite to an Ink TUI, in progress)
- **In-app Terminal → real PTY.** Rewrote `electron/terminal.cjs` as a **dual PTY/pipe** terminal: spawns a real PTY via **node-pty** when available, **falls back to the pipe shell** otherwise (panel never breaks). Header shows a **PTY** (green) / **compat** badge. With a true TTY, full-screen TUI programs (`vim`, and the `brainedge` CLI itself) render correctly inside the app and resize reflows. Added `node-pty` + `@electron/rebuild` deps, **`npm run rebuild`** (`electron-rebuild -f -w node-pty`), and **`asarUnpack` + `npmRebuild`** so installers ship the PTY with no build tools needed by end users. Caveat: node-pty compiles C++ → Windows needs **Visual Studio Build Tools** ("Desktop development with C++") for `npm run rebuild`; without it the terminal runs in compat mode.
- **CLI rewrite to an Ink TUI — IN PROGRESS.** User: the BrainEdge CLI isn't as polished/efficient as Claude Code; "just replicate it." Set scope honestly — no byte-for-byte clone of Anthropic's closed source. Root cause (confidence high): the CLI is a Node **`readline`** prompt-loop, which can't do a persistent bottom input box or rich in-place re-render; Claude Code is a full-screen **Ink** (React-for-terminal) TUI with a custom line editor. So polishing readline can't reach parity → needs a new foundation. User chose the **Ink rewrite**. Building in 3 files: shared **UI-agnostic agent core** (`cli/agent-core.mjs`, ~14.8 KB, written), the **Ink UI**, and an **entry that falls back to the old REPL** (`cli/brainedge.mjs`) if Ink isn't installed. NOT yet finished or verified — Ink can't run in the sandbox, so it will need an interactive test pass on the user's machine.

### 11s. STILL-OPEN ITEMS (carried forward)
- **Ink CLI rewrite** mid-flight — finish the Ink UI + entry wiring, then test interactively (sandbox can't run Ink).
- **node-pty PTY mode** unverified — needs `npm install` + `npm run rebuild` (+ VS Build Tools on Windows) on the user's machine; compat fallback otherwise.
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only).
- CLI: add the anthropic wire format; npm/`.exe` distribution. Visible UI still to surface: file-tree view + undo/checkpoint buttons.

### 11t. Update — 2026-06-09 07:40 (web Terminal signpost, full Claude-parity CLI slash commands, GUI model-picker filters, Let's Build reshape)
Continuation of the Ink-CLI session; CLI + Build pushed toward Claude Code parity.
- **Web Terminal panel finished**: desktop-only signpost card (browser can't run a shell) with a **"Get the desktop app"** button → `/download` on the app origin (placeholder URL, change when the download page ships).
- **Full Claude-parity CLI slash commands (core in, UI wiring half-done).** Added to the shared agent core (`cli/agent-core.mjs`) + Ink UI: changeable **working dir** (for `/cd`, `/add-dir`), **session save/resume**, **single-shot completion** (powers `/compact`), **custom commands** (markdown command files, Claude `.claude/commands/`-style), and **ping/doctor** diagnostics. Fixed an ESM `require`→`spawn` import bug. Menu lists the new commands but **several actions aren't wired yet** — finishing the wiring is the immediate next step so the menu doesn't list dead commands. BrainEdge already had `/help /model /clear /skills /reload /init /undo /cwd /cost /auto /exit`.
- **GUI model-selector filters**: **Cost chips** `All·Free·Paid` (Free = local + OpenRouter `:free`), **Best-for chips** `Any·Coding·Reasoning·Vision·Fast` (reuse existing name-based `classify()`), per-row purpose tag + **Free/Cloud/Local** badge, live **"X of Y"** count, combines with search. NOTE: Free/Paid + Best-for are **heuristics from the model id**, not authoritative — offered to wire the **OpenRouter catalog** (real pricing + modality) for exact values. Parity TODO: mirror these filters into the CLI `/model` picker.
- **Let's Build reshape — IN PROGRESS.** User wants a Claude-style environment picker that connects **multiple GitHub repos/accounts** (pull repos from a connected account), **no remote control**. Key decision stated to user: BrainEdge has **no cloud compute backend** (local desktop / in-browser only), so a "Cloud / Default"-style option won't be faked — building **Local folder + multi GitHub repo/account** only. Reshaping current Build wiring; not finished/verified.

### 11u. STILL-OPEN ITEMS (carried forward)
- **CLI slash commands** half-wired — finish hooking `/compact /resume /cd /add-dir /memory /config /status /doctor` + custom commands to Ink-UI actions; mirror Free/Best-for filters into CLI `/model`.
- **Let's Build environment-picker reshape** mid-flight (local folder + multi GitHub repo/account; no cloud, no remote control) — finish + verify.
- **Ink CLI rewrite** + **node-pty PTY mode** still need interactive verification on the user's machine (sandbox can't run Ink/PTY).
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only). CLI: anthropic wire format; npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.
- Optional precision upgrade: OpenRouter catalog → authoritative Free/Paid + Vision in the model picker.

---

## 11v. Update — 2026-06-09 08:10 (Models Overview restyle rejected, Claude-style GitHub repo list, cost-display bug)
- **Models Overview table restyle — REJECTED.** A design-director pass (red-✗ noise removed → capabilities light up only when present in semantic accents; maker monogram avatars; color-tiered cost; sticky blurred header; zebra; hover edge) was rejected by the user ("horrible"). Presentation only, no data change. Needs a different direction.
- **Cost-display bug (found, NOT fixed):** Models Overview shows **`$-1,000,000,000`** for router models (`openrouter/auto`, `pareto-code`). OpenRouter encodes variable pricing as `-1`; code multiplies per-token price ×1,000,000 → −1e9. Fix = treat `-1` as "variable"/unpriced. Awaiting user direction on revert scope before editing code.
- **GitHub repo connection rebuilt (Claude-style):** connect form replaced with a clean, **searchable, scrollable repo list** that pulls all repos from the connected account(s); account/token entry tucked away quietly; restyled professional. Continues the Let's Build environment-picker reshape (§11t/11u). Not yet verified.

### 11w. STILL-OPEN ITEMS (carried forward)
- **Models Overview**: pick a new restyle direction; fix the `$-1,000,000,000` router-price bug.
- **GitHub repo list / Let's Build picker** — verify on web + desktop.
- CLI slash commands half-wired; Ink CLI + node-pty need interactive verification on user's machine.
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only). CLI: anthropic wire format; npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11x. Update — 2026-06-09 08:40 (CLI slash-commands fully wired + scrolling slash menu + CLI /model filters)
Records CLI completion that preceded the §11v 08:10 work (which jumped straight to Models Overview). Clears the §11u/11w "CLI slash commands half-wired" + "mirror filters into CLI /model" items.
- **CLI slash commands FINISHED.** All the half-wired commands from §11t are now hooked to actions in the Ink TUI (verified in `cli/tui.mjs` case handlers): `/compact` (summarize→reset), `/resume`, `/cd`, `/add-dir`, `/memory`, `/status`, `/config`, `/doctor`, plus custom user commands (`core.COMMANDS`/`reloadCommands`), alongside existing `/model /clear /skills /reload /init /undo /cwd /cost /auto /exit /permissions /mcp /agents`.
- **Scrolling slash menu.** The live `/` menu is now a navigable scrolling list (no 8-item cap): shows a count (`commands 3/22`) + ↑/↓ "more" markers, arrow keys scroll the highlight through every command, Enter runs, Tab fills for arguments, typing filters. No rebuild — just rerun `brainedge`.
- **CLI /model Free/Best-for filters.** Mirrored the GUI picker filters into the CLI `/model` picker (`cli/tui.mjs`: `PURPOSES`/`COSTS`/`costOk`/`purpOk`, applied in the picker `view`): Cost (all/free/paid, free=`:free`) + Best-for (any/coding/reasoning/vision/fast), classified from the model id (heuristic, same caveat as GUI).

### 11y. STILL-OPEN ITEMS (carried forward)
- Ink CLI + node-pty PTY mode need interactive verification on the user's machine (sandbox can't run Ink/PTY).
- **Let's Build environment-picker / GitHub repo list** — verify on web + desktop.
- **Models Overview**: pick a new restyle direction (design pass rejected); fix the `$-1,000,000,000` router-price bug (treat `-1` as variable/unpriced).
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only). CLI: anthropic wire format; npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11z. Update — 2026-06-09 09:30 (Models Overview restyle reverted to plain format; router-price bug fixed)
- **Models Overview restyle REVERTED** per user ("put back to previous format … revert only changes related to view"). Rolled back the rejected design pass — removed maker monogram avatars, colored capability dots/accents, color-tiered cost, context/host chips, and sticky/blurred/zebra/hover styling. **Standard ✓/✗ + plain cost/host text restored.** The data columns (cost, coding/reasoning/image/agentic, descriptions, params) were kept untouched. Plain format is the baseline again.
- **`$-1,000,000,000` router-price bug FIXED** (clears the §11v/w/y open item): OpenRouter returns `-1` for variable/router pricing (`openrouter/auto`, `pareto-code`); the per-token ×1,000,000 math produced `-1e9`. Router models now display **"Variable"**.
- **Benchmark/Speed columns — requested, NOT built (needs user decision).** User wants SWE-bench / HumanEval / Speed (est.) / qualitative Agentic-Thinking labels like a hand-curated comparison image. Reality (confidence high): no API in use (OpenRouter / provider `/models`) publishes benchmark scores or tokens/sec, so ~440 of 448 models would be blank. Proposed two honest paths, awaiting go-ahead: (1) a curated `benchmarks.js` of published scores + Agentic/Thinking levels for the ~30–50 well-known models; (2) a Speed (est.) column fed from the **existing Models Speed Check** measurements (real measured tokens/sec per tested model).

### 11z'. STILL-OPEN ITEMS (carried forward)
- **Benchmark/Speed columns** — decide between curated `benchmarks.js` and/or Speed-Check hookup, then build.
- **Models Overview restyle** — still needs an accepted direction (plain format is the current baseline; the `$-1e9` bug is now fixed).
- **Let's Build / GitHub repo list** — verify on web + desktop.
- Ink CLI + node-pty PTY mode need interactive verification on the user's machine.
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only). CLI: anthropic wire format; npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11z''. Update — 2026-06-09 16:39 (Models Overview benchmark/Speed columns BUILT + filter-bar redesign + full Best-for text)
User approved ("yes proceed") path 1+2 from §11z, so the columns were **built** (in the plain reverted table format — the rejected restyle did NOT return). Clears the §11z' "Benchmark/Speed columns" item.
- **New `benchmarks.js`** — curated, real published figures for **~22 well-known model families** (Claude, GPT-4o/4.1, o1/o3, DeepSeek V3/R1, Qwen Coder/QwQ, Devstral, Codestral, Llama 3.3/4, Mistral Large, Gemini, Grok, Command-R, Nemotron), matched by model id, figures marked approximate (`~`).
- **New Models Overview columns (all click-to-sort):** **SWE-bench** + **HumanEval** from `benchmarks.js` (matched rows show numbers, others "—", nothing fabricated); **Speed** fed live from the existing **Models Speed Check** measured tokens/sec (untested → "—"); **Thinking** + **Agentic** changed from ✓/✗ to **qualitative color-coded labels** (Always-on/Toggle green/blue; Best-in-class/Good/Partial/Moderate green→amber) with fallback to derived values. `COLS` moved into the component + a `speedMap` state loader/dependency so Speed sorts on measured data. Table now **scrolls horizontally**; one-line approximate/curated caveat under the title. Forward/fictional ids (GPT-5.4/5.5, Grok-4.20) stay "—" (no public data). Not compile-checked in sandbox → rebuild + eyeball.
- **Filter bar redesigned** → single flat set of **combining toggles**: Local, Cloud, Free, Agentic, Coding, Image, Reasoning, Fast, General ("All" clears; toggles stack). Replaced the old chips; added filter defs + logic/helpers + chip-bar render.
- **Best-for** now shows the **complete untruncated description in a dimmer secondary colour** (model name stays the anchor).
- **Download counts — declined, not built.** No API in use returns per-model download/usage counts (screenshot counts come from marketplace backends, not API fields); refused to invent. Offered one real optional source — **Hugging Face `downloads` for open-weight models only**, fetched lazily per visible row (caveats: HF downloads ≠ provider usage; open models only; per-model call; HF rate-limits anon). Awaiting decision.

### 11z'''. STILL-OPEN ITEMS (carried forward)
- **Provider display name + logo** — NEW: user asked to show a provider's real display name + logo instead of the plain lowercase id (e.g. "openai"). Requested at session end, **not yet built.**
- **Hugging Face downloads column** (open-weight only) — offered, awaiting go-ahead.
- **Models Overview restyle** — still needs an accepted direction (plain format remains the baseline; benchmark/Speed/filter/Best-for work is layered on it).
- **Let's Build / GitHub repo list** — verify on web + desktop.
- Ink CLI + node-pty PTY mode need interactive verification on the user's machine.
- **Model determination / selector** bug — still open.
- Pre-launch: rotate exposed OAuth secrets; remove the Anthropic subscription/OAuth path (API-key only). CLI: anthropic wire format; npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11z''. Doc-maintenance — 2026-06-09 (Chat.md caught up to MEMORY.md)
- **Chat.md was stale** (last entry 2026-06-08); the entire 2026-06-09 arc (§11f–§11z') existed only in MEMORY.md. Appended one consolidated **"## Session — 2026-06-09 (catch-up)"** block to the end of Chat.md summarizing that arc (IndexedDB/streaming/tone, Profile+account-menu, admin analytics+visitor tracking, nav redesign, artifacts upgrade, Studio, GitHub-connect fix + agent diffs, BrainEdge CLI + subscription gating + terminal access + PTY + Ink rewrite, CLI slash commands, Models Overview revert + router-price fix, benchmark columns pending). **Chat.md and MEMORY.md are now in sync.** No source code touched. No new project work this run — the latest BrainEdge work session ends at the §11z/§11z' state.

### 11aa. Update — 2026-06-09 14:41 (Models Overview benchmark/Speed columns BUILT — clears the §11z'/§11z'' "pending" item)
- User answered **"yes proceed"** on the two-path proposal from §11z, so the columns were **built** in the plain table format (the rejected restyle did NOT return).
- **New `benchmarks.js`** — curated, real published figures for **~22 well-known model families** (Claude, GPT-4o/4.1, o1/o3, DeepSeek V3/R1, Qwen Coder/QwQ, Devstral, Codestral, Llama 3.3/4, Mistral Large, Gemini, Grok, Command-R, Nemotron); matched by id, marked approximate (`~`).
- **Models Overview gained 5 sortable columns:** **SWE-bench** + **HumanEval** (from `benchmarks.js`; unmatched models show "—", no fabrication); **Speed** (fed from the existing Models Speed Check measured tokens/sec; untested = "—"); **Thinking** + **Agentic** are now **qualitative color-coded labels** (Always-on/Toggle; Best-in-class/Good/Partial/Moderate) replacing plain ✓/✗, with a fallback to derived values. Table scrolls horizontally; caveat line added under the title.
- Implementation: `COLS` moved into the component; Speed-Check results loaded into state with a `speedMap` sort dependency.
- **Honest limits:** forward/fictional catalog names (GPT-5.4/5.5, Grok-4.20) have no public data → "—" (no invented numbers); figures approximate. **Not compile-checked in sandbox** → rebuild + eyeball; extend the curated set if a wanted model shows "—".
- **Still-open (unchanged):** Models Overview needs an accepted restyle direction (plain is baseline); Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty interactive verification; model determination/selector bug; pre-launch — rotate OAuth secrets + remove Anthropic subscription/OAuth path; CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11ab. Update — 2026-06-09 17:10 (provider logos BUILT, release date in detail card, General-filter discussion, commit guidance, design pass started)
Continuation of the §11z''/§11aa Models Overview work. All edits shared code → web + desktop. Nothing compile-checked in the sandbox.
- **Provider display name + logo BUILT** (clears the §11z''' open item): real brand logos next to each maker name in Models Overview + colored monogram fallback. **Clearbit's free logo API is dead** (HubSpot shut it down → all 404 → monograms); switched to **Google's favicon service** (`google.com/s2/favicons`, reliable for any domain). Fixed maker→domain map (meta.ai, x.ai, qwen.ai, moonshot.ai, z.ai) + added openrouter. CSP already allows external logos (`img-src 'self' data: https:`). Caveat: favicons are real but low-res (fine at 15px); optional upgrade = bundle Simple-Icons SVGs for top ~20 providers w/ favicon fallback (not done).
- **Release date** now pulled from OpenRouter's real `created` timestamp during enrichment → shown as "released Nd/Nmo ago" in the **model detail card**. "Best for" confirmed dim + wrapping, char cap raised ~88→160. (Modality = Image column; long context = Context column.)
- **"General" filter** is currently `m.cat === "General"` — a thin heuristic (uncurated OpenRouter models default to General). Offered a one-line redefinition to "general-purpose, NOT a specialist" (exclude coding/thinking/vision/embedding). **Not changed — awaiting user OK.**
- **Popularity/usage counts reaffirmed declined** — not in any public API (OpenRouter's token-count number lives only on their rankings webpage); won't fabricate.
- **Commit:** user asked to commit all changes; **refused to run git from the sandbox** (truncated reads would stage corrupted files and poison the repo). Gave PowerShell: `npm run build` → `git status`/`add -A`/`commit`/`push`, + reminder that `server/.env`, `users.json`, `free-emails.txt`, `admin-emails.txt` stay gitignored. No source touched, no git run.
- **UI/UX design pass STARTED** (user: "work on aesthetic, look and feel"): asked to lock direction + starting surface first rather than restyle blind. **In progress, no edits landed.**

### 11ac. STILL-OPEN ITEMS (carried forward)
- **Let's Collaborate progress-report/queue panel + hide/open button** — NEW user request; not yet built (folded into the design pass).
- **UI/UX design pass** — direction not yet locked, no edits landed.
- **"General" filter** redefinition — awaiting user OK. **Provider logos** — favicon source works; optional Simple-Icons SVG upgrade not done. **HF downloads column** (open-weight only) — still offered, awaiting go-ahead.
- Models Overview accepted restyle direction; Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty interactive verification; **model determination/selector** bug; pre-launch rotate OAuth secrets + remove Anthropic subscription/OAuth path; CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface. Nothing this session compile-checked → rebuild + eyeball.

### STANDING INSTRUCTION (user, 2026-06-09): for ALL BrainEdge UI/frontend work, always use the **design-director** (frontend design) and **web-artifacts-builder** skills wherever applicable.

### 11ad. Update — 2026-06-09 18:10 (design pass underway: header/logo + sidebar alignment + ModelPicker redesign; maker filter in progress)
Design pass (§11ab) is now landing edits. All shared code → web + desktop. Nothing compile-checked in the sandbox.
- **Header cleanup BUILT:** "by Chaithrodaya Sukruth" tagline removed; BrainEdge wordmark no longer animated — single solid theme-accent color (no gradient). Leftover `.tn-by` CSS rules harmless.
- **Sidebar header alignment BUILT:** toggle + logo + wordmark vertically centered, equal 10px gaps, group centered in the 252px sidebar column when open (left-anchored when collapsed).
- **ModelPicker REDESIGNED (full rewrite):** Agentic filter (real `tools` data from OpenRouter catalog, name fallback); provider favicon logos on rows + group headers; colored capability pills (coding/reasoning/vision/fast/agentic + Free/Local/Cloud host pill); dropdown 480×560px. "Any" chip removed; capability chips are **multi-select, AND-combined** toggles. **Agentic detection made independent of coding** (no coder⇒agentic heuristic); coding+agentic models show both pills; hover tooltip = full model name. Models Overview verified already independent (capCoding from name, capAgentic from `m.tools`) — unchanged.
- **Reasoning vs Thinking** = same feature, named inconsistently (picker vs overview column); offered to standardize on "Reasoning" — awaiting user OK.
- Dev-run guidance given: `npm run electron:dev` (+ `node server/auth-server.mjs` for auth), `npm run dev` for web.
- **In progress / unconfirmed at log time:** maker filter in ModelPicker (filter by maker, e.g. NVIDIA within OpenRouter — edits underway); selected-model highlight w/ theme background following scroll — requested, unconfirmed.
- **Still-open (carried):** Let's Collaborate progress/queue panel + hide/open button; "General" filter redefinition awaiting OK; Simple-Icons SVG logo upgrade; HF downloads column offer; Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty verification; model determination/selector bug; pre-launch rotate OAuth secrets + remove Anthropic subscription/OAuth path; CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons. Eyeball ModelPicker 480px width for composer clipping. Nothing compile-checked → rebuild + eyeball.

### 11ae. Update — 2026-06-09 (ModelPicker maker filter + provider-logo fix + selected-row highlight; composer "+" menu trimmed; two NEW requests)
Continues the §11ad design pass. All shared code → web + desktop. Nothing compile-checked in the sandbox.
- **ModelPicker maker filter BUILT** (clears §11ad "in progress"): a **"Maker" dropdown** lists every maker present (nvidia, meta-llama, qwen, deepseek…) with per-maker counts, sorted by count. Lets the user narrow within a router (e.g. OpenRouter → only NVIDIA models). `makerOf(it,group)` = id prefix before "/" (or provider for local); `makers` useMemo builds the unique list; filter line `maker !== "all" && makerOf !== maker`; native `<select>` (OS-styled options — themed-dropdown upgrade optional).
- **Provider-logo bug FIXED:** group header logo was deriving from the FIRST model's maker (OpenRouter showed ai21's "a"). Header now passes `prov={g.group}` only → shows the **provider's** logo. `Logo` maker-match improved for multi-word names (`raw`, `raw.replace(/\s+/g,'')`, first token) + added **router domains** (deepinfra, groq, together, fireworks, lmstudio, ollama, novita, hyperbolic, sambanova, cerebras, lambda, nvidianim/nim) and a few makers (bigcode, bytedance, z-ai).
- **Selected-model highlight BUILT** (clears §11ad "unconfirmed"): `.model-row.sel` now has an **accent-tinted background box + inset accent border** (was text-color only); `.model-row` got `transition: background/box-shadow .12s`. Because it's a CSS class on the row, the highlight scrolls with the list naturally (no JS). Hover-on-selected slightly stronger tint.
- **Composer "+" menu trimmed** (`src/components/Composer.jsx`): removed **"Commands & skills"** (redundant with `/`) and **"Use style / instructions"**. Menu now: Add files or photos · Mention file/connector · Add to project · Connect a GitHub repo · Connectors. (`openSlashFromMenu` now unused but harmless.)
- **NEW request — Claude-style "Add from GitHub" modal (NOT built):** user wants to replicate Claude's exact "Add content from GitHub" dialog — title "Add content from GitHub / Select the files you would like to add to this chat", a **"Select a repository" dropdown** + paste-URL (link icon), a file picker area ("Select a repository or paste a URL above to get started"), and a footer "Select files to add to chat context · N% of capacity used". Must link a GitHub account, switch between repos, and select individual files to add to the chat as context. This is richer than the current EnvPicker (which clones a repo as a working folder) — it's **file-level context selection into a chat**. Not yet built.
- **NEW request — Skills section in the "+" menu (NOT built):** user wants a **Skills submenu listing the available skills** (algorithmic-art, canvas-design, design-director, doc-coauthoring, internal-comms, mcp-builder, research-deep, skill-creator, slack-gif-creator, etc.) that can be **applied to a Chat or Cowork session**, with "Manage skills" + "Add skill" entries — like Claude's "+ → Skills →" flyout. Not yet built.
- User noted responses are taking too long — keep edits tighter/faster.

### 11af. STILL-OPEN ITEMS (carried forward)
- **NEW: Claude-style "Add content from GitHub" file-picker modal** (repo dropdown + URL + per-file selection into chat context) — not built.
- **NEW: "+" menu Skills submenu** (list skills, apply to Chat/Cowork, Manage/Add) — not built.
- Let's Collaborate progress/queue panel + hide/open button; "General" filter redefinition awaiting OK; Reasoning/Thinking label standardization awaiting OK; Simple-Icons SVG logo upgrade; HF downloads column offer.
- Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty interactive verification; model determination/selector bug.
- Pre-launch: rotate exposed OAuth secrets; remove Anthropic subscription/OAuth path (API-key only); CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.
- Reminder: commit from the user's own terminal (NOT the sandbox — truncated reads corrupt files). Nothing this session compile-checked → `npm run build` + eyeball.

### 11ag. Update — 2026-06-09 (AGENTS feature BUILT — Console-style agent builder, web + desktop)
User asked to replicate Claude Console's "Create agent" concept (screenshot: 4-step stepper, describe-box, template gallery) in BrainEdge, with the difference that **agents use the model from the model selector, not an API key**. Clarified via questions: Integrate step = model binding via the selector; agents can use ALL capabilities (files/shell/connectors/skills, each toggleable per agent); describe-box AI-generates the config with the selected model; adapted Console template set.
- **Storage:** `settings.agents` array (`{id,name,description,instructions,tools:{files,shell,connectors,skills},model,createdAt}`) — persists via existing settings on BOTH platforms (no new IPC). `settings.cjs`: DEFAULTS `agents:[]` + array guard in load().
- **UI:** new `src/components/Agents.jsx` — list view (agent cards: tool pills, pinned-model pill, Run/Edit/Delete) + builder with the Console 4-step stepper: **1 Create** (hero "What do you want to build?" + describe-textarea → `bridge.completeOnce` with a JSON-schema meta-prompt → parsed into the draft; right column = searchable 10-template gallery adapted from Console: Blank, Deep researcher, Structured extractor, Field monitor, Support agent, Incident commander, Contract tracker, Sprint retro facilitator, Support-to-eng escalator, Data analyst); **2 Configure environment** (name/description/instructions + 4 capability toggle cards); **3 Start session** (summary + optional first message + launch); **4 Integrate** (embedded ModelPicker pins a model per agent; "Unpin = use selector"). Settings writes re-read from disk first (clobber-bug pattern). CSS `.ag-*`/`.agent-*` appended to styles.css.
- **Sidebar:** "Agents" entry (Bot icon) in TOP under Projects. **App.jsx:** `mode==="agents"` route; `startAgentSession(agent,prompt)` pins the model via `selectModel` (selector semantics), picks target mode (**files/shell → cowork**, else chat), seeds a FRESH conversation via `agentSeed` ref (mirrors studioSeed; explicit agent param to `send` avoids a stale closure); `agentCtx` state shows an accent **agent chip** (hero) / **agent bar** (in-chat) with detach ×; cleared on manual nav/newSession/openSession.
- **Engine (desktop)** `session-manager.cjs`: `req.agent` stored on session; `_agentSys(s)` builds the agent system prompt (+date); `_agentExtras` filters connectors/skills by the agent's toggles; chat tool-loop gets `systemOverride`, plain `_chatTurn` swaps its system prompt, cowork/code openai loop appends agent sys via `globalInstructions` (keeps file-tool guidance), anthropic SDK path injects instructions into the first prompt (like project injection).
- **Engine (web)** `webBridge.js`: `agentBlock()` prepended to the session system prompt; a custom agent only gets file tools when its Files toggle is on (`wantsFiles` gates `agentic`); `sess.agent` kept.
- **Known v1 limits (called out):** reopening an old conversation does NOT re-attach its agent; web connectors/skills toggles are prompt-level only (MCP spawn is desktop-only, standing limitation); cowork-target agents still need the user to pick a folder before the first send.
- **NOT compile-checked** (sandbox VM down this session) → `npm run dev` / `npm run electron:dev` + eyeball. Test: Sidebar → Agents → describe an agent → generated config lands in step 2 → Start session → agent chip shows + replies follow instructions; pin a model in step 4 and confirm the selector repoints on Run.

- **Follow-up (same day):** live **ModelPicker added inside the Agents flow** — list header + builder stepper bar (all steps), bound to the global selector via new `onSelectModel` prop (App passes `selectModel`); hint under the describe box names the model generation will use. Step-4 pinning unchanged.
- **Follow-up 2:** user thought Run "just opened Let's Chat" — the agent WAS attached but only the small chip showed. Hero now renders an **agent identity header** when `agentCtx` is set (accent Bot tile + agent name as the greeting + description subline) instead of the generic greeting. CSS `.hero-agent*`.

- **Follow-up 3 — "Agent Studio" REDESIGN (de-Anthropic'd, full UI rewrite; backend untouched).** User: looks copied from Console — make it innovative, inspired by other AI providers, backend 100% same. Chose (via questions): **build-by-chat + live preview** (GPT-Builder-style), **full visual identity**, templates reframed as **personas/crew**. New `Agents.jsx`: NO stepper — a "Studio" room with **Designer chat (left)**: talk to shape the agent (completeOnce returns `{reply, config}`, draft updates live; persona chips inline when empty) + collapsible **Blueprint** (raw purpose/instructions/capability pills/model pin); **Bench (right)**: live multi-turn test chat with the draft agent (instructions-only via completeOnce; note that tools activate in real sessions; reset button). Top bar: clickable identity face (cycles color/glyph), inline name input, ModelPicker, Save, **"Put to work"** (launch). **Identity** = `agent.identity {color, glyph}` auto-assigned (8 colors × 12 glyphs, hash-based) — additive settings field, engines ignore it; shown on cards, Studio, hero header, in-chat bar, chip (App.jsx inline-styled). List = "Agent Studio" identity-card grid + dashed "New agent" tile; empty state shows the **crew** grouped Research/Ops/Docs/Data (personas: Scout, Radar, Sentinel, Concierge, Bridger, Clausewise, Retroscribe, Schema, Quant — same instructions/tools as before, renamed presentation only). Vocab fully de-Claude'd: hire/persona/bench/blueprint/put-to-work. CSS `.ags-*` block added (old `.ag-*` kept for shared bits). Same caveats: not compile-checked; Save bug from earlier session still awaiting user's console output.

- **Follow-up 4 — agentic-only model filter in Agent Studio.** New opt-in `agenticOnly` prop on ModelPicker: pre-filters to tool-calling-capable models (real `tools` data from the OpenRouter catalog, name fallback; catalog pre-fetched on mount for agenticOnly pickers, not just on open), hides the redundant Agentic chip, shows an "agent-ready only" pill. Applied to all three Studio pickers (list header, Studio top bar, Blueprint pin). **Global model selector untouched** (prop defaults to false).

### 11ag-2. Update — 2026-06-09 (MULTI-AGENT ECOSYSTEM: Teams + Mission Control, web + desktop)
User: build the multi-agent ecosystem — non-developer friendly, "feel like running a team of 100+, like a factory". Built **Teams** end-to-end:
- **Concept:** a Team = saved agents + a working mode. **Relay line** (members run in order, each receives mission + all prior teammates' work; last member's output is the deliverable) or **Managed** (coordinator LLM plans one sub-task per member as JSON, members execute in sequence seeing prior work, coordinator synthesizes one streamed answer). Hard cap 6 members/run.
- **Desktop engine** (`session-manager.cjs`): `req.team {name,mode,members:[agent objects]}` → `_teamTurn` (plan → execute → deliver). `_runMember` wraps emit — member prose captured (not streamed), member tool_use/tool_result/permission events FORWARDED so tools + permission modals work mid-mission; members with files/shell get cwd when session has one; per-member **pinned model honored** (`_memberProfile` — members can run on different models); anthropic-kind members run plain streamChat. Member steps emitted as tool cards named `"<Name> (teammate)"`; manager plan as `"Team plan — <team>"`.
- **Web engine** (`webBridge.js`): `runTeamTurn` — same flow/event shapes via callModel; members instruction-level only (no MCP/terminal in browser — called out); routed at top of runTurn; persists via persistSession.

### 11ah. Update — 2026-06-10 05:45 (same "Fable5" session continued: fan-out → Guide → code-review fix waves → missed features → UI/layout → Models dashboard → FULL QA ORGANISM)
Chronological; full narrative in Chat.md "Session — 2026-06-10 05:45". Session still active at doc time.
1. **Parallel fan-out** for Managed teams (desktop `_teamTurn` `Promise.all`; web `runTeamTurn`) + permission queue (no modal deadlock). Relay sequential by design. **TEST-AGENTS.md** = 6-scenario e2e script (Scenario 0 = Save smoke test).
2. **Agent Guide**: storytelling first-visit overview → redesigned two-pane (chapter rail | "Flight school" launchable sims). Tabs renamed **Agent / Agents Team**; Agent Guide tab (animated book, standing violet highlight); **model selection mandatory** before agent creation; **global accent theming of all lucide icons** (inversion on accent surfaces).
3. **CODE-REVIEW-SUMMARY.md** (3 review agents, ~80 findings, report-only) then user-approved **fix waves, 16/17 done**: prod refuses default secrets; arg-safe tar extraction (kills filename injection); crypto IDs; timing-safe admin key + rate limit; async terminal (no 30s freeze); 4MB log rotation; history cap 200; settings cache+guards; **`src/components/markdown.jsx`** dependency-free XSS-safe React markdown renderer + `Message.jsx` memoization (chat finally renders real markdown); picker 250-row cap; deps pinned (agent-sdk 0.3.150, MCP SDK 1.29.0). **Q16 monolith split deferred.**
4. **§4 half-baked all closed**: speed-test selector snapshot/restore guard; **conversations persist their agent/team and re-attach on reopen** (supersedes the §11ag "reopened conversations don't re-attach" limit — new records only); artifact version dropdown; CDN-fallback notice; **PDF/docx Projects knowledge** (pdf-parse + mammoth, ~100k-token/file cap); web cowork signpost.
5. **Builds/audit**: first green vite build of the batch; `npm audit --omit=dev` = **0 runtime vulnerabilities**; electron-builder→26 + @electron/rebuild→4 (15→6 findings; rest in vite/vitest dev chain — major upgrade deferred). Commit done by user per guidance.
6. **Missed features (7/8)**: sidebar **global content search**; conversation **Markdown export**; **per-agent knowledge files** (≤8, solo + teams); **Backup & restore** (single file, keys readable — warned); **onboarding wizard**; **Consumption cost estimates** (OpenRouter pricing, coverage-labeled); **update check** (`/app-version` + sidebar banner). Per-member team retry deferred honestly.
7. **World-class UI pass**: single motion vocabulary (one easing, 3 durations), micro-interactions on everything, skeletons, reduced-motion, teaching empty states. **Layout discipline**: dense pages full-width (Models Overview), dashboards centered ≤1500/1280 with clamp padding, chat 860px; Models desc 2-line clamp (no horizontal scroll); Consumption 16px rhythm; subagent audit centered remaining pages.
8. **Models Overview = interactive dashboard**: 5 stat tiles as filters, per-cell meter bars, cost color tiers, inline row expansion, **Compare mode** (≤4 models, best-value badges).
9. **QA ORGANISM (admin-only Test Center)** — the session's biggest build:
   - **Engine cycle**: 7 suites ~32 tests (code integrity, stores w/ canary CRUD, file sandbox, live engine = 6 real model calls, Agents&Teams incl. REAL 2-member relay mission through the team engine, Skills/Scheduler/ViaMobile/CLI, auth server). ~9 model calls/cycle.
   - **TESTING-BLUEPRINT.md**: non-developer storybook bible (architecture diagrams, 4-gate pipeline, runbooks, triage table, 39-test inventory).
   - **Repair Bay** (`qaDiagnose` bridge): error + suspect files → AI diagnosis + ONE validated minimal patch as diff → admin Approve&apply (backup first) / Roll back; env failures labeled not-auto-fixable. Supervised autonomy.
   - **Functional UI Sweep**: app drives itself — 19 scripted scenarios across all surfaces (real PNG paste, voice check, slash menu…), HUD, visual dashboard (% card, clickable area cards, per-scenario detail board, honest skips).
   - **Plain-English error layer**: every failure = bold explanation + action; raw text collapsed; **navigation buttons to the fixing screen** (key/model issues → Model configuration).
   - **Scenario Manager**: scenarios are DATA (navigate/click/type/paste/expect/wait); plain-English description → AI drafts steps → editable rows → saved scenarios run in every sweep; pause/delete; untick stale built-ins.
   - **Test Center restructured**: 4 status cards → tabs (Engine / UI sweep / Scenario library / History & issues); survives navigation mid-run.
   - **External safety net**: `npm run qa | qa:fast | qa:list | qa:restore` — terminal-only verifier (parse all engine/server/CLI, manifest, real build), **auto-checkpoint of green source to `.checkpoints/good-<ts>/`** (keep 5), restore = back to last green (broken state snapshotted first). Source only — never user data/keys.
10. **OPEN at doc time**: Save "nothing happens" bug STILL unresolved; per-member team retry; vite/vitest majors (incl. 1 dev-only critical); Q16 split; speech engine absent by design; Playwright/CI harness = pre-launch roadmap; electron-builder 26 unverified until next installer build; user hit NVIDIA 401 (key/model mismatch — guidance given, navigation button now exists).
- **Storage:** `settings.teams` `{id,name,identity,mode,members:[agentId]}` (ids resolved to live agents at launch so agent edits flow through). settings.cjs DEFAULTS + guard.
- **UI:** Agent Studio gains **Agents | Teams tabs**; team cards (stacked member faces, mode, "Brief the team"); **team builder** (name+identity, Relay/Managed mode cards in plain language, line-up with order arrows ↑↓ + remove, add-from-bench persona chips). **Mission Control** (`TeamOps.jsx`, right panel in chat like ArtifactPanel): live factory floor — stations per member with rail connectors, queued/working(glow pulse + scanning bar + rotating verbs)/done(output snippet)/failed states, Coordinator plan + Assembly synthesis stations, elapsed clock, status strip ("X on the floor · n/m stations cleared"). Driven purely by UiEvents (App tracks `teamRun` from `(teammate)`/`Team plan` tool events; result → finished). `teamCtx`+`teamSeed` mirror agentCtx; hero shows stacked team faces; clears on nav/new/open.
- **Honest limits:** web members are prompt-only (no tools); members run sequentially (no parallel fan-out yet); reopened conversations don't re-attach teams; cost = N member calls + plan + synthesis per mission. NOT compile-checked (sandbox down) — `npm run electron:dev` + eyeball; Mission Control hides <980px width.
- **Roadmap next:** agent-as-tool (`call_agent`) so any session/agent can invoke roster agents; Scheduler-run teams.

### 11ah. Update — 2026-06-09 (PARALLEL FAN-OUT + AGENT GUIDE + FULL CODE REVIEW & FIX WAVES — newest authoritative state)
- **Parallel fan-out BUILT** (clears §11ag-2 "sequential" limit): Managed teams dispatch all members via `Promise.all` (desktop `_teamTurn`) / same in web `runTeamTurn`; each member gets only its own sub-task, coordinator merges after join. Relay stays sequential by design. **Permission queue** added in UI so concurrent member permission requests don't deadlock the modal. Mission Control shows multiple stations working at once.
- **TEST-AGENTS.md** (new repo doc): 6-scenario E2E script — Scenario 0 (Save smoke test) GATES everything; 1–2 solo, 3 Relay, 4 Managed-parallel proof, 5 combined solo→Managed→Relay mission. Score card + troubleshooting map.
- **Agent Guide BUILT** (in `Agents.jsx`): first-visit storytelling overview — 5 chapters w/ themed-markup flow diagrams (Anatomy, Solo, Relay, Managed) + simulations launching into Studio/Teams (sim 1 pre-fills Designer). Redesigned to **two panes**: left chapter rail (staged, ✓ progress, pager; final Next → "Create your first agent" in header), right "Flight school" sim column w/ chapter-linked glow. Refinements: tabs = **Agent** / **Agents Team**; **Agent Guide** button before them (violet standing highlight, page-turn book animation); "Ready to hire" removed; scroll clamped; **mandatory model gate** before agent creation (accent-solid pulsing picker); **global lucide icon theming** to accent w/ contrast exceptions.
- **CODE-REVIEW-SUMMARY.md** (new repo doc; CODE-REVIEW.md also present): 3-subagent review of the whole project, ~80 findings, Q1–Q18 fix questionnaire in 4 waves, zero-bug deploy strategy (self-testing Managed QA team), UI world-class recs.
- **All waves approved & EXECUTED — 16/17:** W1 security (prod startup refuses factory-default `SESSION_SECRET`/`ADMIN_KEY` — **server now EXITS in prod without real values; set on Render before deploy**; argument-safe tar zip import; crypto-strength IDs; timing-safe admin key + rate limit; web local-keys notice). W2 reliability (async run_bash; 4MB log rotation; 200-msg history cap; team hand-off trimming; per-session usage state fixes race; settings cache + schema guard; web save-failure warnings). W3 quality (**real markdown chat rendering** via new dependency-free XSS-safe `src/markdown.jsx`; Message memo = only live message re-renders while streaming; 250-row picker cap; light-theme coverage Studio/MissionControl/Guide; focus rings/aria; honest web Skills notice). W4 (deps pinned: agent-sdk 0.3.150, MCP SDK 1.29.0; node-pty OK). **Q16 monolith split DEFERRED** until first green `npm run build`.
- **Standing directives:** top-5 provider quality bar; 100k-users/2yr → scale items (Postgres store, Redis rate limiting, multi-instance) promoted to roadmap.

### 11ai. STILL-OPEN ITEMS (carried forward)
- **Save button "nothing happens" bug — undiagnosed**, awaiting user's DevTools console / [VITE] output; blocks Scenario 0 and all agent/team persistence testing.
- **Nothing from this session compile-checked** → user must run `npm run build` + full restart (engine changes in main process); first-failure suspects: markdown.jsx, Message.jsx, agent-openai.cjs, settings.cjs. Markdown smoke test: ask for a table + code sample. Commit from user's own terminal only.
- Q16 monolith file split (after green build); per-agent knowledge files (GPTs-style) noted gap; `call_agent`, scheduler-run teams; icon repaint contrast eyeball pass.
- Earlier carry-forwards remain (§11af): Claude-style GitHub file-picker modal; "+" menu Skills submenu; Let's Collaborate progress/queue panel; "General" filter + Reasoning-label decisions; Simple-Icons upgrade; Ink CLI verification; pre-launch secret rotation + Anthropic-path removal; CLI wire format + distribution; file-tree view + undo/checkpoints.

### 11ag-3. Update — 2026-06-09 (PARALLEL FAN-OUT built + permission queue; originality directive)
- **Parallel fan-out BUILT (web + desktop):** **Managed** teams now run ALL members **simultaneously** (`Promise.all`; each member gets mission + own sub-task ONLY — no prior-work chaining in parallel mode), coordinator synthesis after the join. **Relay stays sequential by design** (the hand-off chain is its purpose). Mission Control shows multiple glowing stations + "N agents on the floor" count.
- **Permission queue (App.jsx):** parallel members can request permissions at the same instant — previously the modal would show only the latest and orphan the rest (deadlock). Now `permQueue` ref queues requests; resolving/denying one feeds the next.
- **USER DIRECTIVE (standing):** nothing should feel like an Anthropic copy — borrow the best agent concepts from across the market (user cited "Teamly"-style team/workforce concepts). Current build already leans AI-workforce (hire/crew/bench/line-up/Mission Control/stations); future agent work should continue the workforce metaphor (role titles, departments, per-agent run history/KPIs, org-chart view are natural next steps).
- Cost note: parallel doesn't reduce tokens — only wall-clock time (N calls still happen, now concurrent; watch provider rate limits with 5-6 members).

### 11ag-4. Update — 2026-06-09 (E2E agent test plan → TEST-AGENTS.md; no code changes)
- User asked to test the entire agent concept end-to-end (solo agent, Relay team, Managed team, all three combined). Wrote **TEST-AGENTS.md** (repo root): six scenarios, ~30 min, exact prompts, per-step pass/fail, score card, troubleshooting map. **Scenario 0 = Save-path smoke test and GATES everything** (Save bug unresolved; agents + teams persist via that path). Scenarios: 1 solo instruction agent (Bench vs deployed), 2 solo file agent (Quant + permissions), 3 Relay pipeline, 4 Managed parallel fan-out (all stations must glow at once), 5 combined: solo profile → Managed parallel launch kit → Relay blog post (8 agents, 3 stages; stage-1 data must survive to final output). Stage chaining is manual paste — automatic chaining = `call_agent` roadmap item. No source touched; full restart (`npm run electron:dev`) needed before testing.

### 11ag-4. Update — 2026-06-09 (Agents GUIDE page — storytelling overview + flow diagrams + simulations)
- Clicking sidebar → Agents now opens a **first-visit Guide** (view "guide", localStorage flag `be.agentsGuideSeen`; reopen anytime via the **Guide** button in the Studio header). Storytelling structure: hero "Meet your AI workforce" → 5 numbered chapters: 01 anatomy (Identity→Instructions→Capabilities→Model flow), 02 solo agent (You→Agent→Deliverable), 03 Relay (assembly-line chain diagram), 04 Managed (coordinator fan-out diagram with 4 parallel branches + merge), 05 **Simulations** — the 5 TEST-AGENTS.md scenarios as story cards (title/arch/time/story/steps); "Start" on sim 1 jumps to the Studio with **the Designer input pre-filled**; team sims open the Teams tab. Closing CTA card "Ready to hire?" → create first agent. Diagrams are pure CSS/markup (`Node`/`Arrow` components, theme vars, no images/SVG deps). CSS `.agg-*`. TEST-AGENTS.md is the deeper companion script.

- **Follow-up (same day): guide split into a two-pane interactive layout** (user liked the page but wanted no long scroll). LEFT = the story: intro + a clickable **chapter rail** (01 anatomy / 02 solo / 03 relay / 04 managed; active accent, read chapters get a ✓) showing **one chapter on stage at a time** with a slide-in animation, Back/Next pager with progress dots; final Next becomes "Create your first agent". RIGHT = **Flight school**: the 5 simulation cards (single column, the card matching the current chapter's architecture gets a glow ring `.lit`) + the "Ready to hire?" CTA. New `chapter` state; CSS `.agg-wrap/.agg-left/.agg-right/.agg-rail*/.agg-stage/.agg-pager*`; stacks to one column <980px. Old single-scroll chapter markup removed (stale `.agg-chapter/.agg-hero` CSS rules remain, harmless).

- **Follow-up (guide/UX polish round):** "Ready to hire?" card REMOVED (right pane now ends with a one-line reopen hint); "Create your first agent" moved to the TOP of the guide (header row beside the kicker); guide layout fixed so the page never scrolls past the panes (`.agg-wrap overflow:hidden`, `.agg-stage flex:none` removes the dead space below the pager); tabs renamed — **"Agent"** (single-person User icon) + **"Agents Team"** (Users icon) — with **"Agent Guide"** as a tab-styled button positioned BEFORE them (replaces the header Guide button), book icon animated with a page-turn keyframe (`.agg-book`/`agg-flip`); **model selection now mandatory** before creating an agent (`hasModel` gate in openStudio → error line + pulsing picker; clears when a model is picked) and the Studio ModelPicker trigger is **accent-solid like "Put to work"** (`.ags-mp .model-btn`).

- **Follow-up (icons + tabs round):** tab counts removed (plain "Agent" / "Agents Team"); **Agent Guide tab gets a standing violet highlight** (#a99bff tint — deliberately NOT the accent so it reads as "learning", not "selected"); **global icon theming** added — `svg.lucide { color: var(--accent) }` so every lucide icon app-wide carries the theme accent, with contrast exceptions (accent-solid surfaces: primary buttons/send/ag-gen/model-btn/sb-new invert to inherit; delete icons stay danger-red on hover). NOTE: this recolors icons app-wide (nav, tool cards, menus) — eyeball for spots where accent-on-accent or odd contrast appears; specific overrides with higher specificity still win.

### 11ag-5. Update — 2026-06-09 (FULL CODE REVIEW delivered — report only, NO code changed)
- User asked for a whole-project review (everything pre-Agents was built by Opus 4.8). Ran 3 parallel review agents (backend+server / frontend / web+CLI), consolidated ~80 findings into **`CODE-REVIEW-SUMMARY.md`** (in repo root): §1 findings in plain language (S1-S6 security incl. default server secrets + 2 command-injection points + weak IDs; R1-R6 reliability incl. blocking execSync, unbounded growth, _curTurn race, silent IndexedDB failures; F1-F8 frontend incl. NO markdown rendering in chat, full-timeline re-render per token, monolith App/Agents.jsx, light-theme gaps; B1-B3 build incl. "latest" deps, node-pty packaging conflict); §2 fix plan as **Q1–Q17 YES/NO questionnaire in 4 waves** (security → reliability → visible quality → structural); §3 missed features (export, per-agent knowledge, global search, auto-update, onboarding wizard, cost estimates, backup/restore); §4 half-baked audit vs Claude inspiration (chat rendering worst, plus artifacts versioning, text-only knowledge, selector bug, my own Agents caveats); §5 zero-bug deploy strategy — **QA agent crew testing BrainEdge with BrainEdge** (Smoke Tester/API Prober/UI Auditor/Regression Scribe as a Managed team) + 4 gate layers; §6 world-class UI pass = **Q18**. AWAITING the user's Q1–Q18 answers before any action. NOTE: long Write calls were truncated this session — the file was assembled in chunks; verify tail reads "End of review."

### 11ag-6. Update — 2026-06-09 (REVIEW FIX WAVES EXECUTED — Q1–Q17 approved by user, all built except Q16)
User approved all waves autonomously. **Landed:**
- **W1 security:** auth-server **production guard** (refuses to start with default SESSION_SECRET/ADMIN_KEY when NODE_ENV=production, RENDER set, or non-loopback BASE); zip import now uses **tar.exe argv** (injection-safe) w/ escaped-PowerShell fallback (main.cjs); **crypto IDs** (session-manager `newId` via randomBytes; webBridge `rid` via getRandomValues); **adminOk hardened** (timing-safe key compare + 30/min/IP rate limit); **web key notice** in ModelConfig.jsx (keys stay in browser).
- **W2 reliability:** `run_bash` now **async** (execAsync; execTool made async — main process no longer freezes); **usage.jsonl rotation** (4MB → keep last 20k lines); **history load cap 200 msgs**; team hand-off/synthesis context **trimmed 12k chars/member** + abort check after parallel join (both engines); **_curTurn → per-session `_turns` Map** (race fixed); **settings load() mtime cache** + invalidate-on-save + light schema guard; **webBridge persistSession surfaces failures** (console + one-time in-chat warning).
- **W3 visible quality:** **NEW `src/markdown.jsx`** — dependency-free markdown→React renderer (headings/bold/italic/strike/inline code/fenced code with copy bar/links/lists/quotes/hr/tables; XSS-safe: React elements only, mid-stream tolerant) wired into Message.jsx for assistant bubbles; **Message memoized** (only the live streaming message re-renders); **ModelPicker render cap 250 rows** + "type to narrow" note; Sidebar recents cap 100; `.md-*` CSS; **light-theme overrides** for ags/tops/agg/md; global **:focus-visible** ring; aria-labels on icon-only sends/close; **Skills web signpost** (folders/import = desktop).
- **W4:** package.json deps **pinned** (claude-agent-sdk ^0.3.150, @modelcontextprotocol/sdk ^1.29.0 — fetched from npm registry); npmRebuild:false confirmed CORRECT (prebuilt-multiarch pty ships binaries).
- **Q16 DEFERRED deliberately:** splitting App.jsx/Agents.jsx blind with no compile environment contradicts zero-bug — do it after the first verified build.
- **USER DIRECTIVES (standing):** (1) world-class app, take best features from top-5 AI providers, never limit to Anthropic; (2) **target 100,000 users in 2 years** → scale matters: JSON store → Postgres, Redis-backed rate limiting, multi-instance server are now roadmap, not nice-to-haves.
- NOTHING compile-checked (sandbox down ALL session). First `npm run build` + `npm run electron:dev` is the test. Risk spots: markdown.jsx (new), Message memo, execTool async conversion, settings cache.

### 11ag-7. Update — 2026-06-09 (§4 HALF-BAKED AUDIT — all observations fixed, user-approved autonomous)
- **Model-selector stranding: GUARDED both platforms.** Deep trace found NO direct write path in Speed Check/Overview UI — so a bulletproof guard instead: speed test snapshots `activeProfileId+model` at start and **restores them after the run if anything moved them**, console.warn names before/after so the true culprit self-identifies. main.cjs (`_speedSnap`) + webBridge runSpeedTest (`snap`).
- **Agent/team re-attach on reopen: BUILT.** Conversation records carry `agent`/`team` (desktop `_persistTurn` → sstore; web persistSession); App.openSession restores agentCtx/teamCtx.
- **Artifacts: version history + CDN fallback BUILT.** ArtifactPanel **version dropdown** (same-kind artifacts from the timeline, App passes `versions` via extractArtifacts — App now imports it; CSS `.artifact-ver`). CDN script tags (react/reactDom/babel/mermaid/marked) get **onerror fallbacks** ("Preview library blocked — source in Code tab") + load-guarded init; no more blank frames on strict networks.
- **PDF/docx knowledge parsing BUILT (desktop):** `knowledgeText()` in main.cjs lazy-requires **pdf-parse ^1.1.1 / mammoth ^1.8.0** (added to package.json — **`npm install` REQUIRED before next build**); image-only PDFs skipped with reason (`skipped[]` returned); 400k-char/file cap; dialog accepts pdf/docx. Web knowledge stays text-paste.
- **Web cowork signpost:** folder bar (web, folder chosen) now says "File edits only on web — running commands needs the desktop app".
- **Documented as deliberate, NOT bugs:** Via Mobile single-session binding (multi-device = relay infra, roadmap); Bench instructions-only (labeled); web team members prompt-only (browser physics). Chat rendering already fixed (markdown wave).

### 11ag-8. Update — 2026-06-09 (§3 MISSED FEATURES — 7 of 8 BUILT, user-approved autonomous)
- **Global search (content) BUILT:** `sstore.searchSessions` (snippet around first hit, 50 cap) + IPC/preload; webBridge parity over idbAll. Sidebar: 3+ chars = debounced DEEP search with snippet line under titles (`.sb-rec-snip`); shorter = title filter as before.
- **Conversation export BUILT:** Download icon on every Recents row → exports the conversation as Markdown (title + You/BrainEdge turns + divider; safe filename). Prints to PDF from any editor.
- **Per-agent knowledge BUILT (GPTs-style):** `agent.knowledge[] {name, content}` — Studio Blueprint "Knowledge (n/8)" section with Add-file (FileReader; text formats; 1MB/file guard, 200k-char cap, 8 docs max) + remove pills. Injected into desktop `_agentSys` AND `_memberSys` + web `agentBlock`/`memberSys` via shared `agentKnowledge` block (20k chars/doc cap) — so knowledge works solo AND in teams, both platforms. PDFs → use Projects (which now parse them); hint says so.
- **Backup/restore BUILT:** ModelConfig bottom card — Download backup (full settings incl. agents/teams as JSON; warns keys are readable) + Restore (validates `app:"brainedge"` marker, confirm dialog, replaces settings). `restoreRef` hook placed above the early return (hooks rule).
- **Onboarding wizard BUILT:** `Onboarding.jsx` overlay on first run when NO provider has a key (skippable, `be.onboarded` flag): pick OpenRouter (recommended)/Gemini/NIM/Local → paste key → Connect verifies via listModels, auto-picks a `:free` model when present, caches models, "Start chatting". App reloads settings+models on done.
- **Cost estimates BUILT:** Consumption gains "Est. spend (N% priced)" KPI — tokens × blended OpenRouter per-token pricing; models without published pricing excluded and the coverage % says so; card hidden at 0% coverage (graceful if catalog shape lacks pricing).
- **Update check BUILT:** server `GET /app-version` (env APP_VERSION + APP_DOWNLOAD_URL); desktop Sidebar compares vs `app.getVersion()` (new `getAppVersion` IPC/preload + webBridge "web" stub) and shows an upsell-style "Update available · vX → Download" banner. NOT auto-install — deliberate (real auto-update = electron-updater + signed releases, roadmap).
- **#7 per-member team retry: DEFERRED honestly** — needs a real engine API (re-run one member + patch deliverable); Stop works today; documented as the next Teams engine iteration rather than shipping a fake re-run button.
- Compile status: built on top of a GREEN build, but THIS batch is unverified → `npm run build` again. Risk spots: Consumption spend memo (catalog shape), Sidebar update effect, ModelConfig double react import (legal but lint-noisy), Onboarding overlay z-order.

### 11ag-9. Update — 2026-06-09 (Q18 WORLD-CLASS UI PASS — design-system layer landed)
- **Design tokens** in :root — ONE easing (`--ease` cubic-bezier(.22,1,.36,1)), three durations (`--dur-1/2/3` 120/220/380ms), modular type scale (`--fs-xs…--fs-2xl`).
- **200ms rule:** every interactive element (buttons/chips/nav/cards/tabs/rows) shares one transition vocabulary; `:active` scale(0.97) press feedback; primary buttons lift+glow on hover.
- **Card lift** (2px translate + soft shadow) on agent/sim/choice cards, light-theme variant.
- **Arrival animations, one vocabulary:** messages `rise-in`, side panels (Artifact/Mission Control) `slide-in`, menus `pop-in`, modals `modal-in`, scrims `fade-in`. Streaming caret = breathing block (not a blink).
- **Skeleton loaders** (`.skel` shimmer) replace "Loading…" in Consumption + ModelConfig; `.skel-page/.skel-row` primitives for future screens.
- **Empty states teach:** Recents empty/no-match copy now points at the next action; ::selection themed; tabular-nums on all stat numbers; custom scrollbars padded; **prefers-reduced-motion honored globally**.
- Note: `.msg` rise-in animates restored conversations once on mount (acceptable); deeper per-component polish (Composer focus glow, TopNav) intentionally left for after visual review — foundation first, then taste passes on real screens.

### 11ag-10. Update — 2026-06-09 (LAYOUT DISCIPLINE — every page centers + breathes with the window)
User screenshot showed Consumption using ~half a 2550px window (`.cons` max-width:1040, left-anchored). Fixed globally:
- New tokens `--page-max:1500px` (dashboards/galleries) + `--prose-max:860px` (reading surfaces). One rule centers all page containers (`width:100%; margin-inline:auto`).
- Per-page: `.cons` → page-max + fluid `clamp(20px,3vw,44px)` padding + **`.cons-wide2`** (Consumption.jsx wraps Activity+Daily panels → side-by-side ≥1500px, stacked below); `.agents-page` 1180→page-max; `.mo` (Models Overview) centered page-max + fluid padding; `.settings` (Connectors/ViaMobile/Plugins/Settings) NEW rule max-width 1280 centered; `.mc-wrap`/`.pj-*`/`.pjd-grid` 1080-1100→1280; `.sched-wrap` 1000→1280; `.studio-inner` 940→1240; `.chat-inner` 780→prose-max(860); `.prof` 560→720 centered; `.skel-page` matches.
- Audit (subagent) confirmed Skills split-pane + charts already fluid; no fixed-width SVGs. Eyeball risk: Settings' internal grid at 1280 cap; ViaMobile/Plugins had inline maxWidth (760/720) on inner content — still narrower than their now-centered container (fine, content centers).

- **Follow-up (Models Overview, user screenshot):** horizontal table scroll KILLED — root cause was the unbounded Best-for description column pushing the table past the window (hiding the model-name column off-screen left). `.mo-best` now **2-line clamp** (-webkit-line-clamp; full text via row title tooltip + detail card); `.mo` is now **full-window width** (max-width:none — data-dense pages use everything; sparse pages keep centering via --page-max). Rows also got much shorter (2-line cap vs 5-6 lines). `.mo-tablewrap` keeps overflow-x:auto only as a narrow-window safety net. RULE OF THUMB recorded: data-dense tables = full width; content pages = centered --page-max; prose = --prose-max.

- **Follow-up 2 (Consumption alignment, user screenshot):** the page now runs on a STRICT 16px rhythm — `.cons` is a flex column with gap:16 (all ad-hoc margin-bottoms removed: head/kpis/panel/foot); `.cons-wide2` is always a grid (1col → 3fr/2fr ≥1500px, the old margin:0!important hack removed — it had been collapsing row spacing); KPI cards are flex columns with `min-height:108px` and **labels pinned to a shared baseline** (`margin-top:auto`), auto-fit columns; `.cons-2col` stretch-aligns so Tokens-by-model and Highlights panels are EQUAL HEIGHT, donut + heatmap content vertically centers in the equalized panels. Outer-rhythm normalization (gap/margins → 16px) also applied to `.ags-grid/.ags-split/.agg-sims/.prof-card/.pjd-rail`. DESIGN RULE recorded: outer rhythm (between cards/sections) = 16px everywhere; inner spacing (within a card) may be tighter; data-dense pages full-width, sparse centered. Pixel-perfection claims require eyeballing real renders — user should screenshot any page that still looks off.

### 11ag-11. Update — 2026-06-09 (Models Overview INTERACTIVE DASHBOARD + admin QA TEST CENTER)
**A. Models Overview rebuilt as an interactive dashboard** (user: "boring") — data logic untouched, interaction layer added: **Insight band** (5 clickable stat tiles: Models / Free / Agent-ready / Open-weight (new `open` filter) / Speed-tested→sorts by speed); **in-cell Meter mini-bars** under Context (log scale)/SWE/HumanEval/Speed + cost color tiers (`tier-free/low/mid/high` via costTier); **inline expandable rows** (click toggles `expanded`, caret rotates; expansion = full description, wins/misses chips, stat meters, actions: Full details→old modal, Copy id, Download sources, Add to compare); **Compare mode** (per-row checkbox max 4 → floating bottom bar → side-by-side overlay with **best value highlighted** per metric). Rows are `Fragment key=` pairs. CSS `.mo-tiles/.mo-meter/.mo-exp*/.mo-cmp*`.
**B. QA TEST CENTER (admin-only) — "BrainEdge tests BrainEdge":**
- **`electron/qa-runner.cjs`**: ~25 tests, 5 suites — Code integrity (node --check every .cjs + server + package.json pin check), Data stores (settings round-trip, agents/teams schema, sessions create→content-search→delete canary, projects CRUD + projectSystem, usage summary), File tools (temp-dir ops + escape semantics), **Live engine** (real model calls: PONG ping, exactly-3-bullets, agent-identity BANANA test, Designer-JSON discipline, team-plan JSON, markdown table), Auth server (health/app-version/admin-locked; `skip:` when no authBaseUrl). Events `qa_start/qa_test/qa_done` over `brainedge:qa`; history (30 runs) → qa-runs.json.
- IPC/preload qaStart/qaStatus/qaHistory/onQaEvent; **TestCenter.jsx** (admin gate = working adminStats(), same door as Admin Analytics): progress bar, per-suite board (queued/running/pass/fail/skip + ms), **Issues list first** with exact errors, "All clear — ship it" banner, past-runs history; web = desktop signpost. Sidebar **Test Center** (FlaskConical) shown only to admins.
- Honest limits: no pixel/UI-click automation (needs a browser harness — roadmap); LLM tests lenient to nondeterminism; server suite skips when unconfigured. Restart required (main-process change) + sign in as admin.
- **REPAIR BAY built (identify → review with admin → fix, supervised-autonomous):** new `electron/qa-fixer.cjs` — per failed test, `diagnose()` maps the test id to suspect source files (full map), sends error+code to the active model, gets `{diagnosis (plain English), fixable, file, find, replace, restartRequired, confidence}`; the patch is **validated before display** (must exist EXACTLY ONCE in the file, else demoted to diagnosis-only with the reason). `applyFix()` = path/extension allowlist guard (project tree only, .cjs/.mjs/.js/.jsx/.css/.json) → timestamped `.repairbak-` backup → exact replace → require-cache drop; `rollback()` restores. **Nothing applies without the admin's Approve click.** IPC qaDiagnose/qaApplyFix/qaRollback; TestCenter issues get "Diagnose & propose fix" → proposal card (diagnosis, file, confidence, restart note, red/green diff) → Approve & apply / Dismiss / Roll back. Environmental failures (provider/key/server) honestly marked not-auto-fixable. Renderer/src + main/preload fixes flagged "restart/rebuild required". Also: **TESTING-BLUEPRINT.md** written (storybook QA bible: cast/architecture/flow diagrams/7 departments/daily ritual/4-gate pipeline/runbook/triage table/honest boundaries/39-test inventory) — needs a Repair Bay chapter added next doc pass.
- **TEST CENTER RESTRUCTURED (categorized dashboard):** page is now **overview + 4 tabs** — header with BOTH run buttons (engine cycle / UI sweep); **mission-status card row** (`.qa-ov*`): Engine tests (last pass ratio + date, live % while running), UI sweep (last %), Scenario library (counts), Open issues (engine+sweep fails; green "all clear"/red "needs attention") — each card is a door into its tab; tabs = Engine tests | UI sweep | Scenario library | History & issues (reusing `.ags-tab`). Engine cycle state now **restores on mount via qaStatus** (leaving the page mid-run no longer loses the board). Library moved out of the sweep section into its own tab (libOpen toggle removed; state var remains unused-harmless). History tab = past engine runs + cross-references to failing tabs.
- **TEST CENTER RESTRUCTURED (tabs + overview):** header now has BOTH run buttons; **4 clickable status cards** (Engine last score+date / UI sweep % / Scenario library counts / **Open issues** green-or-red) each opening its tab; categorized tabs **Engine tests · UI sweep · Scenario library · History & issues**; engine run state **restores from qaStatus on mount** (leaving mid-run no longer loses the board); sweep section's duplicate header/run button removed; history tab shows engine past-runs + cross-references issues per tab. CSS `.qa-ov*`. (Stale `libOpen` state harmless.) Also answered in-app-vs-outside: in-app = primary (Gates 1-2), outside = Gate 0 + future Playwright CI (pre-launch milestone).
- **EXTERNAL QA + CHECKPOINT/RESTORE built (the outside safety net + "restore last working condition"):** new **`scripts/qa-external.mjs`** (zero deps, runs WITHOUT the app — works even when BrainEdge can't start): parses every .cjs/.mjs/.js in electron/server/cli/scripts, validates package.json + pinned versions, runs the real `npm run build` (skippable via `--no-build`), prints plain-English ✓/✗. **On ALL-GREEN it auto-saves a checkpoint** (copies electron/src/server/cli/scripts/package.json/vite.config.js/index.html → `.checkpoints/good-<timestamp>/`, pointer in LAST_GOOD.txt, keeps newest 5). **`npm run qa:restore`** = snapshots the CURRENT broken state to `pre-restore-<ts>` first (reversible!), then copies the last good state back; prints next steps (npm install/build/restart). npm scripts: `qa`, `qa:fast`, `qa:restore`, `qa:list`. `.gitignore` += `.checkpoints/` + `*.repairbak-*`. NOTE: checkpoints cover SOURCE CODE, not user data (settings/conversations live in %APPDATA% untouched by restore) — and git remains the deeper history; checkpoints are the instant, non-developer-friendly layer.
- **PRE-DEPLOYMENT-STEPS.md written** (user request): full release pipeline — build-vocabulary table (dev/build/build:admin/electron:build/rebuild/qa*/server), Gate 0 (npm run qa) → Gate 1 (Test Center engine+sweep, cheap model) → Gate 2 (30-min human pass) → secrets checklist (rotate OAuth, remove Anthropic sub path, 2FA, gitignore audit, prod env vars incl SESSION_SECRET/ADMIN_KEY boot-guard) → build artifacts → Gate 3 (clean-login install, Test-Center-absent check, dist grep for "Repair Bay", staging→promote) → post-deploy (git tag, checkpoint, daily cycle). Iron rule: red gate stops the line.
- **AGENT-ENGINE-ROADMAP.md written** (user asked: research what agent features other AIs have that BrainEdge lacks; web-researched OpenAI AgentKit/Agents SDK, Anthropic SDK/Skills, Google ADK/A2A/Memory Bank, Copilot Studio, Lindy, Relevance, CrewAI, LangGraph via subagent). **Gap table (14 items, impact-ranked):** 1 persistent agent memory ★5, 2 triggers (schedule/event/webhook — Scheduler can't run agents today) ★5, 3 agent-as-tool/handoffs ★4, 4 per-agent run history/analytics ★4, 5 branching/conditional flows ★4, 6 mid-mission ask_user ★4, 7 durable missions (checkpoint/resume) ★3, 8 RAG-lite knowledge retrieval ★3, 9 .agent share+versioning ★3, 10 agent API/webhook exposure ★3, 11 cost budgets ★2, 12 computer use ★2-heavy, 13 swarms ★2, 14 voice ★1. **Advice: 3 waves** — A: memory→triggers→run-history (workforce-while-you-sleep, smallest builds biggest felt value); B: call_agent + ask_user (shared plumbing) + coordinator re-planning (branching v1) + durable missions; C: .agent files/versioning, RAG-lite, cost meters, swarms; explicitly NOT copying node-graph builders/A2A/hosted evals (reasons given). BrainEdge's existing strengths noted (Designer+Bench, parallel teams, Mission Control, per-member models — rare in market). AWAITING user's wave pick before building.
- **QA UI EXCLUDED AT COMPILE TIME (user follow-up — Test Center UI + Repair Bay UI out of installers):** App.jsx now gates the Test Center behind `QA_IN_BUILD = import.meta.env.VITE_INCLUDE_QA === "1"` with a **lazy() dynamic import** — when the flag is absent (plain `npm run build`, used by electron:build AND web deploy) the branch is statically false and **Rollup never emits the TestCenter/functional.js chunk**: the QA interface doesn't exist in dist at all. Scripts: `dev` = cross-env VITE_INCLUDE_QA=1 vite (QA on in dev); **`build:admin`** = flag-on production build for the user's personal copy; `build` = clean. testcenter route in a clean build shows a "Not in this build" empty state (unreachable anyway — sidebar gate). VERIFY after next clean `npm run build`: search dist/assets/*.js for "Repair Bay"/"qa-runner" — should be absent; and dev still shows Test Center. EXTERNAL-TESTING.md §8 updated to the 4-layer exclusion + build-commands cheat-sheet.
- **QA EXCLUDED FROM USER INSTALLERS (user directive):** package.json build.files += `!electron/qa-runner.cjs` + `!electron/qa-fixer.cjs`; main.cjs QA requires now **guarded/lazy** (`try{require}catch` → handlers return `{error:"Testing tools aren't included in this build", available:false}` instead of crashing a packaged app); qaStatus returns `available:true` when present; **Sidebar Test Center entry requires isAdmin AND qaHere** (bridge.qaStatus().available !== false) — customers never see the entry and the QA code isn't on their disk. External tools (scripts/, QA-Console.cmd, .checkpoints, docs) were already never packaged (build.files only ships dist/electron/cli). EXTERNAL-TESTING.md gained §8 (distribution policy table + how exclusion works + "verify on fresh install" Gate-3 check) and §8½ (OTP recap). VERIFY at next `npm run electron:build`: install setup on a clean profile, admin sign-in → Test Center must NOT appear.
- **OTP-PROTECTED RESTORE (user request):** Restore in the QA Console now requires a **6-digit one-time code** (5-min expiry, single use, timing-safe compare): `/otp/send` generates + delivers via (a) **email** — dependency-free SMTP-over-TLS client (Gmail smtp.gmail.com:465 + App Password), (b) **SMS via Twilio REST** to +16159068147 (lands in iPhone Messages app — **true iMessage is impossible: Apple has no public API**, stated honestly), (c) **terminal fallback** (code prints in the console window when nothing configured — zero-setup default). Config: `scripts/qa-config.json` (gitignored) from `qa-config.example.json` (smtpUser/Pass, otpEmail=chaithrodaya.sukruth@gmail.com, twilio*, otpPhone). UI: Restore → "code sent to …" + entry box → confirm; `/run restore` returns 403 on wrong/expired. EXTERNAL-TESTING.md §6½ added. NOTE: Gmail App Password + Twilio creds sit in plaintext in qa-config.json (gitignored, local-only, sender-account creds not app secrets) — acceptable, flagged.
- **QA CONSOLE (UI for external testing) + EXTERNAL-TESTING.md:** new `scripts/qa-external-ui.mjs` — zero-dep Node HTTP server (port 7878, auto-opens browser) serving a styled dashboard with buttons (Full verification / Fast check / Checkpoints / Restore w/ confirm) that spawns qa-external.mjs and **streams output live via SSE** (ANSI stripped, ✓/✗ colorized); stays independent of the app by design. **`QA-Console.cmd`** at repo root = double-click launcher; npm script `qa:ui`. **EXTERNAL-TESTING.md** written (what/two ways to run/checks table/checkpoint mechanics/post-restore steps/guidelines/troubleshooting/architecture fit).
- **SCENARIO MANAGER built (user: how do we add/edit scenarios as features grow?):** sweep tests are now **data, not code** — functional.js gained a declarative step interpreter (`runSteps`: navigate/click/type/pasteImage/expect[css:]/expectGone/wait, documented in exported `STEP_DOCS`), **custom scenarios** stored in localStorage `be.qa.customScenarios` (merged into every sweep, per-scenario enable toggle), **built-in disable toggles** (`be.qa.disabledScenarios` — for when a feature changes on purpose), and **`draftScenario(area, desc)`** — AI turns a plain-English description into validated steps (unknown step types rejected). TestCenter gained a collapsible **"Scenario library"** panel: Add-a-scenario flow (area picker + description → "Draft steps with AI" → editable step rows (do/target/value + add/remove) → Save), Your-scenarios list (toggle/delete, step count), Built-ins list with checkboxes. Division of labor locked in: **agents AUTHOR tests, the deterministic robot EXECUTES them.** CSS `.qa-lib/.qa-step`.
- **Sweep detail drill-down:** the UI-sweep dashboard now lists **every scenario under every topic** — per-area panels showing each check's name + ✓/✗/skip + timing + skip reason inline; the **area cards are clickable to focus one topic** (`fnArea` state, `.qa-fn-area.sel`, `.qa-fn-detail` responsive grid; default shows all areas).
- **PLAIN-ENGLISH ERRORS + FIX NAVIGATION (user couldn't read raw 401s):** TestCenter exports `translateError(raw)` — maps 401/no-cookie-auth, 404 model-not-found, 429 quota, no-provider, timeouts/unreachable, server 5xx, parse errors, weak-model-disobedience → `{plain English meaning, what to do, nav}`; failures now show the **plain explanation bold + remedy first**, a **"→ Open Model configuration" navigation button** when fixable on-screen (TestCenter now receives `onNavigate={switchMode}` from App), and the raw error demoted to a collapsed "Technical detail". Applied to BOTH the engine-cycle issues and the UI-sweep failures. Also: clicking Diagnose before an app restart now explains "close and reopen BrainEdge" instead of `bridge.qaDiagnose is not a function` (that error = preload not reloaded; full restart fixes the user's report).
- **FUNCTIONAL UI SWEEP built (user: "test every small feature — voice, image paste, 10,000 functionalities"):** new **`src/qa/functional.js`** — a renderer-side driver that pilots the REAL interface via pure DOM (no React imports, so it survives navigation): text-based element finding, React-safe `typeInto` (native value setter + input event), **real image paste** (1×1 PNG File through a constructed ClipboardEvent/DataTransfer), waits/timeouts, floating **HUD** appended to body showing live progress, report → localStorage `be.qa.functional`. Ships ~19 EXAMPLE scenarios across Let's Chat (open/typing-enables-send/**image paste lands as attachment**/**voice: mic present + speech-engine check — honestly skips since no engine is wired, mic exists with alert fallback**/slash menu/new-chat reset), Collaborate (folder chooser), Build, Projects (UI + engine create→delete), Agents (Studio surface + storage), Studio (tile seeds fresh chat), Scheduler (UI + task lifecycle), Interface/Skills, Models overview (search filters live, tiles), Consumption. Framework is the deliverable — adding checks = one SCENARIOS entry. **TestCenter** gained the "Functional UI sweep" section: Run button (window drives itself ~1min), **visual dashboard** — big % verdict card (green/red) + per-area cards with pass bars + failed-checks list + honest skips line. CAVEATS: text/class-based selectors are brittle to UI renames (expected — failures will say what vanished); sweep should be run from Test Center and not touched mid-run; voice deep-test (actual speech) impossible without an engine.
- **Extension (user re-affirmed "test EVERY feature"):** two new suites added to qa-runner — **Agents & Teams** (`_agentSys` identity+knowledge injection assert, `_memberProfile` pin/fallback resolution, and **team_relay_e2e: a REAL 2-member relay mission through SessionManager._teamTurn** with event capture asserting 2 teammate steps + deliverable + success result — the heaviest test, ~3 live model calls) and **Skills & tasks** (skills createStarter→discover→indexText in temp dir, task-store create/update/delete, viamobile-log add/remove, CLI .mjs parse checks). TestCenter AREAS updated to 7 suites (~32 tests). Total live-model calls per full cycle: ~9 — pick a cheap/free model before running daily.

### 11ah. STILL-OPEN ITEMS (carried forward)
- **NEW — code review report pending:** full-project code review requested 2026-06-09 evening (report-only; see §11ai). Findings + summary file not yet in these docs.
- **Run TEST-AGENTS.md** — Scenario 0 (Save smoke test) first; send failures with console/[ELECTRON] output.
- **Agents feature** — verify on web + desktop (not compile-checked); roadmap: Scheduler-run agents, CLI `--agent`, re-attach agent on reopened conversations.
- Claude-style "Add content from GitHub" file-picker modal; "+" menu Skills submenu — still not built.
- Let's Collaborate progress/queue panel; "General" filter redefinition awaiting OK; Reasoning/Thinking label standardization awaiting OK; Simple-Icons SVG logo upgrade; HF downloads column offer.
- Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty interactive verification; model determination/selector bug.
- Pre-launch: rotate exposed OAuth secrets; remove Anthropic subscription/OAuth path (API-key only); CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.

### 11ai. Addendum — 2026-06-09 22:12 (FULL CODE REVIEW requested — report-only, IN PROGRESS)
- User: "entire codebase except Agents was built by Opus 4.8" — run a full project code review and report (NO action until user confirms). Six parts: (1) non-technical analysis of weak code (efficiency/security/UX/quality/UI), (2) fix plan as a yes/no questionnaire, (3) user-benefiting features Opus missed, (4) audit for half-baked Claude-inspired solutions, (5) very detailed agent-driven testing strategy for zero-bug production deployment, (6) recommendations to make the UI/UX world-class. Save as a code-review summary file in the repo; optimize token usage.
- At the time of this docs update the review was RUNNING (4 review subagents launched in the "Brain Edge with Fable5" session); findings and the summary file are NOT yet recorded in these docs — next update must capture them.
- Agent Guide two-pane page, polish rounds, and global icon theming are already documented in §11ag-4 above. Standing gates unchanged: Save-button bug (Scenario 0) blocks all agent/team testing; nothing compile-checked this session.

### 11aj. Addendum — 2026-06-09 (doc sync: §11ai is STALE — this is the current authoritative state)
- §11ai (22:12) recorded the code review as still running. It has since COMPLETED and all follow-on work LANDED — already documented in §11ag-5 (review delivered → CODE-REVIEW-SUMMARY.md), §11ag-6 (fix waves Q1–Q17: 16/17 landed, Q16 monolith split deferred), §11ag-7 (§4 half-baked audit: all fixed), §11ag-8 (§3 missed features: 7 of 8 built; per-member team retry deferred). The latest work session ends at the §11ag-8 state; no work exists beyond it.
- **Current gates:** `npm install` (new deps pdf-parse/mammoth) → `npm run build` (the §11ag-7/8 batches are unverified) → commit from the user's own terminal. **Save-button bug still undiagnosed** and gates TEST-AGENTS.md Scenario 0. Q16 split waits for the first green build.
- Open items otherwise unchanged: §11ah STILL-OPEN list + §11ag-8 retry deferral (GitHub file-picker modal, "+" Skills submenu, Collaborate progress panel, "General"/Reasoning-label decisions, Simple-Icons upgrade, HF downloads offer, Ink CLI verification, model-selector bug guard verification, pre-launch secret rotation + Anthropic-path removal, CLI wire format + distribution, file-tree view + undo/checkpoints).

### 11ak. Addendum — 2026-06-09 (BUILD GREEN + audit triage; dashboard redesign IN PROGRESS — newest authoritative state)
- **§11aj's build gate is CLEARED:** user ran `npm install` (pdf-parse/mammoth in) + `npm run build` → **GREEN** (vite 5.4.21, 1547 modules; 868KB chunk warning cosmetic for Electron, code-splitting = web roadmap). First compile verification of all 2026-06-09 work (waves, Agents/Teams, §4 audit fixes, §3 missed features, Q18, layout).
- **npm audit triage:** all findings dev-tooling (tar ← @electron/rebuild/electron-builder; vite-node ← vitest). Bumped **electron-builder → 26**, **@electron/rebuild → 4** (15 → 6 findings); **`npm audit --omit=dev` = 0 runtime vulnerabilities**. Remaining 6 (incl. the critical) = vite/vitest dev chain → vite 5→7 major deferred to its own verified session, never `--force`. electron-builder 26 untested until the next `npm run electron:build`. Commit commands handed to user (own terminal).
- auth-server "MODULE_NOT_FOUND auth-server.mj" = user typo (missing `s`), not a bug; production guard behavior reconfirmed (real SESSION_SECRET/ADMIN_KEY required when non-localhost/production).
- §11ag-9 (Q18 design-system layer) and §11ag-10 + follow-ups (layout discipline: page-max/prose-max tokens, data-dense-full-width rule, Models Overview 2-line clamp + full width, Consumption 16px rhythm) all landed BEFORE this green build — they are inside the verified bundle. (§11aj's "no work exists beyond §11ag-8" was wrong on that point.)
- **IN PROGRESS at log time:** user rejected the Models Overview dashboard as "boring" → industry-class **interactive Models dashboard redesign** underway in the "Brain Edge with Fable5" session (insight band + interactive table body being built). Next docs update must capture its outcome.
- **Open:** runtime smoke pass pending (markdown table, Agents Save bug/Scenario 0 — status unconfirmed, agent re-attach on NEW conversations, async shell, PDF knowledge import); Q16 monolith split now unblocked; per-member team retry deferred; carried items per §11ah/§11aj unchanged.

### 11al. Addendum — 2026-06-09 (doc sync: §11ak's "IN PROGRESS" items COMPLETED — newest authoritative state)
- §11ak logged the Models Overview dashboard redesign as in progress. It is **DONE**, and the session also built the **admin QA Test Center** — both fully documented in §11ag-11 (A: interactive dashboard — insight-band filter tiles, in-cell meters, cost tiers, inline expandable rows, Compare mode up to 4 models; B: Test Center — qa-runner.cjs + TestCenter.jsx, admin-gated, 7 suites/~32 tests incl. a real 2-member relay mission through `_teamTurn`, ~9 live model calls per cycle, 30-run history). The "Brain Edge with Fable5" work session ends at this state.
- **Current gates:** the dashboard + Test Center batch is built on top of the §11ak green build but is itself **unverified** → `npm run build` + **full restart** (qa-runner/IPC are main-process) → sign in as admin → run first test cycle (point selector at a cheap/free model first) → commit from user's own terminal. electron-builder 26 still untested until next `npm run electron:build`.
- **Still open (unchanged):** Save-button bug undiagnosed (gates TEST-AGENTS.md Scenario 0); runtime smoke pass (markdown table, agent re-attach on NEW conversations, async shell, PDF knowledge import); Q16 monolith split (unblocked); per-member team retry deferred; pixel-level UI test harness (Playwright) = roadmap suite 8; carried items per §11ah/§11aj.

### 11am. Addendum — 2026-06-09 (TESTING-BLUEPRINT.md written — true end of the "Brain Edge with Fable5" session; newest authoritative state)
- §11al said the session ended at the Test Center; one more deliverable followed: **`TESTING-BLUEPRINT.md`** (repo root, ~19KB, docs only — no code changed). Non-developer "testing bible" for the QA Test Center in storybook form: cast of characters (Test Center / QA Engine `qa-runner.cjs` / 7 suites / 30-run Ledger / Admin Gate), plain-text architecture + info-flow diagrams (UI → IPC `brainedge:qa` → engine → suites → provider → live events back), per-suite "a failure here means…" tour, daily + pre-release runbooks, error-triage table, four-gate deploy pipeline, honest-boundaries chapter + roadmap, 39-test inventory appendix. The session truly ends here.
- All gates and open items per §11al unchanged (build + full restart + first admin cycle + commit pending; Save bug; smoke pass; Q16; retry deferral; Playwright suite 8).

### 11am-doc. Doc-maintenance — 2026-06-09 (Chat.md caught up to §11am; no new work)
- Chat.md previously ended at Teams + Mission Control; a catch-up session block was appended covering §11ah–§11am (fan-out, Guide, code review + waves, §4 fixes, §3 missed features, Q18, layout, green build + audit triage, Models dashboard, QA Test Center, TESTING-BLUEPRINT.md). Both docs now reflect the same end-of-session state; no code or new session work since §11am.

### 11an. Addendum — 2026-06-10 (doc correction: §11am's "session ends at the blueprint" was WRONG — newest authoritative state)
- The "Brain Edge with Fable5" session continued AFTER TESTING-BLUEPRINT.md with three more deliverables, all already detailed in the late bullets of §11ag-11 (Repair Bay / plain-English errors / Functional UI Sweep / 7-suite extension): **REPAIR BAY** (`electron/qa-fixer.cjs` — diagnose → validated patch proposal → admin Approve & apply with `.repairbak-` backup → rollback; nothing applies without the admin click; blueprint gained chapter "6¾: The Repair Bay", so §11ag-11's "needs a Repair Bay chapter" note is CLEARED); **FUNCTIONAL UI SWEEP** (`src/qa/functional.js` self-driving DOM tester, ~19 scenarios incl. real image paste + honest voice skip, visual %-verdict dashboard in TestCenter); **PLAIN-ENGLISH ERROR TRANSLATION + FIX NAVIGATION** (`translateError` — meaning + remedy bold first, raw error collapsed, "→ Open Model configuration" button via `onNavigate`). The session truly ends THERE.
- **Live user-reported issues at session end:** 401 "No cookie auth credentials" on the live-engine ping = NVIDIA key not valid for the selected model (user must pick an accessible model or fix the key, then re-run); `bridge.qaDiagnose is not a function` = stale preload — **a full close-and-reopen of the app is REQUIRED** (not just rebuild) before the Repair Bay/Diagnose works.
- **Gates now:** `npm run build` + FULL app restart → admin sign-in → engine cycle (cheap/free model; ~9 live calls) + UI sweep → commit from the user's own terminal. All other open items per §11al/§11am unchanged (Save-button bug → Scenario 0; runtime smoke pass; Q16 split; per-member retry; Playwright suite 8; carried §11ah/§11aj items).
- Chat.md got a matching 2026-06-10 catch-up block; both docs now end at the same true end-of-session state.

### 11ap. Addendum — 2026-06-10 (Wave A+B+C ALL approved, Fable-only constraint, teamly.ai review pending — NEWEST authoritative state)
- **SCOPE ESCALATED:** user upgraded the earlier "Wave A+B" approval to **build Wave A, Wave B AND Wave C** — autonomous approval, all three. Same two riders as §11ao: (1) **document every new capability in the Agent Guide with scenarios**, (2) **review teamly.ai's agent approach and confirm whether BrainEdge has equivalent functionality**.
- **HARD CONSTRAINT (user, explicit):** **do NOT switch the model to Opus 4.8 — this work must be built with Fable only.** Any future build sessions on the agent engine stay on Fable.
- **STILL NOT BUILT:** Wave A (agent memory, triggers/scheduler-run agents, per-agent run history), Wave B (call_agent handoffs, mid-mission ask_user, coordinator re-planning, durable missions), Wave C (.agent share+versioning, RAG-lite knowledge retrieval, cost budgets/meters, agent swarms). All scoped in **AGENT-ENGINE-ROADMAP.md**. This is the #1 carry-forward.
- **teamly.ai review: NOT yet done** — the June-2026 agent research (§11ag-11 / AGENT-ENGINE-ROADMAP.md) covered OpenAI/Anthropic/Google/Copilot Studio/Lindy/Relevance/CrewAI/LangGraph but **did not include teamly.ai**; owe the user a teamly.ai capability comparison + parity gap note as part of the Wave build.
- Gates/opens otherwise unchanged from §11ao/§11an: full close-and-reopen → `npm run build` → admin engine cycle + UI sweep (cheap/free model) → commit from user's terminal; NVIDIA 401 awaits key/model fix; Save-button bug (Scenario 0); runtime smoke pass; Q16 monolith split; per-member team retry; vite/vitest majors; electron-builder 26 + "Test Center absent on fresh install" check at next `electron:build`; Playwright suite 8.

### 11ao. Addendum — 2026-06-10 (doc correction: §11an's end-of-session was ALSO wrong; Wave A+B APPROVED but NOT built — newest authoritative state)
- The "Brain Edge with Fable5" session continued well past the Functional UI Sweep / error-translation round. Everything that followed is already detailed in §11ag-11's late bullets and now has a matching Chat.md block ("Session — 2026-06-10 06:05"): sweep detail drill-down → **Scenario Manager** (scenarios as data + AI-drafted steps) → **Test Center restructure** (status cards + tabs) → **external QA + checkpoints** (`qa`/`qa:fast`/`qa:list`/`qa:restore`, auto-checkpoint on green) → **QA Console** (`qa:ui`, QA-Console.cmd, port 7878) + **EXTERNAL-TESTING.md** → **OTP-protected restore** (email/Twilio-SMS/terminal fallback; qa-config.json gitignored) → **four-layer QA exclusion from user builds** (installer file excludes + guarded requires + sidebar gate + compile-time `VITE_INCLUDE_QA` flag; `build:admin` for personal QA-included builds) → **PRE-DEPLOYMENT-STEPS.md** (Gates 0–3 release pipeline) → **AGENT-ENGINE-ROADMAP.md** (14-gap research vs AgentKit/Anthropic SDK/Google ADK/Copilot Studio/Lindy/Relevance/CrewAI/LangGraph; Waves A/B/C).
- **DECISION (supersedes §11ag-11's "AWAITING wave pick"):** user granted **autonomous approval to build Wave A (persistent agent memory, triggers/scheduler-run agents, per-agent run history) AND Wave B (call_agent, mid-mission ask_user, coordinator re-planning, durable missions)**, plus: document the new capabilities in the Agent Guide with scenarios, and review temly.ai's agent approach for parity. **NONE of it was built** — every attempt at session end hit repeated API errors and the session went idle. Wave A+B is the #1 carry-forward for the next work session.
- Gates/opens otherwise per §11an: full close-and-reopen → `npm run build` → admin engine cycle + UI sweep (cheap model) → commit from user's terminal; NVIDIA 401 awaits key/model fix; Save-button bug (Scenario 0); runtime smoke pass; Q16 split; per-member retry; vite/vitest majors; electron-builder 26 + "Test Center absent on fresh install" check at next `electron:build`; Playwright suite 8.

### 11aq. Addendum — 2026-06-10 06:40 (Wave A+B+C build STARTED in new session "BrainEdge Fable New" — IN PROGRESS, newest authoritative state)
- §11ap's "#1 carry-forward" is now underway: the user re-issued the Wave A+B+C approval (roadmap attached, Fable-only constraint repeated) in a fresh work session, and the **engine layer is on disk** — six new main-process modules: `agent-memory.cjs` (durable per-agent notes, 60 cap / 30 injected, post-mission extraction), `agent-history.cjs` (per-agent run JSONL w/ rotation → track-record stats), `agent-prompt.cjs` (shared identity+instructions+knowledge+memory prompt builder for interactive AND headless paths), `knowledge-retrieval.cjs` (RAG-lite chunk+keyword scoring past prompt budget; whole-injection preserved when small; no embeddings), `mission-store.cjs` (per-member mission checkpoints keyed by conversation id → "Resume mission"), `mission-runner.cjs` (headless runs for schedule/webhook/call_agent/swarm; same history+memory as interactive).
- **NOT yet confirmed:** wiring into session-manager/main/preload/UI, trigger surfaces, Wave B/C UI, Agent Guide scenarios, teamly.ai parity review, and any build verification — the session was still running at log time. Next docs update must record the outcome; treat this section as a snapshot, not completion.
- Gates/opens unchanged from §11ap/§11ao: full close-and-reopen → `npm run build` → admin engine cycle + UI sweep (cheap/free model) → commit from the user's terminal; NVIDIA 401; Save-button bug (Scenario 0); runtime smoke pass; Q16 split; per-member retry; vite/vitest majors; electron-builder 26 + installer-exclusion check; Playwright suite 8.

### 11ar. Addendum — 2026-06-10 07:10 (Wave A+B+C wiring/UI/Guide DONE on disk; verification in flight — newest authoritative state)
- Beyond §11aq's six engine modules, the "BrainEdge Fable New" session has now wired everything: `ask_user` + `call_agent` tools in the agent loop; **`_teamTurn` rewritten** (budget meter, per-member checkpoints + resume, coordinator re-planning, per-member history + memory); scheduler task-runner runs agent/team targets headless via mission-runner; Scheduler.jsx adds agent/team trigger targets + a webhook-triggers card; new IPC in main.cjs + preload bridge methods; chat JSX gets a "Resume mission" banner + mid-mission question modal; `BlueprintExtras` + `SwarmModal` components added (Wave C surface); per-agent **knowledge cap raised 8 → 24**; in-app Agent Guide gained new chapters + scenario simulations and **AGENT-GUIDE.md was rewritten with scenarios** (rider #1 satisfied on disk).
- **NEW ENVIRONMENT QUIRK (add to §7 lore):** in-place Edits on large files appear TRUNCATED on the Linux sandbox mount while the Windows-side file is intact; new files sync fine. Workaround used: rewrite affected files whole via Write and verify a /tmp copy spliced from Windows-side content. `node --check` green on all edited .cjs; Linux node_modules install for a real build check was still running at log time.
- **UNRESOLVED:** build verification outcome unknown (session still running); **teamly.ai parity review (rider #2) still owed** — no evidence of it in the transcript. Then the standing gates: full close-and-reopen → `npm run build` → admin engine cycle + UI sweep (cheap/free model) → commit from the user's terminal. All other opens per §11ap/§11ao unchanged.

### 11as. Addendum — 2026-06-10 07:40 (Wave A+B+C VERIFIED GREEN, session COMPLETE — NEWEST authoritative state)
- §11ar's verification finished: /tmp Linux copy (slimmed package.json — full-tree npm resolve was the hang — + Linux node_modules) → **23/23 tests pass, production `vite build` clean**, engine-module smoke test green. Two PRE-EXISTING test issues fixed along the way (stale `/settings` route expectation; flaky timestamp-sort assertion) — no Wave-code regressions. Scaffolding cleaned; AGENT-ENGINE-ROADMAP.md marked built. The "BrainEdge Fable New" session is COMPLETE; built entirely on Fable per the §11ap constraint.
- Final shipped surface (detail §11aq/§11ar + AGENT-GUIDE.md): Wave A — agent memory (Blueprint view/edit/clear + per-agent toggle), Scheduler agent/team targets + token-protected webhook server (`POST /hook/agent|team|task/<id>`), per-agent track record on cards + Blueprint run list. Wave B — call_agent handoffs (interactive ones inherit the session's permission prompts), ask_user modal w/ suggested answers (headless runs self-decide + state the assumption), coordinator re-planning (≤2 follow-up waves, recruits whole bench), durable missions w/ Resume banner. Wave C — .agent export/import (memory + model pins stay private) + last-10 blueprint versions w/ restore, RAG-lite (cap 8→24), per-team budget meter + hard-stop in Mission Control, ⧉ swarm (1–6 parallel over pasted list → one compiled report). Rider #1 DONE: 2 new in-app Guide chapters + 4 flight-school scenarios; AGENT-GUIDE.md = 9 scenarios + capability matrix. Scope note: ask_user/call_agent live on BrainEdge's own tool loop (OpenAI-compatible); Anthropic-SDK sessions use native SDK subagents — flagged in the guide.
- **Rider #2 NOT done: teamly.ai parity review** — grep confirms zero mentions outside these docs. **#1 carry-forward.**
- Gates: sandbox-green ≠ user-machine-green — full app close-and-reopen (new main-process modules + preload) → Windows `npm run build` → admin engine cycle + UI sweep (cheap/free model) → commit from the user's terminal. Other opens per §11ap unchanged (NVIDIA 401; Save-button bug/Scenario 0; runtime smoke pass; Q16 split; per-member retry — mission-runner may now enable it, revisit; vite/vitest majors; electron-builder 26 + installer-exclusion check; Playwright suite 8).

### 11at. Addendum — 2026-06-10 08:10 ("BrainEdge Fable New" CONTINUED past §11as: gap rows 12+14 built as Agent Browser + push-to-talk voice; Guide redesign + admin browser controls; session still RUNNING — NEWEST authoritative state)
- (Doc note: §11ap was misfiled before §11ao by an earlier run; chronological order is …11an → 11ao → 11ap → 11aq…)
- **Gap-table decision:** user asked to close rows 7–14; corrected — rows 7–11+13 already closed by the waves; only **row 12 (browser)** and **row 14 (voice)** remained. User approved scoped builds; Operator-class vision-pixel control and realtime full-duplex voice deliberately SKIPPED.
- **Row 12 BUILT — `electron/agent-browser.cjs`:** visible Chromium window as an agent tool — `browse_open/read/click/fill/back`, DOM→readable text + numbered elements (any text model, no vision). Guardrails: permission-gated actions, per-agent site allowlist, password/payment fill refused, page content framed untrusted. Wired into solo/team/headless runs; new **Browser capability** toggle + allowlist in the Studio. **Admin controls** added in Settings.jsx (`AgentBrowserSettings`): allowlist enforcement ON, untrusted-page shield ON, credential-fill OFF by default, each with warnings; agent-browser.cjs honors them.
- **Row 14 BUILT — `electron/voice.cjs`:** push-to-talk (composer mic → MediaRecorder → user's OpenAI/Groq Whisper key, configurable STT) + spoken replies via OS speech synthesis; IPC/preload plumbing; mic stub replaced.
- **Agents Guide redesign:** scroll bug root-caused (`.scroll` had no overflow rule + `.agg-wrap{overflow:hidden}`) and fixed; objective badges, single-story simulation steps, guide sub-nav, new Reference (do's & don'ts) page, `GUIDE_FEATURES` how-to accordion, title/description layout fix.
- **⚠️ VERIFICATION GAP:** mount staleness persisted; this round is `node --check`-clean and Read-confirmed on Windows but had **NO full build verification** (the /tmp re-verify was cut short when the user pivoted to the Guide work). A from-scratch build check is owed before trusting it.
- **Open:** session still running at log time — back-button on chat-view agent bar + history scoping in progress; outcome to be captured next. **teamly.ai parity review still NOT done** (no evidence in transcript) — standing owed rider. Gates/opens otherwise per §11as unchanged (close-and-reopen now also covers agent-browser + voice modules; NVIDIA 401; Save-button bug/Scenario 0; runtime smoke pass; Q16 split; per-member retry; vite/vitest majors; electron-builder 26 + installer-exclusion check; Playwright suite 8).

### 11au. Addendum — 2026-06-10 08:41 ("BrainEdge Fable New" STILL RUNNING: Test Center scenario mgmt · BeanBox single-story Guide · browser master switch (admin-always-on) · savedStore bug FIXED · flow infographics · local Creator/Complimentary roster IN PROGRESS — NEWEST authoritative state)
- **§11at's in-flight items landed:** back button on the chat-view agent bar; agent/team-bound conversations excluded from Sidebar recents and moved to a new **Recent Activity** section on the Agents screen.
- **Test Center scenario management (admin):** Simulate-now (drives live UI, pass/fail + failing selector) with a required review-confirm checkbox gating Add; ↑/↓ reorder with persisted run order; ✎ edit-in-place; `runScenario` exported from `functional.js`. Testing guides for rows 12+14 delivered to the user.
- **Flight School = one story:** intro fixed ("Five" → nine) and all nine simulations rewritten as chapters of a single **BeanBox** narrative, later chapters reusing earlier hires.
- **Agent Browser master switch:** `settings.agentBrowser.enabled` (default ON) enforced at both construction points (session-manager `_browserFor`, mission-runner `browserFor` → null when off); admin-panel master toggle; Studio hides the capability. **Refined: admins ALWAYS keep the browser** — `isEnabled()` admin-aware via an admin flag cached in main.cjs authMe. Allowlist semantics documented (per-agent `browserAllow` list; admin `enforceAllowlist` switch; checked on open + post-load + post-click redirect guard; subdomain match; empty = any).
- **savedStore bug (REAL, pre-existing, fixed):** user's local suite showed 3 savedStore failures — `saved-store.cjs` was the only store not mkdir-ing its directory before write, so `persist()` failed silently when userData didn't exist. Fixed with `fs.mkdirSync(..., {recursive:true})`; harness-verified; expect 23/23 on the user's re-run (`act()` lines = warnings only).
- **Flow diagrams rebuilt** as modern infographics (gradient glyph tiles, animated pulse connectors); user flagged connector vertical alignment + a top gap — **fix in progress at log time**.
- **Local Creator/Complimentary roster (IN PROGRESS):** per user request, a **local, installer- and git-excluded roster file** (+ template + loader; build excludes + .gitignore updated) listing admin emails (display **"Creator"**) and allowed-user emails (display **"Complimentary"**, excluded from subscription); the roster **overrides the server's authMe verdict** so a hijacked server account can't strip access (server-side `admin-emails.txt`/`free-emails.txt` already existed — this is the local override layer). AccountCard done (labels + hides subscribe/manage); **Sidebar trial/subscribe prompts being updated at log time — session still RUNNING; next docs run must capture the outcome.**
- **Open:** roster Sidebar wiring + flow alignment fix in flight; **no full build verification of anything after the Wave round** (browser/voice/guide/Test Center/roster) — user must run `npm run build:admin && npm run test:run`; **teamly.ai parity review still owed.** Standing gates/opens per §11as/§11at unchanged (close-and-reopen → Windows build → admin engine cycle + UI sweep → commit from user's terminal; NVIDIA 401; Save-button bug/Scenario 0; runtime smoke pass; Q16 split; per-member retry; vite/vitest majors; electron-builder 26 + installer-exclusion check; Playwright suite 8).

### 11av. Addendum — 2026-06-10 09:12 ("BrainEdge Fable New" STILL RUNNING: roster + flow fixes done · 30-persona library · Studio artifacts libs + iteration rule · Studio launcher = build console · BLUEPRINT Ch. 6⅔ · Claude-style light mode — NEWEST authoritative state)
- **§11au's two in-flight items LANDED:** (1) roster wiring complete — Sidebar trial/subscribe prompts respect Creator/Complimentary; modules `node --check` green; role resolution harness-verified (case-insensitive, graceful fallback when file absent). (2) Flow alignment fixed everywhere — nodes top-align, connectors are fixed 48px boxes centered on the tile line, fan lanes/coordinator/merge centred.
- **Persona library:** 30 agents across 9 industry categories (Engineering, QA & Testing, Delivery & Agile, Marketing, Finance & Trading, Research, Ops & Support, Docs & Legal, Data); `PERSONA_CATS` updated.
- **Studio artifacts upgraded (both user-approved fixes):** `artifacts.js` React harness rewrites imports to globals + loads lodash/d3/recharts/papaparse/chart.js/mathjs + lucide-react icon shim (self-referencing default-import bug found by the parse harness and fixed); `ARTIFACT_RULE` (re-emit the complete file on refinement) wired into chat system prompts in `agent-openai.cjs` AND the session-manager Anthropic path. Remaining known artifact limitation: previews for React/Markdown/Mermaid still load from cdnjs at runtime.
- **Studio launcher REBUILT** ("looks copied from Claude"): `StudioLauncher.jsx` rewritten as a prompt-first **build console** (`.stu2-*` CSS; old `.studio-*` rules kept) — rotating example placeholder, format-lens pills replacing the category card grid, example reel, animated idea→forge→preview pipeline; `onStart(prompt)` contract unchanged.
- **TESTING-BLUEPRINT.md:** new **Chapter 6⅔ — The Scenario Manager** (add/simulate/confirm, Area-field semantics + pick table, Interface-catch-all + Terminal-under-Custom caveats). Area-field user Q answered (label + AI-draft navigation hint only).
- **Light mode = Claude-style retheme (CSS-only, scoped `:root[data-theme="light"]`, dark untouched):** warm neutrals (canvas `#f6f5f1`, text `#20201d`), default accent teal → terracotta `#c96442` gated to `[data-accent="default"]` (custom accents still win); teal body glow fixed; push/primary buttons (`.btn.primary`, send arrow, `.ag-gen`) now accent-colored, not black; `.cons-kpi.accent` dual-accent neutralized in light; Studio console background accent wash removed in light.
- **OPEN at log time (session still running):** Models table "pale in light mode" polish in flight — capture next. **Unaddressed user request:** review of the Terminal section ("Sonnet did decent job — review + improve") was interrupted and never handled. Pending user-OK offers: align Test Center Area list to the sidebar (add Terminal, split Skills/Connectors); mandatory allowlist for headless browser runs. **teamly.ai parity review STILL owed.** Build verification of everything post-Wave round still owed (`npm run build:admin && npm run test:run`; user's earlier local run already caught the savedStore bug, since fixed). Standing gates/opens per §11as–§11au unchanged (close-and-reopen → Windows build → admin engine cycle + UI sweep cheap/free model → commit from user's terminal; NVIDIA 401; Save-button bug/Scenario 0; runtime smoke pass; Q16 split; per-member retry; vite/vitest majors; electron-builder 26 + installer-exclusion check; Playwright suite 8).

---

## 12. SESSION — 2026-06-10 (this is the CURRENT authoritative state; supersedes earlier where they differ)

Long single session on **claude-opus-4-8** (NOT Fable — the §11ap Fable-only rule was for the prior sessions; the running model is chosen by the user's app, flagged honestly). Full narrative in **Chat.md** (two big 2026-06-10 blocks). Two commits landed by the user: `9c406ba3` (corruption recovery + list/tile + export + first Sage), `e8106d83`-era + a second commit for autonomy/folder/Floor/Anthropic/Sage; the **global Sage mount** built green (1560 modules) and was pending its own commit at doc time.

### 12a. styles.css CORRUPTION — diagnosed + fully repaired (the session's opening crisis)
- A prior session's **whole-file rewrite** of `src/styles.css` was assembled from a stale mid-file copy → silently DELETED the entire QA Test Center block (74 `.qa-*` rules — the unstyled Test Center the user screenshotted), the Models Overview interactive-dashboard layer + full-width base, the Consumption/Profile 16px rhythm, and `--page-max`/`--prose-max` tokens + page-centering. New edges (light theme, `.stu2-*`) survived.
- Repaired via **targeted merges** from `.checkpoints/good-2026-06-10T05-48-57-479Z` (NEVER whole-file rewrites — **standing rule for styles.css now**). Agent Guide CSS (`.agg-ref-*` reference page, sub-nav, flow infographics, sim goal/label) existed NOWHERE (not checkpoint, not git HEAD) → **recreated from the JSX markup**. Guide pane scroll fixed.
- Explore-agent diff of 95+ files vs checkpoint: **only styles.css shrank**; everything else intact. Commit `9c406ba3` also revealed the prior session had built most of the original kickoff queue (SECURITY-REVIEW-2026-06-10.md, RESEARCH-FEATURE-GAPS.md, PLAN-AGENT-PARITY.md, PLAN-LETS-CREATE.md, in-app UserGuide, speedcheck.css, branding scrub).
- **MULTI-SESSION HAZARD (root cause, standing warning):** concurrent Claude sessions ("BrainEdge Fable New" / "Brain Edge with Fable5") editing the same repo caused the corruption + later interleaved edits. Only the user can close them. **Single-writer discipline is the rule.**

### 12b. Security audit (SECURITY-REVIEW-2026-06-10.md) — VERIFIED
- All **21 claimed fixes verified on disk** (prod guards, Stripe webhook hard-fail+idempotency, SSRF blocklist, CLI token revocation, CORS allowlist, security headers, rate limits, git arg-injection, window hardening, webhook timing-safe, electron fuses, headless-shell triple gate, cli 0600, MCP env allowlist, artifact-popout sandbox [was CRITICAL], markdown sanitize, restore whitelist, webfs path guard). **User-only remainder:** rotate `server/.env` OAuth/Stripe secrets, `ALLOW_DEV_LOGIN=0`, 2FA.
- **Code signing WIRED:** new `electron-builder.config.cjs` (extends package.json build; signs when creds present — Azure Trusted Signing `AZURE_SIGNING=1`, token cert `CSC_SHA1`, or legacy pfx; unsigned builds unchanged); `electron:build` now uses `--config electron-builder.config.cjs`. Cert acquisition is the user's task. Explained why shipping a desktop app is safe (client belongs to the attacker; value is server-side). `electron:build` hits **EPERM on win-unpacked rename** — Defender real-time scan; fix = kill BrainEdge/electron, delete `release\`, add Defender exclusions for `release\` + `%LOCALAPPDATA%\electron\Cache`.

### 12c. teamly.ai parity (clears the standing rider) → TEAMLY-PARITY.md
- teamly.to = cloud-hosted AI workforce (Pixel Department, $/agent + credits on hosted Sonnet/Opus); teamily.ai = human+agent messenger. Verdict: BrainEdge leads on engine; gaps are WHERE agents run (their cloud) + presentation charm + multiplayer. **Built the 3 the user picked as BrainEdge originals** (below); skip cloud hosting/credits/multiplayer/avatar-of-you.

### 12d. The WORKFORCE LAYER (3 teamly-inspired originals + supporting work)
- **The Recruiter** (own tab): describe the work → `RECRUITER_SYS` returns `{reply, team{name,mode,members[existing|persona|new],budgetTokens}}`; proposal tags members **roster/crew/new hire** (roster-first = the differentiator); refine reworks it; **Hire** creates new agents + team in one clobber-safe write.
- **Living Portraits** (`src/components/Portrait.jsx`, original procedural SVG, no assets): unique deterministic human faces from INDEPENDENT hash streams (skin/hair-style/hair-color/glasses/beard/freckles/earring) + explicit override props (skin/hair/beard/glasses/style) for fixed characters. Moods: idle·hello·working·happy·**sleeping**(zzz)·**running**(lean+streaks)·**cheer**(arms-up). **Auto-nicknames** (`NICKS`) so no agent is "Untitled".
- **The Floor** (own tab): whole-workforce live board (5s poll of stats+sessions+tasks), **state-grouped colored COLLAPSIBLE sections** (Working/Finished/Scheduled/Resting), moods mapped to state. **Activity** = its own tab (recent agent/team conversations, themed `.ags-run`). **AgentOps** (`src/components/AgentOps.jsx`) = solo live panel (working portrait, clock, tool steps).
- **Roster organize:** user-defined **groups/folders** (`settings.agentGroups` + per-agent `group`; engines ignore), drag-drop to file; **folder view = DEFAULT** (folder grid → click to enter → breadcrumb); separate Folders⟷All + Tile⟷List toggles; icon-only utility toolbar; per-card **.agent export**.
- **Tabs in TWO LAYERS:** learning (Agent Guide · Ask Sage) over workforce (Agent · Agents Team · Recruiter · Floor · Activity).
- **Studio liveliness** (design-director): REFINE chips, Bench "Suggest 3 test prompts", re-run last test, identity ambiance, vitals strip; send-button fixes; completeness spine removed.

### 12e. Bug fixes this session
- **Navigation killed running turns:** `switchMode` dropped the pending permission request + restored a stale timeline → fixed (busy/perm/session survive nav; perm modal is a global overlay; sessionId guard drops stale events; Floor stamps active at turn START).
- **Per-agent Autonomy** (Ask first / Act freely / Skip & decide) — `session-manager._permsFor`; **string-mismatch bug** fixed (`bypassPermissions` vs `bypass` in `isAuto`).
- **Browser:** false "message sent" → contenteditable support in `browse_fill` (`execCommand insertText`+Enter) + `[contenteditable]`/`[role=textbox]` in selector + **verify-before-claiming** system rule; **UA strip** of Electron token (WhatsApp wall); **per-agent windows** (`wins` Map, parallel browsing, shared cookie session); **global default allowlist** (Settings → Agent Browser `globalAllow`).
- **Anthropic API-key-ONLY:** subscription/`claude login` OAuth path removed end-to-end (session-manager `subMode`/`_chatViaSdk`, agent-transport env branch, providers/SpeedCheck/ModelConfig/settings + Billing UI). No `anthropicUseSubscription` left.
- **Brand tagline** "by Chaithrodaya Sukruth" restored under the wordmark (markup + dark-mode `.tn-by` base).

### 12f. SAGE — the in-app AI buddy (the session's biggest UX build)
- Floating helper → **GLOBAL**: new self-contained **`src/components/SageDock.jsx`** mounted in **App.jsx** (`<SageDock mode onNavigate={switchMode}/>`) → floats over the WHOLE app. Knowledge = **`AGENT-GUIDE.md` + new `APP-GUIDE.md`** (whole-app guide) bundled via `?raw` (auto-learns each release). **`GOTO: <key>`** in replies → "Take me there" buttons mapped to app modes. Krisp answer rules (~80 words). Persisted thread `be.sage.thread` shared with the in-Agents "Ask Sage" tab. **Draggable** (FAB or header, persisted, clamped — fixes edge-clip; panel auto-flips toward center), **minimize-to-edge** tab, **8 chooseable human faces** (look picker, persisted), **theme-blended uniform** (`var(--accent)`), **quiet nudge** (hover + first-visit + ~5-min peek), **proactive per-screen tips** (heuristic, dismissible). Personality: warm, funny, jovial buddy. Independent one-shot call → **never disturbs a running session**. In-Agents floating dock removed (global covers it; full Ask Sage tab kept; old dock code remains as harmless dead `sageDock` const).

### 12g. CURRENT GATES / OPEN (pick up here)
- **Global Sage mount built GREEN (1560 modules) but is UNCOMMITTED + un-restart-tested.** Next: full close-and-reopen → verify Sage on a non-agent screen (Models/Connectors) + parallel-while-session → commit `git add -A && commit -m "Global Sage: SageDock in App + APP-GUIDE.md + app-wide GOTO; remove in-Agents duplicate dock" && push`.
- Cleanup later: dead `sageDock` const + duplicate peek/tip intervals in Agents.jsx (harmless); on the Agents "Ask Sage" tab both full page + global bubble show (acceptable).
- **Standing constraints/rules:** styles.css = targeted edits only; single-writer (no concurrent sessions); every agent feature updates Tour & Practice + Flight School + AGENT-GUIDE.md (feeds Sage) + APP-GUIDE.md; keep bringing agents to life.
- **Carried pre-launch:** rotate OAuth secrets + `ALLOW_DEV_LOGIN=0` + 2FA; SIGNING.md + cert + signed-build verify; electron:build EPERM (Defender exclusion) + packaged Anthropic-SDK `runAsNode` fuse test + "Test Center absent on fresh install" check; inherited-deliverable integrity read-through; bundle is 1.12MB → code-split before web launch; Q16 monolith split; vite/vitest majors; Playwright suite 8.
- **Repo docs added this session:** SECURITY-REVIEW-2026-06-10.md, RESEARCH-FEATURE-GAPS.md, PLAN-AGENT-PARITY.md, PLAN-LETS-CREATE.md, TEAMLY-PARITY.md, APP-GUIDE.md, electron-builder.config.cjs; new src: Portrait.jsx, AgentOps.jsx, SageDock.jsx, UserGuide.jsx (+userguide.css, speedcheck.css).

---

## 13. SESSION — 2026-06-10 (Fable, single-writer — kickoff-queue INTEGRITY PASS + branding scrub completion + Anthropic gap research; NEWEST authoritative state)

User re-issued the original 7-task kickoff list; per §12a most was already built, so this session ran the owed **inherited-deliverable integrity read-through** and closed the gaps. Sandbox VM down all session (host file tools only; Glob unreliable on this mount — use Read/Grep).

### Verified intact (no action needed)
- **Task 1 security:** SECURITY-REVIEW-2026-06-10.md complete (A–E sections); spot-checked 3 of the 21 fixes in code (artifact popout sandboxed iframe, `noShell` hard-gate in agent-openai, CORS allowlist + timing-safe compares in auth-server) — all real. Remaining = user-only Section A (rotate secrets, ALLOW_DEV_LOGIN=0, 2FA).
- **Task 2 user guide:** UserGuide.jsx (1423 lines, clean tail) + userguide.css (419 lines, clean tail); 19 chapters covering every feature; wired in the sidebar account menu **directly below Settings** (Sidebar.jsx:239) + Get help opens it; App route mode "guide".
- **Task 3 speed test:** speedcheck.css complete (.spx- — live race animation, winner hero band, ranked bars, scatter, detail table, methodology, responsive/reduced-motion) and imported by ModelSpeedCheck.jsx.

### Branding scrub COMPLETED (task 4 — fixes landed this session)
- **package.json description** de-Claude'd → "chat, agents, and an AI workforce over any cloud or local LLM".
- **`linkAnthropic` subscription remnant removed end-to-end** (was the standing "remove Anthropic subscription path" leftover): main.cjs IPC handler (incl. "claude login" note), preload wire, mockBridge + webBridge stubs; vestigial `anthropicLinked` account field dropped from settings.cjs DEFAULTS + main.cjs signOut/googleSignIn. No UI callers existed.
- **APP-GUIDE.md** (feeds Sage, user-visible): "Claude-Desktop-style workflows" + "Claude-style skill playbooks" reworded.
- **agent-transport.cjs** wrong_profile error no longer names "free-claude-code proxy"; providers.cjs + settings.cjs stale subscription comments reworded.
- **Verdict:** remaining Claude/Anthropic/OpenAI mentions are FUNCTIONAL ONLY (provider wire formats, API headers, real model ids in catalog/benchmarks, `@anthropic-ai/claude-agent-sdk` npm dep, CLI reading CLAUDE.md for interop) — legitimate, no litigation surface. Zero Teamly/ChatGPT-style brand comparisons anywhere in src/electron/server/cli.

### Task 5 research COMPLETED — Anthropic section added
- RESEARCH-FEATURE-GAPS.md previously covered ChatGPT/Gemini/Grok/Groq but **omitted Anthropic** (user explicitly asked for it). Added **§4 Anthropic Claude** (19-row gap table, June-2026 web-researched: memory all-tiers, incognito, Research mode, in-chat office file creation, Managed Agents cron+vaults 2026-06-09, Claude-in-Chrome/Office add-ins, voice, plugins) + parity confirmations (chat search, skills, Cowork-style, continue-on-phone) + "BrainEdge ahead" list + sources. Honorable mentions gained office-file-creation + vault-style env allowlist. RESEARCH IS REVIEW-ONLY — user decides what to build.
- Tasks 6/7 deliverables verified complete: PLAN-AGENT-PARITY.md (5-wave harness plan, ends §9) + PLAN-LETS-CREATE.md (providers/architecture/P1-P3/risks/sources).

### Review round (same session, later)
- User asked for (1) a consolidated competitive gap table + build recommendations, (2) plain-English explanation of PLAN-AGENT-PARITY, (3) an implementable Let's Create architecture **bound to the model selector's provider profiles**. Delivered all three in chat; **PLAN-LETS-CREATE.md gained §5 "Architecture v2 — selector-integrated"** (shared engine catalog ∩ user profiles → engine picker; MediaJob store desktop JSON/web IndexedDB; sync image/transcript + async video poller w/ resume; Creations tray; budget guardrails; P1 image+transcript ≈1-2wk, P2 video ≈2-3wk; §5.4 = 5 open user decisions). AWAITING user's picks on the build order + §5.4 decisions before any implementation.

### Sage/Sara upgrade round (same session, later — BUILT)
User asked for 5 Sage improvements; all landed (renderer-only, shared web+desktop):
1. **Voice command:** mic button in the Sage panel input row — records via `bridge.transcribe` (desktop, user's OpenAI/Groq key; same pattern as Composer) or Web Speech API fallback (Chromium web); transcript **auto-sends** so you can just talk. Errors surface as in-thread mentor messages, not alerts.
2. **Resizable panel:** `.sage-grip` drag handle on the panel's free corner (positions/cursors flip with the dock's up/down/left/right anchor classes); size persisted to `be.sage.size`, clamped 320-760w × 380-900h and to the viewport; panel got max-w/h viewport clamps.
3. **BrainEdge-first rule** in SYS: whenever the user wants to build/create anything, Sage must answer with the right BrainEdge surface (Build/Studio/Agents/Projects/Scheduler/Connectors) + first step + GOTO; never point to outside tools. **GOTO keys gained `studio` + `projects`** (mode ids "studio"/"project").
4. **14-look multicultural gallery** (append-only — saved `be.sage.look` indices stay valid): original 8 male looks labeled (classic/European/Indian/Nordic/African/silver) + 6 NEW female looks (Indian, 2× East Asian, European, African, Latina). **Portrait.jsx gained explicit-only styles 7 (long center-part hair) + 8 (swept bangs + side bun), `lashes` + `earring` override props** — deterministic agent faces unchanged (random range still 0-6).
5. **Sara naming:** female look → the buddy is **Sara** everywhere (header, hello, placeholder, nudge, titles, SYS persona via `SYS(name)`); male looks stay Sage. Same thread/memory either way. APP-GUIDE.md gained a "Sage / Sara — the floating helper" section (so Sage can describe its own features; documents-feed-Sage rule honored).
- Files: SageDock.jsx (looks/name/voice/resize/SYS), Portrait.jsx (styles 7-8, lashes, earring prop), styles.css (TARGETED append after the sage block: .sage-mic + rec pulse, .sage-grip × 4 anchor variants, panel max clamps, looks-row scroll), APP-GUIDE.md.
- NOTE: the in-Agents full "Ask Sage" tab (Agents.jsx) still says Sage regardless of look — only the global dock renames. Flagged, not changed (Agents.jsx is the monolith; touch in its own pass).

### HARNESS BUILD — PLAN-AGENT-PARITY Waves 1-5 ALL BUILT (same session, after user committed a clean checkpoint)
User granted full autonomy ("implement Wave 1,2,3,4,5 … you have autonomous power … keep security in mind"). Committed checkpoint exists BEFORE these edits. Everything below is **NOT compile-checked** (sandbox down all session) — `npm run build` + FULL restart is the gate; suspects on failure: agent-openai.cjs (biggest diff), harness.cjs, webBridge.js import.
- **NEW `electron/harness.cjs`** — pure discipline layer: tolerantParse (JSON repair ladder; CTRL_RE built via String.fromCharCode — NEVER put literal control bytes in source, they corrupt in transit), headTail truncation, PlanTracker, CallGuard (3rd-identical-call block + per-target fail streaks), estTokens/ctxWindowFor (heuristic windows), buildCompactionMessages/applyCompaction (in-place; tail never starts on a tool msg), squashStale, formatRepoMap, tierFor + FEWSHOT_NOTE + TEXT_PROTOCOL + parseTextToolCalls (SECURITY: parse ASSISTANT text only — never tool results/page content), METHOD_RULES, PLAN_TOOL, SCOUT_TOOL.
- **NEW `electron/model-stats.cjs`** — per-model counters (missions/success/maxSteps/toolCalls/repaired/parseFails/reasks/failures/denied/textMode/nativeBroken) → `model-stats.json` (debounced), score() 0-10 null until ≥10 calls.
- **`agent-openai.cjs` rewired (targeted edits, kept all permission/noShell/browser gates):** execTool hardened (edit_file unique-match + ±3-line read-back region; write_file refuses overwrite-unread; read-before-edit via `mission.readPaths`; read_file/run_bash → headTail); loop gained: auto-compaction at 70% window ("compact_context" card), tier-B re-pin every 6 steps, tier-C/text-mode path (streamChat + parseTextToolCalls; auto-fallback when provider rejects tools at step 0 → flags nativeBroken; **pushToolResult helper: text mode pushes user-role results, NOT tool-role**), tolerant parse + max-2 re-asks, set_plan handler + plan-pending nudge before final answer, explore_parallel → `runScout` (text-protocol mini-loop, READ-ONLY tool allowlist by construction, economy profile), thorough self-review pass, `runReviewer` (approve|flag, failures never block, ≤6/turn), failure-streak reflect text, stats bumps everywhere. **GOTCHA fixed mid-build: providers.streamChat returns `{text}`, not a string** — all 4 internal call sites unwrap .text.
- **Wiring:** session-manager `_harnessFor(agentLike, profile)` (thorough/reviewer→economy-or-self/economyProfile via _memberProfile pin shape/textTools) passed at all 3 runOpenAIAgentTurn sites (agent-chat, team member, cowork/code); mission-runner passes the same via its `profileFor`. Plain non-agent sessions keep `{}` (always-on layer only).
- **Surface:** main.cjs IPC `brainedge:getModelStats` (+preload, webBridge/mockBridge `{}` stubs); ModelsOverview expanded row gained a **Harness** stat (score/10 · N calls, amber meter, "not measured" honest default). Agents.jsx **BlueprintExtras gained "Craft — quality vs cost"** Section (Hammer icon — already imported): thorough/reviewer/textTools checkboxes + economyModel text input (`profileId::model-id`); saveDraft spreads draft so fields persist; engines read them directly.
- **Web mirror:** NEW `src/shared/harness.js` (tolerantParse/headTail/squashStale/CallGuard, ESM twin — keep in sync with the .cjs) wired into webBridge runAgentTurn (squash at turn start, tolerant parse + 2 re-asks, repeat-block, reflect-on-error + 2-strike, headTail on results) + runSubagent (tolerant parse + headTail).
- **Docs:** **HARNESS.md** (plain-English: always-on vs per-agent toggles, measurement story, desktop/web matrix, security section, honest limits, 4-step verify checklist); PLAN-AGENT-PARITY.md header → STATUS BUILT (deviations: heuristic ctx windows; live-mission stats instead of the §8 gauntlet — **gauntlet = open follow-up**; readPaths reset on restart); AGENT-GUIDE.md §2 gained "The Harness" block (Sage learns it).
- **Open follow-ups:** §8 agentic gauntlet in Test Center; catalog-fed exact context windows; web parity for plan/compaction/tiers; CLI (cli/agent-core.mjs) not yet harness-wired.

### SAGE ROUND 2 (same session, after the harness batch was committed by the user) — 5 improvements BUILT
1. **Windows-native mic (key-free, model-independent):** NEW `electron/win-speech.cjs` — OS recognizer via short-lived PowerShell `System.Speech` (DictationGrammar, default mic, clamped-integer-only interpolation = injection-safe, hard kill timeout, busy guard); IPC `brainedge:winSpeech` + preload `winSpeech`. **Web/mock bridges deliberately DON'T stub it** so `bridge.winSpeech` truthiness routes correctly. **Sage mic priority: winSpeech → browser SR → Whisper.** **Composer keeps Whisper first** (quality) but a key-error flips `localStorage be.voice.engine="win"` permanently → next tap uses the Windows engine ("not model dependent" satisfied both places).
2. **Sage navigation:** new `GOTO! <key>` directive = navigate IMMEDIATELY (explicit "open/take me to" asks), `GOTO:` stays the button; dock auto-navigates 650ms after the reply renders; gotoKey/clean regexes accept both forms.
3. **Plain answers:** SYS now mandates PLAIN TEXT (no **, no headers, no bullets, exact labels/steps/values) + `clean()` safety net strips `**`/`__`/`#`/list markers before display (replies render as raw text, so markdown was showing as literal asterisks).
4. **Learning memory + persona growth:** NEW `src/sageMemory.js` (localStorage `be.sage.memory`, device-only): records every question (cap 30), screen-visit counts (recordScreen on mode change), nav/tip events; **distills every 10 questions** via one completeOnce call into ≤18 one-line insights (claims the slot BEFORE running — no double-distill); `memoryBlock()` injected into SYS. Persona: growth path guide→architect→solution-expert→consultant, expertise-shows-don't-boast, **creator-respect rule (never claim to surpass/disrespect the creator/team)**.
5. **User Guide "screenshots":** NEW `Shot` mockup system in UserGuide.jsx (Sk skeleton bars, Hl accent highlight-ring + label tag, window chrome + sidebar) — 5 theme-aware vector figures: providers (card+key+selector), chat (bubbles+MIC highlighted), collaborate (folder chip, diff tool cards, permission modal), agents (Designer|Bench split + Put to work), scheduler (timer rows + webhook). `.ug-shot-*` CSS appended to userguide.css. HONEST: vector mockups, not PNG captures (no running app here); pixel-true PNGs can replace them later if user supplies captures.
- APP-GUIDE.md Sage section updated (Sage self-describes all 5). NOT compile-checked (sandbox down): suspects = UserGuide.jsx Shot JSX, SageDock GOTO! regex, win-speech PowerShell quoting.

### SAGE MIC FIX (user: "mic not working correctly — simple Windows mic, hear user, type as text")
- **ROOT CAUSE (Electron trap, record this):** `webkitSpeechRecognition` EXISTS inside Electron but is NON-FUNCTIONAL (needs Google's cloud speech service that desktop apps don't get) — it starts, fires onerror, ends silently. Any voice chain that can fall through to it on desktop looks "broken: click, nothing happens". Also plausible: user tested before a full restart (winSpeech preload needs close-and-reopen).
- **Fix 1 — SageDock mic SIMPLIFIED:** desktop = Windows engine ONLY (no SR, no Whisper in the Sage chain); web = browser SR only. Recognized words are now **TYPED into Sage's input box** (`heard()` appends + user presses Enter) instead of auto-sent — per explicit user request "hear user and type to sage as text".
- **Fix 2 — win-speech.cjs hardened:** en-US recognizer w/ fallback to any InstalledRecognizers (E_NORECOG if none), UTF-8 console output, E_NOMIC/E_SILENT named markers → friendly messages w/ exact Windows Settings paths, **BabbleTimeout REMOVED** (background noise was aborting recognition), EndSilenceTimeout 1.4s, default listen 10s, `-ExecutionPolicy Bypass`, hard kill at t+8s.
- Composer verified safe: its desktop path always has bridge.transcribe so the dead SR branch is unreachable there; key-error→win-engine flip from earlier round unchanged.

### SAGE SCOPE LOCK (user directive, standing): app-only expert, no web, any model key
- **Standing scope:** Sage's ONLY domain = BrainEdge features + this user's behavior. NOT a general assistant: SYS hard rules now (1) decline general-knowledge questions in one warm sentence and hand off to the right surface with a GOTO (general → Let's Chat, coding → Let's Build, repeatable → an Agent); (2) NO WEB, NO OUTSIDE FACTS — cannot search, never pretends to, never cites outside info; only sources = the two guides + learned user memory; (3) Build-with-BrainEdge rule reworded: Sage explains the PATH, the building happens on those surfaces, not in the bubble.
- **Model keys:** Sage thinks via bridge.completeOnce on the SELECTOR's profile (any provider/key — unchanged); NEW friendly failure path: key/provider/model errors → plain explanation + "GOTO: models" line so the existing Take-me-there button opens Model configuration.
- Hello message reworded to "Your BrainEdge guide". APP-GUIDE Sage section updated (Sage self-describes the scope). Future Sage work must preserve this scope lock.

### COMPETITIVE-GAP BUILD (user approved 8 features) — 6 BUILT, 2 QUEUED WITH SPECS
**BUILT (web + desktop unless noted):**
1. **Cross-chat memory** — NEW `electron/user-memory.cjs` (agent-memory pattern, global): notes file in userData, injected via `session-manager.withLang` (= every mode), learn fire-and-forget hooked into `_send` result branch (4-min cooldown, claims slot first, skips <40-char msgs); settings `userMemory:{enabled:true}`; IPC get/set/clearUserMemory + preload; **Settings → Profile → Memory card** (`UserMemoryCard` in Settings.jsx: toggle/list/edit/forget; Brain+Pencil icons added to import). WEB: `umGet/umSave/umBlock/umLearn` in webBridge (localStorage `be.userMemory`), injected in systemPrompt + coworkSystem, learn after plain chat turns; bridge methods + mock stubs.
2. **In-chat office files** — NEW `src/office.js`: ```officedoc JSON spec → real .xlsx/.docx/.pptx/.pdf built ON-DEVICE via dynamic imports; `OfficE_RULE` (sic: OFFICE_RULE) exported + appended to webBridge BASE_BEHAVIOR; same rule text INLINED into ARTIFACT_RULE in agent-openai.cjs AND session-manager.cjs (CJS can't import the ESM — keep the 3 copies in sync). markdown.jsx: officedoc fences → `OfficeCard` (file card w/ Download/built-on-device; falls back to raw code view mid-stream); `.md-office*` CSS. **DEPS ADDED: xlsx, docx, pptxgenjs, jspdf → `npm install` REQUIRED.**
3. **Image generation (selector-powered)** — NEW `electron/imagegen.cjs`: OpenAI-compatible chat/completions + `modalities:["image","text"]` (OpenRouter serves Gemini-image/GPT-image/FLUX through it); saves to userData/creations/; human errors name a fix model. `create_image` tool in agent-openai (ALL modes incl. chat; plan-mode blocked; image flows on `tool_result.data.image` — base64 NEVER enters model history, model gets a one-line confirmation). App.jsx copies e.data.image onto timeline items; ToolCard renders `.tool2-img` w/ hover Download. WEB: tool in COWORK_TOOLS + `webGenImage` + handler in runAgentTurn (web folder-agent only; plain web chat has no tool loop — honest gap).
4. **Study & Learn** — distinct from Sage (Sage=app guide; this=Socratic tutor for the USER'S topics/documents). NEW "Learning" persona category + **Tutor** persona in Agents.jsx PERSONAS (questions-first, one concept at a time, mini-quizzes w/ honest grading, teaches FROM attached knowledge files).
5. **Editable Canvas** — ArtifactPanel.jsx REWRITTEN: new **Edit tab** = live textarea canvas + **AI revise bar** (`bridge.completeOnce`; SELECTION → targeted region replacement w/ ±800-char context, no selection → whole-document revision; fence-stripped); 10-deep undo stack; "· edited" badge; preview/copy/download all use edited content; version-dropdown switch resets the draft. `.artifact-canvas/.artifact-edit/.artifact-revise` CSS.
6. **Daily brief (Pulse-lite)** — task-runner target `"brief"`: gathers recent conversations (sstore) + agent stats (agent-history) + scheduled tasks → <180-word morning digest via streamChat; Scheduler.jsx target dropdown gained "Daily brief" + hint (prompt field = extra topics). Read in run history; Telegram replay piggybacks existing Via Mobile behavior.
**BUG FIX (user screenshot — attached .xlsx dumped raw ZIP bytes into chat):** Composer `ingest()` rewritten: images unchanged; **.xlsx/.xls now PARSED via SheetJS** (dynamic import; CSV per sheet, 8 sheets/12k chars caps) — attaching a spreadsheet is a real feature now; **.docx parsed via `mammoth/mammoth.browser.js`**; .pdf → friendly "use Projects knowledge" note (chat-side PDF parse = follow-up); known-binary extension list refused gracefully; unknown files get a control-char sniff (>5% → refused) so NOTHING can dump garbage/explode tokens again. If the mammoth.browser subpath import trips vite, fall back to `import("mammoth")` w/ browser field or copy the worker — first suspect on build failure.

**PROJECTS "Add files" FIX (user screenshot):** the add-file option existed only as an unlabeled FileUp ICON that swallowed errors (`if (!r?.error)`) and was desktop-only. ProjectsBrowser.jsx now has a labeled **"Add files" button**: desktop → existing native dialog (errors now surfaced via setSrc); web/fallback → hidden multi-file input parsed IN the renderer (xlsx→CSV/sheet via SheetJS, docx→mammoth.browser, txt/md/csv/code inline, PDF→"needs desktop" message) feeding `addKnowledgeText` per file (200k cap, 8 files/pick). Paste-text row kept below it.
**CHAT ALIGNMENT FIX:** the binary-dump screenshot also broke layout — long unbroken strings stretched bubbles past the container. styles.css guard: `.msg, .msg * { overflow-wrap:anywhere }` + pre/code word-break. Root cause (binary ingestion) fixed separately above.

**AGENT STUDIO FEEDBACK (user, 7 items — answered; 2 queued as features):**
- QUEUED: **screenshots in agent knowledge** — extend `agent.knowledge` to accept images (dataUrl entries, FileReader path like Composer); inject as image content parts for vision models in `_agentSys`/agent-prompt.cjs (skip + note for non-vision models); Studio "Add file" accepts images. Spec'd, not built.
- QUEUED: **Designer follow-up robustness** — likely cause of "instructions not saved after first one": Designer merges config ONLY when completeOnce returns valid {reply,config} JSON; the user's pinned LM Studio local-model often fails JSON discipline on follow-ups → reply shows but draft doesn't change, feels like "not saved". Fix idea: tolerantParse the designer reply + explicit "(no blueprint change detected — edit the Blueprint fields directly or rephrase)" notice in the Designer chat + few-shot the JSON contract on tier-B/C models. ALSO still awaiting user console output for the standing Save-button bug (§11ai).
- Answered (no code): capability pills = on/off toggles (cyan=granted), connectors/skills configured in their own screens, agent uses them mid-mission; Knowledge = reference material (not instructions) injected w/ RAG-lite; "learns across missions" = agent-memory extraction after OK missions, selective by design ([] is the common correct answer; weak local models often fail the extraction call silently); learning layers = agent memory + model-stats + user memory + track record; Act freely covers ALL permissions (incl. MCP) — remaining prompts are ask_user DECISION questions (by design, not permissions).

**TOOL-CARD HUMANIZATION (user: "don't display technical information in chat"):** ToolCard.jsx `describe()` extended — every engine tool now has a human sentence + icon: browse_open/read/click/fill/back ("Opened/Read the page/Clicked item N/Typed \"…\"/Went back"), create_image, set_plan ("Updated the working plan"), compact_context ("Tidied its working notes"), reviewer, ask_user, load_skill, web_fetch/search, spawn_subagent, delete_file, list_files, search; dynamic prefixes call_agent→/explore_parallel/mcp__ handled; FINAL fallback humanizes snake_case (capitalized, underscores→spaces) so no raw tool name can ever leak again. New lucide imports added. STANDING RULE: any new tool MUST get a describe() entry. ROUND 2 (user: "Ran mkdir" still too technical): `humanizeCommand()` translates shell headlines to plain English (mkdir→"Created folder X", rm/del→Deleted, cp→Copied, mv→Moved, git <sub>→"Git: sub", npm install→"Installed packages", node/python→"Ran X", curl→Downloaded, fallback "Worked in the terminal"); the literal `$ command` now ALWAYS shows in the expandable detail (gate changed from d.mono to input.command; JSON detail only when no command).

**PROJECTS DIALOG: EXCEL SUPPORT (user screenshot — "Docs & text" filter blocked xlsx):** main.cjs addKnowledgeFile dialog filters → "Documents & data" (now incl. xlsx/xls/csv) + "Spreadsheets" + "All files"; `knowledgeText()` gained an xlsx/xls branch (lazy `require("xlsx")`, CSV per sheet, 12 sheets/60k chars each, buffer read). PDF/docx parse unchanged. MAIN-PROCESS change → full restart required. Knowledge hint in Studio/Projects copy may still say "PDFs → Projects" etc. — fine.

**SPEED CHECK FULL-WIDTH (user: "so much space unused"):** speedcheck.css `.spx-page > *` max-width 1280 → none + fluid clamp padding — the data-dense rule applied (Models Overview precedent). Prose keeps `.spx-sub` 860px. Renderer-only.

**WORKSTRIP — conversation-first chat (user: step cards are noise even humanized):** App.jsx timeline render now GROUPS consecutive tool items into one collapsible `WorkStrip` ("✓ Worked — 8 steps ▸" / spinner + "Working" while running; expand → the full cards). Stand-alone exceptions: tool items w/ `image` (create_image) and ask_user cards; single-step bursts render normally. `WorkStrip` component above App(); `.workstrip*` CSS. Live side panels (AgentOps/Mission Control) still stream every step. Renderer-only.
**BROWSER PAGE-DUMP TRIMMING — BUILT (user approved):** agent-openai browser handler tracks `history._browseIdxs`; the moment a newer browse result lands, every earlier page snapshot shrinks to a 300-char stub ("older page snapshot trimmed — newest read is authoritative"; `_pageTrimmed` guard; role tool|user so text-mode works too); indices reset after compaction (array rebuilt). Cuts per-step prompt size >50% on long browser missions. Main-process change → full restart.

**SAGE WALKTHROUGH MODE (user: detailed E2E steps + observe + guide to completion + learn):** SYS — how-to/guide-me questions DROP the 80-word cap → COMPLETE numbered E2E procedure (exact labels, through the final verify step). SageDock: numbered replies (≥3 steps) to guide-intent questions auto-start a **walkthrough** (`be.sage.walk` {topic,steps≤20,idx}) → accent **guide bar** in the panel (Step N of M, current step text, "Done — next ▸" / "I'm stuck" / end ×); **"I'm stuck"** auto-asks with step+screen context; **screen changes mid-walkthrough with dock closed surface the current step as the FAB tip**; walkthrough context (step + screen) injected into every Sage call; completion → 🎉 + recordEvent (start/stuck/complete/abandoned feed the distillation = Sage learns which flows users struggle with). HONEST LIMIT noted to user: v1 observes SCREEN changes, not in-page clicks (DOM-level observation = future functional.js-style hook).

**ACCOUNT MENU DEDUPE:** "Get help" removed from the sidebar account menu — it duplicated "User Guide" exactly (both did `onSelect("guide")`). getHelp fn removed; HelpCircle import left (harmless). Menu now: Settings · User Guide · Language · Manage subscription · Log out.

**AGENT MODEL PICKER — agentic-only filter softened (user: local LLMs lack agentic tag → uninvisible in Agent picker):** ModelPicker.jsx `agenticOnly` prop no longer HIDES non-agentic models. New internal `agOnly` state (default FALSE) — all models selectable in Agent Studio; agenticOnly now just SHOWS an opt-in "Agent-ready only" toggle chip (replacing the old static "agent-ready only" pill + the suppressed Agentic capability chip, which is back for everyone). Local Ollama/LM Studio models now appear. Renderer-only.

**QUEUED (full spec, next session):**
7. **Deep Research mode** — spec: `electron/research.cjs` w/ ddg-lite HTML search (no key) + direct fetch + tag-strip text + SSRF blocklist (mirror server rules); plan(3-5 queries via model) → parallel fetch ~8 sources (headTail) → synthesis w/ [n] citations + source list; expose as `deep_research` tool (chat+agent modes, auto:false so the user approves the spend); web v1 = orchestration prompt template over existing web_search/web_fetch tools.
8. **Shareable conversation links** — spec: auth-server `POST /share` (auth, 200KB cap, rate-limited, 32-hex id, 30-day expiry, store.mjs `shares`), `GET /s/:id` server-rendered ESCAPED read-only page (no scripts), `DELETE /share/:id` owner-only; client `shareConversation(sessionId)` in both bridges (desktop via main-process authed fetch — reuse auth.cjs token pattern; web direct) + Share icon on Sidebar recents rows → copies URL. PRIVACY.md note required (shared content leaves the device BY USER CLICK).

### Gates
- This session touched **main.cjs / preload.cjs / settings.cjs / agent-transport.cjs / providers.cjs / agent-openai.cjs / session-manager.cjs / mission-runner.cjs / task-runner.cjs (+ NEW harness.cjs, model-stats.cjs, win-speech.cjs, user-memory.cjs, imagegen.cjs)** (main process) + webBridge/mockBridge/package.json/APP-GUIDE/AGENT-GUIDE/RESEARCH/PLAN docs + **SageDock.jsx/Portrait.jsx/Agents.jsx/ModelsOverview.jsx/Composer.jsx/UserGuide.jsx/Settings.jsx/ToolCard.jsx/ArtifactPanel.jsx/Scheduler.jsx/App.jsx/markdown.jsx/styles.css/userguide.css (+ NEW src/shared/harness.js, src/sageMemory.js, src/office.js, HARNESS.md)** (renderer) → **`npm install` (4 new office deps!) → `npm run build` + FULL close-and-reopen**, then commit from the user's terminal. Harness batch committed by user mid-session; everything after (Sage round 2 + mic fix + scope lock + the 6 competitive-gap features) is the current uncommitted diff. Nothing compile-checked (sandbox down).
- Carried opens unchanged from §12g: commit global Sage mount (if still uncommitted), rotate OAuth secrets + ALLOW_DEV_LOGIN=0 + 2FA, SIGNING.md + cert, electron:build EPERM Defender exclusion, packaged runAsNode fuse test, bundle code-split before web launch, Q16 split, vite/vitest majors, Playwright suite 8.

---

## 14. SESSION — 2026-06-11 (Fable: FULL CODE REVIEW → ALL FIXES BUILT + project-scoped Collaborate — NEWEST authoritative state)

### Code review (CODE-REVIEW-2026-06-11.md, repo root)
- 3 parallel review passes (engine / renderer / web+server+CLI) over everything since the 2026-06-09 review. **No build breakers found**; verified solid: streamChat {text} contract everywhere, win-speech injection-safe, permission/noShell/plan gates intact, base64-never-in-history, harness web twin export-matched, markdown XSS-safe, office.js APIs real, bridge degradation graceful.
- Findings: 5 high (A1 webhook folder tasks ran bypass+shell; A2 /proxy forwarded keys to arbitrary hosts; A3 detached-session events leaked into the visible timeline; A4 Craft inputs lost focus per keystroke (Section-in-render); A5 browser fill-guard regex gaps pin/secret/ssn), 12 medium (B1-B12), 14 low (C1-C14). Full detail in the report.

### ALL FIXES BUILT (user approved "critical to low + improvements, start now") — 3 parallel fix agents, disjoint file sets
- **Engine:** A1 task-runner webhook noShell for folder/chat/brief targets; A5 single FORBIDDEN_FIELD_SRC drives both fill guards; B1 justCompacted flag + 6k tail hard-trim after compaction; B2 agent-memory per-id promise-chain locks (NOTE: setNotes/clear now return promises — IPC callers fine); B3 knowledgeText 50MB stat guard (all formats); B12 tier="C" on text-mode flip (tier now `let`); C2 squashStale also squashes user-role "[result of " (mirrored in src/shared/harness.js); C3 mission-store.save try/catch; C4 team checkpoint once post-wave (relay per-step unchanged); C12 task-runner helper renamed runAgent; C13 _browseIdxs append-only comment.
- **Renderer:** A3 strict event guard + init-binding (`init` binds sessionRef when null — web bridge emits init BEFORE start() resolves); A4 Section hoisted to module scope (open/setOpen props, 4 call sites); B4 ArtifactPanel keyed remount + undo() out of updater; B5 Message memo compares handler presence + handlersRef for fresh closures; B6 send/startProjectChat/startProjectCowork try/catch → "⚠ Couldn't start" timeline item; B7 Sage tip now ask()s (skips walk tips); B8 mic engine tracking SageDock+Composer (winSpeech = "stops automatically" label, web rec refs cleared on end/error); B9 artifactVersions useMemo; C1 ToolCard describe() null guards; **NEW src/ErrorBoundary.jsx wrapping AuthGate+App in main.jsx**; C8 Sage timer/pointer-listener leak cleanup; C9 GOTO multiline strip + GOTO! gets no button; C10 Composer replace function-form.
- **Web/server/CLI:** A2 PROXY_HOST_ALLOW (13 provider hosts, +PROXY_HOSTS env adds) on /proxy/chat+models, loopback exempt, /proxy/fetch confirmed key-free and untouched; B10 webGenImage uses apiBase() (**apiBase now EXPORTED from src/shared/providers.js** — load-bearing export); B11 CLI sub-agents now confirm destructive ops ("[sub-agent] " prefix, --yes respected); C5 persistSession per-session promise chain; C6 store.mjs patchUser skips+warns unmapped columns (no raw SQL identifiers); C7 CLI tolerantParse ported (zero-dep copy, "keep in sync with src/shared/harness.js" comment) at all 3 arg-parse sites (agent-core, brainedge.mjs, tui.mjs).
- NOT done from the report: C14 xlsx CDN-tarball note (decision only), context-window catalog feed (improvement #5, queued), Q16 split (still after green build).

### Project-scoped Let's Collaborate (user request, built BEFORE the fix batch)
- Bug: "Start a task in Cowork" from a project dumped into the GENERIC Collaborate screen (coworkProj was set but never rendered anywhere) and cowork tasks never listed under the project.
- Built: sessions-store records + lists `projectId` (createSession 3rd arg; session-manager passes it + back-tags older reopened records); ProjectsBrowser detail now has **categorized sections "Chats · Let's Chat" and "Tasks · Let's Collaborate"** (tasks via listSessions("cowork") filtered by projectId; open via App.openSession; per-task delete) + `openId` prop (mount-opens straight to a project's page); **button renamed "Start work in Let's Collaborate"** (alert reworded; no visible "Cowork" left); App.jsx: coworkProj hero header (project name + "What would you like to work on in this project?"), hero chip + in-chat bar with **← back to the project's page** (`backToProject` + `projOpenId`; sidebar Projects click clears it → list); openSession re-attaches coworkProj from the record's projectId via getProject; webBridge listSessions/getSession expose projectId (+count/cwd).

### Gates (CURRENT — supersedes the §13 gates above)
- §13's uncommitted diff + THIS session (review fixes + Projects/Collaborate) = ONE big uncommitted, **uncompiled** diff. No new deps this session. **GATE: `npm run build` → FULL close-and-reopen → smoke pass → commit from user's terminal.** First-failure suspects this session: App.jsx (event guard + hero branches + handlersRef), Agents.jsx Section hoist, ErrorBoundary/main.jsx, agent-memory promise change, auth-server allowlist block.
- Smoke checklist: create project → link folder → "Start work in Let's Collaborate" → project header shows → send → ← back chip → task listed under "Tasks · Let's Collaborate" → reopen task (project re-attaches). Then: type in Craft economy-model input (A4), navigate away mid-turn and watch the old turn NOT bleed in (A3), attach an xlsx, Sage mic.
- **OWED NEXT (user request, not yet built): agents working on DESKTOP APPLICATIONS** — proposed path: Windows UI Automation-based `desktop-driver.cjs` tool suite (app_open/app_read/app_click/app_type — text element tree, NO vision model needed, mirroring agent-browser's design: permission-gated, per-app allowlist, credential-field guards, master switch) + Office COM automation quick wins via the existing shell; vision-pixel (Operator-class) control stays deferred. Build AFTER the build gate clears, as its own commit.
- Carried: rotate OAuth secrets + ALLOW_DEV_LOGIN=0 + 2FA; signing cert; electron:build EPERM Defender exclusion; bundle code-split; Q16 split (A4 was a symptom — split Agents.jsx after green build); vite/vitest majors; Playwright suite 8; Deep Research + Share links specs (§13 queue); Save-button bug console output still owed.

### 14b. Same-session additions (2026-06-11, later)
- **API-key wipe root cause + fix:** keys vanished after `electron:build` because settings.cjs `decStr` returned "" on safeStorage decrypt failure and App's launch auto-save persisted the wipe (likely trigger: packaged binary w/ different fuses — `enableCookieEncryption` only in installer builds — can't read dev-encrypted secrets, or vice-versa). FIXED: `_decryptFailed` flag → save() preserves on-disk `enc:v1:` ciphertext instead of overwriting with ""; every save also keeps `brainedge-settings.json.bak`. Keys lost before the fix must be re-entered once per binary. Diagnostic for the trigger documented in chat.
- **SageDock off-screen fix:** saved drag position now clamped to the CURRENT viewport on load + on window resize (clampPos; corrected spot persisted). Recovery without rebuild: console `localStorage.removeItem("be.sage.pos"/"be.sage.hidden")` (type `allow pasting` first in DevTools, or type lines manually; NOT PowerShell).
- **Floor tiles are doors now:** clicking a Floor tile opens that agent's newest conversation via onOpenSession (runFor matches agentName/team membership; rocket button stopPropagation; keyboard accessible). Honest limit: reopening shows the saved record — a still-running turn's live stream doesn't re-attach (sessionId guard); live re-attach = future work.
- **EXTRAS — feature switchboard BUILT (user request):** Settings → Extras section, visible ONLY to Creator/Complimentary (authMe admin/role/plan check in Settings.jsx). NEW `src/extras.js` (EXTRAS catalog + extraOn/setExtra; mapped flags browser→agentBrowser.enabled, memory→userMemory.enabled = single source of truth). settings.cjs DEFAULTS `extras:{}` + guard. Contract: absent = ON, explicit false = OFF; engine .cjs reads `(cfg.extras||{}).<key> !== false` directly (can't import ESM). Wired gates: **sage** (App render), **voice** (mic hidden in Composer + SageDock, loaded on mount), **imagegen** (agent-openai tool list + text-mode handler refusal; webBridge activeTools filter), **office** (ARTIFACT_RULE split → ARTIFACT_RULE_BASE + per-turn officeRulePart() in agent-openai SYSTEM + session-manager _chatTurn + webBridge systemPrompt — evaluated per turn, not at module load), **studio/terminal/scheduler/viamobile** (Sidebar entries filtered via new `extras` prop from App). Settings page writes clobber-safe (re-reads from disk before save); App reacts live via onChanged=setSettings. APP-GUIDE.md gained an Extras section (Sage self-describes; including "where did the mic/Studio go" answer).
- All of 14b is in the same uncompiled mega-diff → same gate: `npm run build` → full restart → commit. New smoke items: Settings shows Extras only when signed in as Creator/Complimentary; toggle Studio off → sidebar entry disappears; toggle voice off → mics gone; imagegen off → create_image not offered.

### 14c. TWO-CHANNEL BUILDS (admin + public installers) — BUILT (user request, 2026-06-11 later)
- **`npm run electron:build` now produces BOTH installers** (`BrainEdge-admin-<v>-setup.exe` = everything; `BrainEdge-public-<v>-setup.exe` = Extras-driven). Full design + mapping table + release checklist in **BUILD-CHANNELS.md** (repo root) — read it before touching this system.
- **One manifest, three layers:** NEW `scripts/build-features.mjs` (reads owner's `%APPDATA%/brainedge/brainedge-settings.json` extras, or `--all`) writes gitignored `electron/build-features.json` + `.env.production.local` (VITE_FEAT_*=0). NEW `electron/features.cjs` `builtIn(key)` — **dev/unpackaged ALWAYS true** (stale manifest can't break dev), missing manifest = all ON (fail open). electron-builder.config.cjs: public channel appends file excludes (imagegen/voice/win-speech/agent-browser/telegram-bot/terminal .cjs) + channel-stamped artifactName. Renderer: VITE_FEAT_* consts fold → Rollup drops chunks (QA-exclusion pattern); App.jsx converted SageDock/StudioLauncher/TerminalPanel/Scheduler/ViaMobile to lazy-gated (NotInBuild fallback), BUILD_OFF merged into Sidebar extras prop; FEAT consts also in Composer (voice), SageDock (voice), markdown.jsx (office→code block), webBridge (office/imagegen/memory); extras.js exports FEAT_BUILT (Settings Extras page shows "not in this build" + disabled toggle).
- **Engine guards (subagent, verified report):** main.cjs — lazy guarded getters tgbot()/voiceMod()/terminalMod(); guarded IPC transcribe/winSpeech/applyMessaging/messagingStatus/termCreate-Input-Resize-Kill → `{error:"This feature isn't included in this build."}`; telegram auto-start skipped; **scheduler loop + webhook server not started when !builtIn("scheduler")** (their .cjs files always ship — shared plumbing rule); session-manager _browserFor + mission-runner browserFor builtIn("browser") → null; withLang/learnFromTurn gated builtIn("memory"); agent-openai imagegenOn/officeRulePart gated builtIn.
- **Modularity rule (standing):** exclude ONLY leaf modules behind guarded requires; shared plumbing (task-runner/store, webhook-server, user-memory, mobile-link, viamobile-log, office spec) NEVER excluded — gates disable instead. New switchable feature = key in src/extras.js + build-features KEYS + optional EXCLUDABLE entry + builtIn gates.
- npm scripts: electron:build (both) / electron:build:admin / electron:build:public / build:public (web). `.gitignore` += electron/build-features.json (`*.local` already covers the env file).
- Gate unchanged: everything since the last commit is uncompiled → `npm run build` + full restart; then test BOTH installer channels per BUILD-CHANNELS.md checklist.

### 14e. QUEUE EXECUTED — ALL 10 ITEMS BUILT (2026-06-11, autonomous approval "do not wait, do not stop")
Sequence small→big, 3+4 parallel agents on disjoint files + my wiring pass. NOTHING compile-checked (standing gate). §14d below is now BUILT — kept for spec reference.
1. **Designer robustness:** Agents.jsx extractJson → 4-rung tolerant ladder + "(no blueprint change detected — edit the Blueprint fields directly, or rephrase)" notice; reply never lost.
2. **Image knowledge:** agent.knowledge accepts {type:"image",dataUrl} (≤1.5MB, ≤6, thumbnails in Studio); agent-prompt.cjs skips images in text + exports knowledgeImages(); session-manager merges them into the FIRST turn's images (plain chat path only — _agentTurn tool path NOT covered, flagged).
3. **Browser minimize:** agentBrowser.fullSpeedMinimized (default ON) → backgroundThrottling:false; admin toggle row in AgentBrowserSettings.
4. **Exact ctx windows:** openrouter-catalog exports contextWindowOf(id) (cache ctx ×1000, 0=null); harness.ctxWindowFor(model, exact) prefers sane exact ≥4096; agent-openai passes it.
5. **Local-model registry:** NEW src/data/localModels.js (~33 families, conservative, minB size caps); ModelPicker + ModelsOverview OR-in localCaps for local rows as last fallback.
6. **Share links:** server POST /share (auth, 200KB, 10/h) → {id,url}; GET /s/:id escaped script-free read-only page, 30-day expiry lazy-pruned; DELETE owner-only; store.mjs generic col() collections (shares/requests/threads/posts, JSON + Postgres jsonb tables, names allowlisted); client: generic **bridge.apiCall(method,path,body)** (auth.cjs + main/preload + webBridge + mock stub) and Share2 icon on Sidebar recents → copies URL ("Link copied ✓").
7. **Deep Research:** NEW electron/research.cjs — RESEARCH_TOOL + runDeepResearch(profile,args,{signal,emit}): plan queries (tolerant-parsed) → DDG html endpoint (uddg= decode) → SSRF-mirrored fetchGuarded (private-IP block, redirect re-check, 10s/1MB caps) → ~8 sources parallel → cited [n] synthesis + source list; never throws; builtIn("research") gate. Wired into agent-openai (every mode, ALWAYS asks permission except bypass; plan-mode blocked). Limits: DDG rate-limits, JS-rendered pages thin.
8. **DESKTOP APPLICATIONS DRIVER:** NEW electron/desktop-driver.cjs (~390 lines) — Windows UI Automation via short-lived PowerShell (win-speech safety pattern: ONLY clamped ints + validated base64 interpolated; 15s kill; busy serialize). Tools desktop_apps/focus/read/click/type/open; numbered element tree (depth 4 / 120 els); FORBIDDEN_FIELD refusal on type; desktop_open only from SAFE_APPS map (notepad/calc/explorer/mspaint/wordpad) or allowlisted running app; per-agent agent.desktopAllow; settings.desktopDriver.enabled master (DEFAULTS added); UNTRUSTED framing on reads. Wired: agent-openai (desktop param, DESKTOP_TOOLS, dispatch block — apps/read free, rest permission-gated, plan blocked; SAFE set += desktop_apps/read), session-manager _desktopFor at all 3 interactive sites; **headless runs DELIBERATELY get NO desktop binding** (comment in mission-runner). Studio capability toggle + "Allowed apps" input (Agents.jsx TOOL_DEFS + designer normalizers); APP-GUIDE updated incl. "does NOT exist" correction. Known limits: exact-title focus may mis-resolve dup titles; ValuePattern-only typing (no SendKeys by design).
9. **Product Request board:** server GET/POST /requests, vote (paid-only via statusOf, 403 msg "Voting is for subscribed users — trial accounts can follow along"), status enum requested|approved|rejected|building|deployed (admin, statusAt, adminNote), delete author-while-requested/admin; rate limits per-IP. NEW src/components/ProductRequests.jsx — 10,000-votes banner, sort Top/Newest, status chips, vote ▲ optimistic w/ rollback, admin status dropdown, trial-disabled votes, skeletons/offline states. .pr-* CSS appended.
10. **Community forum:** server /community/threads (categories general|ideas|help|showcase, pinned/locked, 10/day) + posts (≤4000, 30/day, locked 403) + admin /mod pin/lock/delete; authorName = name or truncated email ("chai…"), full emails never echoed; plain-text only. NEW src/components/Community.jsx — list+thread views, category chips, reply composer, admin pin/lock/delete. .cmty-* CSS appended. Settings.jsx: "Community" + "Product requests" nav for ALL users (between Terminal access and Extras).
- **Build-channel integration:** extras.js += desktop+research entries + FEAT_BUILT keys; build-features KEYS += both; EXCLUDABLE += desktop-driver.cjs + research.cjs; ToolCard describe() += desktop_*/deep_research (standing rule honored). PRIVACY.md gained shared-content section.
- **NOT done (needs user):** npm run build gate (NOTHING since last commit compiled — biggest first-failure suspects: Agents.jsx (3 writers this arc), webBridge.js, auth-server.mjs route block, App.jsx lazy conversions); Save-button console output; secret rotation/2FA; Q16 split + vite majors (deferred deliberately). Server changes → restart `node server/auth-server.mjs`. New deps: none.

### 14g. SAGE CONTROL-LEVEL KNOWLEDGE BUILT (user-approved plan: "embed in help + retrieval")
- **Sage now knows every field/checkbox/window** like the building engineer. Architecture (full story in **SAGE-KNOWLEDGE-PROCESS.md** — READ IT before touching this system): `sage-knowledge/01-08*.md` (~295 entries, 8 area files, generated FROM SOURCE by 8 parallel agents — exact JSX labels, real behavior, role gates, ≤110-word entries, strict `### Screen · Label / aliases / What / Why / Behavior / Example` contract) → `src/sageKnowledge.js` (import.meta.glob ?raw eager auto-discovery; one-time chunk parse; per-question keyword scoring heading/alias ×4 body ×1 + current-screen boost +5, threshold ≥4, top 6 ≤5.2k chars; FAIL OPEN everywhere — missing/malformed = Sage as before) → wired into **SageDock.ask()** AND the **Agents "Ask Sage" tab** (dynamic import) as a "CONTROL-LEVEL KNOWLEDGE" system-prompt block; SYS gained the "answer like the engineer who built it" rule + entries-outrank-guides rule. APP-GUIDE gained a self-describing section. Zero engine changes, zero deps, zero runtime model calls for retrieval.
- **Maintenance (standing rule extended):** every feature updates the matching sage-knowledge file (same as APP-GUIDE rule). Drift sweep runbook = SAGE-KNOWLEDGE-PROCESS.md §6 (git-diff changed components → per-area agent brief → REVIEW DIFF before accepting → rebuild). New screens: add 09-<area>.md — auto-discovered. Phase 2 (NOT built): in-app "Sage Librarian" agent w/ admin-approved diffs.
- Uncompiled like everything else → same build gate. Smoke: ask Sage "what is the Craft section?" on the Agents screen → should explain thorough/reviewer/text-protocol/economy precisely.

### 14f. Studio Designer CSS RESTORED (user screenshot: "very bad UX, truncated, dumped")
- ROOT CAUSE: the entire **`.agsd-*` block was MISSING from styles.css** (same §12a corruption class — the Designer-room redesign's styles were never restored after the whole-file rewrite incident; only 2 stray `.sage-panel-msgs .agsd-*` refs survived). The Designer pane rendered completely unstyled: dumped persona chips, truncated header/name/composer, overlapping sections.
- FIXED: (1) **casting call restructured** in Agents.jsx — personas now grouped by profession category (uses the existing `cat` field) with uppercase section headers; hint text folded into the sub-line (it was overlapping the composer); (2) **full `.agsd-*` design block appended** to styles.css (~80 rules): pane = flex column min-height:0 so ONLY the chat scrolls (header/refine/composer/blueprint-toggle fixed), smooth scroll + overscroll-contain, chip pills w/ hover lift, say/sheet bubbles, meter, composer, bp-toggle, vitals, id-pulse; `.ags-split > * { min-height: 0 }` + `.ags-name { flex:1; min-width:140px }` fix the truncations; <880px the chip role labels hide before names truncate. TARGETED APPEND only (standing rule).
- LESSON recorded: when a screen looks "dumped/unstyled", grep styles.css for the component's class prefix FIRST — missing CSS block = §12a corruption survivor.

### 14d. QUEUED (user request 2026-06-11 — specs; NOW BUILT, see 14e)
Two NEW Settings sections (likely better as sidebar/Settings hybrid — decide at build time). Both need SERVER-side storage (auth-server + store.mjs — community content must be shared across users, not localStorage) and must work web + desktop. Research rider: survey best-in-class implementations (Canny, Productboard, Discourse, GitHub Discussions, Featurebase) and combine the best — minimalistic, futuristic, intuitive, interactive.
1. **Community** — a forum for BrainEdge users: discuss, share ideas/feedback/knowledge. Top-notch minimal design. Implies: server endpoints (threads/posts, auth-gated writes, rate limits, escaped server-rendered or client-rendered content — XSS care), categories/tags, search; moderation hooks for admin (delete/pin/lock). Spec details TBD at build.
2. **Product Request** — feature-request board with VOTING: paid users vote (1/user, toggleable), trial users view-only; banner "Minimum 10,000+ votes required for a feature to be considered for approval — final decision rests with the admin". Status workflow owned by admin: **Requested → Approved/Rejected → Build in progress → Deployed** (status chips + filters; sort by votes/recent; duplicate-merge nice-to-have). Admin controls in Admin panel or inline (admin-gated). Server: requests/votes tables, vote uniqueness per user, status audit. UI: card list w/ vote button + count, detail view w/ comments (reuse Community plumbing), status timeline.
- Build order suggestion: shared server primitives (posts/votes/auth gates) → Product Request (smaller, clearer spec) → Community forum. Wire into Settings nav (all users see these two sections; only voting is plan-gated).
