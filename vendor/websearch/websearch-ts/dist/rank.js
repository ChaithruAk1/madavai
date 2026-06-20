import { config } from "./config.js";
export function chunkText(text, maxChars = 500) {
    if (!text)
        return [];
    const parts = text.split(/(?<=[.!?])\s+|\n{2,}/);
    const chunks = [];
    let cur = "";
    for (let p of parts) {
        p = p.trim();
        if (!p)
            continue;
        if (cur.length + p.length + 1 <= maxChars)
            cur = (cur + " " + p).trim();
        else {
            if (cur)
                chunks.push(cur);
            if (p.length <= maxChars)
                cur = p;
            else {
                for (let i = 0; i < p.length; i += maxChars)
                    chunks.push(p.slice(i, i + maxChars));
                cur = "";
            }
        }
    }
    if (cur)
        chunks.push(cur);
    return chunks;
}
export function lexicalScore(query, text) {
    const q = new Set(query.toLowerCase().match(/\w+/g) ?? []);
    if (q.size === 0)
        return 0;
    const t = new Set(text.toLowerCase().match(/\w+/g) ?? []);
    let hit = 0;
    for (const w of q)
        if (t.has(w))
            hit++;
    return hit / q.size;
}
export function scoreChunks(query, chunks) {
    return chunks.map((c) => lexicalScore(query, c));
}
function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
// Rerank via embeddings on the user's existing OpenAI-compatible endpoint.
async function embeddingRerank(query, texts) {
    const r = await fetch(config.embeddingBaseUrl + "/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.embeddingApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.embeddingModel, input: [query, ...texts] }),
    });
    if (!r.ok)
        throw new Error("embeddings http " + r.status);
    const d = await r.json();
    const emb = d.data.map((x) => x.embedding);
    const q = emb[0];
    return texts.map((_, i) => cosine(q, emb[i + 1]));
}
// Rerank via Cohere Rerank API (best-quality cross-encoder; optional).
async function cohereRerank(query, texts) {
    const r = await fetch("https://api.cohere.com/v2/rerank", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.cohereApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.cohereModel, query, documents: texts }),
    });
    if (!r.ok)
        throw new Error("cohere http " + r.status);
    const d = await r.json();
    const scores = new Array(texts.length).fill(0);
    for (const res of d.results ?? [])
        scores[res.index] = res.relevance_score ?? 0;
    return scores;
}
// Public: returns a relevance score per text. Degrades to lexical on any failure.
export async function rerankTexts(query, texts) {
    if (!texts.length)
        return [];
    try {
        if (config.rerankerProvider === "cohere" && config.cohereApiKey)
            return await cohereRerank(query, texts);
        if (config.rerankerProvider === "openai" && config.embeddingApiKey)
            return await embeddingRerank(query, texts);
    }
    catch { /* fall back */ }
    return scoreChunks(query, texts);
}
