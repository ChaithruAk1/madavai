// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Browser-side chat transport — an ESM mirror of electron/providers.cjs so the WEB app streams
// from the same OpenAI-/Anthropic-compatible endpoints the desktop app uses. Calls go straight
// from the browser to the user's chosen provider (keys never touch our servers), exactly like
// the desktop "bring your own key" model. Some providers don't send CORS headers for browser
// calls; those will fail in the browser and are best used from the desktop app.

export function stripReasoning(str) {
  if (!str) return str || "";
  let s = String(str).replace(/<think>[\s\S]*?<\/think>/gi, "");
  const i = s.lastIndexOf("</think>");
  if (i !== -1) s = s.slice(i + "</think>".length);
  s = s.replace(/<think>[\s\S]*$/i, "");
  return s.replace(/^\s+/, "");
}

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

async function ensureOk(res, provider) {
  if (res.ok) return;
  let detail = "";
  try { detail = (await res.text()).slice(0, 400); } catch {}
  if (/image input|support image|no endpoints found that support image|does not support image|vision/i.test(detail)) {
    const err = new Error("This model doesn't support image handling. Switch to a vision-capable model (e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-2.0-flash) and resend the image.");
    err.code = "no_vision"; throw err;
  }
  const err = new Error(`${provider} ${res.status}: ${detail || res.statusText}`);
  err.code = res.status === 429 ? "rate_limit" : res.status === 401 ? "auth" : "http_error";
  throw err;
}

export function apiBase(baseUrl) {
  const b = (baseUrl || "").replace(/\/$/, "");
  return /\/v\d|\/openai/.test(b) ? b : b + "/v1";
}
const chatUrl = (b) => apiBase(b) + "/chat/completions";
const modelsUrl = (b) => apiBase(b) + "/models";

// Stream deltas live (web wants incremental text). We still strip a trailing reasoning block
// from the buffered result and emit a correction if needed.
async function streamOpenAI(profile, messages, { onDelta, signal, proxy }) {
  const res = proxy
    ? await fetch(proxy.base + "/proxy/chat", { method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + proxy.token },
        body: JSON.stringify({ kind: "openai", baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, messages }) })
    : await fetch(chatUrl(profile.baseUrl), { method: "POST", signal,
        headers: { "Content-Type": "application/json", ...(profile.apiKey ? { Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}) },
        body: JSON.stringify({ model: profile.model, messages, stream: true }) });
  await ensureOk(res, "OpenAI-compatible");
  let raw = "";
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) { raw += delta; onDelta(delta, raw); }
  }
  return { text: stripReasoning(raw) };
}

async function streamAnthropic(profile, messages, { onDelta, signal, proxy }) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const turns = messages.filter((m) => m.role !== "system");
  const res = proxy
    ? await fetch(proxy.base + "/proxy/chat", { method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + proxy.token },
        body: JSON.stringify({ kind: "anthropic", baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, messages }) })
    : await fetch(profile.baseUrl.replace(/\/$/, "") + "/v1/messages", { method: "POST", signal,
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true",
          ...(profile.apiKey ? { "x-api-key": (profile.apiKey || "").trim() } : {}) },
        body: JSON.stringify({ model: profile.model, max_tokens: 4096, system, messages: turns, stream: true }) });
  await ensureOk(res, "Anthropic-compatible");
  let text = "";
  for await (const data of sseLines(res)) {
    let json; try { json = JSON.parse(data); } catch { continue; }
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") { text += json.delta.text; onDelta(json.delta.text, text); }
    if (json.type === "message_stop") break;
  }
  return { text };
}

export function streamChat(profile, messages, opts) {
  return profile.kind === "anthropic" ? streamAnthropic(profile, messages, opts) : streamOpenAI(profile, messages, opts);
}

const ANTHROPIC_MODELS = ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"];

export async function listModels(profile, opts) {
  if (!profile || !profile.baseUrl) return [];
  if (profile.kind === "anthropic" && !(profile.apiKey || "").trim()) return [...ANTHROPIC_MODELS];
  const proxy = opts && opts.proxy;
  try {
    let json;
    if (proxy) {
      const res = await fetch(proxy.base + "/proxy/models", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + proxy.token },
        body: JSON.stringify({ kind: profile.kind, baseUrl: profile.baseUrl, apiKey: profile.apiKey }) });
      if (!res.ok) return profile.kind === "anthropic" ? [...ANTHROPIC_MODELS] : [];
      json = await res.json();
    } else {
      const headers = {};
      if (profile.kind === "anthropic") { headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; if (profile.apiKey) headers["x-api-key"] = (profile.apiKey || "").trim(); }
      else if (profile.apiKey) headers["Authorization"] = `Bearer ${(profile.apiKey || "").trim()}`;
      const res = await fetch(modelsUrl(profile.baseUrl), { headers });
      if (!res.ok) return profile.kind === "anthropic" ? [...ANTHROPIC_MODELS] : [];
      json = await res.json();
    }
    const rows = json.data || json.models || json || [];
    return rows.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean).sort();
  } catch { return profile.kind === "anthropic" ? [...ANTHROPIC_MODELS] : []; }
}

// OpenAI-compatible streaming WITH tools — streams text deltas and accumulates tool_calls.
// Optional proxy (same shape as streamChat) to reach providers the browser can't call directly.
export async function streamChatTools(profile, messages, tools, { onDelta, signal, proxy }) {
  const res = proxy
    ? await fetch(proxy.base + "/proxy/chat", { method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + proxy.token },
        body: JSON.stringify({ kind: "openai", baseUrl: profile.baseUrl, apiKey: profile.apiKey, model: profile.model, messages, tools, tool_choice: "auto" }) })
    : await fetch(chatUrl(profile.baseUrl), { method: "POST", signal,
        headers: { "Content-Type": "application/json", ...(profile.apiKey ? { Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}) },
        body: JSON.stringify({ model: profile.model, messages, tools, tool_choice: "auto", stream: true }) });
  await ensureOk(res, "OpenAI-compatible");
  let content = "";
  const calls = {}; // index -> { id, name, arguments }
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices && json.choices[0] && json.choices[0].delta;
    if (!delta) continue;
    if (delta.content) { content += delta.content; onDelta && onDelta(delta.content); }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const i = tc.index != null ? tc.index : 0;
        calls[i] = calls[i] || { id: "", name: "", arguments: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function && tc.function.name) calls[i].name += tc.function.name;
        if (tc.function && tc.function.arguments) calls[i].arguments += tc.function.arguments;
      }
    }
  }
  const toolCalls = Object.values(calls).filter((c) => c.name);
  toolCalls.forEach((c, i) => { if (!c.id) c.id = "call_" + i + "_" + Math.random().toString(36).slice(2, 7); });
  return { content, toolCalls };
}

export async function ping(profile) {
  if (!profile || !profile.baseUrl) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const headers = {};
    if (profile.kind === "anthropic") { headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; if (profile.apiKey) headers["x-api-key"] = (profile.apiKey || "").trim(); }
    else if (profile.apiKey) headers["Authorization"] = `Bearer ${(profile.apiKey || "").trim()}`;
    await fetch(modelsUrl(profile.baseUrl), { headers, signal: ctrl.signal });
    clearTimeout(t); return true;
  } catch { clearTimeout(t); return false; }
}
