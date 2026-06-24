import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaRuntime, type HttpClient, type PullProgress } from '../src/index.js';

function mock(opts: { up?: boolean } = { up: true }): HttpClient {
  return {
    json: async (_m: string, url: string) => {
      if (url.endsWith('/api/version')) { if (opts.up === false) throw new Error('connection refused'); return { version: '0.3.0' }; }
      if (url.endsWith('/api/tags')) return { models: [{ name: 'llama3:8b', size: 4700000000, details: { family: 'llama' } }] };
      return {};
    },
    stream: async function* () { yield JSON.stringify({ status: 'pulling', completed: 50, total: 100 }); yield JSON.stringify({ status: 'success' }); },
  };
}

test('detect: a present runtime reports available + version', async () => {
  const r = await new OllamaRuntime(mock()).detect();
  assert.equal(r.available, true); assert.equal(r.version, '0.3.0');
});
test('detect: an absent runtime reports unavailable, never throws', async () => {
  const r = await new OllamaRuntime(mock({ up: false })).detect();
  assert.equal(r.available, false);
});
test('list: maps provider models into Madav LocalModel shape', async () => {
  const m = await new OllamaRuntime(mock()).list();
  assert.equal(m[0]!.name, 'llama3:8b'); assert.equal(m[0]!.family, 'llama'); assert.equal(m[0]!.sizeBytes, 4700000000);
});
test('pull: streams progress and finishes done', async () => {
  const seen: PullProgress[] = [];
  await new OllamaRuntime(mock()).pull('llama3:8b', (p) => seen.push(p));
  assert.ok(seen.length >= 2);
  assert.equal(seen[seen.length - 1]!.done, true);
});
test('remove: issues a delete without throwing', async () => {
  await new OllamaRuntime(mock()).remove('llama3:8b');
});
