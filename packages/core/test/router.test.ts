import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  categoryFor, isRetryable, retryAfterMs, resolveCandidates, runChain, noteFailure, onCooldown, clearCooldowns, type Candidate,
} from '../src/index.js';

test('categoryFor: image -> vision, code -> coding, data/agent -> agentic, else general', () => {
  assert.equal(categoryFor({ hasImage: true }), 'vision');
  assert.equal(categoryFor({ mode: 'build' }), 'coding');
  assert.equal(categoryFor({ needsData: true }), 'agentic');
  assert.equal(categoryFor({ mode: 'team' }), 'agentic');
  assert.equal(categoryFor({ mode: 'chat' }), 'general');
});

test('isRetryable: transient yes, auth/bad-request/billing no', () => {
  assert.equal(isRetryable({ status: 429 }), true);
  assert.equal(isRetryable({ status: 503 }), true);
  assert.equal(isRetryable({ status: 401 }), false);
  assert.equal(isRetryable({ status: 400 }), false);
  assert.equal(isRetryable({ status: 402 }), false);
});

test('retryAfterMs: numeric seconds -> ms; missing -> null', () => {
  assert.equal(retryAfterMs({ retryAfter: 2 }), 2000);
  assert.equal(retryAfterMs({ headers: { get: (k) => (k === 'retry-after' ? '3' : null) } }), 3000);
  assert.equal(retryAfterMs({}), null);
});

test('resolveCandidates: selected first, then chain; keyless/cooldown dropped', () => {
  clearCooldowns();
  const profiles = {
    p1: { apiKey: 'k', baseUrl: 'https://api.one', name: 'One', kind: 'openai' },
    p2: { apiKey: '', baseUrl: 'https://api.two', name: 'Two' }, // no key -> dropped
  };
  const selected = { id: 'p1', model: 'm-fast', baseUrl: 'https://api.one', apiKey: 'k', name: 'One' };
  const routing = { general: ['p1::m-strong', 'p2::m-x'] };
  const out = resolveCandidates({ category: 'general', selected, profiles, routing });
  assert.equal(out[0]!.model, 'm-fast'); // selected slot 0
  assert.ok(out.some((c) => c.model === 'm-strong')); // chain resolved
  assert.ok(!out.some((c) => c.model === 'm-x')); // keyless dropped
});

test('runChain: returns first success', async () => {
  const cands: Candidate[] = [{ key: 'a', model: 'm', baseUrl: 'u', kind: 'openai', name: 'A', ref: 'a::m' }];
  const r = await runChain({ candidates: cands, attempt: async () => 'ok' });
  assert.equal(r, 'ok');
});

test('runChain: falls back to next on failure and fires onReroute', async () => {
  clearCooldowns();
  const cands: Candidate[] = [
    { key: 'x|1', model: 'm1', baseUrl: 'u1', kind: 'openai', name: 'X', ref: 'x::m1' },
    { key: 'y|2', model: 'm2', baseUrl: 'u2', kind: 'openai', name: 'Y', ref: 'y::m2' },
  ];
  let rerouted = false;
  const r = await runChain({
    candidates: cands,
    attempt: async (c) => { if (c.model === 'm1') throw { status: 429 }; return 'second'; },
    onReroute: () => { rerouted = true; },
  });
  assert.equal(r, 'second');
  assert.equal(rerouted, true);
});

test('runChain: throws an honest exhausted error led by the first failure', async () => {
  clearCooldowns();
  const cands: Candidate[] = [
    { key: 'a|1', model: 'm1', baseUrl: 'u1', kind: 'openai', name: 'Primary', ref: 'a::m1' },
    { key: 'b|2', model: 'm2', baseUrl: 'u2', kind: 'openai', name: 'Backup', ref: 'b::m2' },
  ];
  await assert.rejects(
    () => runChain({ candidates: cands, attempt: async () => { throw { status: 429 }; } }),
    (e: Error) => /Primary m1 is rate-limited/.test(e.message) && /backup model also failed/.test(e.message),
  );
});

test('runChain: abort surfaces immediately (no fallback)', async () => {
  const cands: Candidate[] = [
    { key: 'a', model: 'm1', baseUrl: 'u1', kind: 'openai', name: 'A', ref: 'a::m1' },
    { key: 'b', model: 'm2', baseUrl: 'u2', kind: 'openai', name: 'B', ref: 'b::m2' },
  ];
  let attempts = 0;
  await assert.rejects(
    () => runChain({ candidates: cands, attempt: async () => { attempts++; throw { name: 'AbortError' }; } }),
    (e: { name?: string }) => e.name === 'AbortError',
  );
  assert.equal(attempts, 1);
});

test('cooldown: note then on; clear resets', () => {
  clearCooldowns();
  noteFailure('k1', 60000);
  assert.equal(onCooldown('k1'), true);
  clearCooldowns();
  assert.equal(onCooldown('k1'), false);
});
