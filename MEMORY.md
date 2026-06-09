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

### 11ah. STILL-OPEN ITEMS (carried forward)
- **Agents feature** — verify on web + desktop (not compile-checked); roadmap: Scheduler-run agents, CLI `--agent`, re-attach agent on reopened conversations.
- Claude-style "Add content from GitHub" file-picker modal; "+" menu Skills submenu — still not built.
- Let's Collaborate progress/queue panel; "General" filter redefinition awaiting OK; Reasoning/Thinking label standardization awaiting OK; Simple-Icons SVG logo upgrade; HF downloads column offer.
- Let's Build / GitHub repo list verify web+desktop; Ink CLI + node-pty interactive verification; model determination/selector bug.
- Pre-launch: rotate exposed OAuth secrets; remove Anthropic subscription/OAuth path (API-key only); CLI anthropic wire format + npm/`.exe` distribution; file-tree view + undo/checkpoint buttons still to surface.
