import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, MemorySessionStore, MemoryRateLimiter, MemorySyncStore, type Gateway } from '../src/index.js';

const item = (id: string, updatedAt: number) => ({ id, kind: 'message' as const, updatedAt, envelope: { v: 1 as const, custody: 'server-readable' as const, data: 'aGk=' } });
async function authed() {
  const sessions = new MemorySessionStore(); await sessions.set('tok', { userId: 'u1', email: 'a@b.co' });
  const gw: Gateway = { sessions, limiter: new MemoryRateLimiter(100, 0), sync: new MemorySyncStore() };
  return gw;
}

test('unauthenticated request is refused (401)', async () => {
  const gw = await authed();
  assert.equal((await handle(gw, { path: '/api/whoami', method: 'GET' })).status, 401);
});

test('whoami returns the session user, response schema-validated (200)', async () => {
  const gw = await authed();
  const r = await handle(gw, { path: '/api/whoami', method: 'GET', token: 'tok' });
  assert.equal(r.status, 200);
  assert.equal((r.body as any).userId, 'u1');
});

test('sync push then pull round-trips through the gateway', async () => {
  const gw = await authed();
  const push = await handle(gw, { path: '/api/sync/push', method: 'POST', token: 'tok', body: { workspaceId: 'w', items: [item('a', 1), item('b', 2)] } });
  assert.equal((push.body as any).accepted, 2);
  const pull = await handle(gw, { path: '/api/sync/pull', method: 'POST', token: 'tok', body: { workspaceId: 'w' } });
  assert.equal((pull.body as any).items.length, 2);
  assert.ok((pull.body as any).cursor > 0);
});

test('a malformed body is rejected by the shared schema (400, not a crash)', async () => {
  const gw = await authed();
  const r = await handle(gw, { path: '/api/sync/push', method: 'POST', token: 'tok', body: { workspaceId: '', items: 'nope' } });
  assert.equal(r.status, 400);
});

test('rate limiter blocks once the bucket empties (429)', async () => {
  const sessions = new MemorySessionStore(); await sessions.set('tok', { userId: 'u1' });
  const gw: Gateway = { sessions, limiter: new MemoryRateLimiter(2, 0), sync: new MemorySyncStore() };
  await handle(gw, { path: '/api/whoami', method: 'GET', token: 'tok' });
  await handle(gw, { path: '/api/whoami', method: 'GET', token: 'tok' });
  assert.equal((await handle(gw, { path: '/api/whoami', method: 'GET', token: 'tok' })).status, 429);
});
