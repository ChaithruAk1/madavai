# Madav — Authentication, Trial & Access Control (Phase 1)

> © 2026 Samskruthi Harish. Proprietary. This document is the contract between the Madav
> client (desktop + future web) and the Madav **auth server**.

## Goals

1. Every user must **sign in** (Google or GitHub only) to use Madav — web *or* desktop.
2. **7‑day free trial** from first sign‑up, then a mandatory **paid subscription** (Stripe; no card
   required up front for launch).
3. **Always online**: the desktop app does **not** run offline. It validates the session with the
   server on every launch and periodically; no connection or invalid account ⇒ blocked.
4. **Behavior tracking** tied to the account id (analytics, added later).
5. **Ban / suspend** a user server‑side; takes effect within minutes everywhere.
6. Users keep using **their own LLM API keys** — Madav never proxies models or pays for
   inference. What is gated is **the Madav experience**, not the model calls.

## What is gated vs. local

- **Gated (requires a valid, non‑suspended, trial/active account, online):** the whole Madav UI.
- **Local & private (unchanged):** the user's LLM keys and all inference — those still go directly
  from the user's machine to their chosen provider. The auth server never sees prompts or keys.

Phase‑1 enforcement on desktop is a **client gate backed by mandatory online validation**. True
"served‑UI" enforcement (UI bytes only delivered to valid accounts) arrives with the web app /
desktop‑as‑shell in a later phase; the contract below already supports it.

## Account status model (server is authoritative)

The server computes a single `status` per user and returns it from `/me`:

| status      | meaning                                            | client behaviour                          |
|-------------|----------------------------------------------------|-------------------------------------------|
| `trialing`  | within 7 days of sign‑up, not yet subscribed       | full access + "N days left" banner        |
| `active`    | paid subscription in good standing                 | full access                               |
| `expired`   | trial ended, no active subscription                | **paywall** screen only                   |
| `suspended` | banned by an admin                                 | **locked out** screen, regardless of pay  |

Derivation (server side):
```
if (user.suspended)            status = "suspended"
else if (subscriptionActive)   status = "active"
else if (now < trialEndsAt)    status = "trialing"
else                           status = "expired"
```
`trialEndsAt = createdAt + 7 days`, stamped once at account creation and never reset (it's tied to the
Google/GitHub identity, so reinstalling/clearing the app does not grant a new trial).

## API contract (auth server)

Base URL is configurable in the client (`settings.authBaseUrl`). All times are ISO‑8601 UTC.

### `GET /auth/:provider/start?redirect=<url>&state=<nonce>`
`:provider` ∈ `google | github`. Redirects the **system browser** to the provider's consent page.
`redirect` is the loopback URL the desktop app is listening on (e.g. `http://127.0.0.1:PORT/cb`) or
the web app's callback. OAuth client secrets live **only on the server**.

### `GET /auth/:provider/callback`
Handles the provider redirect: exchanges the code, fetches the verified identity (email + provider
`sub`), **upserts** the user (stamping `trialEndsAt` on first creation), issues a **session token**,
and redirects to `redirect#token=<session>` (desktop loopback) or sets a cookie (web).

### `GET /me`  (Authorization: `Bearer <session>`)
Returns the live account state. The desktop app calls this **on launch and every few minutes**.
```json
{ "user": { "id": "...", "name": "...", "email": "...", "avatar": "...", "provider": "google" },
  "status": "trialing",
  "trialEndsAt": "2026-06-14T10:00:00Z",
  "daysLeft": 5,
  "subscription": { "active": false, "plan": null } }
```
`401` ⇒ not signed in / token invalid (client shows login). `403 {"error":"suspended"}` ⇒ banned.

### `POST /auth/logout`  (Bearer)
Invalidates the session.

### `POST /admin/users/:id/suspend` and `/unsuspend`  (admin key)
Flip the ban flag. Next `/me` from that user returns `suspended` ⇒ they're locked out within minutes.

