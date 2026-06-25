import type { KnowledgeDoc, Chunk } from './types.js';

export interface ChunkOptions { maxChars?: number; overlap?: number }

/**
 * Deterministic chunking. Packs text into ~maxChars windows with a fixed character overlap, preferring to
 * end on a paragraph or sentence boundary in the last 40% of each window. Same input -> same chunks, always.
 */
export function chunkText(doc: KnowledgeDoc, opts: ChunkOptions = {}): Chunk[] {
  const maxChars = Math.max(200, opts.maxChars ?? 1200);
  const overlap = Math.min(Math.max(0, opts.overlap ?? 200), Math.floor(maxChars / 2));
  const text = doc.text ?? '';
  if (!text.trim()) return [];
  const chunks: Chunk[] = [];
  let start = 0, index = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);
    if (end < text.length) {
      const windowStart = start + Math.floor(maxChars * 0.6);
      const slice = text.slice(windowStart, end);
      const para = slice.lastIndexOf('\n\n');
      const sent = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('.\n'));
      const cut = para >= 0 ? para : sent;
      if (cut >= 0) end = windowStart + cut + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) { chunks.push({ id: `${doc.id}#${index}`, docId: doc.id, index, text: piece, start, end }); index++; }
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
