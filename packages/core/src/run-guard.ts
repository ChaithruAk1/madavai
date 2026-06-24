// @madav/core — wall-clock + repeat guard for agentic runs, so a run always ends in bounded time. Pure logic.
export interface RunGuardStop {
  stop: boolean;
  code?: string;
  reason?: string;
}
export interface RunGuard {
  check(): RunGuardStop;
  note(signature: unknown): RunGuardStop;
  readonly steps: number;
  elapsedMs(): number;
}

export function createRunGuard(
  { maxMs = 8 * 60 * 1000, maxSteps = 0, maxRepeat = 3, now = Date.now }:
  { maxMs?: number; maxSteps?: number; maxRepeat?: number; now?: () => number } = {},
): RunGuard {
  const startedAt = now();
  const recent: string[] = [];
  let steps = 0;
  return {
    check(): RunGuardStop {
      if (maxMs > 0 && now() - startedAt >= maxMs) return { stop: true, code: 'time', reason: 'ran past the time limit without finishing' };
      if (maxSteps > 0 && steps >= maxSteps) return { stop: true, code: 'steps', reason: 'used every step without finishing' };
      return { stop: false };
    },
    note(signature: unknown): RunGuardStop {
      steps++;
      const sig = String(signature == null ? '' : signature).slice(0, 120);
      if (sig && maxRepeat > 0) {
        recent.push(sig);
        if (recent.length > maxRepeat) recent.shift();
        if (recent.length >= maxRepeat && recent.every((s) => s === sig)) {
          return { stop: true, code: 'loop', reason: 'kept repeating the same step without progress' };
        }
      }
      return { stop: false };
    },
    get steps() { return steps; },
    elapsedMs() { return now() - startedAt; },
  };
}

export function guardStopMessage(code: string | undefined): string {
  switch (code) {
    case 'time':
      return 'I stopped because this was taking too long without finishing — it looked stuck. Try a more capable model, or split the task into smaller steps.';
    case 'steps':
      return 'I stopped after using all my steps without finishing — this task may be too complex for the current model. Try a more capable model, or break it into smaller parts.';
    case 'loop':
      return 'I stopped because I was repeating the same step without making progress. Try a more capable model, or rephrase the task.';
    default:
      return 'I stopped early to avoid hanging. Try again, or switch to a more capable model.';
  }
}
