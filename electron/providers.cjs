// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Chat transport: stream from OpenAI- or Anthropic-compatible endpoints.
// Node 18+/Electron has global fetch + ReadableStream. No deps.

// Remove chain-of-thought that reasoning models dump into `content`. Handles:
//  - matched <think>…</think> blocks
//  - an orphan </think> with no opener (everything before it is reasoning)
//  - an orphan <think> with no close (drop from it to the end)
function stripReasoning(str) {
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

// Map a provider profile (or a fallback label string) to a clean, user-facing provider name + where to top up.
function providerInfo(prov) {
  if (!prov) return { label: "your AI provider", topup: "" };
  if (typeof prov === "string") return { label: prov, topup: "" };
  const b = String(prov.baseUrl || "").toLowerCase(), nm = String(prov.name || "").trim();
  if (/openrouter\.ai/.test(b)) return { label: "OpenRouter", topup: "openrouter.ai" };
  if (/api\.anthropic\.com/.test(b)) return { label: "Anthropic", topup: "console.anthropic.com" };
  if (/api\.openai\.com/.test(b)) return { label: "OpenAI", topup: "platform.openai.com" };
  if (/integrate\.api\.nvidia|nvidia|\bnim\b/.test(b)) return { label: "NVIDIA NIM", topup: "build.nvidia.com" };
  if (/generativelanguage|googleapis/.test(b)) return { label: "Google AI", topup: "aistudio.google.com" };
  if (/groq\.com/.test(b)) return { label: "Groq", topup: "console.groq.com" };
  if (/together\.(ai|xyz)/.test(b)) return { label: "Together AI", topup: "together.ai" };
  if (/mistral\.ai/.test(b)) return { label: "Mistral", topup: "console.mistral.ai" };
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0|:11434|:1234|ollama|lm.?studio/.test(b)) return { label: "your local model", topup: "" };
  return { label: nm || "your AI provider", topup: "" };
}
async function ensureOk(res, prov) {
  if (res.ok) return;
  let detail = "";
  try { detail = (await res.text()).slice(0, 400); } catch {}
  // Friendly message when the chosen model can't accept images (very common cause of confusion).
  if (/image input|support image|no endpoints found that support image|does not support image|vision/i.test(detail)) {
    const err = new Error("This model doesn't support image handling. Switch to a vision-capable model (e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet, google/gemini-2.0-flash) and resend the image.");
    err.code = "no_vision";
    throw err;
  }
  // Clean, key-free, provider-NAMED messages. Never surface the raw body — it can carry the API key in a URL.
  const { label, topup } = providerInfo(prov);
  const at = topup ? " at " + topup : "";
  const st = res.status;
  let msg;
  if (st === 402 || /requires more credits|insufficient|payment required|quota|billing|afford/i.test(detail)) {
    msg = "Your " + label + " balance is too low for this request. Add credits" + at + ", pick a less expensive model, or ask for a shorter result.";
  } else if (st === 401 || st === 403) {
    msg = "Your " + label + " sign-in was rejected. Open Settings and re-check your " + label + " key.";
  } else if (st === 429) {
    msg = label + " is busy right now (rate limit). Wait a few seconds and try again.";
  } else if (st === 404) {
    msg = "That model isn't available on " + label + ". Pick a different model.";
  } else if (st >= 500) {
    msg = label + " had a server error. Please try again in a moment.";
  } else {
    msg = "Couldn't complete that request on " + label + ". Try again, or switch models.";
  }
  const err = new Error(msg);
  err.code = st === 429 ? "rate_limit" : (st === 401 || st === 403) ? "auth" : st === 402 ? "credits" : "http_error";
  err.status = st; err.raw = detail; // raw kept for logs only, never shown
  throw err;
}

// Resolve the OpenAI-style API base. If the baseUrl already carries a version/openai
// path (e.g. Gemini's /v1beta/openai, or a user-typed .../v1), use it as-is; else add /v1.
function apiBase(baseUrl) {
  const b = (baseUrl || "").replace(/\/$/, "");
  return /\/v\d|\/openai/.test(b) ? b : b + "/v1";
}
const chatUrl = (b) => apiBase(b) + "/chat/completions";
const modelsUrl = (b) => apiBase(b) + "/models";

