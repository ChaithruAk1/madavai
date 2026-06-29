import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCrash, CrashBuffer } from '../src/index.js';

test('formatCrash structures an Error (capped, with kind/name/stack)', () => {
  const r = formatCrash('uncaughtException', new TypeError('boom'), { where: 'x' });
  assert.equal(r.kind, 'uncaughtException');
  assert.equal(r.name, 'TypeError');
  assert.equal(r.message, 'boom');
  assert.ok(r.id.startsWith('crash_') && r.ts.includes('T'));
  assert.deepEqual(r.meta, { where: 'x' });
});

test('formatCrash handles non-Error throws (string / object)', () => {
  assert.equal(formatCrash('react', 'just a string').message, 'just a string');
  assert.ok(formatCrash('react', { weird: true }).message.length > 0);
});

test('formatCrash caps an enormous stack', () => {
  const e = new Error('x'); e.stack = 'S'.repeat(20000);
  assert.ok((formatCrash('uncaughtException', e).stack || '').length <= 8000);
});

test('CrashBuffer keeps only the last N (ring)', () => {
  const b = new CrashBuffer(3);
  for (let i = 0; i < 5; i++) b.add(formatCrash('react', new Error('e' + i)));
  assert.equal(b.size, 3);
  assert.deepEqual(b.all().map((r) => r.message), ['e2', 'e3', 'e4']);
  b.clear(); assert.equal(b.size, 0);
});
