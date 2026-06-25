/** Cosine similarity of two vectors; 0 if either is empty/zero. Range [-1, 1]. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { const x = a[i]!, y = b[i]!; dot += x * y; na += x * x; nb += y * y; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const TOKEN = /[a-z0-9]+/g;
export function tokenize(s: string): string[] { return String(s).toLowerCase().match(TOKEN) ?? []; }

/** Keyword overlap: fraction of DISTINCT query terms present in the chunk (0..1). The lexical half of hybrid. */
export function keywordScore(queryTerms: string[], chunkText: string): number {
  const uniq = new Set(queryTerms);
  if (!uniq.size) return 0;
  const have = new Set(tokenize(chunkText));
  let hit = 0;
  for (const t of uniq) if (have.has(t)) hit++;
  return hit / uniq.size;
}
