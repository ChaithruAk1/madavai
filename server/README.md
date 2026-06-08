# BrainEdge auth server (reference, Phase 1)

Zero‑dependency Node (>=18) implementation of the auth/trial contract in `../AUTH.md`. OAuth secrets
live here, not in the app. This is a dev/starter server — read the **Security TODO** in `AUTH.md`
before production (HTTPS, real DB, CSRF/state validation, rate limiting, security review).

## 1. Create the OAuth apps (one‑time)

- **Google** — Google Cloud Console → Credentials → OAuth client → *Web application*.
  Authorized redirect URI: `https://YOUR_AUTH_URL/auth/google/callback`
  (local dev: `http://127.0.0.1:8787/auth/google/callback`).
- **GitHub** — Settings → Developer settings → OAuth Apps → New.
  Authorization callback URL: `https://YOUR_AUTH_URL/auth/github/callback`.

## 2. Configure (env vars)

```
PORT=8787
AUTH_BASE_URL=http://127.0.0.1:8787        # your public HTTPS URL in production
SESSION_SECRET=<long random string>
ADMIN_KEY=<long random string>
TRIAL_DAYS=7
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

## 3. Run

```
node server/auth-server.mjs
```

Health check: `GET /health`. Point the desktop app at it via Settings → `authBaseUrl` (or the
default `http://127.0.0.1:8787` in dev).

## 4. Suspend / unsuspend a user (ban)

```
curl -X POST https://YOUR_AUTH_URL/admin/users/<id>/suspend -H "x-admin-key: <ADMIN_KEY>"
```
`<id>` is the user id from `users.json` (e.g. `google:1234…`). The user is locked out within minutes.

## 5. Deploy

Any host that runs Node and gives you HTTPS (Render, Fly.io, Railway, a small VM). Set the env vars,
update the OAuth redirect URIs to the public URL, and set the app's `authBaseUrl` to match.

## Endpoints

- `GET  /auth/:provider/start?redirect=<loopback|web>` — begin OAuth
- `GET  /auth/:provider/callback` — finish OAuth, redirect back with `#token=`
- `GET  /me` (Bearer) — `{ user, status, trialEndsAt, daysLeft, subscription }`
- `POST /auth/logout` (Bearer)
- `POST /admin/users/:id/suspend|unsuspend` (x-admin-key)
- `POST /billing/checkout` (Bearer) → `{ url }` Stripe Checkout
- `POST /billing/portal` (Bearer) → `{ url }` Stripe customer portal
- `POST /billing/webhook` (Stripe-signed) → flips `subscriptionActive`
- `GET  /billing/done` / `/billing/cancel` (post-checkout pages)
- `GET  /health`

## Billing (Phase 2 — Stripe)

Billing endpoints activate only when these env vars are set (the rest of the server runs without them):

```
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_PRICE_ID=price_...            # a recurring (subscription) Price in your Stripe dashboard
STRIPE_WEBHOOK_SECRET=whsec_...      # from the webhook endpoint you create
```

Setup:
1. Stripe dashboard → **Products** → create a product with a **recurring Price**; copy the `price_…` id.
2. **Developers → Webhooks → Add endpoint** → URL `https://YOUR_AUTH_URL/billing/webhook`; select events
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`;
   copy the **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.
3. Local testing: `stripe login` then `stripe listen --forward-to 127.0.0.1:8787/billing/webhook`
   (the Stripe CLI prints a `whsec_…` to use), and use a **test** `sk_test_…` key + test card `4242 4242 4242 4242`.

Flow: the app calls `/billing/checkout` → opens the Stripe URL in the browser → on success Stripe fires
`checkout.session.completed` → the webhook sets `subscriptionActive=true` → the app's `/me` poll returns
`active` and unlocks. Implemented with Stripe's REST API (no SDK dependency); webhook signatures are
verified with HMAC. For production, consider the official Stripe SDK and review the AUTH.md security list.
