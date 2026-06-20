import { config } from "./config.js";
export async function generateAnswer(query: string, contexts: string[], detailed = false): Promise<string | null> {
  if (!config.llmApiKey) return null;
  const ctx = contexts.map((c, i) => `[${i + 1}] ${c}`).join("\n\n").slice(0, 8000);
  const prompt =
    `You are a factual search-answer engine. Using ONLY the context below, write a concise, accurate answer. If insufficient, say so.\n\nQuery: ${query}\n\nContext:\n${ctx}\n\nAnswer:`;
  try {
    const r = await fetch(config.llmBaseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.llmApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.llmModel, messages: [{ role: "user", content: prompt }], max_tokens: detailed ? 500 : 200, temperature: 0.2 }),
    });
    if (!r.ok) return null;
    const d = await r.json() as any;
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}
