import type { Embedder } from './types.js';

/** Config for an OpenAI-compatible embeddings endpoint. Works for any provider that speaks /embeddings. */
export interface OpenAIEmbedderConfig {
  endpoint: string;                    // full URL, e.g. https://api.provider.com/v1/embeddings (or a house-key proxy)
  model: string;
  apiKey?: string;
  dimensions?: number;                 // optional output-dimension reduction (provider-dependent)
  batchSize?: number;                  // texts per request (default 64)
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;            // injectable so the adapter tests with NO network
}

/**
 * Build an Embedder over an OpenAI-compatible /embeddings API. Batched, order-preserving, clean errors.
 * fetch is universal (Node 18+ and browsers), so this single adapter serves web and desktop — the surface
 * only supplies the endpoint + key (its own secret storage / house-key proxy).
 */
export function createOpenAIEmbedder(cfg: OpenAIEmbedderConfig): Embedder {
  const doFetch = cfg.fetchImpl ?? fetch;
  const batchSize = Math.max(1, cfg.batchSize ?? 64);
  return async (texts: string[]): Promise<number[][]> => {
    if (!texts.length) return [];
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const body: Record<string, unknown> = { model: cfg.model, input: batch };
      if (cfg.dimensions) body.dimensions = cfg.dimensions;
      const res = await doFetch(cfg.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
          ...(cfg.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`embeddings request failed: ${res.status} ${detail}`.slice(0, 300));
      }
      const json = (await res.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
      const data = Array.isArray(json?.data) ? json.data : [];
      // Preserve input order: APIs may return out of order, but each item carries its index.
      const ordered: number[][] = new Array(batch.length).fill(0).map(() => []);
      data.forEach((d, k) => { const at = typeof d.index === 'number' ? d.index : k; ordered[at] = Array.isArray(d.embedding) ? d.embedding : []; });
      out.push(...ordered);
    }
    return out;
  };
}


/**
 * A deterministic, dependency-free Embedder via character n-gram FEATURE HASHING (signed buckets, L2-normalized).
 * No model or network — so RAG works out of the box on any setup. Captures lexical/character similarity
 * (shared words, substrings, typos). Swap in createOpenAIEmbedder when deeper semantic matching is wanted.
 */
export function createLocalEmbedder(dim = 256, ngram = 3): Embedder {
  const D = Math.max(16, dim | 0);
  const N = Math.max(2, ngram | 0);
  const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const vec = (text: string): number[] => {
    const v = new Array<number>(D).fill(0);
    const t = ` ${String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()} `;
    for (let i = 0; i + N <= t.length; i++) { const h = hash(t.slice(i, i + N)); v[h % D] += (h & 1) ? 1 : -1; }
    let norm = 0; for (const x of v) norm += x * x; norm = Math.sqrt(norm);
    return norm ? v.map((x) => x / norm) : v;
  };
  return async (texts: string[]) => texts.map(vec);
}
