# Madav — Web vs Desktop: Parity Review & Web Gap Analysis

**Date:** 2026-06-17  **HEAD:** `6eb69fd2`  **Branch:** `main` (local: 1 commit ahead of `origin/main` = `6e68859a`; remote not network-verified)
**Method:** Read the bridge spine (`src/bridge/contract.js`, `index.js`, `webBridge.js`), the two desktop turn engines (`electron/session-manager.cjs`, `electron/agent-openai.cjs`), the web server (`server/auth-server.mjs`, `store.mjs`), shared layers (`shared/csp.cjs`, `shared/office-rules.cjs`), and ~33 `electron/*.cjs` native modules — via 4 parallel review agents + direct source re-verification of every P0 claim. Every claim below carries a `file:line`.
**Confidence:** HIGH on structural gaps (re-verified in source). MODERATE on a few native-module one-liners (read from headers/exports only).

---

## 0. TL;DR verdict

The two surfaces share **one renderer** (`src/**`) but have **two completely separate backends**: desktop = the full `electron/` tree (≈60 modules, IPC via `preload.cjs`→`main.cjs`); web = a single `src/bridge/webBridge.js` + `server/auth-server.mjs`. Bridge selection: `bridge = window.madav || webBridge` (`index.js:8`).

- **Desktop** is a full agentic platform: shell/terminal, browser & native-desktop automation, MCP/connectors, folder-linked Projects with a real-file (.xlsx/.docx/.pdf) pipeline, background missions/swarms/scheduled execution, Telegram/webhooks, voice, skill authoring, agent memory.
- **Web** is, accurately, a *chat + single-folder Python(Pyodide) file-agent* with account sync, image-gen, speed-check, and a web-fetch proxy — **and essentially nothing else** from the native surface. Roughly **15–20% of desktop's native capability surface exists on web** (mostly convenience/metadata, not agency).

**The danger for web testing today is not the missing-by-design features (terminal, MCP, automation — all show honest "desktop app" messages). It is the handful of features that look present on web but silently degrade** — chiefly **Projects** (no folder, no file output, falls back to tool-less chat with no error) and **file-output cards** (buttons no-op). Those are the P0 items below.

---

# PART A — Ranked web gaps (what to expect when testing web today)

Severity = impact on a web user. Every "missing-by-design" item is handled gracefully (guarded call → hidden affordance or explicit "desktop app" message) **except where noted as a silent degrade**.

## 🔴 P0 — Looks present on web, but broken / silently degraded (fix or hide before demoing web)

### P0-1 — Folder-linked Projects do not work on web; they silently become tool-less chat
- **Symptom:** A user opens a Project (Workroom) on web, asks for a report/spreadsheet, and gets a **plain text answer with no file** — no error, no hint that the data pipeline isn't running.
- **Root cause (verified):** `webBridge.start` computes `agentic = webfs.hasRoot() && (!!req.cwd || req.mode === "cowork") && wantsFiles` (`webBridge.js:875`). `mode:"project"` is **not** in that condition, so a project turn is never agentic; `runTurn` only branches on `sess.team`/`sess.agentic` (`webBridge.js:799-801`) and falls through to the tool-less `callModel` (`webBridge.js:810`). There is no web analogue of desktop `_projectTurn` (`session-manager.cjs:874`) or its rigid build-report recipe.
- **Compounding:** A web project can never even acquire a folder — `linkProjectFolder` returns `"Linking a local folder is available in the desktop app."` (`webBridge.js:1061`); `addKnowledgeFile`/`seedSampleFiles` likewise (`:1059`, `:1053`). So `startProjectCowork` (which requires `project.folder`) is unreachable on web.
- **Net:** Web Projects degrade to **grounded Q&A over *text* knowledge only** (`systemPrompt(s, projectId)` injects text docs, capped at 8, whole — no RAG). No files in, no files out.
- **Fix options (RULE 0 surface: `src/bridge/webBridge.js`, `src/components/Workrooms.jsx`, `src/App.jsx`):**
  1. *Minimum (1–2 h):* Show an explicit web banner in the Projects UI — "Folder linking & file generation need the desktop app; on web, pick a folder in Let's Collaborate" — so it never silently degrades.
  2. *Real parity (larger):* Persist the File System Access `chooseFolder` handle per-project and route web project turns that have a folder through the existing `runAgentTurn`/`COWORK_TOOLS` (Pyodide) path that already produces real `.xlsx` files. This is the same engine web Collaborate already uses successfully.