// OpenAI-compatible: POST {base}/chat/completions
// Shared rate-limit retry (core/backoff.js) — cached ESM import so a transient 429/503 retries with
// backoff instead of failing the turn. Same logic the server uses for its shared key.
let _backoffP = null;
const loadBackoff = () => (_backoffP ||= import("../core/backoff.js"));
async function streamOpenAI(profile, messages, { onDelta, signal, maxTokens }) {
  const url = chatUrl(profile.baseUrl);
  const { fetchWithBackoff } = await loadBackoff();
  const res = await fetchWithBackoff(fetch, url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, messages, stream: true, max_tokens: maxTokens || 16384 }),
  }, { tries: 3 });
  await ensureOk(res, profile);

  // Buffer the whole reply, strip any chain-of-thought, then emit the clean text.
  // Reasoning models emit their monologue into `content` (often a bare </think> with
  // no opener), which can't be detected mid-stream — so we clean once at the end.
  let raw = "";
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices?.[0]?.delta?.content; // ignore delta.reasoning_content on purpose
    if (delta) raw += delta;
  }
  const clean = stripReasoning(raw);
  if (clean) onDelta(clean);
  return { text: clean };
}

// Anthropic-compatible: POST {baseUrl}/v1/messages (works for the free-cc proxy too)
async function streamAnthropic(profile, messages, { onDelta, signal }) {
  const url = profile.baseUrl.replace(/\/$/, "") + "/v1/messages";
  // Anthropic wants system separate from the turn list.
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n") || undefined;
  const turns = messages.filter((m) => m.role !== "system");
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      ...(profile.apiKey ? { "x-api-key": (profile.apiKey || "").trim(), Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, max_tokens: 16384, system, messages: turns, stream: true }),
  });
  await ensureOk(res, profile);

  let text = "";
  for await (const data of sseLines(res)) {
    let json; try { json = JSON.parse(data); } catch { continue; }
    if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
      text += json.delta.text; onDelta(json.delta.text);
    }
    if (json.type === "message_stop") break;
  }
  return { text };
}

function _streamChat(profile, messages, opts) {
  return profile.kind === "anthropic"
    ? streamAnthropic(profile, messages, opts)
    : streamOpenAI(profile, messages, opts);
}

// Current Anthropic model ids — fallback list when no API key is set yet
// (can't query /v1/models without one).
const ANTHROPIC_MODELS = [
  "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001",
  "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest",
];

