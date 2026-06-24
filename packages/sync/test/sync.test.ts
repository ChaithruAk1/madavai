import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine, MemoryLocalStore, type Transport } from '../src/index.js';
import { API, type SyncItem } from '@madav/contracts';

/** A tiny in-process server implementing the sync contract (cursor-based) — stands in for the gateway. */
function server(): Transport {
  const rows = new Map<string, SyncItem & { seq: number }>();
  let seq = 0;
  return {
    call: async (path, _m, body: any) => {
      if (path === API.syncPush.path) {
        let accepted = 0; const conflicts: string[] = [];
        for (const it of body.items as SyncItem[]) { const ex = rows.get(it.id); if (ex && ex.updatedAt > it.updatedAt) { conflicts.push(it.id); continue; } rows.set(it.id, { ...it, seq: ++seq }); accepted++; }
        return { accepted, conflicts };
      }
      const out = [...rows.values()].filter((r) => r.seq > body.since).sort((a, b) => a.seq - b.seq);
      return { items: out.map(({ seq: _s, ...r }) => r as SyncItem), cursor: out.length ? out[out.length - 1]!.seq : body.since };
    },
  };
}
const item = (id: string, u: number, data = 'aA==') => ({ id, kind: 'message' as const, updatedAt: u, envelope: { v: 1 as const, custody: 'server-readable' as const, data } });

test('two devices converge through one server', async () => {
  const t = server();
  const A = new SyncEngine(t, new MemoryLocalStore(), 'w');
  const B = new SyncEngine(t, new MemoryLocalStore(), 'w');
  (A.store as MemoryLocalStore).edit(item('doc1', 1));
  await A.sync(); await B.sync();
  assert.deepEqual(B.store.all().map((x) => x.id), ['doc1']);
  (B.store as MemoryLocalStore).edit(item('doc2', 2));
  await B.sync(); await A.sync();
  assert.deepEqual(A.store.all().map((x) => x.id), ['doc1', 'doc2']);
  assert.deepEqual(B.store.all().map((x) => x.id), ['doc1', 'doc2']);
});

test('last-writer-wins across devices (older edit loses, no data loss surprise)', async () => {
  const t = server();
  const A = new SyncEngine(t, new MemoryLocalStore(), 'w');
  const B = new SyncEngine(t, new MemoryLocalStore(), 'w');
  (A.store as MemoryLocalStore).edit(item('d', 5, 'QQ=='));
  await A.sync();
  (B.store as MemoryLocalStore).edit(item('d', 3, 'Qg=='));
  await B.sync();
  assert.equal(B.store.all()[0]!.envelope.data, 'QQ==');
});

test('nothing pending is a no-op push', async () => {
  const r = await new SyncEngine(server(), new MemoryLocalStore(), 'w').push();
  assert.equal(r.accepted, 0);
});
