# Madav — working memory (web↔desktop parity effort)

_Last updated: 2026-06-22. Durable handoff. Pair with `docs/WEB-PARITY-PLAN.md`, `docs/PARITY-SCORECARD.md`,
`docs/PARITY-PHASE-TESTS.md` (all manual test scenarios), `docs/adr/0001-architecture.md`,
`docs/adr/0001-MIGRATION-PLAN.md`, `docs/adr/0001-M2-CHAT-LOOP-DESIGN.md`, and the `docs/PHASE3-*` / `*-WEB-DESIGN.md` notes._

## Mission
Bring **Madav Web** as close as possible to **Desktop** capability **without destabilizing Desktop**
(desktop validated first, web follows; never modify desktop to accommodate web without explicit sign-off).
Replicate Claude's proven agent patterns for stability/longevity. Be honest about what NOT to build.

## Architecture (ADR-0001)
- **Single source of truth** behind a platform **adapter**; **desktop is the reference**; migrate the engine
  incrementally (strangler-fig, harness-first, never big-bang).
- **Core module format = ESM** (corrected 2026-06-18; earlier "CJS" was wrong — the browser can't import source
  `.cjs`, which is why `src/office.js` was a copy+`rules-parity` test). Core lives in `core/` (ESM); the web
  renderer + Node server import it natively; **desktop (CJS) consumes it via cached dynamic `import()`** (the
  proven MCP-SDK pattern). Pervasively-synchronous logic (loop + helpers) migrates as a UNIT *inside* the core
  loop, which desktop `await`s — so individual helpers never need separate async-loading.
- Two surfaces, one renderer (`src/**`). Desktop backend `electron/*.cjs` (IPC). Web backend
  `src/bridge/webBridge.js` + `server/auth-server.mjs`. Bridge select: `window.madav || webBridge`.
- Anti-drift: `webCapabilities` manifest, `tests/parity/**` (209 green), turn-replay harness, ADR, per-feature rule.