// List models from the provider's /v1/models (best-effort).
async function listModels(profile) {
  if (!profile || !profile.baseUrl) return [];
  // Anthropic without a key yet: can't query the API — return the known model set.
  if (profile.kind === "anthropic" && !(profile.apiKey || "").trim()) return [...ANTHROPIC_MODELS];
  const url = modelsUrl(profile.baseUrl);
  const headers = {};
  if (profile.kind === "anthropic") {
    headers["anthropic-version"] = "2023-06-01";
    if (profile.apiKey) headers["x-api-key"] = (profile.apiKey || "").trim();
  } else if (profile.apiKey) {
    headers["Authorization"] = `Bearer ${(profile.apiKey || "").trim()}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const rows = json.data || json.models || json || [];
  return rows
    .map((m) => (typeof m === "string" ? m : m.id || m.name))
    .filter(Boolean)
    .sort();
}

// OpenAI-compatible streaming WITH tools — streams text deltas and accumulates tool_calls.
async function _streamChatTools(profile, messages, tools, { onDelta, signal, maxTokens }) {
  const url = chatUrl(profile.baseUrl);
  const { fetchWithBackoff } = await loadBackoff();
  const res = await fetchWithBackoff(fetch, url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(profile.apiKey ? { Authorization: `Bearer ${(profile.apiKey || "").trim()}` } : {}),
    },
    body: JSON.stringify({ model: profile.model, messages, tools, tool_choice: "auto", stream: true, max_tokens: maxTokens || 16384 }),
  }, { tries: 3 });
  await ensureOk(res, profile);

  let content = "";
  let emittedClean = ""; // stream only reasoning-stripped text to the UI (never leak <think> mid-stream)
  const calls = {}; // index -> { id, name, arguments }
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let json; try { json = JSON.parse(data); } catch { continue; }
    const delta = json.choices && json.choices[0] && json.choices[0].delta;
    if (!delta) continue;
    if (delta.content) {
      content += delta.content;
      // Emit only the clean (reasoning-stripped) text gained since the last delta. While inside a
      // <think> block stripReasoning() yields "" so nothing leaks; once it closes, the answer flows.
      const clean = stripReasoning(content);
      if (clean.length > emittedClean.length && clean.startsWith(emittedClean)) {
        onDelta(clean.slice(emittedClean.length));
        emittedClean = clean;
      }
    }
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

// Reachability check — any HTTP response means online; a network error means offline.
async function ping(profile) {
  if (!profile || !profile.baseUrl) return false;
  const url = modelsUrl(profile.baseUrl);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);
  try {
    const headers = {};
    if (profile.kind === "anthropic") { headers["anthropic-version"] = "2023-06-01"; if (profile.apiKey) headers["x-api-key"] = (profile.apiKey || "").trim(); }
    else if (profile.apiKey) headers["Authorization"] = `Bearer ${(profile.apiKey || "").trim()}`;
    await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch { clearTimeout(t); return false; }
}

// --- NVIDIA → OpenRouter fallback ------------------------------------------------------------------
// When a NVIDIA call fails RETRYABLY (busy model / 5xx / model-not-found / out-of-credits) — after the
// in-call backoff already retried — retry the SAME request ONCE on the user's OpenRouter profile before
// surfacing the error. Fires only on a pre-stream HTTP status error (e.status set by ensureOk), so a
// mid-stream break or user abort never double-streams. No-op unless an OpenRouter profile with a key AND
// a model is configured. The over-the-wire model becomes OpenRouter's; the user gets an answer instead of a 429.
// Only fall back to OpenRouter on a GENUINELY transient/busy NVIDIA error. NOT 404 (the model simply
// isn't hosted on NVIDIA — silently swapping to a different model misleads the user; surface it instead)
// and NOT 402 (a billing issue, not "busy"). 429 = rate limit, 5xx = server hiccup → those retry.
function _retryableStatus(e) { const st = e && e.status; return st === 429 || st === 503 || st === 502 || st === 500; }
function _openRouterFallback(profile) {
  try {
    if (!/nvidia|\bnim\b|integrate\.api\.nvidia|build\.nvidia/i.test((profile && profile.baseUrl) || "")) return null; // only NVIDIA → OpenRouter
    const s = require("./settings.cjs").load();
    // The user's EXPLICITLY designated fallback wins (settings.fallbackModel = "profileId::modelId") — so a
    // busy NVIDIA falls back to a model THEY picked (capable), never a weak default. Set it in Settings.
    if (s.fallbackModel && String(s.fallbackModel).includes("::")) {
      const i = String(s.fallbackModel).indexOf("::");
      const p = (s.profiles || {})[String(s.fallbackModel).slice(0, i)];
      const fm = String(s.fallbackModel).slice(i + 2);
      if (p && String(p.apiKey || "").trim() && fm) return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: fm, kind: p.kind || "openai", name: p.name || "Fallback" };
    }
    const or = Object.values(s.profiles || {}).find((x) => /openrouter\.ai/i.test(x.baseUrl || "") && String(x.apiKey || "").trim() && String(x.model || "").trim());
    return or ? { baseUrl: or.baseUrl, apiKey: or.apiKey, model: or.model, kind: or.kind || "openai", name: or.name || "OpenRouter" } : null;
  } catch { return null; }
}
async function streamChat(profile, messages, opts = {}) {
  try { return await _streamChat(profile, messages, opts); }
  catch (e) {
    if (e && e.name === "AbortError") throw e;
    const fb = _retryableStatus(e) ? _openRouterFallback(profile) : null;
    if (!fb) throw e;
    try { console.log("[providers] NVIDIA busy (" + (e.status || "") + ") — falling back to OpenRouter (" + fb.model + ")"); opts.onFallback && opts.onFallback(fb); } catch {}
    return await _streamChat(fb, messages, opts);
  }
}
async function streamChatTools(profile, messages, tools, opts = {}) {
  try { return await _streamChatTools(profile, messages, tools, opts); }
  catch (e) {
    if (e && e.name === "AbortError") throw e;
    const fb = _retryableStatus(e) ? _openRouterFallback(profile) : null;
    if (!fb) throw e;
    try { console.log("[providers] NVIDIA busy (" + (e.status || "") + ") — falling back to OpenRouter (" + fb.model + ")"); opts.onFallback && opts.onFallback(fb); } catch {}
    return await _streamChatTools(fb, messages, tools, opts);
  }
}

module.exports = { streamChat, streamChatTools, listModels, ping, stripReasoning };
