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
let _routerP = null; // SINGLE SOURCE model routing (selected-first chain + cooldowns); shared with web's providers.js.
const loadRouter = () => (_routerP ||= import("../core/model-router.js"));
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

// --- Model routing: ordered fallback via the SHARED router ----------------------------------------
// Every model call runs through core/model-router.js. The user's picked model is slot 0; if it fails
// RETRYABLY (429 / 5xx / transient) the router cools it down and advances to the next model in the user's
// category chain (settings.modelRouting), trying each until one answers. A NON-retryable error (bad key,
// missing model, user abort) is surfaced immediately — never masked by silently swapping models (the old
// behavior, which dropped users onto a weak model). With no chain configured the candidate list is just the
// selected model — no fallback — so nothing changes until the user builds chains in Models → Model Routing.
// ONE fallback policy for the whole app; web's providers.js calls the SAME router. (replaces the old
// hard-coded NVIDIA→OpenRouter swap + settings.fallbackModel.)
function _routingInputs(profile, opts) {
  let s = {}; try { s = require("./settings.cjs").load() || {}; } catch {}
  return { category: opts.category || "general", selected: profile, profiles: s.profiles || {}, routing: s.modelRouting || {} };
}
function _onReroute(opts) {
  return ({ from, to, error }) => { try { console.log("[router] " + (from.name || from.model) + " failed (" + ((error && (error.status || error.code || (error.message || "").slice(0, 40))) || "") + ") → trying " + (to.name || to.model) + " · " + to.model); opts.onFallback && opts.onFallback(to); } catch {} };
}
// Wrap an attempt so a failure AFTER streaming started is flagged (e.streamed) — the router then won't reroute
// (which would double-stream a half-written answer). A pre-stream failure stays unflagged → the router falls
// back on ANY reason. Tiny per-platform glue; web's providers.js mirrors it.
function _track(opts, run) {
  return async (c) => {
    let started = false;
    const o = Object.assign({}, opts, { onDelta: (d, full) => { started = true; return opts.onDelta && opts.onDelta(d, full); } });
    try { return await run(c, o); }
    catch (e) { if (started && e && typeof e === "object") { try { e.streamed = true; } catch {} } throw e; }
  };
}
async function streamChat(profile, messages, opts = {}) {
  const router = await loadRouter();
  const cands = router.resolveCandidates(_routingInputs(profile, opts));
  return router.runChain({ candidates: cands.length ? cands : [profile], attempt: _track(opts, (c, o) => _streamChat(c, messages, o)), onReroute: _onReroute(opts) });
}
async function streamChatTools(profile, messages, tools, opts = {}) {
  const router = await loadRouter();
  const cands = router.resolveCandidates(_routingInputs(profile, opts));
  return router.runChain({ candidates: cands.length ? cands : [profile], attempt: _track(opts, (c, o) => _streamChatTools(c, messages, tools, o)), onReroute: _onReroute(opts) });
}

module.exports = { streamChat, streamChatTools, listModels, ping, stripReasoning };
