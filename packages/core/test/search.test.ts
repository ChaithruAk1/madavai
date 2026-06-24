import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProvider, parseDuckResults, searchWeb, formatResults } from '../src/index.js';

test('pickProvider: explicit, by-key, default duckduckgo', () => {
  assert.equal(pickProvider({ provider: 'brave' }), 'brave');
  assert.equal(pickProvider({ serperKey: 'k' }), 'serper');
  assert.equal(pickProvider({}), 'duckduckgo');
});

test('parseDuckResults: extracts links + titles, dedups', () => {
  const html = '<a class="result__a" href="https://a.com">Alpha</a><a class="result__a" href="https://a.com">dup</a><a class="result__a" href="https://b.com">Beta</a>';
  const r = parseDuckResults(html);
  assert.equal(r.length, 2);
  assert.equal(r[0].url, 'https://a.com');
  assert.equal(r[0].title, 'Alpha');
});

test('searchWeb: serper provider returns the unified shape', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ organic: [{ title: 'T', link: 'https://x.com', snippet: 's' }] }) });
  const r = await searchWeb('q', { fetchImpl, cfg: { serperKey: 'k' } });
  assert.deepEqual(r, [{ title: 'T', url: 'https://x.com', content: 's' }]);
});

test('searchWeb: falls back to DuckDuckGo when no provider key', async () => {
  const fetchImpl = async () => ({ text: async () => '<a class="result__a" href="https://d.com">Duck</a>' });
  const r = await searchWeb('q', { fetchImpl, cfg: {} });
  assert.equal(r[0].url, 'https://d.com');
});

test('formatResults: renders or says none', () => {
  assert.match(formatResults([{ title: 'T', url: 'https://u', content: 'c' }], 'q'), /Web results for: q[\s\S]*1\. T[\s\S]*https:\/\/u/);
  assert.equal(formatResults([], 'q'), '(no web results)');
});
