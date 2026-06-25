import type { KnowledgeDoc, Chunk, ScoredChunk, Embedder } from './types.js';
import type { KnowledgeStore } from './store.js';
import { chunkText, type ChunkOptions } from './chunk.js';
import { cosine, tokenize, keywordScore } from './score.js';

export interface IngestDeps { embed: Embedder; store: KnowledgeStore }
/** Chunk a document deterministically, embed each chunk via the injected embedder, and store it. */
export async function ingestDoc(doc: KnowledgeDoc, deps: IngestDeps, opts: ChunkOptions = {}): Promise<Chunk[]> {
  const chunks = chunkText(doc, opts);
  if (!chunks.length) return [];
  const vectors = await deps.embed(chunks.map((c) => c.text));
  chunks.forEach((c, i) => { c.vector = vectors[i]; });
  await deps.store.upsert(chunks);
  return chunks;
}

export interface RetrieveDeps { embed: Embedder; store: KnowledgeStore }
export interface RetrieveOptions { k?: number; vectorWeight?: number }
/**
 * Hybrid retrieval: blend semantic similarity (cosine of embeddings) with lexical overlap (keyword), rank,
 * and return the top-K. vectorWeight (default 0.6) balances the two; lexical catches exact terms embeddings miss.
 */
export async function retrieve(query: string, deps: RetrieveDeps, opts: RetrieveOptions = {}): Promise<ScoredChunk[]> {
  const k = Math.max(1, opts.k ?? 5);
  const w = Math.min(1, Math.max(0, opts.vectorWeight ?? 0.6));
  const all = await deps.store.all();
  if (!all.length) return [];
  const [qVec] = await deps.embed([query]);
  const qTerms = tokenize(query);
  const scored: ScoredChunk[] = all.map((chunk) => {
    const v = chunk.vector && qVec ? cosine(qVec, chunk.vector) : 0;
    const vectorScore = (v + 1) / 2;                       // map [-1,1] -> [0,1]
    const kw = keywordScore(qTerms, chunk.text);
    return { chunk, vectorScore, keywordScore: kw, score: w * vectorScore + (1 - w) * kw };
  });
  scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
  return scored.slice(0, k);
}
