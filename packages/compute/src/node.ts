import vm from 'node:vm';
import type { Sandbox, RunCodeRequest, CodeResult } from './index.js';

/** Node `vm` sandbox: runs JS in an isolated context, with an enforced timeout and captured output.
 *  Untrusted code belongs in the microVM tier; this is the trusted-compute tier behind the same contract. */
export class NodeVmSandbox implements Sandbox {
  async run(req: RunCodeRequest): Promise<CodeResult> {
    if (req.language !== 'js') return { ok: false, error: `language "${req.language}" runs in the Python/microVM tier (deploy)` };
    const stdout: string[] = [];
    const ctx = vm.createContext({ console: { log: (...a: unknown[]) => stdout.push(a.map((x) => String(x)).join(' ')) } });
    try {
      const result = vm.runInContext(req.source, ctx, { timeout: req.timeoutMs ?? 1000 });
      return { ok: true, stdout: stdout.join('\n'), result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), stdout: stdout.join('\n') };
    }
  }
}
