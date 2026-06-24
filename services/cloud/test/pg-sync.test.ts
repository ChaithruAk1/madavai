import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PgSyncStore, migrate, type Queryable } from '../src/pg-sync-store.js';

function db(): Queryable & { close(): Promise<void> } {
  const pg = new PGlite();
  return { query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) as any, close: () => pg.close() };
}
const item = (id: string, u: number, data = 'aGk=') => ({ id, kind: 'message' as const, updatedAt: u, envelope: { v: 1 as const, custody: 'server-readable' as const, data } });

test('PgSyncStore: push then pull round-trips against REAL Postgres (PGlite)', async () => {
  const d = db(); await migrate(d);
  const s = new PgSyncStore(d);
  assert.equal((await s.push('w', [item('a', 1), item('b', 2)])).accepted, 2);
  const pull = await s.pull('w', 0, 100);
  assert.equal(pull.items.length, 2);
  assert.ok(pull.cursor > 0);
  await d.close();
});

test('last-writer-wins: an older update is reported as a conflict, newer kept', async () => {
  const d = db(); await migrate(d);
  const s = new PgSyncStore(d);
  await s.push('w', [item('x', 5, 'bmV3')]);
  const r = await s.push('w', [item('x', 3, 'b2xk')]);
  assert.deepEqual(r.conflicts, ['x']);
  assert.equal((await s.pull('w', 0, 10)).items[0].envelope.data, 'bmV3');
  await d.close();
});

test('incremental pull by cursor returns only rows after the cursor', async () => {
  const d = db(); await migrate(d);
  const s = new PgSyncStore(d);
  await s.push('w', [item('a', 1)]);
  const first = await s.pull('w', 0, 10);
  await s.push('w', [item('b', 1)]);
  const second = await s.pull('w', first.cursor, 10);
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].id, 'b');
  await d.close();
});
