import type { Chunk, ScoredChunk, ChunkQuery, KnowledgeStore } from '@madav/knowledge';
import { keywordScore, tokenize } from '@madav/knowledge';

/** Minimal db handle — structurally identical to pg-sync-store's; satisfied by BOTH PGlite (tests) and `pg` (prod). */
export interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; }

/** pgvector schema for a knowledge base. `dim` MUST equal the embedder's output dimension. */
export function knowledgeMigration(dim: number): string {
  return `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id        text PRIMARY KEY,
  doc_id    text NOT NULL,
  idx       integer NOT NULL,
  text      text NOT NULL,
  embedding vector(${dim})
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_doc ON knowledge_chunks (doc_id);
`;
}

const toVec = (v?: number[]) => (v && v.length ? `[${v.join(',')}]` : null);

/**
 * pgvector-backed knowledge store — same KnowledgeStore interface as the in-memory one, so retrieve()/ingestDoc()
 * never change (one source, swappable backend). search() pushes the ANN down to SQL (ORDER BY embedding <=> q),
 * then reranks the candidates with the lexical score — the standard scalable hybrid.
 */
export class PgVectorKnowledgeStore implements KnowledgeStore {
  constructor(private db: Queryable, private dim: number) {}

  async migrate(): Promise<void> {
    for (const s of knowledgeMigration(this.dim).split(';').map((x) => x.trim()).filter(Boolean)) await this.db.query(s);
  }

  async upsert(chunks: Chunk[]): Promise<void> {
    for (const c of chunks) {
      await this.db.query(
        `INSERT INTO knowledge_chunks (id, doc_id, idx, text, embedding)
         VALUES ($1,$2,$3,$4,$5::vector)
         ON CONFLICT (id) DO UPDATE SET doc_id=EXCLUDED.doc_id, idx=EXCLUDED.idx, text=EXCLUDED.text, embedding=EXCLUDED.embedding`,
        [c.id, c.docId, c.index, c.text, toVec(c.vector)],
      );
    }
  }

  async clear(docId?: string): Promise<void> {
    if (docId) await this.db.query(`DELETE FROM knowledge_chunks WHERE doc_id=$1`, [docId]);
    else await this.db.query(`DELETE FROM knowledge_chunks`);
  }

  async search(q: ChunkQuery, k: number, vectorWeight: number): Promise<ScoredChunk[]> {
    const qv = toVec(q.vector);
    if (!qv) return [];
    const candidates = Math.max(k * 5, 50);
    const r = await this.db.query(
      `SELECT id, doc_id, idx, text, 1 - (embedding <=> $1::vector) AS cos
       FROM knowledge_chunks WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector LIMIT $2`,
      [qv, candidates],
    );
    const terms = q.terms.length ? q.terms : tokenize(q.text);
    const w = Math.min(1, Math.max(0, vectorWeight));
    const scored: ScoredChunk[] = r.rows.map((row: any) => {
      const vectorScore = (Number(row.cos) + 1) / 2;
      const chunk: Chunk = { id: row.id, docId: row.doc_id, index: Number(row.idx), text: row.text, start: 0, end: 0 };
      const kw = keywordScore(terms, row.text);
      return { chunk, vectorScore, keywordScore: kw, score: w * vectorScore + (1 - w) * kw };
    });
    scored.sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index);
    return scored.slice(0, k);
  }
}
