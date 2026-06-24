import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJobQueue, Worker } from '../src/index.js';

test('a job runs to completion via the worker', async () => {
  const q = new MemoryJobQueue();
  const ran: string[] = [];
  const w = new Worker(q, { greet: async (p: any) => { ran.push(p.name); } });
  await q.enqueue('greet', { name: 'ada' });
  await w.drain();
  assert.deepEqual(ran, ['ada']);
  assert.equal((await q.stats()).done, 1);
});

test('a failing job retries up to maxAttempts then dead-letters (no data loss)', async () => {
  const q = new MemoryJobQueue();
  let tries = 0;
  const w = new Worker(q, { boom: async () => { tries++; throw new Error('nope'); } });
  await q.enqueue('boom', {}, { maxAttempts: 3 });
  await w.drain();
  assert.equal(tries, 3);
  assert.equal((await q.stats()).dead, 1);
});

test('a transient failure eventually succeeds', async () => {
  const q = new MemoryJobQueue();
  let n = 0;
  const w = new Worker(q, { flaky: async () => { if (++n < 2) throw new Error('transient'); } });
  await q.enqueue('flaky', {}, { maxAttempts: 5 });
  await w.drain();
  assert.equal((await q.stats()).done, 1);
});

test('a job with no registered handler is dead-lettered, not silently lost', async () => {
  const q = new MemoryJobQueue();
  const w = new Worker(q, {});
  await q.enqueue('unknown', {}, { maxAttempts: 1 });
  await w.drain();
  assert.equal((await q.stats()).dead, 1);
});

test('many jobs all complete', async () => {
  const q = new MemoryJobQueue();
  let count = 0;
  const w = new Worker(q, { inc: async () => { count++; } });
  for (let i = 0; i < 25; i++) await q.enqueue('inc', {});
  await w.drain();
  assert.equal(count, 25);
  assert.equal((await q.stats()).done, 25);
});
