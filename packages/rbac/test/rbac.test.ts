import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, roleAtLeast, type AccessContext, type Resource, type Role } from '../src/index.js';

const ctx = (role: Role, userId = 'u1', workspaceId = 'w1'): AccessContext => ({ userId, workspaceId, role });
const res = (type: Resource['type'], ownerId?: string, workspaceId = 'w1'): Resource => ({ type, workspaceId, ...(ownerId ? { ownerId } : {}) });

test('owner can do anything in their own workspace', () => {
  for (const a of ['read', 'write', 'delete', 'share', 'manage_members', 'manage_workspace'] as const)
    assert.equal(can(ctx('owner'), a, res('workspace')), true, a);
  assert.equal(can(ctx('owner'), 'delete', res('project', 'someone-else')), true);
});

test('admin manages members and deletes content, but cannot delete the workspace', () => {
  assert.equal(can(ctx('admin'), 'manage_members', res('member')), true);
  assert.equal(can(ctx('admin'), 'delete', res('project', 'u2')), true);
  assert.equal(can(ctx('admin'), 'manage_workspace', res('workspace')), false);
  assert.equal(can(ctx('admin'), 'delete', res('workspace')), false);
});

test('member writes and reads content and manages OWN, but not others deletes or membership', () => {
  assert.equal(can(ctx('member'), 'write', res('project')), true);
  assert.equal(can(ctx('member'), 'read', res('chat')), true);
  assert.equal(can(ctx('member', 'u1'), 'delete', res('project', 'u1')), true);
  assert.equal(can(ctx('member', 'u1'), 'delete', res('project', 'u2')), false);
  assert.equal(can(ctx('member'), 'manage_members', res('member')), false);
});

test('viewer is read-only (cannot even manage own content)', () => {
  assert.equal(can(ctx('viewer'), 'read', res('project')), true);
  assert.equal(can(ctx('viewer'), 'write', res('project')), false);
  assert.equal(can(ctx('viewer', 'u1'), 'delete', res('project', 'u1')), false);
});

test('cross-workspace access is always denied (even for an owner)', () => {
  assert.equal(can(ctx('owner', 'u1', 'w1'), 'read', res('project', undefined, 'w2')), false);
  assert.equal(can(ctx('admin', 'u1', 'w1'), 'write', res('project', 'u1', 'w2')), false);
});

test('roleAtLeast respects the hierarchy', () => {
  assert.equal(roleAtLeast('admin', 'member'), true);
  assert.equal(roleAtLeast('member', 'admin'), false);
  assert.equal(roleAtLeast('owner', 'owner'), true);
});
