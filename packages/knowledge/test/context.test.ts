import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingestDocs, buildContext, tokenize, MemoryKnowledgeStore, type Embedder } from '../src/index.js';

const VOCAB = ['invoice','payment','refund','shipping','delivery','password','login','account'];
const embed: Embedder = async (texts) => texts.map((t) => { const s = new Set(tokenize(t)); return VOCAB.map((w) => (s.has(w) ? 1 : 0)); });

async function kb() {
  const store = new MemoryKnowledgeStore();
  await ingestDocs([
    { id: 'faq', text: 'Refund policy: a refund is issued once the invoice is paid and the payment clears.' },
    { id: 'help', text: 'Reset your password on the login page using account recovery.' },
    { id: 'ship', text: 'Shipping and delivery take three to five business days.' },
  ], { embed, store }, { maxChars: 200 });
  return store;
}

test('buildContext returns a source-labeled block containing the relevant passage', async () => {
  const { text, used } = await buildContext('how do I get a refund on my invoice', { embed, store: await kb() }, { k: 2 });
  assert.ok(used.length >= 1);
  assert.match(text, /refund/i);
  assert.match(text, /\[faq#0\]/);
});

test('buildContext respects the char budget (fewer chunks when tighter)', async () => {
  const store = await kb();
  const small = await buildContext('refund invoice payment shipping delivery', { embed, store }, { k: 6, maxChars: 80 });
  const large = await buildContext('refund invoice payment shipping delivery', { embed, store }, { k: 6, maxChars: 4000 });
  assert.ok(small.used.length >= 1);
  assert.ok(small.used.length <= large.used.length);
});

test('buildContext on an empty store returns empty text (caller can skip injection)', async () => {
  const { text, used } = await buildContext('anything', { embed, store: new MemoryKnowledgeStore() });
  assert.equal(text, '');
  assert.equal(used.length, 0);
});

test('ingestDocs reports the doc count and chunks everything', async () => {
  const store = new MemoryKnowledgeStore();
  const r = await ingestDocs([{ id: 'a', text: 'invoice' }, { id: 'b', text: 'refund payment' }], { embed, store });
  assert.equal(r.docs, 2);
  assert.ok(r.chunks.length >= 2);
});
