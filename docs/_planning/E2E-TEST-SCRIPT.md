# Madav (MadavNew) — End-to-End Test Script
### Living document — covers EVERY change in this rebuild, with exact steps, expected results, and examples. Updated as each new piece lands.

You do not need to be a developer to run these. Every test says exactly what to type/click, how to turn the feature on, what a PASS looks like, and a concrete example. Every new behaviour is behind a **flag that is OFF by default**, so with no flags set the app behaves exactly as before.

---

## 0. Master flag table (everything new is opt-in)

| Flag | Turns on | Desktop (PowerShell) | Web (browser console) | OFF = fallback |
|---|---|---|---|---|
| `MADAV_DETERMINISTIC_PROJECT` | New Excel/Projects engine (model writes a *plan*, not code) | `$env:MADAV_DETERMINISTIC_PROJECT="1"` | `localStorage.setItem("MADAV_DETERMINISTIC_PROJECT","1")` | old project engine |
| `MADAV_KNOWLEDGE` | RAG — project chat grounded in the project's documents | `$env:MADAV_KNOWLEDGE="1"` | `localStorage.setItem("MADAV_KNOWLEDGE","1")` | legacy keyword RAG-lite |
| `MADAV_RBAC` | Workspace access control (roles/membership) on the new cloud gateway | `$env:MADAV_RBAC="1"` | `localStorage.setItem("MADAV_RBAC","1")` | open access (today) |
| `MADAV_CRASH_REPORTS` | Local-only crash capture | `$env:MADAV_CRASH_REPORTS="1"` | `localStorage.setItem("MADAV_CRASH_REPORTS","1")` | console log only |

After setting a desktop env flag, launch with `npm run electron:dev` in the SAME PowerShell window. To turn a flag off: open a fresh window (desktop) or `localStorage.setItem("...","0")` + reload (web). Always fully quit the app (close window + Ctrl+C) before relaunching in a different mode.

---

## 1. One-time setup & automated tests (run this first)

**Build all shared engines + run every automated test:**
```powershell
cd C:\Projects\ClaudeCodeUI\MadavNew
node scripts/verify-packages.mjs
```
**PASS:** the last line reads `All N spine packages green`. This builds and tests `@madav/contracts, @madav/insight, @madav/storage, @madav/core, @madav/documents, @madav/knowledge, @madav/rbac, services/cloud, …`.

**Expected automated test counts (as of this build):**

| Package | Tests | Covers |
|---|---|---|
| @madav/contracts | 12 | shared schemas incl. the multi-file plan |
| @madav/documents | 48 | ingest · compute · join · derive · multi-sheet · weak-model repair |
| @madav/knowledge | 15 | chunking · hybrid retrieval · embedder · local embedder · context |
| @madav/rbac | 7 | role matrix · `can()` · per-user workspace |
| @madav/insight | 6 | structured logger · crash capture |
| services/cloud | 9 | pgvector store · membership store · gateway RBAC enforcement |

If any package says `FAILED`, copy the last ~15 lines and send them — stop there.

---

## 2. Deterministic Projects / Excel engine — `MADAV_DETERMINISTIC_PROJECT`

