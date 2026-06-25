/** A document the user adds to a project's knowledge base. */
export interface KnowledgeDoc { id: string; title?: string; text: string; source?: string }
/** A deterministic slice of a document, optionally carrying its embedding vector. */
export interface Chunk { id: string; docId: string; index: number; text: string; start: number; end: number; vector?: number[] }
/** A retrieved chunk with its blended + component scores (all 0..1). */
export interface ScoredChunk { chunk: Chunk; score: number; vectorScore: number; keywordScore: number }
/** The ONE model-facing seam: turn texts into vectors. Injected, never hard-coded, so any provider works. */
export type Embedder = (texts: string[]) => Promise<number[][]>;
