import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API, SyncPushRequest, SyncPullRequest } from '../src/api.js';

test('the endpoint registry pairs request + response schemas', () => {
  assert.equal(API.syncPush.method, 'POST');
  assert.equal(API.syncPush.path, '/api/sync/push');
  assert.ok(API.whoami.response && API.syncPull.request);
});

test('a valid sync push parses; an invalid one is rejected (same schema both ends)', () => {
  const good = SyncPushRequest.safeParse({ workspaceId: 'w1', items: [{ id: 'm1', kind: 'message', updatedAt: 10, envelope: { v: 1, custody: 'server-readable', data: 'aGk=' } }] });
  assert.equal(good.success, true);
  const bad = SyncPushRequest.safeParse({ workspaceId: '', items: [{ id: 'm1', kind: 'banana', updatedAt: 10, envelope: {} }] });
  assert.equal(bad.success, false);
});

test('pull defaults apply (since=0, limit=200)', () => {
  const parsed = SyncPullRequest.parse({ workspaceId: 'w1' });
  assert.equal(parsed.since, 0);
  assert.equal(parsed.limit, 200);
});
