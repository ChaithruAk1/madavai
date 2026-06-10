// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Persists provider profiles to userData/brainedge-settings.json.
// Secret fields (API keys, bot token, OAuth secret) are encrypted at rest with the
// OS keychain via Electron safeStorage, so the JSON on disk never holds plaintext keys.
const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");

function file() {
  return path.join(app.getPath("userData"), "brainedge-settings.json");
}

const ENC_PREFIX = "enc:v1:";
function canEncrypt() { try { return safeStorage && safeStorage.isEncryptionAvailable(); } catch { return false; } }
function encStr(v) {
  if (!v || typeof v !== "string" || v.startsWith(ENC_PREFIX) || !canEncrypt()) return v;
  try { return ENC_PREFIX + safeStorage.encryptString(v).toString("base64"); } catch { return v; }
}
function decStr(v) {
  if (typeof v !== "string" || !v.startsWith(ENC_PREFIX)) return v;
  try { return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), "base64")); } catch { return ""; }
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
  skillsDir: "",
  skillsDirs: [],
  disabledSkills: [],
  account: { name: "", email: "", avatar: "", googleLinked: false, githubLinked: false, anthropicLinked: false },
  googleClientId: "",
  googleClientSecret: "",
  githubClientId: "",
  globalInstructions: "", // custom instructions applied to every conversation
  responseLanguage: "model", // "model" = let the model decide; or a language name to force replies
  theme: "dark", // "dark" | "light" | "system"
  accent: "default", // "default" = original two-tone; or a hex for a monochrome accent
  defaultModel: "", // "profileId::model" — applied on every app start
  anthropicUseSubscription: false, // TESTING ONLY: use `claude login` creds (remove before publishing — Anthropic ToS)
  proxyUrl: "", // optional corporate proxy, e.g. http://proxy.corp:8080 (applied on startup)
  noProxy: "", // optional comma-separated hosts to bypass the proxy (defaults to localhost)
  messaging: { enabled: false, platform: "telegram", telegramToken: "", telegramAllowedUserIds: "", target: "chat", folder: "" },
  webhooks: { enabled: false, port: 8765, token: "", lan: false }, // local webhook triggers (POST /hook/agent/<id> …)
  missionTokenBudget: 0, // global per-mission token cap for teams (estimated; 0 = off). Teams can override per-team.
  // Agent Browser guardrails (admin-controllable; secure defaults). Relaxing any of
  // these widens what a browsing agent can do on hostile web pages — change with care.
  agentBrowser: {
    enabled: true,            // MASTER switch — off disables the Agent Browser feature for ALL agents
    enforceAllowlist: true,   // confine agents to each agent's allowed sites (off = any site, redirects unchecked)
    shieldInjection: true,    // mark page text UNTRUSTED so embedded "instructions" stay inert (off = injection risk)
    allowSecretFields: false, // let agents type into password/payment/OTP fields (off = human-only; ON is dangerous)
  },
  profiles: {
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
    if (merged.profiles.p_proxy) delete merged.profiles.p_proxy; // free-claude-code proxy removed
    if (!merged.profiles[merged.activeProfileId]) merged.activeProfileId = Object.keys(merged.profiles)[0];
    if (merged.activeProfileId === "p_proxy") merged.activeProfileId = Object.keys(merged.profiles)[0];
    // Light schema guard: a corrupted file shouldn't crash callers with wrong types.
    if (typeof merged.profiles !== "object" || !merged.profiles) merged.profiles = { ...DEFAULTS.profiles };
    if (!Array.isArray(merged.connectors)) merged.connectors = [];
    if (!Array.isArray(merged.disabledSkills)) merged.disabledSkills = [];
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
  fs.writeFileSync(file(), JSON.stringify(onDisk, null, 2), "utf8");
  _cache = null; // invalidate the read cache — next load() re-reads what we just wrote
  return settings;
}

function activeProfile(settings) {
  const s = settings || load();
  return s.profiles[s.activeProfileId] || Object.values(s.profiles)[0];
}

module.exports = { load, save, activeProfile, DEFAULTS };
