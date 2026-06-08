# Go live — put the web app on a public URL

This is the plain‑English walkthrough to take BrainEdge from "runs on my laptop" to "real users can
visit it." You'll use two free services: **Supabase** (database) and **Render** (hosting). Budget ~30–45 min.

## Why a database?
On your laptop the data sits in a file. On a host, that file gets wiped on every redeploy, so accounts
would vanish. A real database (Supabase Postgres) keeps your users, trials, and subscriptions safe.

---

## Step 1 — Create the database (Supabase)
1. Go to **supabase.com** → sign up → **New project**. Pick a name and a strong database password.
2. When it's ready: left sidebar → **Project Settings → Database → Connection string → URI**.
3. Copy that string (it looks like `postgresql://postgres:...@...supabase.co:5432/postgres`).
   Keep it handy — that's your `DATABASE_URL`. The app creates its own tables automatically on first run.

## Step 2 — Put your code on GitHub
Render deploys from GitHub. In your project folder:
```
git add -A
git commit -m "Deploy"
git push
```
(If you don't have a GitHub repo yet, create one at github.com → New repository, then follow its
"push an existing repository" commands.)

## Step 3 — Host it on Render
1. Go to **render.com** → sign up → **New → Web Service** → connect your GitHub repo.
2. Render reads the included `render.yaml`, so most settings auto‑fill. Confirm:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `node server/auth-server.mjs`
3. Click **Create**. The first deploy takes a few minutes and gives you a URL like
   `https://brainedge.onrender.com`. Copy it.

## Step 4 — Fill in the settings (Render → Environment)
In your service → **Environment**, add these (the password‑style ones):
- `AUTH_BASE_URL` = your Render URL (e.g. `https://brainedge.onrender.com`)
- `ALLOWED_REDIRECTS` = the **same** URL
- `DATABASE_URL` = the Supabase string from Step 1
- `ADMIN_EMAILS` = your email (so you're the admin)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` = same values
  from your local `server/.env`
- Leave `ALLOW_DEV_LOGIN` **unset** (dev login must be off in production)

Save — Render redeploys. The startup log should say `store postgres`.

## Step 5 — Point Google & GitHub at the live URL
Your login apps currently only trust `127.0.0.1`. Add the live address:
- **Google** (console.cloud.google.com → Credentials → your OAuth client → Authorized redirect URIs):
  add `https://brainedge.onrender.com/auth/google/callback`
- **GitHub** (Developer settings → your OAuth App → Authorization callback URL):
  set/add `https://brainedge.onrender.com/auth/github/callback`

(Use your real Render URL.)

## Step 6 — Try it
Open your Render URL in a browser and sign in with Google. You're live. Share that URL with anyone.

## Step 7 (later) — Turn on payments
When you're ready to charge:
1. In Stripe, create a **recurring Price**, copy its `price_...` id.
2. Stripe → Developers → Webhooks → add endpoint `https://brainedge.onrender.com/billing/webhook`
   (events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`);
   copy its signing secret.
3. In Render Environment, set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`. Save.

## A few honest notes
- **Free tiers sleep.** Render's free service goes to sleep after inactivity, so the first visit after a
  while is slow (~30s) while it wakes. A paid plan (~$7/mo) keeps it always‑on for real users.
- **Rotate your secrets.** Before sharing the URL, regenerate the Google/GitHub secrets you used during
  testing and put the fresh ones in Render.
- **NVIDIA/local providers** still route through your server's proxy as set up; OpenRouter stays direct.
- The **desktop app** can point at this same URL too — Settings → Profile → Account server URL.
