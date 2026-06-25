import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, cosine, keywordScore, tokenize, MemoryKnowledgeStore, ingestDoc, retrieve } from '../src/index.js';

// A tiny deterministic bag-of-words embedder over a fixed vocab -> the retrieval core needs NO real model to test.
const VOCAB = ['invoice','payment','refund','shipping','delivery','password','login','account','revenue','tax'];
const embed = async (texts: string[]) => texts.map((t) => { const toks = new Set(tokenize(t)); return VOCAB.map((w) => (toks.has(w) ? 1 : 0)); });

test('chunking is deterministic and overlaps to avoid cutting context', () => {
  const doc = { id: 'd1', text: 'A'.repeat(3000) };
  const a = chunkText(doc, { maxChars: 1000, overlap: 100 });
  const b = chunkText(doc, { maxChars: 1000, overlap: 100 });
  assert.deepEqual(a.map((c) => [c.start, c.end]), b.map((c) => [c.start, c.end]));
  assert.ok(a.length >= 3 && a[0]!.docId === 'd1');
});

test('empty / whitespace text yields no chunks (clean, no crash)', () => {
  assert.equal(chunkText({ id: 'x', text: '   ' }).length, 0);
});

test('cosine + keyword scoring behave as expected', () => {
  assert.ok(cosine([1,0,0],[1,0,0]) > 0.99);
  assert.equal(cosine([1,0],[0,1]), 0);
  assert.equal(keywordScore(['invoice','refund'], 'this invoice needs a refund'), 1);
  assert.ok(keywordScore(['invoice','refund'], 'invoice only') < 1);
});

test('hybrid retrieval returns the most relevant chunk first', async () => {
  const store = new MemoryKnowledgeStore();
  await ingestDoc({ id: 'kb', text: [
    'To reset your password go to the login page and use account recovery.',
    '\n\n',
    'Refund policy: a refund is issued once the invoice is paid and the payment clears.',
    '\n\n',
    'Shipping and delivery usually take three to five business days.',
  ].join('') }, { embed, store }, { maxChars: 90, overlap: 10 });
  const hits = await retrieve('how do I get a refund on my invoice payment', { embed, store }, { k: 1 });
  assert.equal(hits.length, 1);
  assert.match(hits[0]!.chunk.text.toLowerCase(), /refund/);
});

test('retrieval over an empty store is clean (no crash, no results)', async () => {
  assert.equal((await retrieve('anything', { embed, store: new MemoryKnowledgeStore() })).length, 0);
});
