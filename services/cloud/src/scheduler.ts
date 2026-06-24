import type { JobQueue } from './jobs.js';

export interface Schedule { id: string; kind: string; payload: unknown; everyMs: number; nextAt: number; maxAttempts?: number }

/**
 * Enqueues jobs on a cadence onto the durable worker tier, so automations run server-side with no
 * desktop. `tick()` is called by a cheap heartbeat; it enqueues every schedule that's due and advances
 * its next run. Missed intervals (server was down) collapse into ONE catch-up run, never a storm.
 */
export class Scheduler {
  private schedules = new Map<string, Schedule>();
  constructor(private queue: JobQueue, private now: () => number = Date.now) {}

  add(id: string, kind: string, payload: unknown, everyMs: number, maxAttempts?: number): void {
    this.schedules.set(id, { id, kind, payload, everyMs, nextAt: this.now() + everyMs, maxAttempts });
  }
  remove(id: string): void { this.schedules.delete(id); }
  list(): Schedule[] { return [...this.schedules.values()]; }

  async tick(): Promise<number> {
    const t = this.now();
    let enqueued = 0;
    for (const s of this.schedules.values()) {
      if (s.nextAt <= t) {
        await this.queue.enqueue(s.kind, s.payload, s.maxAttempts != null ? { maxAttempts: s.maxAttempts } : undefined);
        do { s.nextAt += s.everyMs; } while (s.nextAt <= t); // skip past any missed slots
        enqueued++;
      }
    }
    return enqueued;
  }
}
