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
export function noteFailure(key, retryAfterMs) {
  if (!key) return;
  const ms = Math.min(Math.max(retryAfterMs || 60000, 20000), 5 * 60000); // clamp 20s .. 5m
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
  return { key: keyOf(p.baseUrl, model), baseUrl: p.baseUrl, apiKey: p.apiKey, model, kind: p.kind || "openai", name: p.name || pid, ref };
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
    push({ key: keyOf(selected.baseUrl, selected.model), baseUrl: selected.baseUrl, apiKey: selected.apiKey, model: selected.model, kind: selected.kind || "openai", name: selected.name || "selected", ref: (selected.id ? selected.id + "::" : "") + selected.model });
  }
  for (const ref of ((routing && routing[category]) || [])) push(resolveRef(ref, profiles));
  return out;
}
