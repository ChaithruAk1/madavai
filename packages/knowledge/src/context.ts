import type { ScoredChunk } from './types.js';
import { retrieve, type RetrieveDeps } from './retrieve.js';

export interface ContextOptions {
  k?: number;
  vectorWeight?: number;
  maxChars?: number;                       // budget for the assembled body (default 4000)
  header?: string;                         // instruction line prepended when context exists
  label?: (c: ScoredChunk) => string;      // how to tag each chunk's source
}

const defaultLabel = (c: ScoredChunk) => `${c.chunk.docId}#${c.chunk.index}`;

/**
 * Retrieve the top matches for a query and assemble them into ONE source-labeled context block, ready to
 * inject into the model's prompt. Packs chunks until the char budget is hit (always keeps at least the top
 * one). Deterministic given the store + embedder. Returns the block text and which chunks were used (for
 * citations / a "sources" UI). Returns empty text when nothing is found, so callers can skip injection.
 */
export async function buildContext(query: string, deps: RetrieveDeps, opts: ContextOptions = {}): Promise<{ text: string; used: ScoredChunk[] }> {
  const maxChars = Math.max(200, opts.maxChars ?? 4000);
  const label = opts.label ?? defaultLabel;
  const header = opts.header ?? "Use the following context from the user's documents to answer. When you use a passage, cite its [source] tag. If the answer isn't in the context, say so plainly.";
  const hits = await retrieve(query, deps, { k: opts.k ?? 6, ...(opts.vectorWeight !== undefined ? { vectorWeight: opts.vectorWeight } : {}) });
  const used: ScoredChunk[] = [];
  let body = '';
  for (const h of hits) {
    const block = `\n[${label(h)}]\n${h.chunk.text.trim()}\n`;
    if (body.length + block.length > maxChars && used.length) break;
    body += block;
    used.push(h);
    if (body.length >= maxChars) break;
  }
  return { text: used.length ? `${header}\n${body}` : '', used };
}