### P0-2 — File-output cards are inert on web
- **Symptom:** If a `file_output` card ever renders on web, its **Open** button does `window.open(localPath)` (useless for a sandbox file) and **Folder** does nothing.
- **Root cause (verified):** `FileOutCard` calls `bridge.showInFolder(path)` and `bridge.openPath(path)` (`Message.jsx:51-52`). Neither exists on the web bridge; `openPath` falls back to `openExternal` (`window.open`). Desktop `emitNewOutputs` (`session-manager.cjs:43`) has no web counterpart, and web `getConversation` (`webBridge.js:1067`) never stores `.outputs`, so cards don't persist either.
- **Fix (RULE 0 surface: `src/components/Message.jsx`):** Make `FileOutCard` web-aware — when `!bridge.showInFolder`, hide the Folder button and turn Open into a real browser download (the web office pipeline already builds a Blob + download in `src/office.js:309-316`). Mirrors how `markdown.jsx:110` already gates `saveAndOpen`.

## 🟠 P1 — Major capability reductions on web (present but much weaker)

### P1-3 — Plain chat & folderless Agents have NO tool loop on web
- Desktop "Let's Chat" runs a lightweight tool loop (`_chatAgentTurn`, `session-manager.cjs:468-469`) giving skills + connectors + `web_search` + `create_image` when configured. Web `runTurn` is a **single `callModel` completion with no tools at all** (`webBridge.js:810`). A custom Agent with no folder also falls to this plain path.
- **Symptom:** On web, asking chat to "search the web and make an image" does neither. **Fix surface:** `src/bridge/webBridge.js` `runTurn` — add a web tool loop (realistically `web_search` + `create_image` + bundled `load_skill`; web has no MCP/connectors).

### P1-4 — Agent Teams on web are single-pass, text-only
- Desktop `_teamTurn` (`session-manager.cjs:611`): members get file/shell/connector tools, plus manager **follow-up waves** (`:737-767`), **durable mission checkpoints/resume** (`:648`), and a **token budget** (`:627`). Web `runTeamTurn` (`webBridge.js:404`): relay/manager/parallel fan-out only, members are **pure text completions with no tools** (`:451`, `:468`), no resume, no budget, no follow-up logic.
- *Note:* per-message model attribution + auto-title **are** at parity here (`webBridge.js:487`, `:489`) — that part of the prior "web parity for team turns" work landed. The functional capability is the gap.

### P1-5 — No MCP / connectors on any web path
- `testConnector`/`connectorSignIn`/`connectorAuthStatus` are stubs (`webBridge.js:1210-1212`). `listConnectorDirectory` returns a cosmetic hard-coded catalog (`:1214`). **No third-party tools reach a web agent.** Desktop: `mcp-manager.cjs`, `mcp-oauth.cjs`, `connector-registry.cjs`.

### P1-6 — Scheduled tasks can be authored but never fire on web
- `listTasks`/`createTask` persist to localStorage but `runTaskNow` errors and `getRuns` returns `[]` (`webBridge.js:1071-1077`). A browser can't run in the background. **Symptom:** silent no-op schedules. **Fix:** label the web task UI "runs only while the desktop app is open."

### P1-7 — Skills are read-only on web
- `listSkills` returns bundled packs only; `createSkill`/`importSkill*` error (`webBridge.js:1248-1249`); `load_skill` reads bundled bodies (`:682`). No authoring, import, pinning, or Forge.

### P1-8 — GitHub clone/link/pull desktop-only
- `cloneRepo`/`linkGithub`/`pullGithub` error with guidance to download a ZIP and "Choose folder" (`webBridge.js:1062-1064`).

## 🟡 P2 — Moderate (degraded but usable, or design-limited)

