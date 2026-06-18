// server/task-run.mjs — single-shot scheduled-task executor (Phase 3 S2). Runs ONE provider completion from a
// task's stored prompt and returns a run record. Intentionally NOT the chat/cowork/agent turn engine: no
// tools, no MCP, no file access, no multi-turn loop (drift guard R7). The actual provider request is INJECTED
// (providerCall), so this module is pure, unit-testable, and holds no secrets/keys itself.
import crypto from "node:crypto";

const OUT_CAP = 8000;          // stored output is capped (the model token cap is enforced by the caller, S3)
const MIN_INTERVAL_MS = 15 * 60000;

// Execute one run. providerCall({ prompt, model, userId, provider }) -> Promise<string>. Never throws.
export async function runTaskOnce(task, { providerCall, now = Date.now, runId } = {}) {
  const startedAt = now();
  const base = { id: runId || ("run_" + crypto.randomBytes(8).toString("hex")), taskId: task && task.id, userId: task && task.userId, startedAt };
  if (!task || !task.prompt) return { ...base, finishedAt: now(), ok: false, error: "task has no prompt" };
  if (typeof providerCall !== "function") return { ...base, finishedAt: now(), ok: false, error: "no provider call configured" };
  try {
    const text = await providerCall({ prompt: task.prompt, model: task.model, userId: task.userId, provider: task.provider });
    return { ...base, finishedAt: now(), ok: true, output: String(text == null ? "" : text).slice(0, OUT_CAP) };
  } catch (e) {
    return { ...base, finishedAt: now(), ok: false, error: String((e && e.message) || e).slice(0, 500) };
  }
}

// Pure scheduler helpers (used by S3). Kept here so they're tested alongside the executor.
export function nextRunAfter(task, now = Date.now) {
  return now() + Math.max(MIN_INTERVAL_MS, Number(task && task.intervalMs) || 0);
}
export function isTaskDue(task, now = Date.now) {
  return !!(task && task.enabled && task.nextRunAt && task.nextRunAt <= now());
}
