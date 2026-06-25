import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, type Gateway } from '../src/gateway.js';
import { MemorySessionStore, MemoryRateLimiter, MemorySyncStore, MemoryMembershipStore } from '../src/stores.js';

function makeGw(): Gateway { return { sessions: new MemorySessionStore(), limiter: new MemoryRateLimiter(), sync: new MemorySyncStore(), members: new MemoryMembershipStore() }; }
async function signIn(g: Gateway, token: string, userId: string) { await g.sessions.set(token, { userId }); }
const item = { id: 'm1', kind: 'message' as const, updatedAt: 1, envelope: { v: 1 as const, custody: 'server-readable' as const, data: 'aGk=' } };
const push = (token: string, workspaceId: string) => ({ method: 'POST', path: '/api/sync/push', token, body: { workspaceId, items: [item] } });
const pull = (token: string, workspaceId: string) => ({ method: 'POST', path: '/api/sync/pull', token, body: { workspaceId } });

test('flag OFF: open — any signed-in user can push/pull any workspace (today behavior)', async () => {
  delete process.env.MADAV_RBAC;
  const g = makeGw(); await signIn(g, 't', 'u1');
  assert.equal((await handle(g, push('t', 'someone-elses-ws'))).status, 200);
});

test('flag ON: first toucher of an EMPTY workspace becomes owner and is allowed', async () => {
  process.env.MADAV_RBAC = '1';
  const g = makeGw(); await signIn(g, 't', 'u1');
  assert.equal((await handle(g, push('t', 'w1'))).status, 200);
  assert.equal(await g.members!.roleOf('u1', 'w1'), 'owner');
  delete process.env.MADAV_RBAC;
});

test('flag ON: a NON-member of a populated workspace is FORBIDDEN (read and write)', async () => {
  process.env.MADAV_RBAC = '1';
  const g = makeGw(); await g.members!.setRole('owner1', 'team', 'owner'); await signIn(g, 't2', 'intruder');
  assert.equal((await handle(g, pull('t2', 'team'))).status, 403);
  assert.equal((await handle(g, push('t2', 'team'))).status, 403);
  delete process.env.MADAV_RBAC;
});

test('flag ON: a VIEWER can pull but cannot push', async () => {
  process.env.MADAV_RBAC = '1';
  const g = makeGw(); await g.members!.setRole('owner1', 'team', 'owner'); await g.members!.setRole('v', 'team', 'viewer');
  await signIn(g, 'tv', 'v');
  assert.equal((await handle(g, pull('tv', 'team'))).status, 200);
  assert.equal((await handle(g, push('tv', 'team'))).status, 403);
  delete process.env.MADAV_RBAC;
});

test('flag ON: a MEMBER can push', async () => {
  process.env.MADAV_RBAC = '1';
  const g = makeGw(); await g.members!.setRole('owner1', 'team', 'owner'); await g.members!.setRole('m', 'team', 'member');
  await signIn(g, 'tm', 'm');
  assert.equal((await handle(g, push('tm', 'team'))).status, 200);
  delete process.env.MADAV_RBAC;
});

test('flag ON: WhoAmI returns the users OWN workspace, owner-seeded', async () => {
  process.env.MADAV_RBAC = '1';
  const g = makeGw(); await signIn(g, 'tw', 'alice');
  const r = await handle(g, { method: 'GET', path: '/api/whoami', token: 'tw' });
  const w = (r.body as any).workspaces[0];
  assert.equal(w.id, 'ws_alice');
  assert.equal(w.role, 'owner');
  delete process.env.MADAV_RBAC;
});

test('flag OFF: WhoAmI still returns the legacy single default workspace (unchanged)', async () => {
  delete process.env.MADAV_RBAC;
  const g = makeGw(); await signIn(g, 'tw', 'alice');
  const r = await handle(g, { method: 'GET', path: '/api/whoami', token: 'tw' });
  assert.equal((r.body as any).workspaces[0].id, 'default');
});

test('health and ready are unauthenticated 200 probes (no token, no rate budget)', async () => {
  const g = makeGw();
  assert.equal((await handle(g, { method: 'GET', path: '/api/health' })).status, 200);
  assert.equal((await handle(g, { method: 'GET', path: '/api/ready' })).status, 200);
});

test('gateway emits one structured request log per call (event/path/status/ms)', async () => {
  const events: Array<{ e: string; f: any }> = [];
  const g = { ...makeGw(), log: { info: (e: string, f: any) => events.push({ e, f }) } };
  await handle(g, { method: 'GET', path: '/api/health' });
  const r = events.find((x) => x.e === 'gateway.request');
  assert.ok(r && r.f.status === 200 && r.f.path === '/api/health' && typeof r.f.ms === 'number');
});
