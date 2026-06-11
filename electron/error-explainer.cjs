// Hybrid error-explainer.
//  - Deterministic/known errors are handled by their own code (skipped here).
//  - Unknown raw provider errors are normalized to a signature, looked up in a
//    JSON cache, and (on a miss) rewritten into one friendly sentence by a
//    lightweight model — preferring a LOCAL model so it works even when the main
//    provider is the thing that's failing. Hard timeout; raw text is the fallback.
//  - The cache is what "improves over time": each new error is explained once,
//    then served instantly and consistently forever after.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const settings = require("./settings.cjs");
const { streamChat } = require("./providers.cjs");

try {
  const legacy = path.join(app.getPath("userData"), ("brain" + "edge") + "-error-cache.json");
  const nf = path.join(app.getPath("userData"), "madav-error-cache.json");
  if (!fs.existsSync(nf) && fs.existsSync(legacy)) fs.renameSync(legacy, nf);
} catch {}
const cacheFile = () => path.join(app.getPath("userData"), "madav-error-cache.json");
function loadCache() { try { return JSON.parse(fs.readFileSync(cacheFile(), "utf8")); } catch { return {}; } }
function saveCache(c) { try { fs.writeFileSync(cacheFile(), JSON.stringify(c, null, 2)); } catch {} }

// Normalize volatile bits (ids, numbers, urls, punctuation) so the same class of
// error maps to one stable cache key.
function signature(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[0-9a-f]{8,}/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

// Prefer a local model (always available, free, no circular failure); else the active one.
function pickExplainerProfile() {
  const s = settings.load();
  const profs = Object.values(s.profiles || {});
  const local = profs.find((p) => /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(p.baseUrl || "") && p.model);
  if (local) return local;
  try { return settings.activeProfile(); } catch { return null; }
}

async function explain(raw, opts = {}) {
  const sig = signature(raw);
  if (!sig) return null;
  const cache = loadCache();
  if (cache[sig]) return cache[sig];

  const profile = pickExplainerProfile();
  if (!profile || !profile.baseUrl) return null;
  // A subscription-only Anthropic profile has no usable key on this raw path — skip.
  const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(profile.baseUrl || "");
  if (!isLocal && !(profile.apiKey || "").trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 4000);
  try {
    const messages = [
      { role: "system", content: "You turn a raw software/API error into ONE short, friendly, actionable sentence for a non-technical user. No code, no JSON, no apologies, no preamble. If an obvious fix exists, state it plainly. Max 30 words." },
      { role: "user", content: `Raw error:\n${String(raw).slice(0, 600)}` },
    ];
    const { text } = await streamChat(profile, messages, { signal: controller.signal, onDelta: () => {} });
    const msg = (text || "").trim().replace(/\s+/g, " ");
    if (msg && msg.length > 4) { cache[sig] = msg; saveCache(cache); return msg; }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { explain, signature };
