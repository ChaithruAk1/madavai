import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunGuard, guardStopMessage, isDeckCapable } from '../src/index.js';

test('run guard: wall-clock stop via injected clock', () => {
  let t = 1000;
  const g = createRunGuard({ maxMs: 500, now: () => t });
  assert.equal(g.check().stop, false);
  t = 1600;
  const s = g.check();
  assert.equal(s.stop, true);
  assert.equal(s.code, 'time');
});

test('run guard: loop stop after repeated signatures', () => {
  const g = createRunGuard({ maxMs: 0, maxRepeat: 3 });
  assert.equal(g.note('read:a').stop, false);
  assert.equal(g.note('read:a').stop, false);
  assert.equal(g.note('read:a').stop, true);
});

test('guardStopMessage: plain-English per code', () => {
  assert.match(guardStopMessage('time'), /too long/);
  assert.match(guardStopMessage('loop'), /repeating/);
});

test('isDeckCapable: capable vs weak vs MoE', () => {
  assert.equal(isDeckCapable('claude-opus-4'), true);
  assert.equal(isDeckCapable('gpt-4o'), true);
  assert.equal(isDeckCapable('deepseek-v3'), true);
  assert.equal(isDeckCapable('claude-haiku'), false);
  assert.equal(isDeckCapable('llama-3-8b'), false);
  assert.equal(isDeckCapable('some-a12b-moe'), false);
});
