# BrainEdge — Deploying the auth server (production)

The auth server (`server/`) runs anywhere that runs Node ≥18 and gives you HTTPS. For real users you
want: a **public HTTPS URL**, a **Postgres database** (instead of the local `users.json`), and the
**env secrets** set on the host. Then point the app's `authBaseUrl` at the deployed URL.

## 1. Pick a database (Postgres)

Any managed Postgres works — the server uses a plain `DATABASE_URL`:
- **Supabase** (recommended free tier): create a project → Project Settings → Database → copy the
  **Connection string (URI)**. Use the **session/pooler** connection string.
- **Neon** / **Railway Postgres** / **Render Postgres**: same idea — copy the connection URL.

The server auto‑creates the `users` table on first start. (Install the driver in `server/`:
`cd server && npm install` — `pg` is an optional dependency, pulled in only for Postgres.)

## 2. Pick a host for the server

Any of these deploy a Node app with HTTPS in minutes:
- **Render** (Web Service, free tier) — point it at this repo, root dir `server`, build `npm install`,
  start `node auth-server.mjs`.
- **Fly.io** — `fly launch` in `server/`, set secrets with `fly secrets set`.
- **Railway** — new service from repo, root `server`.

## 3. Set the environment variables on the host

```
AUTH_BASE_URL=https://auth.yourdomain.com     # the server's own public URL (no trailing slash)
SESSION_SECRET=<long random string>
ADMIN_KEY=<long random string>
DATABASE_URL=postgres://...                    # from step 1 (omit to keep the JSON file)
TRIAL_DAYS=7
ALLOWED_REDIRECTS=https://app.yourdomain.com   # your web app origin(s), comma-separated (optional)
# OAuth
GOOGLE_CLIENT_ID=...    GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...    GITHUB_CLIENT_SECRET=...
# Stripe (live keys when you go live)
STRIPE_SECRET_KEY=sk_live_...   STRIPE_PRICE_ID=price_...   STRIPE_WEBHOOK_SECRET=whsec_...
```
Do **NOT** set `ALLOW_DEV_LOGIN` in production. The startup log should read
`store postgres · dev-login off · stripe ON`.

## 4. Update the third‑party redirect/callback URLs to the public host

- **Google** console → your OAuth client → Authorized redirect URIs → add
  `https://auth.yourdomain.com/auth/google/callback`.
- **GitHub** OAuth App → Authorization callback URL → `https://auth.yourdomain.com/auth/github/callback`.
- **Stripe** → Developers → Webhooks → add endpoint `https://auth.yourdomain.com/billing/webhook`
  (events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`),
  copy its signing secret into `STRIPE_WEBHOOK_SECRET`. (No Stripe CLI needed in production.)

## 5. Point the desktop app at the deployed server

In the app: **Settings → Profile → Advanced → Account server URL**, set it to
`https://auth.yourdomain.com` (or bake it into the build's default). The desktop OAuth loopback still
works because the server redirects back to `http://127.0.0.1:<port>/cb` on the user's own machine.

## 6. Security checklist (see also AUTH.md)

- HTTPS only (the host provides TLS; keep `AUTH_BASE_URL` https).
- Rotate `SESSION_SECRET` / `ADMIN_KEY` and **the OAuth client secrets you exposed during testing**.
- Postgres with automated backups; restrict network access.
- Rate limiting is in‑process — fine for one instance; use a shared store (Redis) if you scale out.
- Publish a `PRIVACY.md` + consent; complete the Google OAuth consent screen.
- Consider RS256 JWTs + key rotation, and the official Stripe SDK, before scale.
