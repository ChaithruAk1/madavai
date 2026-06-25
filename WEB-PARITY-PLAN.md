# Madav — Web→Desktop Parity Plan

**Date:** 2026-06-17 · **Companion to:** `WEB-VS-DESKTOP.md` (the gap analysis this plan acts on)
**Architecture basis:** `docs/adr/0001-architecture.md`  |  **Feature rule:** `docs/FEATURE-AUTHORING-RULE.md`
**Objective:** Bring Madav **Web** as close as architecturally possible to what **Desktop** can do — without destabilizing Desktop.
**Your two locked decisions (drive everything below):**
1. **Infra posture = Browser + managed 3rd-party.** Web may reach *functional* parity using hosted services (e.g. Browserless, a cron/queue provider, a managed Whisper/STT endpoint) brokered through our server. No self-hosted long-running workers required.
2. **Code posture = single source of truth** (decided 2026-06-17; supersedes the earlier dual-backend/freeze stance — see `docs/adr/0001-architecture.md`). One shared **core** behind the platform **adapter** holds ALL cross-platform logic. New logic is authored there; the **existing desktop engine is migrated into the core incrementally** (strangler-fig) — only **turn-replay-harness-protected**, **validated on desktop first then web**, and **every desktop-touching step is permission-gated**. Desktop keeps its current engine until each module is harness-validated on the core. North-star: model the core on **the coding agent's proven agent patterns** (capability surface, tool design, permission model) for longevity — not its proprietary backend.

> **Non-negotiable (your rule):** Desktop is **top priority and validated first**. No `electron/**` edit happens without your **explicit per-module go-ahead**, and never merely to "accommodate web" — only as a harness-protected, desktop-validated migration step. The shared files `shared/csp.cjs` and `shared/office-rules.cjs` are likewise permission-gated (see §7).

---

## Migration to single source of truth (accepted — risk-controlled)

**Decision (2026-06-17):** the existing desktop turn engine (`electron/session-manager.cjs`, `electron/agent-openai.cjs`, the PROTECTED weak-model office pipeline) **will be migrated into the shared core** — superseding the earlier "freeze / non-goal" stance. The risk is real and accepted **only** under these controls (full detail + impact in `docs/adr/0001-architecture.md`):

1. **Harness first.** Build the turn-replay harness before any engine edit; it records a desktop turn's tool/prompt sequence and replays it against the core, so migration is *measured*, not eyeballed.
2. **Strangler-fig, one mode at a time** (chat -> agent -> project -> team -> cowork). Never big-bang.
3. **Desktop-first per module:** desktop adopts the core version and is validated (harness + by eye, incl. the PROTECTED `Report_March.xlsx` scenario) **before** web lights up the same mode.
4. **Permission-gated:** each desktop-touching step needs your explicit go-ahead.
5. **Safe shelf first:** pure strings/schemas/prompts move to the core before any execution logic.
6. **Locked by tests:** a behavior-version stamp + golden parity tests go red if a migrated mode drifts.

Net target: **one engine, both surfaces** — maximal stability, consistency, and longevity — without a destabilizing big-bang.

---

## 1. The honest core truth (read this first)

Desktop's defining value is that **it runs on the user's machine with full local access**. A web app — by browser design — *cannot* act on the user's computer. So three things are simply true:

- **Cloud / agentic / data features → web can match them** (often via a managed service). This is the large majority of value.
- **"Act on YOUR computer" features → web can never match them** (native app automation, local shell, local desktop recording, OS-native speech). No amount of engineering changes this; the server and the browser have no handle to the user's desktop.
- **Maintenance/dev tooling** (self-test QA, Repair Bay, Librarian) **isn't a web-user feature** and shouldn't be ported.

**Therefore "close to 100%" is honestly reframed as: ~100% of the *cloud-feasible* capability surface.** By module count that is roughly **85%** of Desktop; the remaining **~15%** is inherently-local and is documented as desktop-exclusive, not a backlog item. §4 makes this exact.

---

## 2. Operating principles (how we stay clean, sustainable, non-repeating)