| # | Gap | Web behavior | Source |
|---|---|---|---|
| P2-9 | **Voice input** | `transcribe`/`winSpeech` absent → falls back to browser Web Speech API (Chrome-only; alerts otherwise) | `Composer.jsx:317,328,366` |
| P2-10 | **Native open-in-app for office files** | Office docs **download** instead of opening in Excel/Word; "reveal in folder" inert | `markdown.jsx:110`, `Message.jsx:51-52` — *by design; browsers can't launch native apps* |
| P2-11 | **Identity "not Claude" missing in web Team prompts** | `memberSys`, coordinator, and synthesis sub-prompts omit the negation line that plain-chat/cowork carry | `webBridge.js:397,427,478` — cheap fix, see Part D |
| P2-12 | **Agent builder extras** | memory, track record, versions, `.agent` import/export, swarm — all hidden on web (guarded) | `Agents.jsx` (multiple) |
| P2-13 | **No deep_research / RAG retrieval / agent memory** | web injects knowledge whole (cap 8 docs), no chunk-ranking; no `deep_research` tool; agents don't accumulate learnings | `webBridge.js:373,380-383`; desktop `research.cjs`, `knowledge-retrieval.cjs`, `agent-memory.cjs` |
| P2-14 | **Telegram / webhooks / mobile-link** | stubs / hidden panels — no inbound triggers, no phone control | `webBridge.js:1264-1272`; Scheduler hides webhook panel |
| P2-15 | **QA Test Center / Repair Bay / Librarian / recorders** | panels hidden on web (dev/maintenance features) | `TestCenter.jsx`, `LibrarianPanel.jsx`, `TopNav.jsx:55` |

## ⚪ P3 — Minor / cosmetic (no real loss)
`listDir`→`[]` (`:1208`), `getModelStats`→`{}` (`:1161`), `getAppVersion`→`"web"` (`:1026`), `getProjectAgentHistory`→`[]` (`:1052`), mobile-link local echo (`:1270`), `ensurePythonTools` absent (moot — Pyodide auto-loads pandas/openpyxl).

---

# PART B — Full feature-by-feature parity matrix

Legend: ✅ parity · 🟢 web-native equivalent (different engine) · 🟠 reduced · 🔴 missing/broken · ⛔ desktop-only by design

## B1. Conversation modes / turn engines

| Mode | Desktop (`session-manager.cjs` / `agent-openai.cjs`) | Web (`webBridge.js`) | Status |
|---|---|---|---|
| **Let's Chat** (plain) | `_chatTurn` L830 (tool-less) **or** `_chatAgentTurn` L496 (skills/connectors/web_search/imagegen loop) | `runTurn` L810 — single completion, **no tool loop** | 🟠 major |
| **Projects** (folder data work) | `_projectTurn` L874 + rigid recipe L889 + `emitNewOutputs` L939; real files | **none** — falls to tool-less `runTurn` L810; no folder (L1061) | 🔴 blocker |
| **Agents** (custom builder) | `_agentTurn` L958 (full tools, per-capability gates) / `_chatAgentTurn` | folder+files → `runAgentTurn` (Pyodide); else tool-less | 🟠 major (folderless) / 🟢 (with folder) |
| **Agent Teams** | `_teamTurn` L611 (member tools, follow-up waves, missions, budget) | `runTeamTurn` L404 (single-pass, **text-only members**) | 🟠 major |
| **Let's Collaborate** (folder cowork) | `_agentTurn mode:"cowork"` L958 (file/shell) | `runAgentTurn` L698 + `COWORK_TOOLS` (Pyodide, web_fetch/search, subagent, imagegen) | 🟢 parity (real files via Pyodide; no shell/MCP) |
| `_chatDataTurn` (scratch-dir data chat) | exists L477 but **dispatch commented out** L463-467 | none | n/a (disabled both effectively) |

## B2. Cross-cutting turn behaviors

