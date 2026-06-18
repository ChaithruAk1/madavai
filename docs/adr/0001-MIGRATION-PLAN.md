# ADR-0001 — Core-Migration Plan (operationalized, gated)

**Status: PROPOSAL — no code.** Turns ADR-0001's "migrate the desktop engine into a shared core" decision into
concrete, verifiable, permission-gated steps. **Desktop is the reference and must not regress.** Every
desktop-touching step needs an explicit owner go-ahead; nothing here is started without it.

## Already in place (this de-risks the early phases)
- **Adapter seam:** `core/adapter.contract.js`, `src/bridge/contract.js`, `webBridge`, the Electron preload.
- **Turn-replay harness:** `core/harness`, `electron/harness.cjs`, `src/shared/harness.js`,
  `tests/parity/harness.test.js`, `HARNESS.md` (the ADR's #1 control already exists).
- **Anti-drift:** capability manifest, the 33-file parity suite, `FEATURE-AUTHORING-RULE.md`, CI.
- **Proof the pattern works:** `shared/office-rules.cjs` (office rule + `isDeckCapable`) is **already single-sourced**.

So **M0 is ~80% done.** The real work is M1 (cheap, high-value) then M2–M5 (the per-mode engine migration).

## DECISION (corrected 2026-06-18): ESM core — and the first rule is migrated + proven
My earlier "CJS, Vite imports it fine" was **wrong** (the renderer can't import source `.cjs`; that's why
`src/office.js` is a hand-maintained ESM copy + a parity test). Corrected choice: **ESM core in `core/`**,
imported by the renderer + server natively and by desktop (CJS) via cached dynamic `import()` (the proven
MCP-SDK pattern). This gives a literal single source and lets the `office.js` copy + `rules-parity` test be
**retired** as rules move into the core.

**Proven (this session):** `core/agent-rules.js` holds `dataToolsRule(caps)`; desktop + web both import the one
source; output is **byte-identical** to the prior per-surface strings; full build + 209 parity tests green.
Pending: **desktop runtime validation** (dynamic ESM import in dev + a packaged build) — the one thing only the
owner can confirm. Next core targets: migrate the office rule (retiring the `office.js` copy+test), then the
per-mode engine (M2 chat → M3 agent → M4 project → M5 team).

## (Superseded) The one M0 decision: core module format (CJS vs ESM interop)
Desktop is CJS (`electron/*.cjs`); web is ESM via Vite (`src/*.js`). The shared core must import cleanly on both.
Two options:
- **(A, recommended) Author the core as CJS in `shared/`** (like `office-rules.cjs`). Web/Vite imports CJS fine;
  desktop `require()`s it natively. Lowest friction, already proven by `office-rules.cjs`.
- **(B) Author as ESM in `core/`**; desktop consumes via dynamic `await import()` (already used for the MCP SDK).
  Cleaner long-term, but adds async-load seams on the desktop hot path.
Recommendation: **(A)** — extend `shared/` as the core home; revisit ESM only if a core module needs it.

## Phases (strangler-fig: one mode at a time; never big-bang)

### M0 — Pre-flight (NO engine edits) · gate: confirm the format decision
Confirm the harness records + replays each mode's tool/prompt/output sequence; add a **behavior-version stamp**
+ golden parity goldens for **chat** (the first mode to migrate); lock the core-home/format decision (A).
**Verify:** harness green on a recorded desktop chat turn; goldens committed. **Risk: none** (no engine edits).

### M1 — Safe shelf (pure text/data/functions) · gate: owner go-ahead (low risk)
Extract into `shared/` and import from BOTH desktop and web, deleting the duplicated copies:
tool **schemas** (`agent-openai.cjs` `TOOLS`), system/identity prompts, `DATA_TOOLS_RULE`, the rigid
project-recipe text (`session-manager.cjs`), and tool-call parsing / message assembly. **This kills the
"three copies of the office/prompt rule, keep in lockstep" hazard from CLAUDE.md at the root** — generalizing
what `office-rules.cjs` already proves. **Verify:** harness replay byte-identical + parity suite + desktop
eyeball. **Rollback:** revert the import (text is unchanged, only its home moved).

### M2 — Chat-mode turn loop · gate: owner go-ahead + flag
Extract the chat turn/tool-call loop **shape** into the core behind the adapter interface (the core calls
`adapter.net/exec/persist/emit`, never Node or browser APIs directly). Desktop runs **core-chat behind a flag,
side-by-side** with the old engine; validate via harness replay of recorded chat turns + by eye; flip the flag;
**then** web chat switches to the same core. **Verify:** chat goldens green on the core path; parity.
**Rollback:** flip the flag back to the legacy engine.

### M3 — Agent mode · gate: owner go-ahead + flag
Same pattern for the agent loop (agent block, memory injection, per-agent turn). Desktop-first, harness, flag.

### M4 — Project mode · gate: owner go-ahead + flag + the PROTECTED scenario
The riskiest. Migrate the project turn (`_projectTurn`, `emitNewOutputs`/`scanOffice`, the rigid recipe) and the
high-risk platform-coupled pieces behind the adapter: `run_bash` + `destructiveBashGuard` + `PYTHONSAFEPATH`
(desktop `child_process`; web Pyodide/no-shell), `fs` output scanning, sessions/projects persistence.
**Non-negotiable:** before web touches project mode, re-run the **🔒 PROTECTED `Report_March.xlsx`
weak-model scenario** on desktop and confirm the Open/Download card still renders. **Rollback:** flag.

### M5 — Team / cowork modes · gate: owner go-ahead + flag
Last. Migrating the team loop is what finally **unblocks `team.memberTools` parity** (web team members gain the
core's per-member tool loop) and the richer `chat.toolLoop` — the two PARTIAL rows left in the scorecard.

## Cross-cutting controls (ADR-0001, all required)
Harness-first · strangler-fig one mode at a time · desktop adopts + is validated before web · explicit
permission per desktop-touching step · behind-a-flag side-by-side until sign-off · golden parity tests +
behavior-version stamp go red on drift.

## Honest assessment
- **Effort:** large, front-loaded, multi-session. M0+M1 are quick and high-value (kill the prompt/rule
  triplication, the recurring CLAUDE.md hazard). M2–M5 are the real engine migration, one mode per increment.
- **Risk:** M0/M1 near-zero; M2–M5 carry real regression risk to validated desktop behavior — contained by the
  controls, not by hope. M4 is the sharp end (PROTECTED pipeline + security-critical `run_bash`).
- **Payoff (why it's worth it):** one engine — every fix/security patch lands once; web inherits desktop-grade
  behavior instead of an approximate mirror; the test matrix collapses to "core + thin adapters"; a future
  surface is another adapter, not another rewrite.

## Recommended first move (on approval)
**M0 → M1 only**, then stop for sign-off before M2. M1 alone retires the triple-maintained office/prompt rules —
a real stability win — at near-zero risk, and proves the extraction rhythm before we touch any turn loop.
