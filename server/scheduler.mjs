// server/scheduler.mjs — Phase 3 S3b: the internal scheduler that runs DUE scheduled tasks single-shot.
// Single-instance v1 (approved). Safety: claim-FIRST (advance nextRunAt before running) so a concurrent tick
// can't double-run; per-user daily run cap + plan gate; 60s per-run timeout; runs ring-buffered per task.
// Execution is delegated to runTaskOnce (S2) — ONE completion, NO tools/MCP/loop. The provider call is injected.
import crypto from "node:crypto";
import { runTaskOnce, isTaskDue, nextRunAfter } from "./task-run.mjs";
import { computeNextRunAt } from "./schedule-next.mjs"; // P3 S4: tz-aware next fire for daily/weekly/interval

const DAILY_CAP = 200;
const RUNS_PER_TASK = 50;
const RUN_TIMEOUT_MS = 60000;
const TICK_MS = 60000;

function dayStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }
function withTimeout(p, ms) { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("run timed out after " + ms + "ms")), ms); })]).finally(() => clearTimeout(t)); }

export function makeScheduler({ store, providerCallFor, getUser = null, statusOf = null, now = Date.now, timeoutMs = RUN_TIMEOUT_MS, dailyCap = DAILY_CAP } = {}) {
  const tasksCol = store.col("tasks");
  const runsCol = store.col("runs");

  async function runsToday(userId, t) {
    const ds = dayStart(t);
    return (await runsCol.all()).filter((r) => r.userId === userId && (r.startedAt || 0) >= ds).length;
  }
  async function appendRun(task, run) {
    await runsCol.insert(run);
    const mine = (await runsCol.all()).filter((r) => r.taskId === task.id).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    for (const old of mine.slice(RUNS_PER_TASK)) { try { await runsCol.remove(old.id); } catch {} }
  }
  const skip = (task, t, reason) => ({ id: null, taskId: task.id, userId: task.userId, startedAt: t, ok: false, skipped: reason });

  // Run one task NOW (single-shot). Applies plan + daily-quota gates unless force. Records the run.
  async function runDue(task, { force = false } = {}) {
    const t = now();
    const user = getUser ? await getUser(task.userId) : null;
    if (!force) {
      if (getUser && !user) return skip(task, t, "no user");
      if (statusOf && user) { const s = statusOf(user).status; if (s !== "active" && s !== "trialing") return skip(task, t, "plan"); }
      if (await runsToday(task.userId, t) >= dailyCap) return skip(task, t, "quota");
    }
    let run;
    try {
      run = await withTimeout(runTaskOnce(task, { providerCall: () => providerCallFor(task, user), now }), timeoutMs);
    } catch (e) {
      run = { id: "run_" + crypto.randomBytes(8).toString("hex"), taskId: task.id, userId: task.userId, startedAt: t, finishedAt: now(), ok: false, error: String((e && e.message) || e).slice(0, 500) };
    }
    await appendRun(task, run);
    return run;
  }

  // One scheduler pass: claim-first, then run each due task. Returns the number of due tasks seen.
  async function tick() {
    const t = now();
    const due = (await tasksCol.all()).filter((task) => isTaskDue(task, () => t));
    for (const task of due) {
      // CLAIM: advance nextRunAt before running so a concurrent tick sees it not-due (single-instance lock).
      const nextAt = (task.schedule && task.schedule.mode && task.schedule.mode !== "off")
        ? computeNextRunAt(task.schedule, t, task.tz || "UTC")
        : nextRunAfter(task, () => t);
      const claimed = await tasksCol.update(task.id, { nextRunAt: nextAt, lastRunAt: t });
      if (!claimed) continue;
      try { await runDue(task); } catch {}
    }
    return due.length;
  }

  let timer = null;
  function start(intervalMs = TICK_MS) { if (timer) return false; timer = setInterval(() => { tick().catch(() => {}); }, intervalMs); if (timer && timer.unref) timer.unref(); return true; }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }
  return { tick, runDue, runsToday, appendRun, start, stop };
}
