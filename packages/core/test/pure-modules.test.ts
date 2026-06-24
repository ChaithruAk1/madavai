import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modelFit, taskNeedsStrong, fetchWithBackoff, makeConcurrencyGate, decideLane, LANE, needsDataTools, dataToolsRule, SEARCH_ANSWER_RULE } from '../src/index.js';

test('modelFit: chat=good, weak agent=weak, weak project=recipe, capable=recommended', () => {
  assert.equal(modelFit('anything', {}, { mode: 'chat' }).fit, 'good');
  assert.equal(modelFit('claude-haiku', {}, { mode: 'team' }).fit, 'weak');
  assert.equal(modelFit('claude-haiku', {}, { mode: 'project' }).fit, 'recipe');
  assert.equal(modelFit('claude-opus-4', { agentic: true }, { mode: 'agent' }).label, 'Recommended');
  assert.equal(taskNeedsStrong({ mode: 'project' }), true);
});

test('fetchWithBackoff: retries 429 then succeeds', async () => {
  let n = 0;
  const fetchImpl = async () => { n++; return { status: n < 3 ? 429 : 200, headers: { get: () => null } }; };
  const res = await fetchWithBackoff(fetchImpl as any, 'u', {}, { tries: 3, baseMs: 1, capMs: 2 });
  assert.equal(res?.status, 200);
  assert.equal(n, 3);
});

test('concurrency gate: hands a freed slot to a waiter', async () => {
  const g = makeConcurrencyGate(1, 50);
  assert.equal(await g.acquire(), true);
  const pending = g.acquire();
  g.release();
  assert.equal(await pending, true);
});

test('decideLane: data->C, generative->A, recipe->B, ambiguous report w/ data->C', () => {
  assert.equal(decideLane({ task: 'analyze the data' }), LANE.IMPROVISE);
  assert.equal(decideLane({ task: 'make a budget' }), LANE.DOCUMENT);
  assert.equal(decideLane({ recipe: { x: 1 } }), LANE.JOB);
  assert.equal(decideLane({ task: 'make a report', hasDataFiles: false }), LANE.DOCUMENT);
  assert.equal(decideLane({ task: 'the report', hasDataFiles: true }), LANE.IMPROVISE);
});

test('needsDataTools + rules', () => {
  assert.equal(needsDataTools('make an excel spreadsheet'), true);
  assert.equal(needsDataTools('hello how are you'), false);
  assert.match(dataToolsRule({ shell: true }), /run_bash/);
  assert.match(dataToolsRule({}), /run_python/);
  assert.match(SEARCH_ANSWER_RULE, /web_search/);
});
