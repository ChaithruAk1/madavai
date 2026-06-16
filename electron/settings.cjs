// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Persists provider profiles to userData/madav-settings.json.
// Secret fields (API keys, bot token, OAuth secret) are encrypted at rest with the
// OS keychain via Electron safeStorage, so the JSON on disk never holds plaintext keys.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

function file() {
  const f = path.join(app.getPath("userData"), "madav-settings.json");
  // One-time rename from the legacy filename (literal built by concat so brand
  // sweeps can't clobber the migration; runs only while the old file still exists).
  try {
    const legacy = path.join(app.getPath("userData"), ("brain" + "edge") + "-settings.json");
    if (!fs.existsSync(f) && fs.existsSync(legacy)) fs.renameSync(legacy, f);
  } catch {}
  return f;
}

const ENC_PREFIX = "enc:v1:";
function canEncrypt() { try { return safeStorage && safeStorage.isEncryptionAvailable(); } catch { return false; } }
let _encryptFailed = false;
function encStr(v) {
  if (!v || typeof v !== "string" || v.startsWith(ENC_PREFIX) || !canEncrypt()) return v;
  try { return ENC_PREFIX + safeStorage.encryptString(v).toString("base64"); }
  catch (e) {
    // Encryption was AVAILABLE but failed — never silently write the secret as plaintext (review M6).
    // Flag it so save() keeps the prior on-disk ciphertext instead of persisting cleartext.
    _encryptFailed = true;
    try { console.warn("[settings] secret encryption failed; not writing plaintext:", (e && e.message) || e); } catch {}
    return "";
  }
}
// True when ANY secret failed to decrypt this run (different binary/fuses/OS user can't
// read the old ciphertext). save() uses this to PRESERVE the on-disk ciphertext instead
// of overwriting it with "" — a failed decrypt must mean "unreadable", never "deleted".
let _decryptFailed = false;
function decStr(v) {
  if (typeof v !== "string" || !v.startsWith(ENC_PREFIX)) return v;
  try { return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), "base64")); }
  catch { _decryptFailed = true; return ""; }
}
// Apply fn to every secret string in a settings object (in place).
function mapSecrets(s, fn) {
  if (!s) return s;
  if (typeof s.googleClientSecret === "string") s.googleClientSecret = fn(s.googleClientSecret);
  if (s.messaging && typeof s.messaging.telegramToken === "string") s.messaging.telegramToken = fn(s.messaging.telegramToken);
  if (s.webhooks && typeof s.webhooks.token === "string") s.webhooks.token = fn(s.webhooks.token);
  for (const k of Object.keys(s.profiles || {})) {
    const p = s.profiles[k];
    if (p && typeof p.apiKey === "string") p.apiKey = fn(p.apiKey);
  }
  return s;
}

