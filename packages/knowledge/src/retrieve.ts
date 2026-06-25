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

/** Ingest many documents at once (chunk + embed + store each). Returns all chunks and the doc count. */
export async function ingestDocs(docs: KnowledgeDoc[], deps: IngestDeps, opts: ChunkOptions = {}): Promise<{ chunks: Chunk[]; docs: number }> {
  const all: Chunk[] = [];
  for (const d of docs) all.push(...(await ingestDoc(d, deps, opts)));
  return { chunks: all, docs: docs.length };
}

export interface RetrieveDeps { embed: Embedder; store: KnowledgeStore }
export interface RetrieveOptions { k?: number; vectorWeight?: number }
/**
 * Hybrid retrieval: blend semantic similarity (cosine) with lexical overlap (keyword), rank, return top-K.
 * If the store can search() it pushes ANN + ranking to the backend (scales); otherwise we score all() in JS.
 */
export async function retrieve(query: string, deps: RetrieveDeps, opts: RetrieveOptions = {}): Promise<ScoredChunk[]> {
  const k = Math.max(1, opts.k ?? 5);
  const w = Math.min(1, Math.max(0, opts.vectorWeight ?? 0.6));
  const terms = tokenize(query);
  if (deps.store.search) {
    const [qVec] = await deps.embed([query]);
    return deps.store.search({ vector: qVec ?? [], text: query, terms }, k, w);
  }
  if (deps.store.all) {
    const all = await deps.store.all();
    if (!all.length) return [];
    const [qVec] = await deps.embed([query]);
    const scored: ScoredChunk[] = all.map((chunk) => {
      const v = chunk.vector && qVec ? cosine(qVec, chunk.vector) : 0;
      const vectorScore = (v + 1) / 2;
      const kw = keywordScore(terms, chunk.text);
      return { chunk, vectorScore, keywordScore: kw, score: w * vectorScore + (1 - w) * kw };
    });
    scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
    return scored.slice(0, k);
  }
  return [];
}
