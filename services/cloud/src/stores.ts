import type { SyncItem } from '@madav/contracts';

export interface Session { userId: string; email?: string }

// Swappable backends — in-memory now; Redis (sessions/rate-limit) + Postgres (sync) at deploy.
export interface SessionStore { get(token: string): Promise<Session | null>; set(token: string, s: Session): Promise<void>; del(token: string): Promise<void>; }
export interface RateLimiter { take(key: string, cost?: number): Promise<{ ok: boolean; remaining: number }>; }
export interface SyncStore {
  push(workspaceId: string, items: SyncItem[]): Promise<{ accepted: number; conflicts: string[] }>;
  pull(workspaceId: string, since: number, limit: number): Promise<{ items: SyncItem[]; cursor: number }>;
}

export class MemorySessionStore implements SessionStore {
  private m = new Map<string, Session>();
  async get(t: string) { return this.m.get(t) ?? null; }
  async set(t: string, s: Session) { this.m.set(t, s); }
  async del(t: string) { this.m.delete(t); }
}

/** Token-bucket limiter (the Redis impl will use the same contract). */
export class MemoryRateLimiter implements RateLimiter {
  private b = new Map<string, { tokens: number; ts: number }>();
  constructor(private capacity = 120, private refillPerSec = 2) {}
  async take(key: string, cost = 1) {
    const now = Date.now();
    const cur = this.b.get(key) ?? { tokens: this.capacity, ts: now };
    cur.tokens = Math.min(this.capacity, cur.tokens + ((now - cur.ts) / 1000) * this.refillPerSec);
    cur.ts = now;
    const ok = cur.tokens >= cost;
    if (ok) cur.tokens -= cost;
    this.b.set(key, cur);
    return { ok, remaining: Math.floor(cur.tokens) };
  }
}

/** Monotonic-cursor sync store: last-writer-wins by updatedAt; pull returns items after a cursor. */
export class MemorySyncStore implements SyncStore {
  private ws = new Map<string, Map<string, SyncItem & { seq: number }>>();
  private seq = 0;
  async push(workspaceId: string, items: SyncItem[]) {
    const store = this.ws.get(workspaceId) ?? new Map<string, SyncItem & { seq: number }>();
    this.ws.set(workspaceId, store);
    let accepted = 0; const conflicts: string[] = [];
    for (const it of items) {
      const ex = store.get(it.id);
      if (ex && ex.updatedAt > it.updatedAt) { conflicts.push(it.id); continue; }
      store.set(it.id, { ...it, seq: ++this.seq }); accepted++;
    }
    return { accepted, conflicts };
  }
  async pull(workspaceId: string, since: number, limit: number) {
    const store = this.ws.get(workspaceId);
    if (!store) return { items: [], cursor: since };
    const rows = [...store.values()].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq).slice(0, limit);
    const cursor = rows.length ? rows[rows.length - 1]!.seq : since;
    const items = rows.map(({ seq, ...rest }) => { void seq; return rest as SyncItem; });
    return { items, cursor };
  }
}
