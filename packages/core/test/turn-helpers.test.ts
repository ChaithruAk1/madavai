import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tolerantParse, headTail, CallGuard, estTokens, stripReasoning } from '../src/index.js';

test('tolerantParse: clean JSON', () => {
  const r = tolerantParse('{"a":1}');
  assert.equal(r.ok, true);
  assert.equal(r.repaired, false);
  assert.deepEqual(r.value, { a: 1 });
});
test('tolerantParse: code fence + single quotes + trailing comma + unquoted keys', () => {
  const r = tolerantParse("```json\n{ name: 'Madav', items: [1, 2,], }\n```");
  assert.equal(r.ok, true);
  assert.equal(r.repaired, true);
  assert.deepEqual(r.value, { name: 'Madav', items: [1, 2] });
});
test('tolerantParse: extracts a balanced block from surrounding prose', () => {
  const r = tolerantParse('sure, here you go: {"x": 5} hope that helps');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { x: 5 });
});
test('tolerantParse: truly invalid -> ok:false', () => {
  const r = tolerantParse('not json at all <<<');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'arguments were not valid JSON');
});
test('headTail: short text passes through', () => {
  assert.equal(headTail('hello'), 'hello');
});
test('headTail: elides the middle of many lines', () => {
  const text = Array.from({ length: 200 }, (_, i) => 'line' + i).join('\n');
  const out = headTail(text, { headLines: 3, tailLines: 2 });
  assert.match(out, /lines omitted/);
  assert.ok(out.includes('line0') && out.includes('line199'));
});
test('CallGuard: blocks the same call on the 3rd repeat', () => {
  const g = new CallGuard();
  assert.equal(g.repeatBlocked('read', { path: 'a' }), false);
  assert.equal(g.repeatBlocked('read', { path: 'a' }), false);
  assert.equal(g.repeatBlocked('read', { path: 'a' }), true);
});
test('CallGuard: tracks and clears failure streaks', () => {
  const g = new CallGuard();
  g.noteResult('run', 'build', false);
  g.noteResult('run', 'build', false);
  assert.equal(g.failStreak('run', 'build'), 2);
  g.noteResult('run', 'build', true);
  assert.equal(g.failStreak('run', 'build'), 0);
});
test('estTokens: strings and objects', () => {
  assert.equal(estTokens('abcd'), 1);
  assert.ok(estTokens({ a: 'hello world' }) > 0);
});
test('stripReasoning: removes think tags, keeps final answer', () => {
  assert.equal(stripReasoning('<think>hmm planning</think>The answer is 42'), 'The answer is 42');
});
