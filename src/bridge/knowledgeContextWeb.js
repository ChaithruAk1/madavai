// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// WEB RAG adapter — the single-source twin of electron/knowledgeContext.cjs. Ingests a project's in-memory
// text knowledge via the SAME @madav/knowledge engine (local embedder, no API) and returns a prompt-ready
// context block. Desktop reads a folder; web reads localStorage knowledge — one engine, identical result.
import { createLocalEmbedder, MemoryKnowledgeStore, ingestDocs, buildContext } from "@madav/knowledge";

// docs: [{ name, content }] — the project's text knowledge items. Returns a context string ("" if none/no match).
export async function buildProjectContextWeb(query, docs, opts = {}) {
  const list = (docs || []).filter((d) => d && d.content).map((d) => ({ id: d.name || "doc", text: String(d.content) }));
  if (!query || !list.length) return "";
  const embed = createLocalEmbedder(256);
  const store = new MemoryKnowledgeStore();
  await ingestDocs(list, { embed, store });
  const { text } = await buildContext(query, { embed, store }, { k: opts.k ?? 6, maxChars: opts.maxChars ?? 4000 });
  return text;
}
