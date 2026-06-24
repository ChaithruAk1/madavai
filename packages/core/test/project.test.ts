import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  datedName, outputBase, schemaSignature, decideRun, validateOutputs, extractScript, makeJob, runProjectJob, errorSignature, type SchemaFile, type Job, type ProjectAdapters,
} from '../src/index.js';

test('datedName + outputBase round-trip', () => {
  const d = new Date(2026, 5, 23, 14, 30, 5);
  assert.equal(datedName('Report.xlsx', d), 'Report_23062026_143005.xlsx');
  assert.equal(outputBase('Report_23062026_143005.xlsx'), 'report.xlsx');
});

test('schemaSignature: order/case-insensitive, changes on column change', () => {
  const a = schemaSignature([{ file: 'B.csv', columns: ['Y', 'x'] }, { file: 'A.csv', columns: ['a'] }]);
  const b = schemaSignature([{ file: 'a.csv', columns: ['A'] }, { file: 'b.csv', columns: ['x', 'y'] }]);
  assert.equal(a, b);
  assert.notEqual(a, schemaSignature([{ file: 'A.csv', columns: ['a', 'NEW'] }, { file: 'B.csv', columns: ['x', 'y'] }]));
});

test('decideRun: author when no job / instr changed; replay when same', () => {
  const schema: SchemaFile[] = [{ file: 'data.csv', columns: ['a', 'b'] }];
  const job = makeJob({ task: 'report for Jan', instructions: 'do X', schema, script: 'print(1)', outputs: ['R.xlsx'] });
  assert.equal(decideRun(null, 'do X', schema).action, 'author');
  assert.equal(decideRun(job, 'do Y (changed)', schema).action, 'author');
  assert.equal(decideRun(job, 'do X', schema).action, 'replay');
});

test('validateOutputs + extractScript', () => {
  const job = makeJob({ task: 't', outputs: ['Report.xlsx'] });
  assert.equal(validateOutputs(job, ['Report_23062026_143005.xlsx']).ok, true);
  assert.equal(validateOutputs(job, ['Other.xlsx']).ok, false);
  assert.equal(extractScript('```python\nprint(1)\n```'), 'print(1)');
  assert.equal(extractScript('```python\nprint(2)'), 'print(2)'); // truncated, no closing fence
});

const adapters = (over: Partial<ProjectAdapters> = {}): { a: ProjectAdapters; saved: Job[][] } => {
  const saved: Job[][] = [];
  const a: ProjectAdapters = {
    inspect: async () => [{ file: 'data.csv', columns: ['a', 'b'] }],
    author: async () => ({ script: 'print(1)', outputs: ['R.xlsx'] }),
    run: async () => ({ ok: true, produced: ['Madav Results/R.xlsx'] }),
    loadJobs: async () => [],
    saveJobs: async (jobs) => { saved.push(jobs); },
    model: 'm',
    provider: 'p',
    ...over,
  };
  return { a, saved };
};

test('runProjectJob: author path succeeds and saves a job', async () => {
  const { a, saved } = adapters();
  const r = await runProjectJob({ task: 'build report', folder: '/x' }, a);
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'authored');
  assert.equal(saved.length, 1);
});

test('runProjectJob: stops (not loops) when the model is stuck on the same error', async () => {
  const { a } = adapters({ run: async () => ({ ok: false, error: 'SyntaxError: unexpected EOF' }) });
  const r = await runProjectJob({ task: 'build report', folder: '/x' }, a, { maxRepair: 2 });
  assert.equal(r.ok, false);
  assert.match(String(r.error), /EOF|no output/);
});

test('runProjectJob: replays a matching saved job', async () => {
  const schema: SchemaFile[] = [{ file: 'data.csv', columns: ['a', 'b'] }];
  const job = makeJob({ task: 'build report', instructions: '', schema, script: 'print(1)', outputs: ['R.xlsx'] });
  const { a } = adapters({ loadJobs: async () => [job], run: async () => ({ ok: true, produced: ['R.xlsx'] }) });
  const r = await runProjectJob({ task: 'build report', folder: '/x' }, a);
  assert.equal(r.mode, 'replay');
});

test('errorSignature: normalizes two same failures equal', () => {
  assert.equal(errorSignature('Traceback...\nValueError: bad column "Q3"'), errorSignature('Traceback...\nValueError: bad column "Q4"'));
});