## Shipped 2026-06-18 (this session) — all WEB/SERVER only unless noted; desktop verified untouched
- **Phase 2:** project/Workroom sync (`/projects` + `pjPull`/`pjMaybePush`); **deep_research** (`src/bridge/deepResearch.js`, client multi-fetch over `/proxy/fetch`); **RAG-lite** (`src/bridge/ragLite.js`, chunk+rank into `systemPrompt`); **agent memory + track record** (`src/bridge/agentMemory.js`).
- **Phase 3 scheduled runs (S1–S4):** `tasks`+`runs` store + CRUD; `server/provider-key-vault.mjs` (opt-in BYO key, AES-256-GCM); `server/provider-call.mjs` (single-shot completion); `server/scheduler.mjs` (internal 60s claim-first tick, per-user daily cap + plan gate, single-shot via `runTaskOnce`); `server/schedule-next.mjs` (tz-aware off/interval/daily/weekly, DST-correct); `/tasks` routes + `POST /tasks/:id/run`; the shared `Scheduler.jsx` UI wired to the managed runner via `webBridge` adapter. Caveat: Render free tier sleeps → timed fires only while awake (run-now always works).
- **Agent Ops on web (A1–A3):** `agentMemory.js` bounded run-history + stats; `webBridge` memory edit / history / stats / versioning / export-import. Swarms (`runSwarm`/`cancelSwarm`/`onSwarmEvent`) + missions = graceful desktop-only no-ops (**parked** — need a server multi-agent loop).
- **Skill authoring on web (SK1–SK3):** `src/webSkills.js` `mergeSkills` (bundled+user, prefs); `webBridge` skill CRUD + `importSkillZip` (JSZip) + play export/import; `Skills.jsx` web-gated inline editor + create/import entry points. Authored skills feed the model via the existing `bundledIndex` + `load_skill` path.
- **Voice transcription (BYO Whisper):** `POST /proxy/transcribe` (SSRF-allowlisted, ~25MB cap, forwards the caller's OpenAI/Groq key) + `webBridge.transcribe`; mic capture already existed in `Composer.jsx`. Manifest → PARITY.
- **Parity scorecard** (`docs/PARITY-SCORECARD.md`) + capability-manifest refresh (`webCapabilities.js`: research.deep/mcp.connectors/voice → realized).
- **(earlier sessions, committed)** Phase 0 harness/manifest/adapter-contract/CI; Phase 1 web chat tools; Phase 3 MCP broker + routes; **P3.4 connector OAuth + token vault** — realigned to desktop's generic MCP-SDK flow (one path, vault-backed; bespoke per-provider modules retired). Key lesson: a connector is an MCP URL; the SDK does discovery+DCR+PKCE+refresh — never build per-connector code.

## ESM-CORE MIGRATION (ADR-0001) — ACTIVE FOCUS
- **DONE + desktop-validated:** `core/agent-rules.js` (ESM). `dataToolsRule(caps)` returns the desktop (shell/Node)
  or web (Pyodide) text from ONE source, **byte-identical** to the prior per-surface strings. Desktop loads it via
  cached `import()` inside the async `runOpenAIAgentTurn` (with a defensive degrade-on-failure); web imports natively;
  build bundles it. **Validated on desktop** (DeepSeek built the .xlsx; no `core/agent-rules load failed`). The old
  `shared/agent-rules.cjs` is orphaned → `git rm` it.
- **BANKED, NOT wired:** `core/office-rules.js` (ESM, byte-identical port of `shared/office-rules.cjs`). Decided
  **not to wire now**: the office rule is already drift-guarded by `rules-parity.test.js`, and wiring touches the
  🔒 PROTECTED `session-manager.cjs:889` `isDeckCapable` gate + needs an async restructure across both engine files.
  High risk, low marginal value. Wire it LATER, together with the session-manager engine work, re-running the
  PROTECTED `Report_March.xlsx` scenario.
- **M2 (chat turn-loop) = BUILT, desktop-validated behind `MADAV_CORE_CHAT` (default OFF; legacy still default).**
  `core/chat-loop.js` `coreChatTurn` is a faithful chat drop-in (tool-calling, text-mode/tier-C, permissions,
  streaming, emit events, auto-compaction). LANDED + committed: **M2a** pure helpers `core/turn-helpers.js`
  (verbatim from `harness.cjs`, `.toString()` drift-guarded) · **M2b** core loop + mock-adapter replay tests ·
  **M2c.0/0b** `electron/turn-recorder.cjs` (env-gated `MADAV_RECORD_TURN`; records model turns + tool results + the
  emit stream into a replay cassette; 6 `if(rec)` hooks in `agent-openai.cjs`, no-op off) · **M2c.1**
  `electron/chat-core-adapter.cjs` (DI: stream/runTool/tools/emit + permission gate + native→text fallback) +
  emit-parity proof vs a real recorded turn · **M2c.3** `electron/chat-core-runner.cjs` + a SINGLE flag-guarded
  early-return in `agent-openai.cjs` (off-path byte-identical, diff-proven) — **validated on desktop** (drove a real
  chat turn; first bug caught+fixed there: provider profile not forwarded → `/v1/chat/completions` URL parse) ·
  **M2c.2** single-sourced `stripReasoning` + ported `estTokens/buildCompactionMessages/applyCompaction` into core
  (byte-identical), text-mode + auto-compaction parity. Locked by real-cassette replay (`tests/parity/fixtures/desktop-chat-*.json`).
  NOT YET single-sourced — the **RETIRE phase** is where duplication collapses: **M2d** web adapter (web `webBridge`
  loop adopts `core/chat-loop.js` → delete web's loop + `src/shared/harness.js`) · **M2e** flip `MADAV_CORE_CHAT`
  default → delete the legacy chat path in `agent-openai.cjs` + collapse the `harness.cjs`/`providers.cjs` helper copies.
  Gate before M2d/M2e: broad desktop shakeout of the flag. Two trivial gaps left (low-value): tier-B re-pin, create_image card.

## PROJECTS ORCHESTRATOR (deterministic job engine) — single-source, ACTIVE (2026-06-22)
Goal: Projects "just work" CONSISTENTLY on BOTH surfaces, weak+strong models, repeat+one-off — not reactive bug-fixing. Replaces the old "run a tool-loop agent over the folder each turn" with a deterministic inspect -> decide -> build -> validate -> save-recipe flow.
- **Core (shared ESM):** `core/project-job.js` — Job lifecycle: `schemaSignature` (file names + column names ONLY, not values -> new month / new rows = REPLAY; new/renamed column or file = RE-AUTHOR), `instructionsHash`, `makeJob/findJob/decideRun`, `validateOutputs`, `authoringPrompt` (the ONE build prompt; saves into `Madav Results/` via `OUTPUT_DIR`), `extractScript` (HARDENED 2026-06-22: salvages a TRUNCATED reply — opening fence, no close — so it never runs the model's prose+fence as code). `core/project-runner.js` — `runProjectJob` = the flow (inspect -> decide replay/author -> run -> bounded repair -> validate -> save active job); abort-aware; **FAIL-FAST** via `errorSignature` (stop when no script, or the SAME error twice — was burning all attempts); exports `INSPECT_PY`. `core/model-fit.js` — task-aware fit; **projects judged by `isDeckCapable` alone** (a one-shot script needs no tool-calling); agents/teams also require agentic.
- **Desktop = wired + validated** (deepseek-v4-pro builds the 6-file DTC report end-to-end): `electron/session-manager.cjs` `_tryProjectJob` holds the platform adapters (inspect via `runScriptInFolder(INSPECT_PY)`; author via `streamChat`+30s heartbeat+abort; run via folder-diff `scanOffice`, which recurses 1 level so `Madav Results/` is caught; jobs via `projects-store.cjs` getJobs/saveJobs). Hard 8-min timeout, maxRepair 3, plain-English narration; pre-creates `Madav Results`. Gate: folder + lane!=A -> `_tryProjectJob`, **fail-open** to `runOpenAIAgentTurn` on any error. `electron/agent-openai.cjs` `runScriptInFolder` = the ONE hardened runner (temp .py file — never multi-line `python -c`; `PYTHONSAFEPATH=1` so a stray .py cannot shadow stdlib; captures the real stderr traceback for the repair).
- **Web = NOT wired (the main Projects single-source GAP).** `core/project-runner.js` is surface-agnostic; web needs adapters (inspect/author/run/persist) — Pyodide in-browser or server-side Python — so web runs the SAME engine. Until then web Projects use the legacy path.
- **Shipped 2026-06-22:** Recommended filter chip + per-row fit badges (ModelPicker); deepseek no longer mislabeled "Needs a recipe"; outputs -> `Madav Results/`; accent fit-banner; the endless-loop fix above (truncation salvage + fail-fast) for flaky/`:free` models; reopen-completed-chat restores the card (no stale re-run); per-project model isolation. Tests: `tests/parity/project-job.test.js`, `projects-e2e.test.js`, `model-fit.test.js`. Commits `0a758691` + `3e7f04dc` (verify pushed). Manual E2E: `TEST-PROJECTS-E2E.md`.
- **OPEN DECISION (owner) — the real robustness fork.** Today the CHAT model authors the report, so success depends on the picked model AND its endpoint (a `:free` endpoint truncates -> the loop above). "Recommended" is a NAME regex, so it stamped `llama-3.3-70b-instruct:free` Recommended and it failed. Options: **(1) dedicated builder model** — Madav always builds with a known-good model (e.g. deepseek-v4-pro) regardless of chat model; cloud-builder ONLY when already on cloud (a LOCAL/private pick must keep the build local); + **honest badges**. **(2) honest badges only** — keep per-project model control; make the badge weigh `:free`/size/task-complexity reliability and steer away from likely-fail picks. **(3) diagnose first** — add an error "Details"/log surface, capture the exact failure, fix the proven cause. Prior recommendation: **Option 1**. Badge-honesty is non-negotiable correctness either way.

## Tests
`NODE_ENV=test npx vitest run tests/parity` → **≈290 passing** (sandbox times out on the full run; subsets verified — re-run `npx vitest run tests/parity`). M2 parity files: turn-helpers, chat-loop, chat-loop-{textmode,compaction,replay}, turn-recorder, chat-core-{adapter,runner}. Earlier files: schedule-next,
scheduler, task-run, tasks-*-routes, provider-call/-key-vault, provider-ping, rag-lite, agent-memory(+A1), web-skills,
proxy-transcribe, core-agent-rules. Verify discipline: `node --check` (.cjs/.mjs), `npx esbuild … --outfile=/dev/null`
(browser .js/.jsx), full `vite build` to a /tmp dir (mount can't re-empty `dist/`), confirm electron/ untouched.

## Operational gotchas (this sandbox/mount)
- **Cannot `rm`** in the mount → deletions are the user's `git rm`.
- **Mount silently DROPS/truncates writes** — even python writes (hit `webBridge.js`, `agentMemory.js` this session).
  ALWAYS fsync + **re-read & assert** after an important write; restore botched files with `git show HEAD:<file>`.
- **Sandbox git is unreliable** (partial/stale status, phantom index) → trust the USER's `git status`. `grep -c`
  exits 1 on zero matches (breaks `&&` chains) — use `|| true`.
- Build to a fresh `/tmp` dir (`vite build --outDir /tmp/x`) to dodge the mount's `EPERM` on emptying `dist/`.
- `rules-parity.test.js` asserts `src/office.js` ≡ `shared/office-rules.cjs` — don't break until the office rule migrates to core.
- Desktop dev: `npm run electron:dev` (full restart for main-process changes). If "port 5174 in use" / cache-access-denied:
  kill the stale Vite (`Get-NetTCPConnection -LocalPort 5174 | … Stop-Process`) + leftover `electron.exe`, retry.
- **M2 flags:** `MADAV_CORE_CHAT=1` routes desktop chat through the core loop (default off = legacy, byte-identical);
  `MADAV_RECORD_TURN=1` records a chat turn to a gitignored `desktop-chat-<ts>.json` cassette. Set BEFORE launching
  `electron:dev` (Ctrl+R won't reload main-process code). Sandbox `git status` can leave `.git/index.lock` → use
  `--no-optional-locks` (read-only) and let the USER clear stale locks.

## OPEN / NEXT (priority order)
1. **Projects orchestrator — ACTIVE (see the PROJECTS ORCHESTRATOR section).** (a) Owner picks Option 1/2/3 for the builder/badge fork -> build single-source (core + both surfaces) + tests. (b) **Web parity:** wire `core/project-runner.js` web adapters so web runs the SAME engine (currently desktop-only — the main Projects single-source gap). (c) Push commits; owner runs `TEST-PROJECTS-E2E.md`.
2. **M2 RETIRE phase (where chat-loop single-source is realized).** Build phase DONE (coreChatTurn faithful, flag-
   validated on desktop). (a) broad desktop shakeout of `MADAV_CORE_CHAT` (gate); (b) **M2d** web adapter → web adopts
   `core/chat-loop.js`, delete web's loop + `src/shared/harness.js`; (c) **M2e** flip default → delete legacy chat path
   in `agent-openai.cjs` + collapse `harness.cjs`/`providers.cjs` copies. Desktop validated before web; flag-guarded.
3. **Commit/deploy the accumulated web batch** (scheduled runs, Agent Ops, skills, voice) + smoke-test on Render
   (server *and* `npm run build` redeploy). Scenarios in `docs/PARITY-PHASE-TESTS.md`.
4. **Office rule → ESM core** (banked) — wire alongside the session-manager engine work; re-run the PROTECTED scenario.
5. **Scorecard §4 remainder:** swarms/missions (parked); browser automation + Telegram (vendor-gated, design ready in
   `docs/MANAGED-SERVICES-WEB-DESIGN.md`); team-tools + richer chat-loop (unblocked once M2 lands).
6. **Office-doc UX (deferred, user's call):** unreliable large free models (e.g. `nemotron-550b:free`, classified
   deck-capable by size) hard-fail bespoke with no template fallback — consider a "build a simpler version" fallback
   on the incomplete-document card (shared `markdown.jsx`).

## Hard rules (do not break)
- Desktop-first; never edit `electron/**` or `shared/**` (or the live engine) to accommodate web without explicit sign-off.
- Engine/desktop-touching migration steps are **gated**: harness + desktop validation + a flag + owner go-ahead per step;
  the 🔒 PROTECTED weak-model office pipeline (`session-manager` recipe) must be re-validated with `Report_March.xlsx`.
- Token-accepting / secret-holding / autonomous-execution code is **security-gated** → design+threat note + approval first.
- Small, tested increments; provide plain-English test scenarios; the USER commits.
