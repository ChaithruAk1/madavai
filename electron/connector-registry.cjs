// Connector directory — pulls the OFFICIAL, open MCP registry and normalizes each
// server into a Madav connector config the UI can add with one click.
//   Source: https://registry.modelcontextprotocol.io/v0/servers  (public, no key)
// Results are cached to userData with a TTL so the directory is instant and works
// offline. Remote ("remotes") servers map to a URL connector; npm packages map to
// an `npx` stdio connector; other package types (oci/pypi) are listed but flagged.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const API = "https://registry.modelcontextprotocol.io/v0/servers";
try {
  const legacy = path.join(app.getPath("userData"), ("brain" + "edge") + "-connector-featured.json");
  const nf = path.join(app.getPath("userData"), "madav-connector-featured.json");
  if (!fs.existsSync(nf) && fs.existsSync(legacy)) fs.renameSync(legacy, nf);
} catch {}
const featFile = () => path.join(app.getPath("userData"), "madav-connector-featured.json");
const TTL_MS = 6 * 60 * 60 * 1000;

// Globally popular connectors to surface by default (curated — the open registry has
// no popularity signal). Each is resolved live against the registry so the endpoint,
// description and transport stay accurate; the rest of the catalog is found via search.
const FEATURED = [
  // Productivity & docs
  "notion", "slack", "gmail", "google drive", "google calendar", "google sheets",
  "microsoft 365", "outlook", "onedrive", "sharepoint", "confluence", "jira",
  "asana", "trello", "linear", "clickup", "monday", "airtable", "coda", "todoist",
  // Dev & infra
  "github", "gitlab", "sentry", "cloudflare", "vercel", "netlify", "supabase",
  "postgres", "mysql", "mongodb", "redis", "snowflake", "datadog", "grafana",
  "docker", "kubernetes", "aws", "terraform", "playwright",
  // Comms, CRM & commerce
  "discord", "telegram", "twilio", "hubspot", "salesforce", "zendesk", "intercom",
  "stripe", "shopify",
  // Design, meetings & AI/search
  "figma", "canva", "zoom", "hugging face", "brave search", "perplexity",
  "exa", "firecrawl",
  // Core utilities
  "filesystem", "fetch", "memory", "sqlite",
];

// Run async fn over items with limited concurrency (avoid hammering the registry).
async function mapPool(arr, n, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const worker = async () => { while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx]); } };
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, worker));
  return out;
}

const CACHE_V = 3; // bump to invalidate older cached shapes
function loadCache() { try { const c = JSON.parse(fs.readFileSync(featFile(), "utf8")); return c && c.v === CACHE_V ? c : null; } catch { return null; } }
function saveCache(items) { try { fs.writeFileSync(featFile(), JSON.stringify({ at: Date.now(), v: CACHE_V, items }, null, 2)); } catch {} }

// Rank a search result for how well it represents a featured brand term.
function pickBest(items, term) {
  const t = term.toLowerCase();
  const score = (it) => {
    const title = (it.title || "").toLowerCase(), name = (it.name || "").toLowerCase();
    let s = 0;
    if (title === t) s += 6;
    if (title.startsWith(t)) s += 3;
    if (name.includes(t.replace(/\s+/g, ""))) s += 2;
    if (it.kind === "remote") s += 2;
    if (it.connector) s += 1;
    return s;
  };
  return items.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

async function featuredItems() {
  const results = await mapPool(FEATURED, 8, async (q) => {
    try { return pickBest(await fetchFresh(q), q); } catch { return null; }
  });
  const seen = new Set(); const out = [];
  for (const it of results) { if (it && it.connector && !seen.has(it.name)) { seen.add(it.name); out.push(it); } }
  return out;
}

// One registry entry → { name, title, description, repoUrl, kind, connector, env }
function normalize(rec) {
  const s = rec.server || {};
  const title = s.title || (s.name || "").split("/").pop() || s.name;
  const out = { name: s.name, title, description: s.description || "", repoUrl: (s.repository && s.repository.url) || "", version: s.version || "", kind: "other", connector: null, env: [] };

  const remote = (s.remotes || []).find((r) => r.type === "streamable-http" || r.type === "http") || (s.remotes || []).find((r) => r.type === "sse");
  if (remote) {
    out.kind = "remote";
    out.connector = { name: title, url: remote.url, transport: remote.type === "sse" ? "sse" : "http", enabled: true };
    return out;
  }

  const npm = (s.packages || []).find((p) => p.registryType === "npm");
  if (npm) {
    const runArgs = (npm.runtimeArguments || []).map((a) => a.value).filter(Boolean);
    const args = (runArgs.length ? runArgs : ["-y"]).concat(npm.identifier);
    const env = (npm.environmentVariables || []).map((e) => ({ name: e.name, required: !!e.isRequired, secret: !!e.isSecret }));
    out.kind = "npm";
    out.env = env;
    out.connector = {
      name: title, command: npm.runtimeHint || "npx", args,
      env: Object.fromEntries(env.map((e) => [e.name, ""])), enabled: true,
    };
    return out;
  }

  // pypi / oci / unknown — show it but it isn't one-click installable here.
  const other = (s.packages || [])[0];
  if (other) out.kind = other.registryType || "other";
  return out;
}

async function fetchFresh(search) {
  const url = API + "?limit=100" + (search ? "&search=" + encodeURIComponent(search) : "");
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("registry " + res.status);
  const json = await res.json();
  const rows = json.servers || [];
  // Collapse multiple versions of the same server, preferring the latest active one.
  const byName = new Map();
  for (const rec of rows) {
    const meta = (rec._meta && rec._meta["io.modelcontextprotocol.registry/official"]) || {};
    if (meta.status && meta.status !== "active") continue;
    const name = rec.server && rec.server.name;
    if (!name) continue;
    const item = normalize(rec);
    item.updated = meta.updatedAt || meta.publishedAt || null;
    const prev = byName.get(name);
    if (!prev || meta.isLatest) byName.set(name, item);
  }
  return [...byName.values()];
}

// Returns { items, stale, source } — never throws; falls back to cache.
// A search query is sent to the registry API (covers the whole catalog, not just
// the cached first page). Only the unfiltered list is cached for offline use.
async function listDirectory({ force = false, search = "" } = {}) {
  const q = (search || "").trim();
  if (q) {
    try { return { items: await fetchFresh(q), stale: false, source: "registry" }; }
    catch (e) { return { items: [], stale: true, source: "none", error: String(e.message || e) }; }
  }
  // Default view = curated, well-known connectors (~50), resolved live from the
  // registry and cached. The full catalog is reachable via search.
  const cached = loadCache();
  if (!force && cached && Date.now() - cached.at < TTL_MS) return { items: cached.items, stale: false, source: "cache", featured: true };
  try {
    const items = await featuredItems();
    saveCache(items);
    return { items, stale: false, source: "registry", featured: true };
  } catch (e) {
    if (cached) return { items: cached.items, stale: true, source: "cache", featured: true, error: String(e.message || e) };
    return { items: [], stale: true, source: "none", error: String(e.message || e) };
  }
}

module.exports = { listDirectory, normalize };
