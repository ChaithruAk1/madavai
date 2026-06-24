import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJobQueue, Worker, Scheduler } from '../src/index.js';

test('a schedule enqueues a job each interval, driven by a fake clock', async () => {
  let now = 1000;
  const q = new MemoryJobQueue(() => now);
  const s = new Scheduler(q, () => now);
  s.add('daily-report', 'project-run', { task: 'report' }, 100);
  assert.equal(await s.tick(), 0);          // nextAt=1100, not due
  now = 1100; assert.equal(await s.tick(), 1);
  now = 1150; assert.equal(await s.tick(), 0);
  now = 1200; assert.equal(await s.tick(), 1);
  assert.equal((await q.stats()).pending, 2);
});

test('missed intervals collapse into a single catch-up run (no storm)', async () => {
  let now = 0;
  const q = new MemoryJobQueue(() => now);
  const s = new Scheduler(q, () => now);
  s.add('hourly', 'ping', {}, 10);          // nextAt=10
  now = 100;                                 // 9 intervals missed
  assert.equal(await s.tick(), 1);           // enqueues ONCE
  assert.equal((await q.stats()).pending, 1);
  assert.ok(s.list()[0]!.nextAt > 100);      // advanced past now
});

test('a scheduled job runs on the worker tier end-to-end', async () => {
  let now = 0;
  const q = new MemoryJobQueue(() => now);
  const s = new Scheduler(q, () => now);
  let ran = 0;
  const w = new Worker(q, { ping: async () => { ran++; } });
  s.add('p', 'ping', {}, 5);
  now = 5; await s.tick(); await w.drain();
  assert.equal(ran, 1);
});

test('remove stops a schedule', async () => {
  let now = 0;
  const q = new MemoryJobQueue(() => now);
  const s = new Scheduler(q, () => now);
  s.add('p', 'ping', {}, 5); s.remove('p');
  now = 100; assert.equal(await s.tick(), 0);
});
