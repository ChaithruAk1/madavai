import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIEmbedder } from '../src/index.js';

test('embedder batches, sends model+input, and preserves input order', async () => {
  const calls: any[] = [];
  const fakeFetch = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body); calls.push(body);
    // return items OUT OF ORDER but with index, to prove ordering is honored
    const data = body.input.map((t: string, i: number) => ({ index: i, embedding: [t.length, t.charCodeAt(0) || 0] })).reverse();
    return { ok: true, status: 200, json: async () => ({ data }) };
  }) as any;
  const embed = createOpenAIEmbedder({ endpoint: 'http://x/embeddings', model: 'm', apiKey: 'k', batchSize: 2, fetchImpl: fakeFetch });
  const vecs = await embed(['aa', 'bbb', 'c']);
  assert.equal(vecs.length, 3);
  assert.deepEqual(vecs[0], [2, 97]);   // 'aa'
  assert.deepEqual(vecs[1], [3, 98]);   // 'bbb'
  assert.deepEqual(vecs[2], [1, 99]);   // 'c'
  assert.equal(calls.length, 2);        // [aa,bbb] then [c]
  assert.equal(calls[0].model, 'm');
});

test('embedder returns [] for no input (no request made)', async () => {
  let hit = false;
  const embed = createOpenAIEmbedder({ endpoint: 'http://x', model: 'm', fetchImpl: (async () => { hit = true; return { ok: true, status: 200, json: async () => ({ data: [] }) }; }) as any });
  assert.deepEqual(await embed([]), []);
  assert.equal(hit, false);
});

test('embedder throws a clean error on a failed request', async () => {
  const embed = createOpenAIEmbedder({ endpoint: 'http://x', model: 'm', fetchImpl: (async () => ({ ok: false, status: 429, text: async () => 'rate limited' })) as any });
  await assert.rejects(() => embed(['x']), /429/);
});