| # | Principle | Enforcement |
|---|---|---|
| P1 | **Desktop = reference + permission-gated.** No `electron/**` edit without explicit per-module go-ahead; web-only tasks never touch it; migration steps are harness-protected + desktop-validated first. | CI: a web-only PR touching `electron/**` fails review; migration PRs require the harness gate. |
| P2 | **Functional parity, not literal.** Same *outcome* for the user is success; the mechanism may differ (Pyodide vs shell, Browserless vs local browser). | Parity matrix tracks outcomes, not implementations. |
| P3 | **One source of capability truth.** A single `webCapabilities` manifest replaces scattered `bridge.x && …` guards. UI reads it for honest "available / desktop-only / unsupported-on-this-browser" messaging. | New `src/bridge/webCapabilities.js`; lint rule discourages ad-hoc bridge guards. |
| P4 | **Don't repeat investigation.** `WEB-VS-DESKTOP.md` + the parity matrix are the canonical spec. Every capability is decided once (build/service/won't) and recorded. | This doc + matrix are the backlog; no re-litigating settled items. |
| P5 | **Don't repeat fixes.** Because backends are separate, a behavior change ships with a **porting checklist** entry so the other surface (or the "won't" note) is consciously handled — never silently skipped. | PR template + parity tests (§5). |
| P6 | **Additive on the server.** New server features are new modules/routes; never change an existing route's contract. | Route-contract snapshot test. |
| P7 | **Secrets never reach the browser.** All 3rd-party service calls are proxied server-side. | Code review + a test that the client bundle contains no service keys. |
| P8 | **Every change isolated by surface.** Shared-renderer edits branch on `isWeb`; desktop code paths stay byte-identical. | Visual check on both surfaces; diff review. |

---

## 3. Anti-drift system — the machinery that makes "no repeated fixes" real

This is the heart of the single-source posture. The foundational artifacts, built **before** feature work (Phase 0):

1. **Capability manifest (`webCapabilities.js`).** Canonical enum of every capability with its web status: `parity | service | partial | desktop-only | browser-limited`. The renderer imports it; no feature is "secretly" missing. Kills the silent-degrade traps centrally.
2. **Parity contract tests** (extend the existing `test/rules-parity.test.cjs` pattern):
   - *Bridge-surface test:* asserts `webBridge` implements every method the renderer calls (catches a renderer change that adds a call web forgot).
   - *Manifest test:* asserts every `desktop-only`/`service` capability has matching UI messaging and no silent no-op.
   - *Shared-rule tests:* keep `office-rules` web-mirror parity green; add a **CSP-branch snapshot test** so a web-branch CSP edit can't silently alter the desktop branch.
