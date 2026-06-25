import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalWorkspaceId } from '../src/index.js';

test('personalWorkspaceId is deterministic and distinct per user', () => {
  assert.equal(personalWorkspaceId('u1'), 'ws_u1');
  assert.equal(personalWorkspaceId('u1'), personalWorkspaceId('u1'));
  assert.notEqual(personalWorkspaceId('u1'), personalWorkspaceId('u2'));
});
