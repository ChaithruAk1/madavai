# BrainEdge — Project Memory

> Resume file. If the chat is lost, read this first to pick up exactly where we left off.
> Last updated: 2026-06-08 — auth + monetization, full WEB app, provider proxy, web folder access,
>   default language, code obfuscation, deploy config, reusable auth-kit skill. **Section 11 (bottom) is
>   now the most current authoritative state.**
> NOTE: Sections 1–9 below are older. **Section 10/11 (bottom) is the current authoritative state** and
> corrects stale facts (app is now "BrainEdge" not "Chai"; bridge is `window.brainedge`; the "Dispatch"
> feature was renamed; copyright owner is Samskruthi Harish). Read Section 10 first.

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
