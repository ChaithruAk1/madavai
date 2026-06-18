// server/provider-call.mjs — ONE non-streaming chat completion -> text. Used by the scheduler (S3b) to run a
// scheduled task on the Starter house key or the user's sealed BYO key. No streaming, no tools; output-capped
// upstream via max_tokens. fetchImpl is injectable for tests. Mirrors the request shapes of /starter + /proxy/chat.
const OUT_TOKENS = 2000;
function openaiBase(baseUrl) { const bb = String(baseUrl || "").replace(/\/$/, ""); return /\/v\d|\/openai/.test(bb) ? bb : bb + "/v1"; }
async function bodyText(r) { try { return (await r.text()).slice(0, 200); } catch { return ""; } }

export async function completeOnce({ kind, baseUrl, apiKey, model, prompt, headers = {}, maxTokens = OUT_TOKENS, fetchImpl } = {}) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!f) throw new Error("no fetch available");
  if (!model) throw new Error("model required");
  if (!prompt) throw new Error("prompt required");
  if (kind === "anthropic") {
    const url = String(baseUrl || "").replace(/\/$/, "") + "/v1/messages";
    const r = await f(url, { method: "POST",
      headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", ...(apiKey ? { "x-api-key": apiKey } : {}), ...headers },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], stream: false }) });
    if (!r.ok) throw new Error("provider " + r.status + ": " + (await bodyText(r)));
    const j = await r.json();
    return (Array.isArray(j && j.content) ? j.content.map((c) => (c && c.text) || "").join("") : "") || "";
  }
  const url = openaiBase(baseUrl) + "/chat/completions";
  const r = await f(url, { method: "POST",
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}), ...headers },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, stream: false }) });
  if (!r.ok) throw new Error("provider " + r.status + ": " + (await bodyText(r)));
  const j = await r.json();
  return (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
}
