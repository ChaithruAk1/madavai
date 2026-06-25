import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { ingestDoc, retrieve, tokenize, type Embedder } from '@madav/knowledge';
import { PgVectorKnowledgeStore } from '../src/knowledge-store.js';

const VOCAB = ['invoice','payment','refund','shipping','delivery','password','login','account'];
const embed: Embedder = async (texts) => texts.map((t) => { const s = new Set(tokenize(t)); return VOCAB.map((w) => (s.has(w) ? 1 : 0)); });

async function makeStore() {
  const pg = await PGlite.create({ extensions: { vector } });
  const q: any = { query: (sql: string, params?: unknown[]) => pg.query(sql, params as any[]) };
  const s = new PgVectorKnowledgeStore(q, VOCAB.length);
  await s.migrate();
  return { s, close: () => pg.close() };
}

test('pgvector store: ingest + hybrid retrieve returns the relevant chunk first (REAL pgvector via PGlite)', async () => {
  const { s, close } = await makeStore();
  await ingestDoc({ id: 'kb', text: [
    'Reset your password on the login page via account recovery.',
    '\n\n',
    'Refund policy: a refund is issued once the invoice is paid and the payment clears.',
    '\n\n',
    'Shipping and delivery take three to five business days.',
  ].join('') }, { embed, store: s }, { maxChars: 80, overlap: 10 });
  const hits = await retrieve('refund on my invoice payment', { embed, store: s }, { k: 1 });
  assert.equal(hits.length, 1);
  assert.match(hits[0]!.chunk.text.toLowerCase(), /refund/);
  await close();
});

test('pgvector store: clear(docId) removes the doc; empty search degrades cleanly', async () => {
  const { s, close } = await makeStore();
  await ingestDoc({ id: 'd', text: 'Refund and invoice payment terms apply.' }, { embed, store: s }, { maxChars: 200 });
  assert.ok((await retrieve('refund', { embed, store: s }, { k: 3 })).length >= 1);
  await s.clear('d');
  assert.equal((await retrieve('refund', { embed, store: s })).length, 0);
  await close();
});
