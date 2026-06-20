export function chunkText(text: string, maxChars = 500): string[] {
  if (!text) return [];
  const parts = text.split(/(?<=[.!?])\s+|\n{2,}/);
  const chunks: string[] = [];
  let cur = "";
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    if (cur.length + p.length + 1 <= maxChars) cur = (cur + " " + p).trim();
    else {
      if (cur) chunks.push(cur);
      if (p.length <= maxChars) cur = p;
      else { for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars)); cur = ""; }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
export function lexicalScore(query: string, text: string): number {
  const q = new Set(query.toLowerCase().match(/\w+/g) ?? []);
  if (q.size === 0) return 0;
  const t = new Set(text.toLowerCase().match(/\w+/g) ?? []);
  let hit = 0;
  for (const w of q) if (t.has(w)) hit++;
  return hit / q.size;
}
export function scoreChunks(query: string, chunks: string[]): number[] {
  return chunks.map((c) => lexicalScore(query, c));
}
