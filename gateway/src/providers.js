// Provider definitions: each is a standard OAuth2 app PLUS a few MCP tools. Adding a new
// provider = add an entry here (config from env) and its tools. All calls use the user's
// own provider token, obtained via their browser sign-in — the gateway never sees a password.
import { z } from "zod";

const env = (k) => process.env[k] || "";
const j = async (res) => { const t = await res.text(); try { return JSON.parse(t); } catch { return { _raw: t.slice(0, 300) }; } };

export const PROVIDERS = {
  github: {
    id: "github",
    label: "GitHub",
    clientId: () => env("GITHUB_CLIENT_ID"),
    clientSecret: () => env("GITHUB_CLIENT_SECRET"),
    scopes: "repo read:user",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // GitHub returns the token in a JSON body when Accept: application/json.
    async exchange({ code, redirectUri }) {
      const res = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.clientSecret(), code, redirect_uri: redirectUri }),
      });
      const d = await j(res);
      if (!d.access_token) throw new Error("GitHub token exchange failed: " + (d.error_description || d.error || JSON.stringify(d)));
      return { providerToken: d.access_token };
    },
    tools: [
      { name: "github_list_repos", description: "List the signed-in user's repositories (most recently updated first).",
        schema: { limit: z.number().int().min(1).max(50).optional() },
        run: async (tok, a) => api(`https://api.github.com/user/repos?sort=updated&per_page=${a.limit || 20}`, tok, "github") },
      { name: "github_search_issues", description: "Search GitHub issues and pull requests with a query (GitHub search syntax).",
        schema: { q: z.string() },
        run: async (tok, a) => api(`https://api.github.com/search/issues?q=${encodeURIComponent(a.q)}&per_page=20`, tok, "github") },
      { name: "github_create_issue", description: "Open a new issue in owner/repo.",
        schema: { owner: z.string(), repo: z.string(), title: z.string(), body: z.string().optional() },
        run: async (tok, a) => api(`https://api.github.com/repos/${a.owner}/${a.repo}/issues`, tok, "github", { method: "POST", body: JSON.stringify({ title: a.title, body: a.body || "" }) }) },
    ],
  },

  notion: {
    id: "notion",
    label: "Notion",
    clientId: () => env("NOTION_CLIENT_ID"),
    clientSecret: () => env("NOTION_CLIENT_SECRET"),
    scopes: "",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    authorizeExtra: { owner: "user" },
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    async exchange({ code, redirectUri }) {
      const basic = Buffer.from(`${this.clientId()}:${this.clientSecret()}`).toString("base64");
      const res = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Basic " + basic },
        body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
      });
      const d = await j(res);
      if (!d.access_token) throw new Error("Notion token exchange failed: " + (d.error || JSON.stringify(d)));
      return { providerToken: d.access_token };
    },
    tools: [
      { name: "notion_search", description: "Search pages and databases in the connected Notion workspace.",
        schema: { query: z.string().optional() },
        run: async (tok, a) => api("https://api.notion.com/v1/search", tok, "notion", { method: "POST", body: JSON.stringify({ query: a.query || "", page_size: 20 }) }) },
    ],
  },

  slack: {
    id: "slack",
    label: "Slack",
    clientId: () => env("SLACK_CLIENT_ID"),
    clientSecret: () => env("SLACK_CLIENT_SECRET"),
    scopes: "channels:read,chat:write,channels:history,users:read",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    async exchange({ code, redirectUri }) {
      const res = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.clientSecret(), code, redirect_uri: redirectUri }),
      });
      const d = await j(res);
      const token = d.access_token || (d.authed_user && d.authed_user.access_token);
      if (!d.ok || !token) throw new Error("Slack token exchange failed: " + (d.error || JSON.stringify(d)));
      return { providerToken: token };
    },
    tools: [
      { name: "slack_list_channels", description: "List public channels in the workspace.",
        schema: { limit: z.number().int().min(1).max(200).optional() },
        run: async (tok, a) => api(`https://slack.com/api/conversations.list?limit=${a.limit || 100}&exclude_archived=true`, tok, "slack") },
      { name: "slack_post_message", description: "Post a message to a channel (by channel ID, e.g. C0123).",
        schema: { channel: z.string(), text: z.string() },
        run: async (tok, a) => api("https://slack.com/api/chat.postMessage", tok, "slack", { method: "POST", body: JSON.stringify({ channel: a.channel, text: a.text }) }) },
    ],
  },

  // ---- Google (Gmail + Drive) — tokens EXPIRE, so these also implement refresh() ----
  gmail: googleProvider({
    id: "gmail", label: "Gmail",
    scopes: "openid email https://www.googleapis.com/auth/gmail.readonly",
    tools: [
      { name: "gmail_search", description: "Search the user's Gmail (Gmail search syntax, e.g. 'from:boss newer_than:7d').",
        schema: { q: z.string(), limit: z.number().int().min(1).max(25).optional() },
        run: async (tok, a) => api(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(a.q)}&maxResults=${a.limit || 10}`, tok, "google") },
      { name: "gmail_read", description: "Read one Gmail message by its id (from gmail_search).",
        schema: { id: z.string() },
        run: async (tok, a) => api(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${a.id}?format=full`, tok, "google") },
    ],
  }),
  gdrive: googleProvider({
    id: "gdrive", label: "Google Drive",
    scopes: "openid email https://www.googleapis.com/auth/drive.readonly",
    tools: [
      { name: "gdrive_search", description: "Search the user's Google Drive files by name/content.",
        schema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() },
        run: async (tok, a) => api(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`fullText contains '${a.query.replace(/'/g, "")}'`)}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=${a.limit || 20}`, tok, "google") },
      { name: "gdrive_read", description: "Read a Drive file's plain text by id (best for Docs/text files).",
        schema: { id: z.string() },
        run: async (tok, a) => api(`https://www.googleapis.com/drive/v3/files/${a.id}/export?mimeType=text/plain`, tok, "google") },
    ],
  }),
};

