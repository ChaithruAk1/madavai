---
name: auth-paywall
description: >
  Add user accounts, a free trial, and paid subscriptions to any web or Electron app. Use when the
  user wants login (Google/GitHub), a time-limited free trial that converts to a mandatory paid plan,
  Stripe billing, the ability to suspend/ban users or grant free access, and basic usage analytics —
  i.e. "let users sign in", "add a paywall", "7-day trial then subscription", "charge for my app",
  "track and manage users". Drops in a zero-dependency Node auth server plus a portable browser client.
---

# auth-paywall — drop-in login + trial + subscription + analytics

This skill bundles a battle-tested, **zero-dependency** account system you can add to any app.

## What it provides

- **Login** with Google and/or GitHub (OAuth; your client secrets stay on the server).
- **7-day free trial** stamped at signup, then a **mandatory paid subscription** (Stripe) — configurable.
- **Account gate**: server-authoritative status `trialing | active | expired | suspended`, re-validated
  online so bans/expiry take effect within minutes.
- **Admin controls**: suspend/ban a user, or grant **free access** (comp) — by API or an admin-email list.
- **Analytics**: signups, sign-ins, conversions, last-seen, and app-reported events, with `/admin/stats`.
- **Storage**: JSON file out of the box; **Postgres** automatically when `DATABASE_URL` is set.

Files in this bundle:

```
server/auth-server.mjs   # the HTTP server (Node >=18, no dependencies)
server/store.mjs         # user + events store (JSON or Postgres)
server/.env.example      # all configuration
client/auth-client.js    # portable browser client (vanilla/React/Vue)
README.md                # full setup + deploy guide
```

## Tune it to each business (no code changes — just env)

This kit is meant to be reused across different products. Everything that varies per business is an
environment variable, so the same code fits any use case:

- **Product name** — `APP_NAME` (shown on sign‑in/billing pages).
- **Trial length** — `TRIAL_DAYS` (e.g. `0` for no trial / card‑up‑front, `14` for two weeks, `7` default).
- **Price & plan** — `STRIPE_PRICE_ID` points at whatever recurring price you create in Stripe (monthly,
  yearly, tiered — your choice). The plan name surfaced to the app comes from Stripe.
- **Free / VIP users** — `FREE_EMAILS` (or `free-emails.txt`) for anyone who should skip the paywall.
- **Admins** — `ADMIN_EMAILS` (or `admin-emails.txt`) for who can see analytics + manage users.
- **Providers** — Google and/or GitHub; set only the ones you want.
- **Storage** — JSON file for tiny apps, or set `DATABASE_URL` for Postgres at scale.

The client works with **any frontend** (vanilla JS, React, Vue, Svelte) and on **web or Electron** — it's
plain `fetch` + `localStorage`, no framework lock‑in.

## How to integrate (do this when the user asks)

1. **Copy** `server/` and `client/auth-client.js` into the target project.
2. **Configure**: copy `server/.env.example` to `server/.env`; set `APP_NAME`, `SESSION_SECRET`,
   `ADMIN_KEY`, and the OAuth credentials. For testing, keep `ALLOW_DEV_LOGIN=1` (enables `/auth/dev/start`).
3. **Run** the server: `node server/auth-server.mjs` (it prints its config on startup).
4. **Gate the app** with the client:
   ```js
   import { createAuthClient } from "./auth-client.js";
   const auth = createAuthClient({ baseUrl: AUTH_SERVER_URL }); // omit baseUrl if same-origin
   const me = await auth.me();
   if (me.error === "unauthenticated") showLogin(() => auth.signIn("google"));
   else if (me.status === "expired")  showPaywall(() => auth.subscribe());
   else if (me.status === "suspended") showBlocked();
   else renderApp(me); // trialing or active
   ```
   Poll `auth.me()` every few minutes so trial expiry / bans lock the app without a reload.
5. **Stripe** (when ready): set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (a recurring price), and
   `STRIPE_WEBHOOK_SECRET`; add a webhook to `{server}/billing/webhook` for
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
6. **Deploy**: see README — set `DATABASE_URL` (Postgres), `AUTH_BASE_URL`, `ALLOWED_REDIRECTS`, and the
   production OAuth/Stripe URLs.

## Endpoints (reference)

`GET /auth/{google|github}/start` · `GET /auth/{provider}/callback` · `GET /me` · `POST /auth/logout`
· `POST /events` · `POST /billing/checkout|portal|webhook` · `POST /admin/users/:id/{suspend|unsuspend|comp|uncomp}`
· `GET /admin/users` · `GET /admin/stats` · `GET /health`. Admin routes accept the `x-admin-key` header
or a signed-in admin-email session.

## Notes

- The client keeps the session token in `localStorage`; OAuth redirects back with `?token=` which the
  client captures automatically. For **Electron**, do the OAuth on a one-shot `127.0.0.1` loopback
  redirect instead and store the token encrypted — the server already supports a loopback `redirect`.
- Keep `ALLOW_DEV_LOGIN` OFF in production. Rotate any OAuth secrets exposed during development.
