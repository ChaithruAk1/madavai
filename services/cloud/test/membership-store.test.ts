import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { MemoryMembershipStore, type MembershipStore } from '../src/stores.js';
import { PgMembershipStore, migrateMemberships } from '../src/pg-membership-store.js';

const backends: Array<[string, () => Promise<{ s: MembershipStore; close: () => Promise<void> }>]> = [
  ['memory', async () => ({ s: new MemoryMembershipStore(), close: async () => {} })],
  ['pg', async () => { const pg = new PGlite(); const db = { query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) as any }; await migrateMemberships(db); return { s: new PgMembershipStore(db), close: () => pg.close() }; }],
];

for (const [name, make] of backends) {
  test(`MembershipStore round-trips + upserts + removes (${name})`, async () => {
    const { s, close } = await make();
    assert.equal(await s.roleOf('u1', 'w1'), null);
    assert.equal(await s.count('w1'), 0);
    await s.setRole('u1', 'w1', 'owner');
    await s.setRole('u2', 'w1', 'member');
    assert.equal(await s.roleOf('u1', 'w1'), 'owner');
    assert.equal(await s.roleOf('u2', 'w1'), 'member');
    assert.equal(await s.count('w1'), 2);
    assert.equal((await s.list('w1')).length, 2);
    await s.setRole('u2', 'w1', 'admin'); // upsert, not duplicate
    assert.equal(await s.roleOf('u2', 'w1'), 'admin');
    assert.equal(await s.count('w1'), 2);
    await s.remove('u2', 'w1');
    assert.equal(await s.roleOf('u2', 'w1'), null);
    assert.equal(await s.count('w1'), 1);
    await close();
  });
}
