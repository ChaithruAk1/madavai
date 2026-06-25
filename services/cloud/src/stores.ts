import type { SyncItem } from '@madav/contracts';
import type { Role, Membership } from '@madav/rbac';

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

/** Who belongs to a workspace and with what role. In-memory now; PgMembershipStore at deploy (same interface). */
export interface MembershipStore {
  roleOf(userId: string, workspaceId: string): Promise<Role | null>;
  setRole(userId: string, workspaceId: string, role: Role): Promise<void>;
  remove(userId: string, workspaceId: string): Promise<void>;
  list(workspaceId: string): Promise<Membership[]>;
  count(workspaceId: string): Promise<number>;
}

export class MemoryMembershipStore implements MembershipStore {
  private m = new Map<string, Role>();
  private key(w: string, u: string) { return w + '\u0000' + u; }
  async roleOf(userId: string, workspaceId: string) { return this.m.get(this.key(workspaceId, userId)) ?? null; }
  async setRole(userId: string, workspaceId: string, role: Role) { this.m.set(this.key(workspaceId, userId), role); }
  async remove(userId: string, workspaceId: string) { this.m.delete(this.key(workspaceId, userId)); }
  async list(workspaceId: string): Promise<Membership[]> {
    const out: Membership[] = [];
    for (const [k, role] of this.m) { const [w, u] = k.split('\u0000'); if (w === workspaceId) out.push({ userId: u!, workspaceId: w!, role }); }
    return out;
  }
  async count(workspaceId: string) { let n = 0; for (const k of this.m.keys()) if (k.split('\u0000')[0] === workspaceId) n++; return n; }
}
