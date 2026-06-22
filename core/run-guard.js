// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// core/run-guard.js — SINGLE SOURCE safety guard for agentic runs (desktop + web).
//
// An agent loop can hang: the model keeps calling tools and never converges, so the run
// grinds for many minutes with no result (the "20-minute spin"). The step cap alone is too
// permissive on slow models. This guard adds a WALL-CLOCK cap and a simple repeat detector,
// so a run can ALWAYS end in bounded time with a plain-English reason. Pure logic — no Node,
// DOM, or Electron — desktop imports it via cached import(); web imports it natively. ONE copy.

// Create a guard for one run. Call check() before each step and note(signature) after a step.
//  - maxMs:     wall-clock budget for the whole run (0 disables). Default 8 minutes.
//  - maxSteps:  optional step budget (0 disables; the loops already cap steps, so default off).
//  - maxRepeat: stop if the same step signature repeats this many times in a row (0 disables).
export function createRunGuard({ maxMs = 8 * 60 * 1000, maxSteps = 0, maxRepeat = 3, now = Date.now } = {}) {
  const startedAt = now();
  const recent = [];
  let steps = 0;
  return {
    // Call BEFORE each step. Returns { stop:false } or { stop:true, code, reason }.
    check() {
      if (maxMs > 0 && now() - startedAt >= maxMs) return { stop: true, code: "time", reason: "ran past the time limit without finishing" };
      if (maxSteps > 0 && steps >= maxSteps) return { stop: true, code: "steps", reason: "used every step without finishing" };
      return { stop: false };
    },
    // Call AFTER a step that did work, with a short signature of what it did (e.g. tool names).
    // Returns { stop:false } or { stop:true, code:"loop", reason }.
    note(signature) {
      steps++;
      const sig = String(signature == null ? "" : signature).slice(0, 120);
      if (sig && maxRepeat > 0) {
        recent.push(sig);
        if (recent.length > maxRepeat) recent.shift();
        if (recent.length >= maxRepeat && recent.every((s) => s === sig)) {
          return { stop: true, code: "loop", reason: "kept repeating the same step without progress" };
        }
      }
      return { stop: false };
    },
    get steps() { return steps; },
    elapsedMs() { return now() - startedAt; },
  };
}

// Plain-English message shown to the user when the guard stops a run. Non-technical, actionable.
export function guardStopMessage(code) {
  switch (code) {
    case "time": return "I stopped because this was taking too long without finishing — it looked stuck. Try a more capable model, or split the task into smaller steps.";
    case "steps": return "I stopped after using all my steps without finishing — this task may be too complex for the current model. Try a more capable model, or break it into smaller parts.";
    case "loop": return "I stopped because I was repeating the same step without making progress. Try a more capable model, or rephrase the task.";
    default: return "I stopped early to avoid hanging. Try again, or switch to a more capable model.";
  }
}
