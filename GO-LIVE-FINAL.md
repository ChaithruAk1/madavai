# BrainEdge — FINAL go‑live runbook (web app)

This is the single source of truth to launch. It assumes the plan: **Render** (always‑on) + **Supabase
Postgres** + **web app first** + **7‑day trial now, Stripe live within the first week** + host URL (custom
domain later). Written for someone who is not a developer — follow it top to bottom.

Time: ~60–90 min for Parts 1–6 (that's enough to be LIVE). Part 7 (Stripe) can be done any time in the
first week. Part 9 is for later, as you grow.

---

## Part 0 — Before you start, gather these
You'll need accounts (all free to start): **GitHub**, **Render** (render.com), **Supabase** (supabase.com),
your **Google** + **GitHub OAuth** credentials (you already made these for testing), and later **Stripe**.

> IMPORTANT — security: the Google/GitHub secrets you pasted while testing must be **rotated** (regenerated)
> before launch. Steps are in Part 5. Don't skip it.

---

## Part 1 — Create the database (Supabase) · ~10 min
1. supabase.com → sign up → **New project**. Name it, set a strong DB password (save it).
2. Wait for it to finish provisioning.
3. Left menu → **Project Settings → Database → Connection string → URI**. Copy it. It looks like
   `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`. Put your real password in place of
   `[PASSWORD]`. **This is your `DATABASE_URL`.** (Use the "Session pooler" URI if offered — better for scale.)

The app creates its own tables automatically on first run. Nothing else to do here.

## Part 2 — Push the code to GitHub · ~5 min
In PowerShell, in `C:\Projects\ClaudeCodeUI\BrainEdge`:
```
git add -A
git commit -m "Launch"
git push
```
If you don't have a GitHub repo yet: github.com → New repository → follow its "push an existing repository"
lines.

## Part 3 — Deploy on Render · ~15 min
1. render.com → sign up → **New → Web Service** → connect your GitHub repo.
2. It reads the included `render.yaml`. Confirm: Build `npm install && npm run build`, Start
   `node server/auth-server.mjs`. Choose the **Starter** instance ($7/mo, always‑on) — the free one sleeps
   and makes the first visit slow.
3. **Create**. First deploy takes a few minutes and gives you a URL like `https://brainedge.onrender.com`.
   Copy it — call it **YOUR_URL**.

## Part 4 — Set the production settings (Render → your service → Environment) · ~10 min
Add these (the secret‑style ones aren't in the file for safety):
```
AUTH_BASE_URL      = YOUR_URL                      (e.g. https://brainedge.onrender.com)
ALLOWED_REDIRECTS  = YOUR_URL                      (same value)
DATABASE_URL       = (the Supabase URI from Part 1)
ADMIN_EMAILS       = chaithru@gmail.com            (your admin login)
SESSION_SECRET     = (let Render generate, or a long random string)
ADMIN_KEY          = (a long random string)
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET = your real values
TRIAL_DAYS         = 7
```
Do **NOT** set `ALLOW_DEV_LOGIN` (dev login must be off in production). Leave the Stripe vars empty for now
(Part 7). Save — Render redeploys. The startup log should say `store postgres`.

## Part 5 — Make Google & GitHub production‑ready · ~15 min
**Rotate the secrets first** (the testing ones were exposed):
- Google: console.cloud.google.com → Credentials → your OAuth client → **Reset/Add secret** → use the new one.
- GitHub: Settings → Developer settings → OAuth Apps → your app → **Generate a new client secret** → use it.
Update those new values in Render (Part 4) and in your local `server/.env`.

**Add the live redirect URLs** (they currently only trust 127.0.0.1):
- Google → your OAuth client → **Authorized redirect URIs** → add `YOUR_URL/auth/google/callback`.
- GitHub → your OAuth App → **Authorization callback URL** → set/add `YOUR_URL/auth/github/callback`.

**Publish the Google consent screen**: Google → APIs & Services → **OAuth consent screen** → set it from
"Testing" to **In production / Publish**. (While in "Testing" only the test users you listed can sign in.)

## Part 6 — You're live · ~5 min
Open **YOUR_URL** in a browser → **Continue with Google** → you should be in, on a 7‑day trial. Share that
URL. Anyone can sign up. You're an admin (your email), so Settings → Admin Analytics shows usage.

---

## Part 7 — Turn on payments (do this within the first week) · Stripe
Nobody hits the paywall until their trial ends (7 days), so you have a buffer.
1. Stripe → activate your account (business details — start this early; verification can take a day or two).
2. Create a **recurring Price** (Products → add product → recurring, monthly). Copy its `price_...` id.
3. Developers → **Webhooks** → Add endpoint `YOUR_URL/billing/webhook`, events:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copy its
   **Signing secret** (`whsec_...`).
4. In Render → Environment, set:
   ```
   STRIPE_SECRET_KEY      = sk_live_...
   STRIPE_PRICE_ID        = price_...   (the recurring one)
   STRIPE_WEBHOOK_SECRET  = whsec_...
   ```
   Save. Startup log should now read `stripe ON`. Test with a real card on a fresh account after its trial.

---

## Part 8 — Pre‑launch checklist (do all of these)
- [ ] **Rotated** the Google + GitHub secrets (Part 5).
- [ ] `ALLOW_DEV_LOGIN` is **not set** on Render.
- [ ] **2FA turned on** for your Google, GitHub, Render, Supabase, and (later) Stripe accounts. This is the
      single biggest protection — your whole admin power is "whoever logs in as your email."
- [ ] `ADMIN_EMAILS` is just you (and anyone you trust).
- [ ] `SESSION_SECRET` and `ADMIN_KEY` are long random strings (not the dev defaults).
- [ ] Fill in `PRIVACY.md` and `TERMS.md` (replace the bracketed fields) and link them from the app/site.
- [ ] Google consent screen **published**.
- [ ] Visit YOUR_URL in a private window and sign up as a brand‑new user to confirm the trial flow.

## Part 9 — Built to grow to 10k+ users (do as you scale, not tomorrow)
You don't need these on day one, but here's the path so nothing surprises you:
- **Database**: Supabase free tier is fine to start; upgrade the plan as users grow, and use the **pooler**
  connection string (handles many connections). Turn on automated backups.
- **Server plan**: Render Starter is fine for a few thousand. Bump to a larger instance as traffic rises;
  the app is stateless (tokens are signed, not stored), so it scales horizontally later.
- **Rate limiting** is currently in‑memory (per server instance). Fine for one instance. If you ever run
  **multiple** instances, move it to a shared store (Redis) — tell me and I'll wire it.
- **Proxy bandwidth**: users on providers that block browsers (NVIDIA/OpenAI) stream through your server,
  which uses egress bandwidth. Users on OpenRouter go direct (free to you). Watch this cost as you grow;
  it's the main variable expense.
- **Custom domain**: buy one (e.g. brainedge.ai), add it in Render → Settings → Custom Domain, then change
  `AUTH_BASE_URL` + `ALLOWED_REDIRECTS` to it and add the new `/auth/*/callback` URLs in Google/GitHub. ~10 min.
- **Stronger tokens**: before large scale, consider RS256 JWTs + key rotation and the official Stripe SDK.

## Part 10 — Desktop app (fast follow, not tomorrow)
The web app is the right thing to launch first. For the downloadable desktop installer:
- Build: `npm run electron:build` → `release/` gets the `.exe`.
- **It needs a code‑signing certificate** — without one, Windows SmartScreen warns users "unknown publisher,"
  which kills trust. Buy an OV/EV code‑signing cert (~$100–300/yr) before distributing widely.
- Point the desktop app's **Account server URL** (Settings → Profile) at YOUR_URL so it shares accounts.
- Before shipping desktop: disable the Anthropic **subscription** sign‑in option (using a personal Claude
  subscription through a third‑party app breaches Anthropic's terms) — keep the API‑key path only. Tell me
  and I'll remove that toggle.

---

### The shortest version
Supabase DB → push to GitHub → Render web service ($7 always‑on) → set the env vars → rotate + publish the
Google/GitHub OAuth → open YOUR_URL. That's live. Add Stripe within the week. Turn on 2FA everywhere.
