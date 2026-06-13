// Composio integration — turns hundreds of apps into one-click connectors WITHOUT you
// registering an OAuth app per provider. Composio's "managed auth" supplies the OAuth
// client; the user signs in via Composio's hosted page (link()), and we execute the
// toolkit's tools on their behalf. Enabled only when COMPOSIO_API_KEY is set.
import { Composio } from "@composio/core";

let _c = null;
function client() {
  if (!_c) _c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  return _c;
}
export const composioEnabled = () => !!process.env.COMPOSIO_API_KEY;

// The popular toolkits we surface as one-click. (Composio has ~250+; this is the curated
// front. slug must match Composio's toolkit slug.)
export const COMPOSIO_TOOLKITS = [
  { slug: "gmail", label: "Gmail" },
  { slug: "googledrive", label: "Google Drive" },
  { slug: "googlecalendar", label: "Google Calendar" },
  { slug: "googlesheets", label: "Google Sheets" },
  { slug: "github", label: "GitHub" },
  { slug: "slack", label: "Slack" },
  { slug: "notion", label: "Notion" },
  { slug: "linear", label: "Linear" },
  { slug: "jira", label: "Jira" },
  { slug: "asana", label: "Asana" },
  { slug: "trello", label: "Trello" },
  { slug: "hubspot", label: "HubSpot" },
  { slug: "salesforce", label: "Salesforce" },
  { slug: "zendesk", label: "Zendesk" },
  { slug: "discord", label: "Discord" },
  { slug: "airtable", label: "Airtable" },
  { slug: "calendly", label: "Calendly" },
  { slug: "dropbox", label: "Dropbox" },
];
const TOOLKIT_BY_SLUG = Object.fromEntries(COMPOSIO_TOOLKITS.map((t) => [t.slug, t]));
export const composioToolkit = (slug) => TOOLKIT_BY_SLUG[String(slug || "").toLowerCase()] || null;

// Managed auth config per toolkit — created once, then reused. Cached in memory.
const authConfigCache = new Map();
async function ensureAuthConfig(slug) {
  if (authConfigCache.has(slug)) return authConfigCache.get(slug);
  const ac = await client().authConfigs.create(slug.toUpperCase(), { name: `madav-${slug}`, type: "use_composio_managed_auth" });
  const id = ac.id || ac.nanoid || ac.authConfigId;
  authConfigCache.set(slug, id);
  return id;
}

// Begin hosted sign-in. Composio sends the user back to `callbackUrl` when done.
export async function composioStartLink(slug, userId, callbackUrl) {
  const authConfigId = await ensureAuthConfig(slug);
  const req = await client().connectedAccounts.link(userId, authConfigId, { callbackUrl, allowMultiple: true });
  return { redirectUrl: req.redirectUrl || req.redirect_url, connectionId: req.id };
}

export async function composioConnectionActive(connectionId) {
  try { const a = await client().connectedAccounts.get(connectionId); return String(a.status || "").toUpperCase() === "ACTIVE"; }
  catch { return false; }
}

// List a toolkit's tools as MCP tool descriptors (JSON-schema input).
export async function composioListTools(slug, limit = 40) {
  const raw = await client().tools.getRawComposioTools({ toolkits: [slug.toUpperCase()], limit });
  return (raw || []).map((t) => ({
    name: t.slug || t.name,
    description: String(t.description || t.name || t.slug || "").slice(0, 1024),
    inputSchema: normalizeSchema(t.inputParameters || t.input_parameters),
  })).filter((t) => t.name);
}

// Execute a tool for this user's connected account.
export async function composioExecute(slug, userId, connectionId, args) {
  const r = await client().tools.execute(slug, { userId, connectedAccountId: connectionId, arguments: args || {} });
  const data = r && (r.data !== undefined ? r.data : r);
  return typeof data === "string" ? data : JSON.stringify(data);
}

// Composio raw tools sometimes give a Zod schema; MCP needs JSON Schema. Pass objects
// through; fall back to a permissive object schema otherwise.
function normalizeSchema(s) {
  if (s && typeof s === "object" && (s.type || s.properties)) return s;
  return { type: "object", properties: {}, additionalProperties: true };
}
