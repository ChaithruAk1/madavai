import type { Chunk, ScoredChunk } from './types.js';

/** A prepared query: the embedded vector plus the raw text and its tokens (for the lexical half). */
export interface ChunkQuery { vector: number[]; text: string; terms: string[] }

/**
 * Where chunks + vectors live. A store exposes EITHER all() (small/in-memory; retrieve() scores in JS)
 * OR search() (scalable; pushes ANN + ranking down to the backend, e.g. pgvector). One interface, swappable backend.
 */
export interface KnowledgeStore {
  upsert(chunks: Chunk[]): Promise<void>;
  clear(docId?: string): Promise<void>;
  all?(): Promise<Chunk[]>;
  search?(q: ChunkQuery, k: number, vectorWeight: number): Promise<ScoredChunk[]>;
}

export class MemoryKnowledgeStore implements KnowledgeStore {
  private chunks = new Map<string, Chunk>();
  async upsert(chunks: Chunk[]): Promise<void> { for (const c of chunks) this.chunks.set(c.id, c); }
  async all(): Promise<Chunk[]> { return [...this.chunks.values()]; }
  async clear(docId?: string): Promise<void> {
    if (!docId) { this.chunks.clear(); return; }
    for (const [k, c] of this.chunks) if (c.docId === docId) this.chunks.delete(k);
  }
}