// Google base: shared OAuth + refresh, parameterized per Gmail/Drive.
function googleProvider({ id, label, scopes, tools }) {
  return {
    id, label, scopes, tools,
    clientId: () => env("GOOGLE_CLIENT_ID"),
    clientSecret: () => env("GOOGLE_CLIENT_SECRET"),
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    authorizeExtra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    tokenUrl: "https://oauth2.googleapis.com/token",
    async exchange({ code, redirectUri }) {
      const res = await fetch(this.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.clientSecret(), code, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
      const d = await j(res);
      if (!d.access_token) throw new Error("Google token exchange failed: " + (d.error_description || d.error || JSON.stringify(d)));
      return { providerToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + ((d.expires_in || 3600) * 1000) };
    },
    async refresh(refreshToken) {
      const res = await fetch(this.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.clientId(), client_secret: this.clientSecret(), refresh_token: refreshToken, grant_type: "refresh_token" }) });
      const d = await j(res);
      if (!d.access_token) throw new Error("Google token refresh failed: " + (d.error_description || d.error || JSON.stringify(d)));
      return { providerToken: d.access_token, expiresAt: Date.now() + ((d.expires_in || 3600) * 1000) };
    },
  };
}

// One HTTP helper for all provider APIs. Adds the right auth + content headers per provider.
async function api(url, token, provider, opts = {}) {
  const headers = { Authorization: "Bearer " + token, Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) };
  if (provider === "github") headers.Accept = "application/vnd.github+json";
  if (provider === "notion") headers["Notion-Version"] = "2022-06-28";
  const res = await fetch(url, { method: opts.method || "GET", headers, body: opts.body });
  const text = await res.text();
  return text.slice(0, 8000) || `(${res.status})`;
}

export const listProviders = () => Object.values(PROVIDERS).filter((p) => p.clientId() && p.clientSecret());