### `POST /billing/checkout` (Bearer) ⇒ `{ url }`  — Phase 2
Creates a Stripe **subscription** Checkout session and returns its URL; the app opens it in the system
browser. On success Stripe fires `checkout.session.completed` → the webhook sets `subscriptionActive`.

### `POST /billing/portal` (Bearer) ⇒ `{ url }`
Stripe customer portal (manage / cancel). Requires the user to already have a `stripeCustomerId`.

### `POST /billing/webhook`  (Stripe‑signed; raw body)
Verifies the `Stripe-Signature` HMAC, then on `checkout.session.completed` /
`customer.subscription.updated|deleted` flips the user's `subscriptionActive` + `plan`.

**Client behaviour:** the paywall "Subscribe" button calls `/billing/checkout`, opens the URL, then
**polls `/me` every 5s** for up to 3 minutes; when status becomes `active`, the app unlocks
automatically. An in‑app **account menu** (top‑right) shows status and offers Manage subscription
(portal) / Subscribe / Sign out. Stripe env vars: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`,
`STRIPE_WEBHOOK_SECRET` (see `server/README.md`).

## Session token

A signed token the server issues and verifies (Phase‑1 reference uses HMAC‑SHA256; production may use
RS256 JWT). Short‑lived (e.g. 24h) and re‑validated online, so a ban bites quickly even before expiry.
Stored on the desktop **encrypted via Electron `safeStorage`** (same mechanism already used for API keys).

## Desktop sign‑in flow (no OAuth secrets in the app)

1. App launches → `GET /me` with the stored token. If `401`/offline/`suspended` ⇒ show the gate.
2. User clicks **Continue with Google / GitHub**.
3. Main process starts a one‑shot loopback server on `http://127.0.0.1:<random port>/cb`, then opens
   the **system browser** to `${authBaseUrl}/auth/<provider>/start?redirect=http://127.0.0.1:<port>/cb`.
4. User authenticates in the browser; the server redirects back to the loopback with `#token=…`.
5. Main process captures the token, stores it via `safeStorage`, closes the loopback server.
6. App calls `/me`, unlocks (or shows paywall) based on `status`.

This is OAuth 2.0 Authorization Code on the **server**; the desktop only ever holds the resulting
session token.

## "Always online" rule

- On launch the gate **must** get a successful `/me`. If the request fails (no internet) or returns
  non‑OK, the app shows a blocking **"Madav needs an internet connection and a signed‑in account"**
  screen — it never falls back to an offline/cached session.
- A re‑validation runs every few minutes; a failure or `suspended`/`expired` result re‑locks the app.

## What YOU must set up (one‑time, not buildable from code)

1. **Google OAuth Client** (Web application) + **GitHub OAuth App** — set their redirect URI to
   `${authBaseUrl}/auth/google/callback` and `/auth/github/callback`. Put the client id/secret in the
   server's env (`GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`).
2. **Host the auth server** (Render / Fly.io / Railway / a small VM) at a stable HTTPS URL; set
   `authBaseUrl` in the client to that URL. (Local dev: `http://127.0.0.1:8787`.)
3. **A server secret** (`SESSION_SECRET`) and an `ADMIN_KEY` for the suspend endpoints.
4. **Stripe** account (later) for billing.
5. A **security review** before production — see below.

## Security TODO before production (do not skip)

- Serve over **HTTPS only**; set `Secure`/`HttpOnly`/`SameSite` cookies for web.
- Validate the OAuth `state` nonce (CSRF) and the `redirect` allow‑list (only loopback / your domain).
- Move the JSON file store to a real DB (Postgres/Supabase) with backups.
- Rate‑limit `/auth/*` and `/me`; rotate `SESSION_SECRET` strategy; consider RS256 + key rotation.
- Add a privacy policy (`PRIVACY.md`) and a consent step — required once you track users + charge.
- Threat‑model the desktop gate: it raises the bar but a standalone build is ultimately patchable;
  the web / served‑UI path is the strong enforcement and where paid users should live.