| Behavior | Desktop | Web | Status |
|---|---|---|---|
| Auto-title (3–6 words) | `_autoTitle` L212 | `maybeAutoTitle` L770 | ✅ |
| Per-message model+provider | `_persistTurn` L248 | `runTurn` L812; `persistSession` L834 | ✅ |
| Identity "not Claude" — chat/projects/cowork | SYSTEM strings L214-224 | `BASE_BEHAVIOR` L303, `coworkSystem` L544 | ✅ |
| Identity "not Claude" — **team members/coordinator** | member SYSTEM carries it | `memberSys` L397 / L427 / L478 **omit it** | 🟠 minor gap |
| Office bespoke engine (officedoc → in-chat card) | shared renderer | shared renderer | ✅ (shared `src/**`) |
| Real-file output (.xlsx/.docx/.pdf) | run_bash python/node → folder | Pyodide → folder (**cowork/agentic only**) | 🟠 cowork-only on web |
| Persistent `file_output` cards | `emitNewOutputs` + `conv.outputs` restore | **none**; card buttons inert | 🔴 |

## B3. Filesystem & native open

| Capability | Desktop | Web | Status |
|---|---|---|---|
| Folder picker | native dialog | File System Access API (Chrome/Edge only); returns name label | 🟠 `webfs.js:15` |
| Agent file read/write/edit/delete | IPC fs | `webfs.js` (real, via picked handle) | 🟢 |
| `openPath` (open in OS app) | yes (allowlisted, H1) | **missing** → `openExternal` | 🔴 by design |
| `showInFolder` / reveal | yes | **missing** (inert) | 🔴 by design |
| `saveAndOpen` (native open-in-app) | IPC → Downloads + open | **missing** → downloads instead | 🟢 graceful (`markdown.jsx:116`) |

## B4. Code execution

| Capability | Desktop | Web | Status |
|---|---|---|---|
| Shell / `run_bash` / terminal | `terminal.cjs`, `agent-openai` run_bash (H3 guard) | **none** ("no terminal", `:684`; `termCreate` stub `:1279`) | ⛔ by design |
| Python | system Python via run_bash | **Pyodide WASM** (pandas+openpyxl), cowork only | 🟢 `pyodideRunner.js:37` |

## B5. Native capability surface (desktop module → web)

| Theme | Desktop modules | Web equivalent | Status |
|---|---|---|---|
| Browser automation | `agent-browser.cjs` | only `web_fetch`/`web_search` (read-only) via `/proxy/fetch` | 🔴 |
| Native-app automation | `desktop-driver.cjs` | none | ⛔ |
| Teach-by-demo recorders | `desktop-recorder.cjs`, `flow-recorder.cjs` | none | 🔴 |
| Terminal / CLI install | `terminal.cjs`, `cli-install.cjs` | stubs | ⛔ |
| Voice / STT | `voice.cjs`, `win-speech.cjs` | Web Speech API fallback only | 🔴 |
| Telegram / webhooks / mobile | `telegram-bot.cjs`, `webhook-server.cjs`, `mobile-link.cjs` | stubs / hidden | 🔴 |
| Missions / swarms / scheduled exec | `mission-runner.cjs`, `task-runner.cjs` | none (storage only) | 🔴 |
| QA / Repair Bay | `qa-runner.cjs`, `qa-fixer.cjs` | none | ⛔ (dev tool) |
| MCP & connectors | `mcp-manager.cjs`, `mcp-oauth.cjs`, `connector-registry.cjs` | stubs + cosmetic catalog | 🔴 |
| Skills authoring / Forge | `skills-manager.cjs`, `instincts.cjs`, `skill-draft.cjs` | read-only bundled | 🔴 |
| Knowledge / memory | `knowledge-retrieval.cjs`, `agent-memory.cjs`, `user-memory.cjs` | user-memory ✅; agent-memory & RAG ❌ | 🟠 |
| Deep research | `research.cjs` | none (single web_search) | 🔴 |
| Image generation | `imagegen.cjs` | `webGenImage` `:578` | ✅ |
| Model speed check | `speedtest.cjs` | in-browser `:1114` | ✅ |
| OpenRouter catalog | `openrouter-catalog.cjs` | direct fetch `:1175` | ✅ |
| Page extraction (HTML→MD) | `webmd.cjs` | reused server-side `auth-server.mjs:16,801` | ✅ |
| Tracing | `trace-store.cjs` | `webTrace` local-only `:1106` | 🟠 |

