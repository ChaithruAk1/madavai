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
};

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
