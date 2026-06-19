# ADR-0001 / M2d — Web cutover plan (execution-ready)

**Status: READY TO EXECUTE — gated on the desktop shakeout (§4).** Authored 2026-06-18.
Pair with `docs/adr/0001-architecture.md`, `docs/adr/0001-M2-CHAT-LOOP-DESIGN.md`, `PENDING.md`, `MEMORY.md`.

> **Key finding (corrects PENDING #2).** The M2d.3 cutover is **already wired** in `src/bridge/webBridge.js`
> (lines 770–788), and it carries a tool-set bug. So M2d is no longer "write the cutover" — it is
> **fix one line → validate flag-on → delete legacy**. This also means `webBridge.js` holds a real
> uncommitted change (the cutover block), not just mount noise — verify with local
> `git diff src/bridge/webBridge.js` and commit that block as its **own M2d.3 commit**, separate from
> the three-fix commit (`type:"function"` / create_image card / auto inline tools).

**Flag:** `MADAV_CORE_CHAT` in `localStorage`, value `"1"` = core path; absent/anything else = legacy.
**Default OFF.** Mirrors desktop's `process.env.MADAV_CORE_CHAT`. Toggle in a browser console:
`localStorage.setItem("MADAV_CORE_CHAT","1")` then reload; `localStorage.removeItem("MADAV_CORE_CHAT")` to revert.

---

## 1. Exact files and precise changes

### `src/bridge/webBridge.js` — three distinct edits

- **Cutover block (lines 770–788) — ALREADY PRESENT, no rewrite needed.** `runAgentTurn` checks
  `localStorage.getItem("MADAV_CORE_CHAT") === "1"` and, if on, calls
  `runWebChatTurnViaCore({ streamChatTools, streamChat (both net-fallback-wrapped), executeTool,
  webGenImage, emit, sessId, sess, tools, history: sess.messages, profile: prof, signal })`,
  handles `AbortError`/error, then `return`s — so the legacy loop (789–850) is bypassed. Flag off →
  legacy runs byte-for-byte.

- **REQUIRED FIX — line 778.** Change `tools: [...activeChatTools(), ...(sess.mcpTools || [])]` →
  `[...activeTools(), ...]`. `runAgentTurn` is the **folder-agentic** path (gated
  `sess.agentic && webfs.hasRoot()`, line 1096); its legacy loop uses `activeTools()` = full
  `COWORK_TOOLS` (file tools, `run_python`). `activeChatTools()` is only the 5-tool chat subset
  (`web_fetch/web_search/create_image/deep_research/remember`). As written, flag-on drops the agent's
  file/python tools. **Must be fixed before validation.**

- **Import repoint — line 29 (deletion phase).**
  `import { tolerantParse, headTail, squashStale, CallGuard } from "../shared/harness.js"` →
  `from "../../core/turn-helpers.js"` (identical 4 exports). This is what makes deleting
  `shared/harness.js` safe — four web loops use these imported names (see §5 risk 2).

- **Legacy-loop deletion (deletion phase).** Remove `runAgentTurn`'s legacy body (lines 789–850),
  collapse the function to preamble (763–769) + the unconditional core call, keep abort/error handling.
  Whether to also drop the `if (flag)` guard (making core the only path) is an M2e-style flip —
  owner's call.

### `src/bridge/chatCoreWeb.js`

No cutover code change (it **is** the web runner, `runWebChatTurnViaCore`). Only stale documentation:
the header still says "ADDITIVE / NOT WIRED: webBridge.runAgentTurn does NOT call this yet" — now false.
Update the comment when committing the cutover.

### `src/shared/harness.js`

**DELETE**, but only after the line-29 repoint. Its sole real importer is `webBridge.js`
(`src/components/Agents.jsx:200` is a comment reference, not an import). No test imports it
(`tests/parity/harness.test.js` doesn't reference it). Its 4 helpers are duplicated in
`core/turn-helpers.js`.

### `tests/parity/`

`chat-core-web.test.js` already covers `runWebChatTurnViaCore`. Pre-deletion, grep repo-wide for
`shared/harness` to confirm zero remaining importers. M2e adds the behavior-version stamp + web golden test.

---

## 2. Step order (cutover behind flag first → deletions last)

0. **Gate:** desktop shakeout passes (§4). Nothing below runs until then.
1. Apply the line-778 tool-set fix. `npm run build` (the dormant core path bundles into the web build —
   confirm no bundling error). Smoke-test **flag OFF** locally: web must behave exactly as today.
2. Deploy to Render (server *and* `npm run build` redeploy). With flag OFF, regression-check the live site.
3. **Flag ON** in a test browser. Run the web validation scenarios (mirror of §4) on Render.
4. Owner sign-off on flag-on web parity.
5. **RETIRE (separate commit):** repoint import → core, delete legacy `runAgentTurn` loop, delete
   `src/shared/harness.js`, fix `chatCoreWeb.js` comment. Rebuild → re-run `tests/parity` → redeploy →
   re-validate.
6. **M2e (desktop, its own increment, later):** flip desktop default-on → delete legacy chat path in
   `agent-openai.cjs` → collapse `harness.cjs`/`providers.cjs` copies → behavior-version stamp + golden
   tests. Desktop-first, not bundled with M2d.

Deletions happen only after *both* the desktop gate and the flag-on web validation.

---

## 3. Rollback

- **Flag-guarded phase (steps 1–4):** instant and per-user — `localStorage.removeItem("MADAV_CORE_CHAT")`
  + reload drops back to the untouched legacy loop. Globally it's already default-off, so "rollback" is
  "tell testers to unset the flag." No redeploy needed.
- **Bad build deployed:** Render → roll back to the prior deploy, or `git revert` the cutover commit and
  redeploy.
- **Post-deletion (step 5):** keep deletions in a *separate commit* so rollback = `git revert <deletion-commit>`
  (restores the legacy loop + `shared/harness.js`) without disturbing the cutover. Legacy code stays in
  git history; the M2e behavior-version stamp guards against silent drift.

---

## 4. Desktop shakeout checklist — the gate (run BEFORE any M2d work)

Set `MADAV_CORE_CHAT=1` **before** launching `npm run electron:dev` (Ctrl+R won't reload main-process env).
Each scenario must match its flag-off result:

1. **Long chat → auto-compaction.** Run a long multi-turn conversation (or paste bulky content) until it
   nears the model's context window. Confirm a `compact_context` card fires, the reply stays coherent, and
   the conversation continues correctly afterward.
2. **No-native-tools model → text-mode / native→text fallback.** Pick a tier-C model (no native
   function-calling) and ask something needing a tool. Confirm it emits a fenced ` ```tool ` block, the
   result returns as a `[result of …]` user-role message (never `role:"tool"` errors), and it finishes.
3. **Connector or skill turn → MCP/skill routing + permissions.** With an MCP connector configured or a
   skill installed, ask it to use that tool. Confirm the tool runs, the card renders, and permissions
   behave — inline `web_search`/`create_image`/`ask_user` run auto (no popup), other tools prompt as usual.

**Sanity add-on** (re-checks the 3 just-committed fixes on the flag-on path): one normal tool-calling chat
on a strict/NVIDIA provider + one `create_image` turn — confirm the call is accepted (the `type:"function"`
fix) and the image card renders.

---

## 5. Risks & unknowns

1. **Tool-set regression — HIGH, must fix before validation.** Line 778 (`activeChatTools()` vs
   `activeTools()`) — see §1. Open question for the owner: desktop cut over `mode==="chat"`, but on web the
   cutover sits in `runAgentTurn` (folder agent), while plain chat is a *different* function
   `runChatAgentTurn` (line 1105) with no cutover. Confirm whether M2d should target the folder-agent path,
   the Let's-Chat path, or both — and whether the tool set should be path-dependent.
2. **Four loops share `shared/harness.js` — MEDIUM.** Helpers are used at ~699, the `runAgentTurn` loop,
   ~993 (`runChatAgentTurn`), and ~1045 — but the cutover only reroutes `runAgentTurn`. So deletion requires
   the import-repoint to `core/turn-helpers.js` (keeps the other three loops alive); PENDING's "delete the
   loop + the file" is incomplete. Those other loops migrate to core in later increments, not M2d.
3. **Behavioral diffs, core vs legacy web loop — LOW/MEDIUM, validate.** Legacy `runAgentTurn` calls
   `maybeAutoTitle` (795) and emits `result` with `total_cost_usd:0` (843); the core path doesn't auto-title
   and omits that field. Confirm titles still appear (basic `sess.title` is set at 764) and no UI reads
   `total_cost_usd`. Step caps match (legacy 16 / core `opts.stepCap:16`).
4. **`squashStale` prefix nuance — LOW.** `core/turn-helpers` matches `"[result of "` (trailing space);
   `shared/harness` matches `"[result of"` (no space). Repointing is behaviorally equivalent on real markers;
   just be aware they're not byte-identical.
5. **Build/deploy — LOW.** Cutover + validation bundle `core/chat-loop` + `chat-adapter` + `turn-helpers`
   into the web build; rerun `npm run build`, smoke-test flag-off, then push. Render free-tier sleeps —
   timed validation only while awake; manual turns always work.
6. **Commit-state ambiguity — LOW/process.** The cutover block in `webBridge.js` may be uncommitted (sandbox
   git/mount is unreliable). Verify with local `git diff src/bridge/webBridge.js`; commit the cutover block
   as its own M2d.3 commit, distinct from the three-fix commit.
7. **Anthropic excluded — INFO.** `runAgentTurn` is gated `prof.kind !== "anthropic"` (1096); the cutover
   inherits that. The core path is only exercised for OpenAI-style providers on web.

---

## Provenance (verified 2026-06-18, real-disk reads)

- Cutover wiring: `src/bridge/webBridge.js:770–788`; flag read at line 772; `runWebChatTurnViaCore` import
  at line 12; tool-set line at 778.
- `runAgentTurn` definition at line 762; caller/dispatch at `runTurn` line 1096 (folder-agentic gate);
  plain-chat dispatch `runChatAgentTurn` at line 1105.
- `activeTools()` (full `COWORK_TOOLS`) line 752; `activeChatTools()` (CHAT_TOOLS subset) line 865;
  `CHAT_TOOLS` defined line 856.
- `shared/harness.js` exports `tolerantParse/headTail/squashStale/CallGuard`; helper use sites in
  `webBridge.js` at 699, 702, 789, 790, 799, 839, 840, 993, 1006, 1007, 1045, 1057.
- Sole importer of `../shared/harness.js`: `webBridge.js:29` (plus a non-import comment in
  `src/components/Agents.jsx:200`).
- `core/turn-helpers.js` re-exports the same four helpers (single source, drift-locked vs
  `electron/harness.cjs`).