## B6. Persistence

| Data | Desktop | Web | Status |
|---|---|---|---|
| Sessions / chats | JSON per session `sessions-store.cjs:43` | IndexedDB + server `/conversations` sync `store.mjs:31` | ✅ |
| Account / workspace (agents, teams, groups, global instructions) | `settings.cjs` | server Postgres workspace blob `auth-server.mjs:585-608` | ✅ |
| **Project (Workroom) records** (knowledge, folder, goals, pinned skills) | `projects-store.cjs:45-52` | **localStorage only** (`be.projects`) — **not** in server `COLLECTIONS` | 🟠 device-local, not synced |
| Project conversations | per-file `projects-store.cjs:145` | `be.convs` localStorage (no `.outputs`) | 🟠 |
| Generated output files | linked folder / Downloads | in-browser Blob download; nothing server-side | 🟢 |
| API keys / connector tokens | encrypted `settings.cjs` (M6) | **never synced** by design `auth-server.mjs:583` | ✅ |

## B7. CSP (both import `shared/csp.cjs buildCSP`)

| Directive | Web `{web:true}` | Desktop dev | Desktop prod |
|---|---|---|---|
| `script-src` | `'self' 'unsafe-eval'` + cdnjs/jsdelivr/unpkg (`csp.cjs:12`) | `'self' 'unsafe-inline' 'unsafe-eval'` | `'self' 'unsafe-eval'` |
| `worker-src` | `'self' blob:` (`:18`) | `'self' blob:` | `'self' blob:` |
| `connect-src` | `'self' https:` | `+ ws://localhost:5174` | `'self' https:` |
| `img-src` | `'self' data: blob: https:` | `'self' data: https:` | `'self' data: https:` |
| `frame-src`/`media-src` | `blob: data:` (preview iframes) | (default-src) | (default-src) |

**Bespoke office engine needs (`'unsafe-eval'` + `worker-src blob:`) satisfied on BOTH.** M1 (no `unsafe-inline` in web `script-src`) confirmed. Web is looser on CDN hosts + blob (needed for browser delivery / CDN-Tailwind artifacts); desktop is stricter on script hosts. No surface is uniformly stricter.

## B8. Auth (web-only vs desktop-only surfaces)

| | Web (`auth-server.mjs`) | Desktop (`main.cjs`/`auth.cjs`) |
|---|---|---|
| OAuth | `/auth/:provider/start`+`callback`, exact-origin redirect (H2), state+exp `:412-465` | Google loopback PKCE+state (M4) `:1063`; GitHub device flow |
| Session token | HMAC `sign`/`verify` + length-check (M3) + `tokenVersion` revocation `:143-158,389` | n/a (local) |
| Rate-limit | right-most trusted XFF hop (M5) `:359-364` | n/a |
| Web-only | `/cli/*`, dev login, Stripe billing, private-beta gate, `/proxy/*` | — |
| Desktop-only | — | MCP connector OAuth, local encrypted secrets |

## B9. Shared model-facing rules (single-sourcing)

