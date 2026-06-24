import { API } from '@madav/contracts';
import type { SyncItem } from '@madav/contracts';

/** How the engine reaches the server. Production: an HTTP call to the @madav/cloud gateway.
 *  Tests / offline: a direct in-process call. The engine is transport-agnostic. */
export interface Transport { call(path: string, method: string, body: unknown): Promise<unknown>; }

export interface LocalStore {
  edit(item: SyncItem): void;          // a LOCAL change (marks the item pending)
  applyRemote(item: SyncItem): void;   // merge a server item (last-writer-wins by updatedAt)
  pending(): SyncItem[];               // locally-edited items not yet pushed
  markPushed(ids: string[]): void;
  all(): SyncItem[];
  cursor(): number;
  setCursor(n: number): void;
}

/** Push local changes, pull remote ones, advance the cursor. Stateless beyond the injected store. */
export class SyncEngine {
  constructor(private t: Transport, public store: LocalStore, private workspaceId: string) {}

  async push(): Promise<{ accepted: number; conflicts: string[] }> {
    const items = this.store.pending();
    if (!items.length) return { accepted: 0, conflicts: [] };
    const res = (await this.t.call(API.syncPush.path, API.syncPush.method, { workspaceId: this.workspaceId, items })) as { accepted: number; conflicts: string[] };
    this.store.markPushed(items.map((i) => i.id));
    return res;
  }

  async pull(): Promise<{ items: SyncItem[]; cursor: number }> {
    const res = (await this.t.call(API.syncPull.path, API.syncPull.method, { workspaceId: this.workspaceId, since: this.store.cursor(), limit: 500 })) as { items: SyncItem[]; cursor: number };
    for (const it of res.items) this.store.applyRemote(it);
    this.store.setCursor(res.cursor);
    return res;
  }

  async sync(): Promise<{ items: SyncItem[]; cursor: number }> { await this.push(); return this.pull(); }
}

/** A simple in-memory local store (a client would back this with IndexedDB / SQLite). */
export class MemoryLocalStore implements LocalStore {
  private items = new Map<string, SyncItem>();
  private dirty = new Set<string>();
  private cur = 0;
  edit(item: SyncItem) { this.items.set(item.id, item); this.dirty.add(item.id); }
  applyRemote(item: SyncItem) { const ex = this.items.get(item.id); if (!ex || item.updatedAt >= ex.updatedAt) { this.items.set(item.id, item); this.dirty.delete(item.id); } }
  pending() { return [...this.dirty].map((id) => this.items.get(id)).filter((x): x is SyncItem => !!x); }
  markPushed(ids: string[]) { for (const id of ids) this.dirty.delete(id); }
  all() { return [...this.items.values()].sort((a, b) => a.id.localeCompare(b.id)); }
  cursor() { return this.cur; }
  setCursor(n: number) { this.cur = n; }
}
