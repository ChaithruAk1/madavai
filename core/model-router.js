// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// core/model-router.js — SINGLE SOURCE model routing for the WHOLE app (desktop + web).
//
// Phase 1 (manual). The user's LIVE picker model is ALWAYS tried first. If it fails for a retryable
// reason (busy / out of credits / no longer available / server error), Madav walks the ordered FALLBACK
// CHAIN the user defined for THIS turn's category. A short cooldown stops a just-failed model from being
// re-hit on every call of the same turn (the thrash we saw: one busy model, 10 silent fallbacks).
//
// Pure logic + a per-process cooldown map. Takes settings/profiles as INPUT, so it is platform-agnostic
// and unit-testable. Desktop loads it via cached import(); web imports it natively. ONE copy, no drift.

// ---- category: derived from surface + image + data-tool need (deterministic; NO message-topic guessing) ----
// image attached -> vision (a non-vision model literally cannot see it); code/build surface -> coding;
// a data/script turn or an agentic surface -> agentic; everything else -> general.
export const ROUTE_CATEGORIES = ["general", "agentic", "coding", "vision"];
export function categoryFor({ mode, hasImage, needsData } = {}) {
  if (hasImage) return "vision";
  const m = String(mode || "").toLowerCase();
  if (m === "code" || m === "build") return "coding";
  if (needsData) return "agentic";
  if (["cowork", "agent", "agents", "project", "team", "teams"].includes(m)) return "agentic";
  return "general";
}

// ---- cooldowns (per-process; transient rate-limit memory; resets on restart) ----
const _cool = new Map(); // key -> expiresAt(ms)
export function noteFailure(key, retryMs) {
  if (!key) return;
  const ms = Math.min(Math.max(retryMs || 60000, 20000), 5 * 60000); // clamp 20s .. 5m
  _cool.set(key, Date.now() + ms);
}
export function onCooldown(key) {
  const t = _cool.get(key);
  if (!t) return false;
  if (t <= Date.now()) { _cool.delete(key); return false; }
  return true;
}
export function clearCooldowns() { _cool.clear(); }

// A model's identity for dedup + cooldown = its provider endpoint + model id (NOT the profile id, so the
// same model reached two ways still counts once).
const keyOf = (baseUrl, model) => `${String(baseUrl || "").replace(/\/$/, "")}|${model}`;

// Resolve a "profileId::modelId" chain ref against the configured provider profiles. Returns null (skip)
// when the provider has no key or the ref is malformed — a chain entry you can't actually call is dropped.
function resolveRef(ref, profiles) {
  if (!ref || typeof ref !== "string" || !ref.includes("::")) return null;
  const i = ref.indexOf("::");
  const pid = ref.slice(0, i), model = ref.slice(i + 2);
  const p = (profiles || {})[pid];
  if (!p || !String(p.apiKey || "").trim() || !model) return null;
  return { ...p, model, key: keyOf(p.baseUrl, model), kind: p.kind || "openai", name: p.name || pid, ref }; // spread the FULL profile so the stream call keeps every field, just with this ref's model
}

// ---- the ordered candidate list for THIS turn ----
// selected = the live picker profile { baseUrl, apiKey, model, kind, name, id? } — ALWAYS slot 0.
// routing  = settings.modelRouting (chains per category, each an ordered array of "pid::model" refs).
// Returns [{ key, baseUrl, apiKey, model, kind, name, ref }] with cooldown'd, keyless, and duplicate
// entries removed, in priority order. The provider call site tries them top to bottom.
export function resolveCandidates({ category, selected, profiles = {}, routing = {} } = {}) {
  const out = [];
  const seen = new Set();
  const push = (c) => { if (c && c.model && c.baseUrl && !seen.has(c.key) && !onCooldown(c.key)) { seen.add(c.key); out.push(c); } };
  if (selected && selected.model && selected.baseUrl) {
    push({ ...selected, key: keyOf(selected.baseUrl, selected.model), kind: selected.kind || "openai", name: selected.name || "selected", ref: (selected.id ? selected.id + "::" : "") + selected.model });
  }
  for (const ref of ((routing && routing[category]) || [])) push(resolveRef(ref, profiles));
  return out;
}