- `shared/office-rules.cjs` exports `isDeckCapable`, `officeRule`, `ARTIFACT_RULE`.
- Desktop **truly single-sourced**: `agent-openai.cjs:201` and `session-manager.cjs:92` both `require()` it (no divergent copy).
- Web: `src/office.js:441-459` keeps a **deliberate byte-identical copy** (Vite can't import CJS into browser ESM). Drift prevented by `test/rules-parity.test.cjs` (not by import).
- `isDeckCapable` regex is **identical** across all three locations (verified line-for-line by Agent D).
- ⚠ **CLAUDE.md is stale here:** it still says "three prompt copies / two separate CSPs." Reality: office rule = single-sourced (+1 tested web mirror); CSP = single-sourced via `shared/csp.cjs`. Update CLAUDE.md and wire `rules-parity.test.cjs` into CI (MEMORY pending #4).

## B10. Security fixes (committed-code spot-check)

All ten **PRESENT** (file:line): H1 `main.cjs:389-403`, H2 `auth-server.mjs:343-350`, H3 `agent-openai.cjs:52-70,312`, M1 `csp.cjs:12`, M2 `deckPreview.js:14-23`, M3 `auth-server.mjs:154-156,389`, M4 `main.cjs:1069-1082`, M5 `auth-server.mjs:359-364`, M6 `settings.cjs:23-33,176-191`, M7 `store.mjs:74-80`. Caveats: **M2** is defense-in-depth (parameter shadowing + sandboxed iframe; isolated Worker is the airtight follow-up); **M7** only verifies the DB cert when `PGSSLROOTCERT` is set — otherwise TLS stays unauthenticated with a startup warning.

---

# PART C — Where web is genuinely at parity (don't waste test time here)

Account/auth/billing/admin, sessions history + search, saved library, usage stats, local tracing, model speed-check, OpenRouter catalog, cross-chat user-memory, image generation, the **entire bespoke office engine + CSS-only previews + inline charts** (shared renderer), auto-title, per-message model badge, and — uniquely strong on web — **Pyodide** giving real pandas/openpyxl file generation in Collaborate without any local install.

---

# PART D — Notes, robustness, and recommended fixes

**Silent-degrade UX trap (highest test-day risk).** Web Projects (P0-1) and file cards (P0-2) fail *without telling the user*. Everything else fails loudly ("…available in the desktop app"). Prioritize making these two honest.

**Cheap, high-value identity fix (P2-11).** Add the existing "You are NOT Claude, ChatGPT, Gemini…" line to `webBridge.js` `memberSys` (L397), the coordinator prompt (L427), and the synthesis prompt (L478). One surface (web), aligns with the identity work already shipped — but per **RULE 0**, confirm the desktop team-member/coordinator prompts in `electron/agent-prompt.cjs` carry it too.

**Robustness (latent).** In `LibrarianPanel.jsx`, `Skills.jsx` (forge), and `TestCenter.jsx` (qa), inner handlers call `bridge.librarianScan`/`forgeApprove`/`qaStart` **without** optional chaining. Safe today because each parent panel early-returns on a missing `*Status`/`forgeList`. Fragile if any panel is ever rendered unconditionally — would throw on web. Cheap hardening: add `?.` at the call sites.

**Project records aren't synced on web (B6).** `be.projects` lives in localStorage only — conversations sync to the server but their parent Workroom does not. A user on a second browser sees synced chats with no parent project. Consider adding a `projects` collection to `store.mjs:31` + a `/projects` sync route if web Projects are meant to be account-following.

**Before testing web at all — the build is not shippable yet.** `dist/` currently holds an *incomplete* build: only `deckWorker` of the four worker chunks is present (`xlsxWorker`/`docxWorker`/`pdfWorker` missing), consistent with the obfuscator stage never finishing. Run a clean `npm run build`, confirm **all four** worker chunks, then redeploy to Render — otherwise web testing hits stale/partial code. (MEMORY pending #1.)

**Other hygiene (MEMORY pending #5):** `git rm --cached .~lock.Madav-Test-Plan.xlsx#` (it is tracked — confirmed); `npm audit fix` (form-data/joi, non-breaking).

---

## Appendix — key file:line index

- Web bridge selection: `src/bridge/index.js:8`
- Web turn dispatch: `webBridge.js:799-810` (no project branch); `start` agentic gate `:875`
- Web project/folder stubs: `webBridge.js:1053,1059,1061-1064`
- Web cowork tools (Pyodide): `webBridge.js:562,657-675,698`
- Web team prompts (identity gap): `webBridge.js:397,427,478`
- Desktop turn engine: `session-manager.cjs:43 (emitNewOutputs), 463-467 (data path disabled), 611 (_teamTurn), 830 (_chatTurn), 874 (_projectTurn), 958 (_agentTurn)`
- Desktop tools/rules: `agent-openai.cjs:161 (TOOLS), 201 (office-rules require), 210 (DATA_TOOLS_RULE), 312 (destructiveBashGuard)`
- File-output card (inert on web): `src/components/Message.jsx:44-54`
- Shared rules: `shared/office-rules.cjs:6-10`; web mirror `src/office.js:441-459`
- CSP: `shared/csp.cjs:9-38`; desktop apply `electron/main.cjs:160`
