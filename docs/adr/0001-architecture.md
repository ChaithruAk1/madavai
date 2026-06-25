# ADR-0001 — Single source of truth: one shared core behind platform adapters

- **Status:** Accepted — **revised 2026-06-17** (this revision **supersedes** the first draft's "freeze the legacy engine / adapting = non-goal" stance)
- **Date:** 2026-06-17
- **Deciders:** Chaithru (owner) with Claude
- **Related:** `WEB-VS-DESKTOP.md` (gap analysis), `WEB-PARITY-PLAN.md` (roadmap), `docs/FEATURE-AUTHORING-RULE.md` (per-feature rule), `CLAUDE.md` (RULE 0; 🔒 PROTECTED weak-model pipeline)

---

## Context

Madav ships **one renderer** (`src/**`) to **two backends**: desktop (`electron/**`, IPC via `preload.cjs`→`main.cjs`) and web (`src/bridge/webBridge.js` + `server/auth-server.mjs`). The turn/agent logic is **duplicated** on both sides of the bridge — `electron/session-manager.cjs` + `electron/agent-openai.cjs` on desktop, re-implemented in `webBridge.js` on web — which is why the surfaces have drifted to ~85% divergence (`WEB-VS-DESKTOP.md`).

Owner's workflow and constraints:

1. **Desktop-first.** Features are validated and tested on desktop, *then* built for web.
2. **Desktop is top priority and must not be corrupted.**
3. **A single fix should serve both surfaces** — never implement everything twice.
4. **Owner decision (2026-06-17): go to a true single source of truth — including the existing desktop engine** — prioritizing **stability, consistency, and longevity** over short-term speed. The earlier "freeze the legacy engine forever" stance is retired; the duplication is removed at the root, *safely and incrementally*.

The tension between (2) and (4) — "never corrupt desktop" vs "migrate the validated desktop engine" — is resolved not by avoiding the migration but by **gating it** (harness + desktop-first validation + permission per step), below.

---

## Decision

**One repository. One shared *core* holds ALL cross-platform logic; platform *mechanics* live per-surface behind a thin *adapter*. Desktop is the reference implementation. The existing desktop engine is migrated into the core incrementally and safely — not frozen, not big-banged.**

1. **Reject "two separate codebases"** — physically prevents corruption but guarantees the drift we already have.
2. **Reject "naïve single source"** (no seam) — couples desktop to web; a web edit could break desktop.
3. **Adopt the layered shape:** a platform-agnostic **core** depends only on a thin **adapter interface**. Desktop implements it with Node/Electron; web with browser/server. `src/bridge/contract.js` + `webBridge` + the Electron preload are the **existing seed** of this seam.
4. **One engine, both surfaces — reached by migration, not duplication.** New cross-platform logic is authored in the core. The existing desktop engine (`session-manager.cjs`, `agent-openai.cjs`) is **migrated into the core** under the controls in the next section. Nothing stays permanently duplicated; "frozen" now means "frozen *until its migration step is harness-ready*."
5. **Desktop is the reference and is validated first.** For every module — new or migrated — desktop runs the core version and is validated **before** web lights it up. The web adapter is what web work touches; desktop does not import it.
6. **Web infra posture:** browser + **managed 3rd-party** services brokered server-side (`WEB-PARITY-PLAN.md` §4).
7. **Anti-drift is process + tests, not hope:** capability manifest, parity tests, porting checklist, CI, **a turn-replay harness**, and this ADR.
8. **North-star (with caveat):** model the core on **the coding agent's proven agent patterns** — capability surface, tool design, permission model, subagents, skills — because they are battle-tested and favor longevity. **Honest caveat:** Claude's actual backend and models are proprietary and are **not** replicable (per `MEMORY.md`); we replicate *observable patterns and capability surface*, never undisclosed internals or IP.

---

## The adapter seam (the contract between core and platform)

The core may depend **only** on this interface; everything platform-specific lives in an adapter implementation.

| Capability | Desktop adapter (Node/Electron) | Web adapter (browser/server) |
|---|---|---|
| `fs` (read/write/list/delete) | `fs`/`fs-extra` | File System Access API (`webfs.js`) |
| `exec` (run code) | `child_process` + `destructiveBashGuard` + `PYTHONSAFEPATH` | Pyodide (`pyodideRunner.js`); no shell |
| `net` (fetch/search) | direct | `/proxy/fetch` (server-brokered) |
| `persist` (sessions/projects/memory) | local JSON stores | IndexedDB / `server/store.mjs` |
| `emit` (UI events) | IPC → `webContents` | in-process listener set |
| `secrets` | OS-local encrypted (`settings.cjs`) | server-side only, never in the bundle |
| `paths` | `app.getPath` | virtual / handle-based |

**Logic that lives in the core** (no platform coupling): prompt assembly, tool **schemas**, the turn/tool-call loop shape, response parsing, validation, capability gating, model-facing rules. Some is **already single-sourced** (`shared/office-rules.cjs`, `isDeckCapable`) — proof the pattern works.

---

## Migrating the existing desktop engine — sequence, controls & impact

> Revises the earlier "do not adapt; freeze" guidance. The migration is **accepted**; the risk is real and is contained by the controls below. (The migration is the riskiest work in the whole program — these controls are non-optional.)

### Controls (all required)
1. **Harness first.** Build the **turn-replay harness** before any engine edit: it records a desktop turn's tool/prompt/output sequence and replays it against the core, so each migration step is *measured*, not eyeballed. This directly fixes the one weakness that made the migration scary — no in-environment runtime validation.
2. **Strangler-fig, one mode at a time:** chat → agent → project → team → cowork. **Never big-bang.**
3. **Desktop-first per module:** desktop adopts the core version and is validated (harness + by eye, **including re-running the PROTECTED `Report_March.xlsx` weak-model scenario**) **before** web uses the same mode.
4. **Permission-gated:** every desktop-touching step needs the owner's explicit go-ahead.
5. **Behind a flag:** desktop runs old-engine vs core side-by-side until the core mode is signed off, then flips.
6. **Locked by tests:** a behavior-version stamp + golden parity tests go red if a migrated mode drifts.

### Order of extraction (low risk → high risk)

**First — the safe shelf** (pure, no platform coupling; near-zero behavioral risk):

| Piece | Location | Note |
|---|---|---|
| Office rule + `isDeckCapable` | `shared/office-rules.cjs` | already shared ✓ |
| Tool **schemas** | `agent-openai.cjs:161` (`TOOLS`) | data, not behavior |
| System/identity prompts | `agent-openai.cjs:214-224` | pure text |
| `DATA_TOOLS_RULE` | `agent-openai.cjs:210` | pure text |
| Rigid project-recipe text | `session-manager.cjs:889` | pure text |
| Tool-call parsing / message assembly | scattered | pure functions |

**Last — the high-risk core** (platform-coupled and/or PROTECTED; migrate only behind the harness + flag, per mode):

| Piece | Location | Why high-risk |
|---|---|---|
| `run_bash` + `destructiveBashGuard` + `runnerEnv`/`PYTHONSAFEPATH` | `agent-openai.cjs:52-70, 312` | security-critical (H3) + Node `child_process` |
| `emitNewOutputs` / `scanOffice` | `session-manager.cjs:43` | Node `fs` |
| sessions/projects persistence | `sessions-store.cjs`, `projects-store.cjs` | Node `fs` + `app.getPath` |
| Weak-model office pipeline (end-to-end) | per CLAUDE.md 🔒 | PROTECTED; "do not regress" |

### Honest impact
Effort is **large** and front-loaded; the high-risk core carries a real chance of regressing validated behavior, which is precisely why it goes **last, per-mode, harness-gated, desktop-validated, flag-guarded**. The payoff — one engine, fixes/security patches applied once, web inheriting desktop-grade quality, a collapsed test matrix, and a clean path for any third surface — accrues over the product's life and is what the owner has prioritized.

---

## Consequences

**Positive:** drift is eliminated at the root, not merely managed; every future fix and **security patch lands once for both surfaces**; web inherits desktop-grade behavior instead of an approximate mirror; the test matrix collapses to "core + thin adapters"; a future surface (mobile/CLI/server-runner) is another adapter, not another rewrite.

**Negative / costs:** the migration is the highest-risk work in the program (mitigated by harness + strangler-fig + desktop-first + flags + permission gates); during migration a mode may briefly run old-engine on desktop and core on web (acceptable, temporary); managed-3rd-party features add external deps, cost, and a server secret surface; the harness itself is an upfront build.

---

## Alternatives considered

- **Two separate codebases:** rejected — defeats "always build both," regresses the shared renderer, root cause of current drift.
- **Naïve single source (no seam):** rejected — couples desktop to web.
- **Freeze the legacy engine permanently (the first draft of this ADR):** **superseded** by the owner's 2026-06-17 decision — it left the turn engine duplicated forever and never reached true single source.
- **Big-bang shared-core extraction:** rejected — too risky; we migrate **incrementally** under the harness instead.