const DEFAULTS = {
  activeProfileId: "p_local",
  agents: [], // user-built agents (Agent Studio): { id, name, description, instructions, tools, model, identity }
  teams: [],  // agent teams (multi-agent): { id, name, identity, mode: "relay"|"manager", members: [agentId] }
  connectors: [],
  tracing: { enabled: true },                                                  // run tracing (local-only); set false to disable
  alerts: { enabled: true, onError: true, onTaskError: true, channel: "desktop", costPerRunUSD: 0, latencyMs: 0 }, // failure / budget alerts
  pricing: {},                                                                 // model-substring -> { in, out } $/1M tokens (overrides trace-store defaults)
  skillsDir: "",
  skillsDirs: [],
  disabledSkills: [],
  playChains: {}, // play name -> [next play names] (a play hands off to these after it)
  playMeta: {},   // play name -> { connectors:[names], folder:"" } (what a play needs)
  roomTemplates: [], // saved workroom templates: { id, name, instructions, identity, knowledge, pinnedSkills, goals }
  studioStyles: [], // Studio "design DNA" presets: { id, name, rules } — a saved look applied as a prompt prefix
  studioGallery: [], // Studio creations saved by the user: { id, title, kind, code, prompt, style, parentId, createdAt }
  account: { name: "", email: "", avatar: "", googleLinked: false, githubLinked: false },
  googleClientId: "",
  googleClientSecret: "",
  githubClientId: "",
  globalInstructions: "", // custom instructions applied to every conversation
  userMemory: { enabled: true }, // cross-chat memory: remember durable facts about the user
  extras: {}, // feature switchboard (Settings → Extras): { sage, voice, imagegen, office, studio, terminal, scheduler, viamobile } — absent = ON, explicit false = OFF. Keep keys in sync with src/extras.js.
  responseLanguage: "model", // "model" = let the model decide; or a language name to force replies
  theme: "dark", // "dark" | "light" | "system"
  accent: "grad:#0ad0f5:#2196f8:#8b50f5", // Madav logo gradient (cyan->azure->violet) is the default accent
  officeAccent: "1F3864", // Office Suite (Word/Excel) brand colour for headers/titles; 6-hex, custom overrides. Financial cell colours stay fixed.
  defaultModel: "", // "profileId::model" — applied on every app start
  proxyUrl: "", // optional corporate proxy, e.g. http://proxy.corp:8080 (applied on startup)
  noProxy: "", // optional comma-separated hosts to bypass the proxy (defaults to localhost)
  messaging: { enabled: false, platform: "telegram", telegramToken: "", telegramAllowedUserIds: "", target: "chat", folder: "" },
  webhooks: { enabled: false, port: 8765, token: "", lan: false }, // local webhook triggers (POST /hook/agent/<id> …)
  missionTokenBudget: 0, // global per-mission token cap for teams (estimated; 0 = off). Teams can override per-team.
  // Agent Browser guardrails (admin-controllable; secure defaults). Relaxing any of
  // these widens what a browsing agent can do on hostile web pages — change with care.
  desktopDriver: { enabled: true }, // Desktop Applications Driver master switch (agents on native Windows apps)
  agentBrowser: {
    enabled: true,            // MASTER switch — off disables the Agent Browser feature for ALL agents
    enforceAllowlist: true,   // confine agents to each agent's allowed sites (off = any site, redirects unchecked)
    shieldInjection: true,    // mark page text UNTRUSTED so embedded "instructions" stay inert (off = injection risk)
    allowSecretFields: false, // let agents type into password/payment/OTP fields (off = human-only; ON is dangerous)
  },
  profiles: {
    // Madav Starter — zero-setup free models through madav.ai's house key. The standard
    // OpenAI client hits <baseUrl>/v1/...; the bearer is the user's SESSION TOKEN,
    // injected at resolve time (resolveProfile below) — no upstream key ever ships.
    p_starter: {
      id: "p_starter",
      name: "Madav Starter (free)",
      kind: "openai",
      baseUrl: "https://madav.ai/starter",
      apiKey: "",
      model: "meta-llama/llama-3.3-70b-instruct:free",
    },
    p_local: {
      id: "p_local",
      name: "LM Studio (local)",
      kind: "openai", // "openai" | "anthropic"
      baseUrl: "http://localhost:1234",
      apiKey: "",
      model: "local-model",
    },
    p_openrouter: {
      id: "p_openrouter",
      name: "OpenRouter",
      kind: "openai",
      baseUrl: "https://openrouter.ai/api",
      apiKey: "",
      model: "deepseek/deepseek-chat",
    },
    p_anthropic: { id: "p_anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "", model: "claude-sonnet-4-6" },
    p_openai: { id: "p_openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com", apiKey: "", model: "gpt-4o-mini" },
    p_nim: { id: "p_nim", name: "NVIDIA NIM", kind: "openai", baseUrl: "https://integrate.api.nvidia.com", apiKey: "", model: "meta/llama-3.1-8b-instruct" },
    p_gemini: { id: "p_gemini", name: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "", model: "gemini-2.0-flash" },
    p_deepseek: { id: "p_deepseek", name: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com", apiKey: "", model: "deepseek-chat" },
    p_ollama: { id: "p_ollama", name: "Ollama (local)", kind: "openai", baseUrl: "http://localhost:11434", apiKey: "", model: "llama3.1" },
    p_llamacpp: { id: "p_llamacpp", name: "llama.cpp (local)", kind: "openai", baseUrl: "http://localhost:8080", apiKey: "", model: "local-model" },
  },
};

// mtime-based cache: load() is called on every IPC/turn — skip re-reading an unchanged file.
let _cache = null, _cacheMtime = 0;
function load() {
  try {
    const f = file();
    const mt = fs.statSync(f).mtimeMs;
    if (_cache && mt === _cacheMtime) return _cache;
    const raw = fs.readFileSync(f, "utf8");
    const data = JSON.parse(raw);
    // shallow-merge defaults so new fields appear for old config files
    const merged = { ...DEFAULTS, ...data, profiles: { ...DEFAULTS.profiles, ...(data.profiles || {}) } };
    if (!Array.isArray(merged.skillsDirs)) merged.skillsDirs = [];
    if (!Array.isArray(merged.agents)) merged.agents = [];
    if (!Array.isArray(merged.teams)) merged.teams = [];
    if (merged.skillsDirs.length === 0 && merged.skillsDir) merged.skillsDirs = [merged.skillsDir]; // migrate single → list
    if (merged.profiles.p_proxy) delete merged.profiles.p_proxy; // legacy proxy profile removed
    if (!merged.profiles[merged.activeProfileId]) merged.activeProfileId = Object.keys(merged.profiles)[0];
    if (merged.activeProfileId === "p_proxy") merged.activeProfileId = Object.keys(merged.profiles)[0];
    // Light schema guard: a corrupted file shouldn't crash callers with wrong types.
    if (typeof merged.profiles !== "object" || !merged.profiles) merged.profiles = { ...DEFAULTS.profiles };
    if (!Array.isArray(merged.connectors)) merged.connectors = [];
    if (!Array.isArray(merged.disabledSkills)) merged.disabledSkills = [];
    if (typeof merged.extras !== "object" || !merged.extras || Array.isArray(merged.extras)) merged.extras = {};
    mapSecrets(merged, decStr); // decrypt secrets for in-app use
    _cache = merged; _cacheMtime = fs.statSync(file()).mtimeMs;
    return merged;
  } catch {
    return DEFAULTS;
  }
}

function save(settings) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  // Encrypt secrets at rest (deep copy so the in-memory object stays plaintext for the app).
  const onDisk = JSON.parse(JSON.stringify(settings));
  mapSecrets(onDisk, encStr);
  // KEY-WIPE GUARD: if a secret failed to decrypt this run, the in-memory "" is NOT a
  // deletion — keep the existing ciphertext on disk so the binary that CAN read it
  // (e.g. the dev app vs the packaged app) still has the key. Without this, the launch
  // auto-save of any app that can't decrypt would permanently destroy every API key.
  if (_decryptFailed || _encryptFailed) {
    try {
      const prev = JSON.parse(fs.readFileSync(file(), "utf8"));
      const keep = (cur, old) => (cur === "" && typeof old === "string" && old.startsWith(ENC_PREFIX)) ? old : cur;
      if (typeof onDisk.googleClientSecret === "string") onDisk.googleClientSecret = keep(onDisk.googleClientSecret, prev.googleClientSecret);
      if (onDisk.messaging && prev.messaging && typeof onDisk.messaging.telegramToken === "string") onDisk.messaging.telegramToken = keep(onDisk.messaging.telegramToken, prev.messaging.telegramToken);
      if (onDisk.webhooks && prev.webhooks && typeof onDisk.webhooks.token === "string") onDisk.webhooks.token = keep(onDisk.webhooks.token, prev.webhooks.token);
      for (const k of Object.keys(onDisk.profiles || {})) {
        const p = onDisk.profiles[k], q = prev.profiles && prev.profiles[k];
        if (p && q && typeof p.apiKey === "string") p.apiKey = keep(p.apiKey, q.apiKey);
      }
    } catch {} // unreadable previous file: nothing to preserve
  }
  // Safety net: keep ONE backup of the previous settings file so no writer — including a
  // corrupted-file DEFAULTS fallback — can ever wipe settings irrecoverably.
  try { if (fs.existsSync(file())) fs.copyFileSync(file(), file() + ".bak"); } catch {}
  fs.writeFileSync(file(), JSON.stringify(onDisk, null, 2), "utf8");
  _cache = null; // invalidate the read cache — next load() re-reads what we just wrote
  return settings;
}

// Madav Starter profiles authenticate with the user's SESSION TOKEN as the bearer
// (the server swaps in the house key upstream). Injected at resolve time so the
// token is always current and never persisted into the settings file.
function resolveProfile(p) {
  if (p && !p.apiKey && /\/starter\b/.test(p.baseUrl || "")) {
    try { const t = require("./auth.cjs").token(); if (t) return { ...p, apiKey: t }; } catch { /* signed out — server replies with a friendly 401 */ }
  }
  return p;
}

function activeProfile(settings) {
  const s = settings || load();
  return resolveProfile(s.profiles[s.activeProfileId] || Object.values(s.profiles)[0]);
}

module.exports = { load, save, activeProfile, resolveProfile, DEFAULTS };
