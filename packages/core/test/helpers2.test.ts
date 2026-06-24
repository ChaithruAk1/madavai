import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  squashStale, parseTextToolCalls, TEXT_PROTOCOL, buildCompactionMessages, applyCompaction, ctxWindowFor, type ChatMessage,
} from '../src/index.js';

test('ctxWindowFor: explicit tag, model families, exact override, default', () => {
  assert.equal(ctxWindowFor('some-model-32k'), 32000);
  assert.equal(ctxWindowFor('claude-x'), 200000);
  assert.equal(ctxWindowFor('gpt-4o'), 128000);
  assert.equal(ctxWindowFor('unknown'), 32000);
  assert.equal(ctxWindowFor('whatever', 100000), 100000);
});

test('squashStale: compresses an old long tool result, keeps recent', () => {
  const long = 'x'.repeat(500);
  const history: ChatMessage[] = [{ role: 'system', content: 's' }];
  for (let i = 0; i < 20; i++) history.push({ role: 'tool', content: long });
  squashStale(history, { keepRecent: 2, cap: 100 });
  assert.match(String(history[1].content), /older result compressed/);
  assert.equal(history[history.length - 1].content, long); // recent untouched
});

test('parseTextToolCalls: fenced JSON block -> a call, stripped', () => {
  const { calls, stripped } = parseTextToolCalls('do this\n```tool\n{"name":"read","args":{"path":"a"}}\n```\nthanks');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'read');
  assert.equal(JSON.parse(calls[0].arguments).path, 'a');
  assert.ok(!stripped.includes('```tool'));
});

test('parseTextToolCalls: XML function form with coerced args', () => {
  const { calls } = parseTextToolCalls('<function=add><parameter=x>2</parameter><parameter=ok>true</parameter></function>');
  assert.equal(calls[0].name, 'add');
  const a = JSON.parse(calls[0].arguments);
  assert.equal(a.x, 2);
  assert.equal(a.ok, true);
});

test('TEXT_PROTOCOL: lists tools and the fenced format', () => {
  const p = TEXT_PROTOCOL('read, write');
  assert.match(p, /```tool/);
  assert.match(p, /read, write/);
});

test('buildCompactionMessages: system + user with the GOAL template', () => {
  const msgs = buildCompactionMessages([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
  assert.equal(msgs[0].role, 'system');
  assert.match(msgs[1].content, /GOAL:/);
});

test('applyCompaction: keeps system, inserts notes, keeps last turns', () => {
  const history: ChatMessage[] = [{ role: 'system', content: 'S' }];
  for (let i = 0; i < 10; i++) { history.push({ role: 'user', content: 'u' + i }); history.push({ role: 'assistant', content: 'a' + i }); }
  applyCompaction(history, 'SUMMARY', 2);
  assert.equal(history[0].role, 'system');
  assert.match(String(history[1].content), /context notes/);
  assert.ok(history.length < 22);
});
