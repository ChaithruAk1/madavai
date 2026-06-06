# BrainEdge — Project Memory

> Resume file. If the chat is lost, read this first to pick up exactly where we left off.
> Last updated: end of Phase 3 Skills (multi-folder + import).

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
- `dispatch-store.cjs` + `dispatch-runner.cjs` — background/scheduled tasks (tasks+runs persisted;
  headless runner uses permMode bypass). main.cjs has a 60s scheduler (interval/daily/weekly).
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
