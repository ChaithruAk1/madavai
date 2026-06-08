# auth-kit — reusable login + trial + subscription

A zero-dependency account system you can drop into any web or Electron app: Google/GitHub login, a
7-day free trial, mandatory paid subscription via Stripe, admin user management, and basic analytics.

## Quick start (local)

```bash
# 1. copy this folder into your project, then:
cp server/.env.example server/.env        # fill in APP_NAME, SESSION_SECRET, ADMIN_KEY, OAuth creds
node server/auth-server.mjs               # starts on http://127.0.0.1:8787
```

Test without OAuth/Stripe: keep `ALLOW_DEV_LOGIN=1` in `.env`, then hit
`http://127.0.0.1:8787/auth/dev/start?redirect=http://127.0.0.1:8787/` — it returns a session token.

## Wire it into your app (browser)

```html
<script type="module">
  import { createAuthClient } from "./auth-client.js";
  const auth = createAuthClient();            // same-origin; or { baseUrl: "https://auth.example.com" }

  async function boot() {
    const me = await auth.me();
    if (me.error === "unauthenticated") return renderLogin();
    if (me.status === "suspended")     return renderBlocked();
    if (me.status === "expired")       return renderPaywall(me);
    renderApp(me);                              // trialing or active
  }
  function renderLogin() { /* button -> */ auth.signIn("google"); }
  function renderPaywall(me) { /* button -> */ auth.subscribe(); }
  boot();
  setInterval(boot, 3 * 60 * 1000);            // re-validate so bans/expiry lock the app
</script>
```

`me` looks like:
```json
{ "user": { "id": "...", "name": "...", "email": "...", "avatar": "...", "provider": "google" },
  "admin": false, "status": "trialing", "daysLeft": 6,
  "subscription": { "active": false, "plan": null } }
```

## Configuration (server/.env)

| Var | Purpose |
| --- | --- |
| `APP_NAME` | shown on sign-in/billing pages and logs |
| `SESSION_SECRET` | HMAC secret for session tokens (long & random) |
| `ADMIN_KEY` | grants admin API access via `x-admin-key` |
| `TRIAL_DAYS` | trial length (default 7) |
| `ALLOW_DEV_LOGIN` | `1` enables `/auth/dev/start` (local only — never in prod) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | OAuth apps you create |
| `AUTH_BASE_URL` | public URL of this server (prod) |
| `ALLOWED_REDIRECTS` | web origins allowed as OAuth redirect targets |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | billing (off until all set) |
| `DATABASE_URL` | use Postgres instead of the JSON file |
| `ADMIN_EMAILS`, `FREE_EMAILS` | comma-separated; or use `admin-emails.txt` / `free-emails.txt` |

OAuth redirect URIs to register: `{AUTH_BASE_URL}/auth/google/callback` and `.../auth/github/callback`.

## Managing users

```bash
# suspend / ban, or restore:
curl -X POST {server}/admin/users/<id>/suspend   -H "x-admin-key: <ADMIN_KEY>"
curl -X POST {server}/admin/users/<id>/unsuspend -H "x-admin-key: <ADMIN_KEY>"
# grant / revoke free access (skips the paywall):
curl -X POST {server}/admin/users/<id>/comp   -H "x-admin-key: <ADMIN_KEY>"
curl -X POST {server}/admin/users/<id>/uncomp -H "x-admin-key: <ADMIN_KEY>"
```
Or add emails to `server/admin-emails.txt` (admins) / `server/free-emails.txt` (free access) — read
live, no restart. Admins can then call `GET /admin/stats` and `GET /admin/users` from their session.

## Stripe

1. Create a **recurring Price**; put its `price_...` id in `STRIPE_PRICE_ID`.
2. Add a webhook to `{AUTH_BASE_URL}/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret to
   `STRIPE_WEBHOOK_SECRET`. (Locally, use the Stripe CLI to forward events.)
3. The client's `auth.subscribe()` opens Checkout; on success the webhook flips the account to active
   and the app unlocks on the next `me()` poll.

## Deploy

Host the server with HTTPS, set `DATABASE_URL` (Postgres) + `AUTH_BASE_URL` + `ALLOWED_REDIRECTS`,
register the production OAuth/Stripe URLs, and set `ALLOW_DEV_LOGIN` **off**. To also serve a built
SPA from the same origin, point `WEB_DIR` at its `dist/`.

## Security notes

- Keep `ALLOW_DEV_LOGIN` off in production; rotate any secrets exposed during development.
- Tokens are stateless HMAC (24h, re-validated online). For higher assurance, move to RS256 + key
  rotation and add the official Stripe SDK before scale. Rate limiting here is in-process (single
  instance) — use a shared store (Redis) if you run multiple instances.
