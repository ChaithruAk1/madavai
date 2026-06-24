import { runProjectJob } from '@madav/core';
import type { JobHandler } from './jobs.js';

/**
 * Run a project/agent task as a cloud job. The RUNNER is @madav/core's `runProjectJob` — the SAME logic
 * the desktop uses (single source, no parallel cloud copy). The cloud injects per-run adapters (how to
 * call the model, read files, execute code in the sandbox); tests inject fakes. A runner that produces
 * nothing throws, so the worker retries and finally dead-letters it — never a silent no-op.
 */
export interface RunnerEnv { makeAdapters(payload: any): any; }

export function projectRunnerHandler(env: RunnerEnv): JobHandler {
  return async (payload: any) => {
    const adapters = env.makeAdapters(payload);
    const res = await runProjectJob({ task: payload.task, instructions: payload.instructions, folder: payload.folder }, adapters);
    if (!res.ok) throw new Error(res.error || 'runner produced no output');
  };
}
