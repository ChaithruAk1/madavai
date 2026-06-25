import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalEmbedder, cosine, MemoryKnowledgeStore, ingestDocs, buildContext } from '../src/index.js';

test('local embedder is deterministic and L2-normalized', async () => {
  const embed = createLocalEmbedder(64);
  const [v1] = await embed(['hello world']);
  const [v2] = await embed(['hello world']);
  assert.deepEqual(v1, v2);
  const norm = Math.sqrt(v1!.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-9 || norm === 0);
});

test('local embedder scores similar text higher than unrelated text', async () => {
  const embed = createLocalEmbedder(256);
  const [a, b, c] = await embed(['refund policy for paid invoices', 'how do I request an invoice refund', 'shipping and delivery schedule']);
  assert.ok(cosine(a!, b!) > cosine(a!, c!));
});

test('RAG works end-to-end with the local embedder on REAL text (no fake vocab)', async () => {
  const embed = createLocalEmbedder(256);
  const store = new MemoryKnowledgeStore();
  await ingestDocs([
    { id: 'refunds', text: 'Refund policy: refunds are issued after the invoice is paid and cleared.' },
    { id: 'login', text: 'Reset your password from the login page using account recovery.' },
    { id: 'ship', text: 'Shipping usually takes three to five business days to arrive.' },
  ], { embed, store });
  const { used, text } = await buildContext('how do I get a refund on my invoice', { embed, store }, { k: 1 });
  assert.equal(used.length, 1);
  assert.equal(used[0]!.chunk.docId, 'refunds');
  assert.match(text, /refund/i);
});