// ---- retryable classification (SHARED; HTTP status only, no platform code) ----
// A reroute fires ONLY on a transient/availability error. NOT 401/403 (auth — the same key fails the same
// way on a retry), NOT 400/404/422 (the request or model id is wrong — surface it, don't mask it by swapping
// models), NOT 402 (billing). 429 = rate-limited, 408/409/425 = transient, 5xx = server hiccup → advance.
export function isRetryable(e) {
  const st = e && (e.status || e.statusCode);
  return st === 429 || st === 408 || st === 409 || st === 425 || st === 500 || st === 502 || st === 503 || st === 504;
}
// Honor a server-provided Retry-After (seconds or HTTP-date) when present; else null → caller's default cooldown.
export function retryAfterMs(e) {
  try {
    const hdr = e && (e.retryAfter || (e.headers && (typeof e.headers.get === "function" ? e.headers.get("retry-after") : e.headers["retry-after"])));
    if (hdr == null || hdr === "") return null;
    const secs = Number(hdr); if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const when = Date.parse(hdr); if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  } catch {}
  return null;
}

// ---- exhausted-chain error (HONEST: led by the FIRST failure, never the last fallback's message) ----
// Plain-language reason for one failure, used in the summary shown when EVERY candidate failed.
function failureReason(e) {
  const st = e && (e.status || e.statusCode);
  if (st === 429) return "is rate-limited (too busy)";
  if (st === 402) return "is out of credit";
  if (st === 401 || st === 403) return "rejected the API key";
  if (st === 404) return "is unavailable";
  if (st >= 500 && st < 600) return "hit a server error";
  const m = (e && e.message ? String(e.message) : "").trim();
  if (!m) return "failed";
  const short = m.length > 140 ? (m.slice(0, 140).replace(/\s+\S*$/, "") + "…") : m; // trim at a word boundary — never mid-word (the old 50-char cut produced "Try )")
  return "failed — " + short;
}
// Build ONE clear error when the whole chain failed. Leads with the FIRST attempt (usually the user's selected
// model) — the most actionable signal — and copies its status/code so downstream handling is unchanged.
// `failed` = [{ c, e }] in attempt order.
function chainExhaustedError(failed) {
  if (!failed || !failed.length) return new Error("model-router: no usable model candidates");
  const first = failed[0];
  const who = ((first.c && first.c.name) ? first.c.name + " " : "") + ((first.c && first.c.model) || "your model");
  const others = failed.length - 1;
  const extra = others > 0 ? (" and " + others + " backup model" + (others > 1 ? "s" : "") + " also failed") : "";
  const err = new Error(who + " " + failureReason(first.e) + extra + ". Try again in a moment, or pick a different model.");
  if (first.e) { err.status = first.e.status || first.e.statusCode; err.code = first.e.code; err.cause = first.e; }
  return err;
}

// ---- the fallback loop (SINGLE SOURCE; the platform supplies `attempt` = its real stream call) ----
// Tries candidates in order. On a RETRYABLE failure: cool the failed model down and advance to the next.
// On a NON-retryable failure (auth / bad request / user abort): throw immediately — walking the chain can't
// help. Returns whatever `attempt` returns (the platform's stream handle). `onReroute({from,to,error})`
// fires each time we move to the next model, so the UI can show "X was busy → answered with Y".
export async function runChain({ candidates, attempt, onReroute } = {}) {
  const list = (candidates || []).filter((c) => c && c.model && c.baseUrl);
  if (!list.length) throw new Error("model-router: no usable model candidates");
  const failed = []; // { c, e } per attempt — drives an honest exhausted-chain message
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    try {
      return await attempt(c, i);
    } catch (e) {
      // On ANY failure of the chosen model, fall back — the reason is NOT limited (rate limit, bad key, 404,
      // 400, network, timeout, empty reply, anything). Two exceptions only: a user abort (they stopped — not a
      // failure), and a failure AFTER output already began streaming (e.streamed) — rerouting there would
      // double-stream a half-written answer, so surface it instead. Otherwise: cool this model down, try next.
      if (e && (e.name === "AbortError" || e.streamed)) throw e;
      noteFailure(c.key, retryAfterMs(e));            // cool this one down so we don't re-hit it this turn
      failed.push({ c, e });
      if (i + 1 < list.length && typeof onReroute === "function") { try { onReroute({ from: c, to: list[i + 1], error: e }); } catch {} }
    }
  }
  // Whole chain exhausted. Surface an HONEST summary LED BY THE FIRST (usually the selected-model) failure —
  // never the last fallback's misleading message (e.g. a dead OpenRouter id that says "not available").
  throw chainExhaustedError(failed);
}
