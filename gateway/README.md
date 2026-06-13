# Madav Connector Gateway (Phase 1 — GitHub · Notion · Slack)

This small service is what makes **one-click connectors** work in Madav, the same way
Claude's do. It is an OAuth authorization server that *brokers* each provider's own OAuth:
you sign in to GitHub/Notion/Slack in your browser, the gateway stores the resulting token
(server-side, never in the desktop app), and exposes each provider as an OAuth-protected
**remote MCP server** that Madav connects to with its built-in "Sign in with your browser".

```
Madav  ──/github/mcp──▶  Gateway (this)  ──OAuth──▶  GitHub
        ◀── tools ──                      ◀── token ──
```

You only do this setup once. **Cost: $0** for these three providers (no paid verification).

---

## What you need
- A place to run this with a public **HTTPS** URL (a free host is fine — see below).
- Node 18+ (only if running locally).
- 10 minutes to register three free OAuth apps.

---

## Step 1 — Deploy it (get your PUBLIC_URL)

Pick whichever is easiest; all have free tiers.

**Option A — Render (simplest click-deploy)**
1. Push this `gateway/` folder to a GitHub repo (or use Render's "deploy from repo").
2. New → Web Service → pick the repo → Root directory `gateway`.
3. Build command `npm install`, Start command `npm start`.
4. It gives you a URL like `https://madav-gw.onrender.com` — that's your **PUBLIC_URL**.

**Option B — Run locally + free tunnel (no signup host)**
1. `cd gateway && npm install && PUBLIC_URL=<tunnel-url> npm start`
2. Expose it with a free Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:8077`)
   — use the `https://…trycloudflare.com` URL it prints as **PUBLIC_URL** (restart with it set).

> The URL must be HTTPS and stable. On free tunnels the URL changes each run; for ongoing
> use prefer a host (Option A) or a named Cloudflare tunnel.

---

## Step 2 — Register the OAuth apps (free)

For each, the **callback/redirect URL is `PUBLIC_URL/oauth/<provider>/callback`**. Use your real PUBLIC_URL.

**GitHub** — github.com → Settings → Developer settings → **OAuth Apps** → New
- Authorization callback URL: `PUBLIC_URL/oauth/github/callback`
- Copy **Client ID** + generate a **Client secret**.

**Notion** — notion.so/my-integrations → New integration → **Public** (OAuth)
- Redirect URI: `PUBLIC_URL/oauth/notion/callback`
- Copy the **OAuth client ID** + **secret**.

**Slack** — api.slack.com/apps → Create New App → **OAuth & Permissions**
- Redirect URL: `PUBLIC_URL/oauth/slack/callback`
- Bot token scopes: `channels:read`, `chat:write`, `channels:history`, `users:read`.
- Copy the **Client ID** + **Client Secret** (Basic Information).

You don't have to register all three — configure only the ones you want; the gateway shows
whichever are set.

---

## Step 3 — Set environment variables

Copy `.env.example` → `.env` (local) or set these in your host's dashboard:

```
PUBLIC_URL=https://your-gateway.example.com
GATEWAY_SECRET=<any long random string>
GITHUB_CLIENT_ID=...        GITHUB_CLIENT_SECRET=...
NOTION_CLIENT_ID=...        NOTION_CLIENT_SECRET=...
SLACK_CLIENT_ID=...         SLACK_CLIENT_SECRET=...
```

Restart/redeploy. Visit `PUBLIC_URL/` — it lists the ready connectors and the exact MCP
URL to paste into Madav.

---

## Step 4 — Connect from Madav

1. Madav → Connectors → search the connector (or add a Custom MCP server).
2. Set **Connection type = Remote**, **Server URL = `PUBLIC_URL/github/mcp`** (or `/notion/mcp`, `/slack/mcp`), Transport = Streamable HTTP.
3. Click **Sign in with your browser** → approve in the provider's page → the dot turns green.
4. Click **Test connection** — you should see the provider's tools.

That's it: the agent can now use those tools in Chat, Cowork, Code, and Projects.

---

## Security notes
- Provider tokens live **only on the gateway** (in `.gateway-store.json`, file-permission 0600). Madav only ever holds a gateway-issued token.
- OAuth client **secrets** live only in the gateway's environment — never in the desktop app or the renderer.
- PKCE + `state` are enforced on the Madav↔gateway leg by the MCP SDK.
- Keep `PUBLIC_URL` on HTTPS. Don't expose the gateway on an untrusted network without it.
- This is a single-tenant design (you run it for yourself / your org). For multi-user SaaS you'd add per-user isolation + a real datastore.

## Troubleshooting
- **Madav says "didn't start a browser sign-in"** → the Server URL must be a gateway `/…/mcp` URL, not a raw provider URL.
- **Provider page shows redirect_uri mismatch** → the callback in Step 2 must exactly equal `PUBLIC_URL/oauth/<provider>/callback` (no trailing slash, correct scheme).
- **Tools list is empty after sign-in** → check the gateway logs; usually a missing scope (re-add in Step 2) or wrong client secret.
- **Works then stops after redeploy** → if the host has an ephemeral filesystem, `.gateway-store.json` resets and you re-sign-in. Mount a small persistent volume or accept the occasional re-auth.

## Phase 2 (later) — Google / Microsoft
Gmail, Drive, Outlook use **restricted scopes**: Google/Microsoft require app verification
incl. a third-party security (CASA) assessment (~$1k–$5k/yr) and a verified domain + privacy
policy. The gateway code supports adding them (same provider pattern), but that approval is
the real gate — exactly the hurdle a vendor like Anthropic clears as a company.

---

## Composio — broad one-click catalog (optional, no per-app OAuth registration)

The five connectors above need you to register an OAuth app each. To get **one-click for
hundreds of apps without registering anything**, add a Composio API key. Composio supplies
the OAuth app (managed auth) and hosts the sign-in; your gateway brokers it.

1. Sign up at **app.composio.dev** → copy your **API key** (free tier: 20,000 tool calls/month).
2. In Render → madav-gateway → **Environment** → add `COMPOSIO_API_KEY` = your key → Save.
3. After redeploy, open your gateway `/` URL — the `connect` list now includes Composio
   toolkits with URLs like `…/c/gmail/mcp`, `…/c/linear/mcp`, `…/c/jira/mcp`, etc.
4. In Madav: add a remote connector → Server URL `…/c/<toolkit>/mcp` → **Sign in with your
   browser** → you're authenticated via Composio's hosted page → Test.

The curated toolkit list lives in `src/composio.js` (`COMPOSIO_TOOLKITS`) — add or remove
slugs there to control which apps appear. Composio has ~250+; these are the popular front.

**Cost:** your users pay nothing; you (the operator) are billed by Composio only past the
free 20k tool-calls/month. **Privacy:** with Composio, users' tokens are held by Composio
(not your gateway) — that's the trade for not registering OAuth apps yourself.

**Note:** the Composio integration is wired against Composio's documented SDK (managed
auth configs + `link()` hosted sign-in + `tools.execute`). Like the rest, it needs one live
test pass with a real key + a real sign-in; the OAuth discovery chain is already verified.
