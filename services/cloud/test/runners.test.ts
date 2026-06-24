import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryJobQueue, Worker, projectRunnerHandler } from '../src/index.js';

const okAdapters = () => ({
  inspect: async () => [{ file: 'data.csv', rows: 3, columns: ['region', 'sales'], dtypes: { region: 'str', sales: 'int' }, sample: [] }],
  author: async () => ({ script: "import pandas as pd\nprint('ok')", outputs: ['Report.xlsx'] }),
  run: async () => ({ ok: true, produced: ['Report.xlsx'] }),
  loadJobs: async () => [], saveJobs: async () => {}, emit: () => {}, model: 'local', provider: 'p',
});

test('a "project-run" job drives the REAL @madav/core runner to completion (single-source)', async () => {
  const q = new MemoryJobQueue();
  const w = new Worker(q, { 'project-run': projectRunnerHandler({ makeAdapters: okAdapters }) });
  await q.enqueue('project-run', { task: 'Monthly report', instructions: 'sum sales by region', folder: '/ws' });
  await w.drain();
  assert.equal((await q.stats()).done, 1);
});

test('a runner that produces nothing is retried then dead-lettered (no silent loss)', async () => {
  const q = new MemoryJobQueue();
  const badAdapters = () => ({
    inspect: async () => [{ file: 'data.csv', columns: ['a'], rows: 1, sample: [] }],
    author: async () => ({ script: '', outputs: [] }),
    run: async () => ({ ok: false, error: 'no output', produced: [] }),
    loadJobs: async () => [], saveJobs: async () => {}, emit: () => {}, model: 'm', provider: 'p',
  });
  const w = new Worker(q, { 'project-run': projectRunnerHandler({ makeAdapters: badAdapters }) }, 0);
  await q.enqueue('project-run', { task: 't', instructions: 'i', folder: '/ws' }, { maxAttempts: 2 });
  await w.drain();
  assert.equal((await q.stats()).dead, 1);
});