**What changed:** in a folder-linked Project, the AI now emits a schema-validated JSON *plan* (filter/sort/aggregate/**join across files**/**calculated columns**/**multi-sheet**) and Madav executes it deterministically — so even a weak model reliably produces correct, styled Excel. Old engine (model writes Python) stays as the flag-off fallback.

**Detailed scenario plan + sample data already prepared** at `C:\Projects\ClaudeCodeUI\MadavNew\_test-data\` with a full scenario sheet at `_test-data\MADAV-TEST-PLAN.md` (11 scenarios A–K, each with the exact prompt and the correct answer key — grand total $9,228,014.69). Use that document for this section.

**Quick example (single-table):**
1. `node scripts/verify-packages.mjs` (once), then `$env:MADAV_DETERMINISTIC_PROJECT="1"; npm run electron:dev`.
2. New Project → link folder `_test-data\sales-xlsx` → pick a **weak** model (e.g. step-3.5-flash).
3. Type: `Create an Excel report showing the total revenue for each region.`
4. **PASS:** narration "Reading your files… / Working out the steps… / Building your report…", then a styled `Result_<date>.xlsx` card in a `Madav Results` subfolder. **Answer key:** North America $2,409,443.01 · Latin America $2,373,255.25 · Asia Pacific $2,273,341.38 · Europe $2,171,975.05.
5. **FAIL:** a table only in chat, a Python script/error, or wrong totals.

**Multi-file example (join + calculated column):** see scenarios in MADAV-TEST-PLAN.md; the engine is verified to reproduce an independent pandas result on the real KPI2 files (41 consultants, 0 mismatches).

---

## 3. Knowledge / RAG — `MADAV_KNOWLEDGE`

**What changed:** when a Project has documents, the chat answer is grounded in them — the docs are chunked, embedded (a built-in **local** embedder, no API key needed), and the most relevant passages are injected into the model's context with `[source]` tags. Desktop reads the project FOLDER's text files; web reads the project's text knowledge items. Legacy keyword RAG-lite stays as the flag-off fallback. Same engine (`@madav/knowledge`) on both surfaces.

**Desktop test:**
1. `$env:MADAV_KNOWLEDGE="1"; npm run electron:dev` (after `verify-packages`).
2. Open a folder-linked Project; put a couple of `.md`/`.txt` files in the folder. Example — create `refunds.md` containing: `Refund policy: a refund is issued only after the invoice is paid and the payment has cleared.`
3. In that project's chat, ask: `What is our refund policy?`
4. **PASS:** the answer reflects your file (mentions invoice paid + payment cleared) and may cite a tag like `[refunds.md#0]`. **FAIL:** a generic answer ignoring the file, or an error.

**Web test:**
1. Browser console: `localStorage.setItem("MADAV_KNOWLEDGE","1")`, reload.
2. Open a web Project, add a **text knowledge** item (same refund text).
3. Ask the same question → **PASS:** grounded answer as above.

**Note:** text files only for now (PDF/Word extraction is a later add). No network/embeddings key needed.

---

## 4. Workspaces / RBAC — `MADAV_RBAC`  (cloud/new-gateway only)

**What changed:** the new cloud gateway enforces workspace membership + roles (owner/admin/member/viewer) before any synced read/write. Today's live web (auth-server) is **unaffected** — this is on the new spine, which isn't the live backend yet, so enabling it cannot lock out current users. Default OFF = open behavior.

**Role matrix being enforced:** read = everyone; write = member+; delete others' = admin+; manage members = admin+; rename/delete workspace = owner. A member can manage their OWN content. Cross-workspace = always denied.

**Automated test (this is the real verification):** `node scripts/verify-packages.mjs` runs `services/cloud` (9 tests) which prove: flag-off = open; first toucher of an empty workspace becomes owner; a non-member gets 403 on read AND write; a viewer can pull but not push; a member can push; WhoAmI returns the user's own `ws_<userId>` (flag on) or legacy `default` (flag off).

**Manual (only when the new gateway is wired to a server — STAGING, never live until the per-user-workspace cutover is reviewed):** set `MADAV_RBAC=1` in the cloud server env; a request for a workspace the user isn't a member of returns **403 FORBIDDEN**.

---

## 5. Crash reporting — `MADAV_CRASH_REPORTS`  (local only, no network)

**What changed:** uncaught errors are captured to a capped **local** file/store (never sent anywhere). Off by default. Same formatter (`@madav/insight`) on both surfaces.

**Desktop test:**
1. `$env:MADAV_CRASH_REPORTS="1"; npm run electron:dev`.
2. Use the app normally. If an error ever occurs, a JSON entry is appended to `%AppData%\Madav\crash-reports.json` (capped at 50).
3. **PASS:** the file exists/updates only when the flag is on; the app stays running (the global guard keeps it alive). With the flag OFF, no such file is written.

**Web test:** console `localStorage.setItem("MADAV_CRASH_REPORTS","1")`, reload. Captured crashes land in `localStorage["madav.crashReports"]` (capped). Inspect via console: `JSON.parse(localStorage["madav.crashReports"])`.

---

## 6. App stays alive on errors (global crash guard) — always on, no flag

**What changed:** the desktop main process now logs and survives a stray error instead of dying. (Also: the node-pty "AttachConsole failed" line you may see is non-fatal noise — node-pty self-recovers.)

**Test:** use the app; if the terminal shows `[madav] uncaughtException — kept alive: …`, the app window should remain open and usable. **PASS:** no hard crash from a background error.

---

## 7. Branding & readability (no flag — visible immediately) 

| Change | How to check | PASS |
|---|---|---|
| Logo → Logo2 | Look at the top bar + login screen | the new `Logo2` wordmark shows (from `madav-logo2.png`) |
| M monogram → M2 | Chat avatar / brand mark | the new `M2` mark shows (from `madav-m2.png`) |
| Tagline removed | Top bar + login | "Built to think with you" no longer appears as text (it's in the logo now) |
| Font size 15→16px | General reading text (chat/prose) | text is slightly larger/easier to read; fixed bars unchanged |

Press **Ctrl+R** (or restart) after pulling these changes to see them on desktop.

---

## 8. Reference artifacts produced during the build (not features to test, but useful)

- `_test-data\` — sample sales data + `MADAV-TEST-PLAN.md` (the 11-scenario Excel plan).
- `C:\KPI2\Report_March.xlsx` — the DTC IT Service Performance report built from your March data (consultant = Resolved-By; EUNSS = % Very Satisfied; backlog by SESA; cost/allocation deferred). Review the "Received by Resolved-By" basis.
- `docs/_planning/Document-Engine-Roadmap.md` — the per-format roadmap.
- `docs/_planning/CHAT-HISTORY.md` — auto-updated hourly build log.

---

## 9. Final whole-app E2E checklist (run at the END of the build)

1. `node scripts/verify-packages.mjs` → `All N spine packages green`.
2. With NO flags set, launch desktop + web → everything behaves as today (fallbacks intact).
3. Turn each flag on one at a time (sections 2–5) and confirm the PASS for each, on BOTH desktop and web where applicable.
4. Branding/readability (section 7) visible.
5. Leave RBAC OFF on the live deploy until the per-user-workspace cutover is reviewed (section 4).

> This document is updated every time a new change lands. If a section's flag or steps look out of date, tell me and I'll refresh it.

---

## 10. Cloud gateway health + observability (scale-out) — server-only, no flag

**What changed:** the new gateway answers `GET /api/health` and `GET /api/ready` with `200 {"ok":true}` (unauthenticated, for load balancers / rolling deploys / DR), and emits one structured `gateway.request` log per call. Verified by `services/cloud` automated tests (11). Deploy details: see `docs/_planning/SCALE-AND-DR-RUNBOOK.md`.

**Test (automated):** `node scripts/verify-packages.mjs` runs the gateway suite (health/ready 200 + request-log assertions). Manual only applies once the gateway is wired to a live HTTP server (staging).

---

## 11. E2EE Private mode (Phase 4) — FOUNDATION ONLY (enablement is gated)

**What exists (built + tested):** the single storage envelope encrypts `e2ee-private` / `device-only` content **client-side** with AES-256-GCM (key derived via PBKDF2-SHA256, 210k iters). `@madav/storage` tests prove: encrypted content is not plaintext, round-trips with the right key, a **wrong key / tampered data is rejected**, and sealing encrypted custody **without a key is refused** (no silent plaintext).

**Test (automated):** `node scripts/verify-packages.mjs` runs the `@madav/storage` suite.

**NOT enabled (intentionally gated):** key management (master key, multi-device exchange, recovery code), the per-workspace "Private" toggle, and wiring `e2ee-private` into the live sync flow. Per the architecture plan these require **your approval + an external crypto review** before any production content is stored encrypted. Nothing in the app stores E2EE content today.



---

## 12. Native Anthropic agent (own loop, no Agent SDK) — `MADAV_NATIVE_AGENT`  (Claude models only)

**What it is (plain English):** Today, when you chat with a *Claude* model in an agent/folder room, Madav drives it through a third‑party engine (the Claude Agent SDK). This change lets Madav drive Claude with **its own** engine — the exact same loop every other model (NVIDIA / OpenRouter / local) already uses — by speaking Anthropic's tool format directly. One engine for every model = less code, fewer "works on model A but not B" bugs, and no dependency on someone else's agent SDK.

**Default is OFF** — with the flag off, Claude rooms behave **exactly** as before (the SDK path is untouched, byte‑for‑byte). Nothing changes for you until you opt in.

### How the switch works
- **Desktop:** set the environment variable `MADAV_NATIVE_AGENT=1` before launching, then start the app. (PowerShell: `$env:MADAV_NATIVE_AGENT="1"; npm run electron:dev`)
- **OFF again:** close the app, open a fresh PowerShell (or run `Remove-Item Env:\MADAV_NATIVE_AGENT`), relaunch.

### What flag‑ON changes for a Claude model
| Path | OFF (default, today) | ON (native) |
|---|---|---|
| Folder/agent room with a Claude model | Claude Agent SDK (`runAgentTurn`) | Madav's own loop (`runOpenAIAgentTurn` → `streamChatTools` → `_streamAnthropicTools`) |
| Data/report task in a folder (lanes B/C) | already the deterministic engine | unchanged (deterministic engine) |
| Non‑Claude models (NVIDIA/OpenRouter/local) | own loop | own loop (no change either way) |

### Test A — parity smoke (the important one)
1. Pick a **Claude** model (e.g. an Anthropic key profile).
2. Open a folder‑linked room. Ask: *"List the files in this folder and tell me what the biggest one is."*
3. **OFF:** confirm it reads the folder and answers (today's behavior).
4. Quit, set `MADAV_NATIVE_AGENT=1`, relaunch, repeat the same ask.
5. **Expected:** same kind of answer — it still uses real file tools (read_file / list_dir / run_bash), streams text, and finishes. The *engine* changed; the *behavior* should not.

### Test B — a tool chain (proves multi‑step tool use over the native format)
1. Flag ON, Claude model, folder room with a small `.xlsx` or `.csv`.
2. Ask: *"Open the spreadsheet, total the amount column, and tell me the figure."*
3. **Expected:** it calls a tool, gets the result, then answers with the number — i.e. a multi‑turn tool round‑trip works through `_streamAnthropicTools` (tool_use → tool_result → final text).

### Test C — nothing regressed with the flag OFF
1. Flag OFF (default). Repeat Tests A/B.
2. **Expected:** identical to before this change — this is the safety net. If OFF behaves any differently, stop and report.

**Automated test (no key needed, run by Claude):**
`core/anthropic-tools.js` has a 13‑check suite (pure mappers + a full‑stream integration test that replays the exact reduce loop `_streamAnthropicTools` runs — interleaved text + chunked tool‑use JSON, `message_stop`; asserts incremental deltas, final text, tool‑call name/arguments/id). All 13 pass. The live `/v1/messages` behavior against Claude's real API is what **only your keyed staging run** confirms (Tests A/B above).

**Files in this change:** `core/anthropic-tools.js` (new, pure mappers + stream reducer), `electron/providers.cjs` (`_streamAnthropicTools` + route `streamChatTools` by kind), `electron/session-manager.cjs` (one `useNativeAgent()` helper + 5 flag guards so Claude falls through to the own‑loop branches every other model already uses).
