// Model speed check — sends one prompt to a model and times the streamed reply.
// Metrics: TTFT (time to first token), tokens/sec (output throughput), total round trip.
// Cloud-only by design. Reuses no chat history — a clean single-shot measurement.

async function* sseLines(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

function chatUrl(base, kind) {
  let b = (base || "").trim().replace(/\/+$/, "");
  if (kind === "anthropic") return b + "/v1/messages";
  if (/\/chat\/completions$/.test(b)) return b;
  if (!/\/v1$|\/v1beta|\/openai$/.test(b)) b += "/v1";
  return b + "/chat/completions";
}

async function runTest(profile, model, prompt, maxTokens, signal) {
  const key = (profile.apiKey || "").trim();
  const url = chatUrl(profile.baseUrl, profile.kind);
  const headers = { "Content-Type": "application/json" };
  const body = { model, max_tokens: maxTokens || 256, messages: [{ role: "user", content: prompt }], stream: true };
  if (profile.kind === "anthropic") {
    headers["anthropic-version"] = "2023-06-01";
    if (key) headers["x-api-key"] = key;
  } else {
    if (key) headers["Authorization"] = "Bearer " + key;
    body.stream_options = { include_usage: true }; // ask OpenAI-compatible APIs for token usage
  }

  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, error: "cancelled" };
    return { ok: false, error: "network: " + ((e && e.message) || e) };
  }
  if (!res.ok) { const b = (await res.text()).slice(0, 180); return { ok: false, error: res.status + " " + b }; }

  let tFirst = 0, chars = 0, usageTokens = 0;
  try {
    for await (const data of sseLines(res)) {
      if (data === "[DONE]") break;
      let j; try { j = JSON.parse(data); } catch { continue; }
      if (profile.kind === "anthropic") {
        if (j.type === "content_block_delta" && j.delta && j.delta.text) { if (!tFirst) tFirst = Date.now(); chars += j.delta.text.length; }
        if (j.type === "message_delta" && j.usage && j.usage.output_tokens) usageTokens = j.usage.output_tokens;
        if (j.type === "message_stop") break;
      } else {
        const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (d) { if (!tFirst) tFirst = Date.now(); chars += d.length; }
        if (j.usage && j.usage.completion_tokens) usageTokens = j.usage.completion_tokens;
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, error: "cancelled" };
    return { ok: false, error: "stream: " + ((e && e.message) || e) };
  }

  const tEnd = Date.now();
  const tokens = usageTokens || Math.max(1, Math.round(chars / 4));
  // Generation window = first→last token. If it's too small to measure (response arrived
  // in one buffered burst), fall back to total round trip so tok/s stays realistic.
  const genMs = tFirst ? tEnd - tFirst : tEnd - t0;
  const effMs = genMs >= 80 ? genMs : (tEnd - t0);
  return {
    ok: true,
    ttftMs: tFirst ? tFirst - t0 : tEnd - t0,
    totalMs: tEnd - t0,
    tokens,
    tps: +(tokens / Math.max(0.05, effMs / 1000)).toFixed(1),
    estimated: !usageTokens,
  };
}

module.exports = { runTest };
