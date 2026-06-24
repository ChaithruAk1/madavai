export type Language = 'js' | 'python';
export interface RunCodeRequest { language: Language; source: string; timeoutMs?: number }
export interface CodeResult { ok: boolean; stdout?: string; result?: unknown; error?: string }

/** Where model/untrusted code runs in isolation. Tiers implement this ONE interface: a Node vm (trusted
 *  compute), Pyodide (Python), and a microVM pool (untrusted) — chosen by policy, behind runCode(). */
export interface Sandbox { run(req: RunCodeRequest): Promise<CodeResult> }

/** Default everywhere: refuse. Code never runs unless a sandbox is explicitly provided — no raw eval. */
export class DenySandbox implements Sandbox {
  async run(req: RunCodeRequest): Promise<CodeResult> {
    return { ok: false, error: `code execution refused: no sandbox configured for "${req.language}"` };
  }
}

/** The SINGLE entry point. Any path that runs model-authored code calls this, never eval directly. */
export async function runCode(sandbox: Sandbox, req: RunCodeRequest): Promise<CodeResult> {
  if (!req || typeof req.source !== 'string' || !req.source.trim()) return { ok: false, error: 'empty source' };
  return sandbox.run(req);
}
