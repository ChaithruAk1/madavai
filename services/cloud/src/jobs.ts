/** A durable background job. Runners (agent/team/research/scheduled) are enqueued and processed here. */
export interface Job<T = unknown> { id: string; kind: string; payload: T; attempts: number; maxAttempts: number }
export type JobHandler<T = any> = (payload: T, job: Job<T>) => Promise<void>;

/** Queue contract. In-memory now; a BullMQ/Redis impl slots in at deploy with the SAME interface. */
export interface JobQueue {
  enqueue(kind: string, payload: unknown, opts?: { maxAttempts?: number }): Promise<string>;
  claim(): Promise<Job | null>;
  complete(id: string): Promise<void>;
  fail(id: string, error: string, retryDelayMs?: number): Promise<void>;
  stats(): Promise<{ pending: number; active: number; done: number; dead: number }>;
}

type State = 'pending' | 'active' | 'done' | 'dead';
interface Stored extends Job { state: State; readyAt: number; error?: string }

export class MemoryJobQueue implements JobQueue {
  private jobs = new Map<string, Stored>();
  private seq = 0;
  private now: () => number;
  constructor(now: () => number = Date.now) { this.now = now; }

  async enqueue(kind: string, payload: unknown, opts: { maxAttempts?: number } = {}): Promise<string> {
    const id = 'j' + ++this.seq;
    this.jobs.set(id, { id, kind, payload, attempts: 0, maxAttempts: opts.maxAttempts ?? 3, state: 'pending', readyAt: this.now() });
    return id;
  }
  async claim(): Promise<Job | null> {
    const t = this.now();
    const j = [...this.jobs.values()].find((x) => x.state === 'pending' && x.readyAt <= t);
    if (!j) return null;
    j.state = 'active'; j.attempts++;
    return { id: j.id, kind: j.kind, payload: j.payload, attempts: j.attempts, maxAttempts: j.maxAttempts };
  }
  async complete(id: string): Promise<void> { const j = this.jobs.get(id); if (j) j.state = 'done'; }
  async fail(id: string, error: string, retryDelayMs = 0): Promise<void> {
    const j = this.jobs.get(id); if (!j) return;
    if (j.attempts >= j.maxAttempts) { j.state = 'dead'; j.error = error; }
    else { j.state = 'pending'; j.readyAt = this.now() + retryDelayMs; j.error = error; }
  }
  async stats() {
    const c = (s: State) => [...this.jobs.values()].filter((j) => j.state === s).length;
    return { pending: c('pending'), active: c('active'), done: c('done'), dead: c('dead') };
  }
}

/** Pulls jobs, runs the matching handler, retries with exponential backoff, dead-letters on exhaustion. */
export class Worker {
  constructor(private q: JobQueue, private handlers: Record<string, JobHandler>, private backoffMs = 0) {}
  async runOnce(): Promise<boolean> {
    const job = await this.q.claim();
    if (!job) return false;
    const h = this.handlers[job.kind];
    if (!h) { await this.q.fail(job.id, `no handler for "${job.kind}"`); return true; }
    try { await h(job.payload, job); await this.q.complete(job.id); }
    catch (e) { await this.q.fail(job.id, e instanceof Error ? e.message : String(e), this.backoffMs * 2 ** (job.attempts - 1)); }
    return true;
  }
  /** Process every job that is ready now (tests / single-tick). */
  async drain(maxLoops = 10000): Promise<void> { let n = 0; while (n++ < maxLoops && (await this.runOnce())) { /* keep going */ } }
}
