import type { Chunk } from './types.js';

/**
 * Where chunks + vectors live. In-memory now; a pgvector-backed store will implement the same interface
 * (and push scoring down to SQL) without changing retrieve()/ingestDoc() — one source, swappable backend.
 */
export interface KnowledgeStore {
  upsert(chunks: Chunk[]): Promise<void>;
  all(): Promise<Chunk[]>;
  clear(docId?: string): Promise<void>;
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