3. **Porting checklist (PR template).** Every PR that changes turn/tool/prompt behavior answers: *Desktop affected? Web affected? Shared rule? Matrix updated? Test added?* Forces a conscious decision instead of drift.
4. **Architecture Decision Record (`docs/adr/0001-architecture.md`).** Records the layered core+adapter decision and *why* the validated desktop engine stays frozen as the reference, so a future contributor doesn't "helpfully" big-bang-merge the backends and break Desktop. Also records the managed-3rd-party posture.
5. **CI wiring** (also clears MEMORY pending #4): run parity tests + a full build asserting **all four** worker chunks (`xlsxWorker/docxWorker/pdfWorker/deckWorker`) on every push.
6. **Turn-replay harness.** Records a desktop turn's tool/prompt/output sequence and replays it against the shared core — the linchpin that makes migrating the existing engine *measurable* instead of eyeballed, and the standing regression net for the core thereafter.

---

## 4. Feasibility partition — build / service / won't (the honest map)

### ✅ BUILD ON WEB — pure browser, no new infra (functional parity achievable)

| Capability | Web approach | Primary surface |
|---|---|---|
| Chat tool loop (web_search, create_image, bundled skills) | Add a lightweight tool loop to `runTurn` | `webBridge.js` |
| **Projects data pipeline** (real .xlsx/.docx/.pdf) | Route folder-backed projects through the existing **Pyodide** cowork path | `webBridge.js start/runTurn` |
| **File-output cards** | Browser-download fallback when `!bridge.showInFolder` | `Message.jsx` (isWeb branch) |
| Team **member tools** | Give members the `COWORK_TOOLS` loop (not text-only) | `webBridge.js runTeamTurn` |
| Team manager follow-up waves / budget | Port the orchestration logic (runs client-side) | `webBridge.js` |
| Identity "not Claude" in team/coordinator prompts | Add the line to `memberSys`/coordinator/synthesis | `webBridge.js:397/427/478` |
| RAG-lite knowledge retrieval | Client-side chunk + rank before injection | new web module |
| Agent memory + track record | localStorage + server sync | `webBridge.js` + `server/` |
| deep_research | Client-orchestrated multi-fetch over `/proxy/fetch` | `webBridge.js` |
| Project records **sync** across devices | Add a `projects` collection + `/projects` route | `server/store.mjs`, `auth-server.mjs` |
| Skill **authoring/import/enable** | Browser-side create/import; store IDB/server | `webBridge.js` |

### 🟡 BUILD WITH MANAGED SERVICE — 3rd-party + additive server routes (you approved this)

| Capability | Web approach | Cost / risk to weigh |
|---|---|---|
| **MCP connectors** (HTTP/SSE) | Server-side MCP **broker** + per-user OAuth token store; expose tools to web agent via proxy | Biggest item; real security surface; stdio-only MCP servers remain unsupported |
| **Browser automation** | Broker a hosted **Browserless/Playwright** session; expose browse/click/fill tools | Page data egresses through a 3rd party; per-session cost |
| **Scheduled / background runs** | Managed **cron** → calls an additive server `/run` endpoint that executes the turn server-side | ⚠ Server-side turn execution is a **third** turn implementation — keep it *single-shot* (stored prompt → provider), not a full agent loop, to limit drift |
| **Inbound webhooks** | Server listener (or managed webhook→queue) → same `/run` endpoint | Auth/abuse surface; rate-limit |
| **Telegram bot / mobile link** | Host the bot as a server process; pair sessions to it | Already a server-shaped feature; feasible |
| **Whisper transcription** | Managed STT endpoint proxied server-side | Replaces Chrome-only Web Speech fallback |
| Failure/cost **alerts** | Server push / email / Telegram | Depends on Telegram item |

### ⛔ WON'T BUILD ON WEB — honest stop (inherently local or not a web-user feature)

| Capability | Why it cannot/should not be built for web |
|---|---|
| **Native desktop-app automation** (`desktop-driver.cjs`) | Controls the user's local Windows apps via UI Automation. A remote server/browser has **no handle to the user's OS**. Only a program *on* their machine can do it — that program *is* the desktop app. |
| **Desktop teach-by-demo recorder** (`desktop-recorder.cjs`) | Observes the user's native desktop. Same impossibility. |
| **Embedded local terminal / shell** (`terminal.cjs`) + **CLI install** (`cli-install.cjs`) | A browser cannot get a shell on the user's computer. A *server* shell is a different, dangerous capability — **not** parity — and we should not expose it. Pyodide already covers the data-work subset. |
| **Windows-native offline STT** (`win-speech.cjs`) | OS speech engine on the user's machine. Managed Whisper covers *transcription*, but keyless/offline Windows STT specifically cannot exist on web. |
| **Browser flow recorder** (`flow-recorder.cjs`) | Records the user's *real* browser. Would require a browser **extension**, not a web page. Out of scope (revisit only if an extension is ever in scope). |
| **Self-healing QA / Repair Bay** (`qa-runner.cjs`, `qa-fixer.cjs`), **Sage Librarian** (`librarian.cjs`) | Operate on the local source tree / app install. These are dev/maintenance tools, **not** end-user web features — porting them is wasted effort. |
| **OS keychain secret storage** | N/A on web; server-side secret storage is the (different) web model. Not a gap. |

---

## 5. Phased roadmap — two tracks (web build + desktop->core migration)

> **Two tracks.** Phases 0–4 below are the **web build** (desktop untouched; `Desktop touched: NO`). The **desktop->core migration** (see "Migration to single source" above + ADR-0001) is a **separate, permission-gated, desktop-validated** track. Detailed cross-track sequencing is finalized at execution kickoff once Phase 0 — including the harness — is green.

Each phase states **Surfaces** (always web-only), **Desktop touched: NO**, **Risk**, **Verify gate**, **Exit criteria**. No phase starts before its predecessor's gate is green — this prevents rework.

### Phase 0 — Foundations & anti-drift (do first; nothing else is durable without it)
- **Build the turn-replay harness FIRST** — it gates the entire desktop->core migration (records a desktop turn, replays against the core).
- **Scaffold the shared core + adapter interface** (`fs/exec/net/persist/emit/secrets/paths`) — the seam every later phase and the migration build on.
- Build the anti-drift artifacts (§3): `webCapabilities.js`, parity tests, PR checklist, ADR; wire CI (+ 4-worker build assertion).
- Replace the silent-degrade guards with manifest-driven messaging (fixes the P0 UX traps centrally).
- **Surfaces:** `src/bridge/webCapabilities.js` (new), `test/*`, `.github/` CI, `docs/adr/`. **Desktop touched:** NO.
- **Risk:** very low (additive + tests). **Verify:** CI green; manifest renders honest states on web. **Exit:** every capability has a recorded status + test.

### Phase 1 — Stop the bleeding: P0 silent-degrades + cheap wins (pure browser)
- Web **Projects**: honest banner immediately; then route folder-backed projects through the working Pyodide cowork path (real files).
- **File-output card** web fallback (download; hide Folder button).
- Web **chat/folderless-agent tool loop** (web_search + create_image + bundled skills).
- **Identity** line in team member/coordinator/synthesis prompts.
- Robustness: optional-chaining on librarian/forge/qa call sites.
- **Surfaces:** `webBridge.js`, `Message.jsx`, `Workrooms.jsx` (isWeb branches). **Desktop touched:** NO.
- **Risk:** medium — shared-renderer edits (see R2, §6). **Verify:** office cards still render correctly on **desktop**; web produces a real .xlsx in a Project. **Exit:** no silent degrade remains; matrix P0/P1-3/P2-11 → ✅.

### Phase 2 — Web agentic depth (pure browser)
- Team **member tools** + manager follow-up logic.
- **RAG-lite** retrieval; **agent memory** + track record; **deep_research** client-orchestration.
- **Project record sync** (server `projects` collection).
- **Surfaces:** `webBridge.js`, new web modules, `server/store.mjs` + `auth-server.mjs` (additive). **Desktop touched:** NO.
- **Risk:** medium (server schema addition). **Verify:** additive-route contract test; existing auth/chat unaffected. **Exit:** matrix P1-4, P2-12/13 → ✅/🟢.

### Phase 3 — Managed-service features (3rd-party + additive server routes)
- **MCP broker** (highest value, highest risk) → then **browser automation** (Browserless) → **scheduled/webhook `/run`** → **Telegram/mobile** → **Whisper** → **alerts**.
- **Surfaces:** `server/` (new modules + additive routes), `webBridge.js` (tool wiring), `shared/csp.cjs` **web branch only** (new service origins — *permission-gated*, see §7). **Desktop touched:** NO.
- **Risk:** high — external deps, secrets, auth surface, CSP (R1), third turn-impl (R7). **Verify:** per-feature security review; secrets-not-in-bundle test; CSP desktop-branch snapshot unchanged. **Exit:** matrix service-tier → 🟢; documented external deps & cost.

### Phase 4 — Skill authoring on web + polish + scorecard sign-off
- Browser-side skill create/import/enable; final UX polish; run the parity scorecard (§8); update `WEB-VS-DESKTOP.md` to reflect achieved state.
- **Surfaces:** `webBridge.js`, UI. **Desktop touched:** NO. **Exit:** scorecard target met; matrix frozen as the living spec.

---

## 6. Risk register — risks to **existing, working web** during the push (your constraint #5)

| ID | Risk | Likelihood × Impact | Mitigation |
|---|---|---|---|
| R1 | **`shared/csp.cjs` is shared with Desktop.** Adding service origins edits a file Desktop imports → could alter Desktop CSP. | Med × High | Edit **only** the `{web:true}` branch; CSP-branch **snapshot test** asserts the desktop branch is byte-unchanged; treat any csp.cjs edit as a §7 permission gate. |
| R2 | **Shared-renderer edits** (`Message.jsx`, `markdown.jsx`, `App.jsx`) for cards/Projects render on **both** surfaces → could regress the working Desktop office cards/previews. | Med × High | All edits branch on `isWeb`; keep desktop code path identical; visual-verify both before merge. |
| R3 | **Existing server routes** (auth, `/proxy/chat`) broken by Phase 2/3 additions. | Low × High | Additive routes only (P6); route-contract snapshot test; never change existing signatures. |
| R4 | **Pyodide** bundle size / cold-start hurts web load. | Med × Med | Lazy-load on first data task; cache the runtime. |
| R5 | **File System Access API** unsupported on Safari, partial on Firefox → Projects-folder feature is Chrome/Edge-only. | High × Med | Surface via `webCapabilities` as `browser-limited`; graceful message; don't pretend parity. |
| R6 | **localStorage limits** (projects/tasks/memory) overflow on heavy users. | Med × Med | Migrate large/growing data to IndexedDB/server during Phase 2. |
| R7 | **Server-side turn runner** (scheduled/webhook) becomes a *third* turn implementation → new drift source. | Med × Med | Keep it single-shot (stored prompt → provider), explicitly **not** a full agent loop; document in ADR; cover with its own test. |
| R8 | **Secrets** for managed services leaking into the client bundle. | Low × Critical | Server-side proxy only (P7); bundle-scan test. |
| R9 | **3rd-party cost/quota/availability** (Browserless, cron, STT). | Med × Med | Per-feature quotas + graceful degradation + cost note in Phase 3 exit. |
| R10 | Manifest/messaging **drift** as features land. | Med × Low | Manifest test (Phase 0) fails the build if a capability lacks a status/message. |

---

## 7. Desktop permission gates (pre-agreed stop points)

Under dual-backend I commit to **no `electron/**` edits at all**. The only places web work can structurally collide with Desktop are the two shared files — I will **not** edit either without your explicit OK, and I'll attach proof the desktop-facing output is unchanged:

- **`shared/csp.cjs`** — needed in Phase 3 to allowlist managed-service origins on the web branch. Gate: show the diff is web-branch-only + desktop-branch snapshot identical.
- **`shared/office-rules.cjs`** — only if a rule change is ever required; today it's stable and single-sourced. Gate: same proof + `rules-parity` green.
- **Any discovered Desktop bug** during web work → I report it and stop; no fix without permission.

---

## 8. Definition of done — how we measure "close to 100%"

- **Denominator = BUILD + SERVICE capabilities** (the cloud-feasible surface). WON'T-BUILD items are excluded and documented as desktop-exclusive (not counted as failures).
- **Target:** 100% of BUILD + SERVICE at ✅/🟢 in the parity matrix; `browser-limited` items honestly labeled.
- **In total-desktop terms:** ≈ **85%** of Desktop's module surface reachable on web; the inherently-local ≈15% is permanently desktop-only **by design, documented, not a gap.**
- **Quality gates (every phase):** parity tests green in CI · clean build with all four worker chunks · both surfaces visually verified · porting checklist completed.

---

## 9. Immediate next actions (pending your go — I will not start until you confirm)

1. **Approve the plan** (or adjust phase order / the WON'T-BUILD list).
2. On approval, I start **Phase 0 only** — it is 100% additive, web/CI/docs, **zero Desktop and zero shared-file edits**, and it's what makes the rest non-repeating and clean.
3. Separately (not blocked by this): finish a clean `npm run build` (4 worker chunks) + Render redeploy so you're testing current web, and run `git fetch` to confirm the real remote state. Neither is a Desktop change.

**Open question for you:** the MCP broker (Phase 3) is the single biggest lever for "real agentic web" *and* the biggest security/ops surface. Want it front-loaded right after Phase 1, or sequenced last after the pure-browser depth (Phase 2) is proven?
