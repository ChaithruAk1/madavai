# Phase 3 — Scheduled / background runs (web): design + threat model (GATE)

**Status: DESIGN ONLY. No code in this slice.** This is the plan's flagged **top drift risk** (server-side
turn execution = a "third turn implementation", R7), so it's reviewed before any code. Desktop runs scheduled
tasks via `task-runner.cjs`; on web `runTaskNow` errors and `getRuns` returns `[]` (matrix **P1-6**) because a
browser can't run in the background. This adds a **server-side** path so a stored task runs without the tab open.

## The hard constraint (read first) — why this is Starter-only in v1
A user's **BYO provider API key lives only in their browser** (localStorage; "keys/connector tokens never
synced by design" — WEB-VS-DESKTOP). The server therefore **cannot** call a BYO provider on the user's behalf
when they're offline. The one provider the server CAN drive is the **Madav Starter** upstream
(`/starter/v1/chat/completions`, the server holds that key). So:
- **v1: background runs use the Starter provider only.** A task on a BYO-key provider is accepted but marked
  "runs only while the desktop app / a browser tab is open" (honest), OR is **skipped** by the scheduler.
- **BYO-key background runs** would require storing the user's provider key **server-side** (the
  connector-vault pattern from P3.4) — a separate, opt-in, security-reviewed follow-up. **Not** in v1.

## The drift boundary (non-negotiable, R7)
The background executor runs **ONE single-shot completion**: load the task's **stored prompt** → call the
Starter upstream once → store the result. It is **NOT** the chat/cowork/agent turn engine:
- **No tools, no MCP, no file access, no multi-turn agent loop, no streaming to a user.**
- It reuses the existing Starter upstream call; it does not re-implement `runTurn`/`runAgentTurn`.
This keeps "server-side execution" from growing into a third full turn engine (the thing the plan warns about).

## Data model (additive store collections)
- `tasks` — per user: `{ id, userId, title, prompt, model, schedule (cron-ish or interval), enabled,
  createdAt, lastRunAt, nextRunAt, provider:"starter" }`. (Mirrors the desktop task shape where sensible.)
- `runs` — per execution: `{ id, taskId, userId, startedAt, finishedAt, ok, output (capped), error? }`.
Both via the existing `store.col(name)` shape (like `conversations`, `projects`). No secrets stored.

## Components
1. **Task CRUD routes** (additive, `authUser`-gated, per-user): `GET/POST/PUT/DELETE /tasks`, `GET /tasks/:id/runs`.
2. **Single-shot executor** (`server/task-run.mjs`, pure-ish, fetch-injectable): `runTaskOnce(task, { starterCall })`
   → calls the Starter upstream with the stored prompt → returns a `run` record. Unit-tested with a mock.
3. **Scheduler** (server tick): every minute, find **due** tasks (`enabled && nextRunAt <= now`), **atomically
   claim** each (set `nextRunAt` forward / a `claimedAt` lease) so multiple Render instances don't double-run,
   execute single-shot, write the `run`, advance `nextRunAt`. Alternative trigger: an external cron POSTing
   `/run/tick` guarded by a `CRON_SECRET` (decision below).
4. **Web wiring**: `createTask/listTasks` already persist; point `runTaskNow` at `POST /tasks/:id/run` and
   `getRuns` at `GET /tasks/:id/runs`. The task UI shows real run history instead of the current no-op.

## Threat model (STRIDE) + mitigations
| # | Threat | Mitigation |
|---|---|---|
| S1 | **Unauthorized task CRUD / reading another user's runs** | All routes `authUser`-gated; tasks/runs keyed by `userId`; never return another user's records. |
| S2 | **Cost / abuse** (a user schedules thousands of runs) | Per-user caps: **max N tasks**, **min interval** (e.g. ≥15 min), **max output tokens/run**, **daily run quota**; enforced server-side; trial/plan gating reuses `statusOf(user)`. |
| S3 | **Trigger forgery** (anyone hits the run endpoint) | Internal scheduler needs no public trigger. If using external cron, `/run/tick` requires a secret header (`CRON_SECRET`), constant-time compared; never the user bearer. |
| S4 | **Multi-instance double-run** | Atomic claim: a run advances `nextRunAt` (or sets a short `claimedAt` lease) **before** executing; a second instance sees it's no longer due. |
| S5 | **Secret exposure** | No BYO key on the server (Starter-only); the Starter upstream key stays server-side; run output stored per-user, never includes provider keys. |
| S6 | **Drift into a full agent** (R7) | Hard single-shot boundary (above): no tools/MCP/files/loop; reuses the Starter call only. A parity test asserts the executor imports no tool/agent modules. |
| S7 | **Runaway execution / hang** | Per-run timeout; failures recorded as a `run` with `ok:false` + error; the scheduler continues. |
| S8 | **Prompt growth / storage blowup** | Cap stored prompt + output length; cap `runs` retained per task (ring buffer). |

## Increments (each verifiable; gated)
- **S1 — store + CRUD:** add `tasks` + `runs` collections + the task/run routes (no execution). Route-contract + store tests.
- **S2 — executor:** `runTaskOnce(task, {starterCall})` single-shot, fetch-injectable; unit tests (success, error, token cap). Wired to nothing.
- **S3 — scheduler (RISKIEST, security-review gate):** the minute tick + atomic claim + quotas + (optional) `/run/tick` + `CRON_SECRET`. This is the slice that actually executes server-side.
- **S4 — UI wiring:** `runTaskNow`/`getRuns` → the routes; task UI shows run history; BYO-key tasks show the honest "needs Starter / desktop" note.

## Decisions needed before S1

**LOCKED (2026-06-17):** provider = **Starter + opt-in server-stored BYO key** (the BYO key is sealed with the existing AES-256-GCM **token-vault** from P3.4 — opt-in, per-user, never returned to the browser, prod-key-guarded, user-deletable; this key custody is **security-reviewed at S2/S3**). Trigger = **internal tick + claim-lock**. Quotas = **conservative** (≤20 tasks/user, ≥15-min interval, ≤2k output tokens/run, ≤200 runs/day).
1. **Provider scope:** **Starter-only v1** (recommended) vs also build server-side BYO-key storage now (bigger, security-reviewed).
2. **Trigger:** **internal scheduler tick** (simplest; works on a single Render instance, needs the claim-lock for multi-instance) vs **external cron → `/run/tick` + `CRON_SECRET`** (decouples scheduling, standard for serverless).
3. **Quotas (your numbers):** max tasks/user, min interval, max tokens/run, daily run cap.

**Decisions locked. S1 (store + CRUD routes + tests) is being built now — additive, no execution, no key handling yet. S2 (executor) and S3 (scheduler + BYO-key vault) remain gated.**
