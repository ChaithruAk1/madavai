# BrainEdge — Real Google & GitHub sign‑in setup

The auth server already implements both OAuth flows (`/auth/google/*`, `/auth/github/*`). You just
need to create the two OAuth apps, give the server their credentials, and run it **without** the dev
login flag. Redirect URIs below use the local dev URL `http://127.0.0.1:8787`; swap in your public
HTTPS URL when you deploy.

## 1. Google OAuth client

1. Go to **console.cloud.google.com** → create or pick a **project** (top bar).
2. **APIs & Services → OAuth consent screen**:
   - User type **External** → Create.
   - App name `BrainEdge`, your support email, developer email → Save.
   - Scopes: add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` → Save.
   - **Test users**: add your own Gmail (while the app is in "Testing", only listed users can sign in).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type **Web application**, name `BrainEdge desktop`.
   - **Authorized redirect URIs** → add exactly:
     `http://127.0.0.1:8787/auth/google/callback`
   - Create → copy the **Client ID** and **Client secret**.

## 2. GitHub OAuth app

1. **github.com → Settings → Developer settings → OAuth Apps → New OAuth App.**
2. Application name `BrainEdge`; Homepage URL `http://127.0.0.1:8787`.
3. **Authorization callback URL** (exactly):
   `http://127.0.0.1:8787/auth/github/callback`
4. Register application → copy the **Client ID**; click **Generate a new client secret** → copy it.

## 3. Run the server with OAuth (dev login OFF)

In the BrainEdge folder (replace the four values; add your Stripe vars too if testing billing):
```
$env:SESSION_SECRET="a-long-random-string"; $env:GOOGLE_CLIENT_ID="...apps.googleusercontent.com"; $env:GOOGLE_CLIENT_SECRET="..."; $env:GITHUB_CLIENT_ID="..."; $env:GITHUB_CLIENT_SECRET="..."; node server/auth-server.mjs
```
Note: **omit `ALLOW_DEV_LOGIN`** so the dev shortcut is disabled and you exercise the real flow. The
startup line should read `dev-login off`.

## 4. Test

1. Run the app (`npm run electron:dev`) — the dev sign‑in button no longer appears (dev build hides it
   only when `import.meta.env.DEV`, and the server would 404 it anyway).
2. Click **Continue with Google** → your browser opens Google's consent screen → approve → it returns
   to the app, signed in with your real Google identity and a fresh **7‑day trial**.
3. Repeat with **Continue with GitHub**.
4. Verify in `server/users.json`: you'll see real entries keyed `google:…` / `github:…` with your email.

## Common issues

- **`redirect_uri_mismatch` (Google)** — the URI in the console must be character‑for‑character
  `http://127.0.0.1:8787/auth/google/callback` (note `127.0.0.1`, not `localhost`, matching the
  server's `AUTH_BASE_URL`). If you set `AUTH_BASE_URL` to something else, register that callback.
- **Google "access blocked / app not verified"** — you're not on the test‑users list, or the consent
  screen is unpublished. Add your email under Test users, or publish the consent screen.
- **GitHub returns no email** — the server falls back to `/user/emails`; ensure the `user:email` scope
  is granted (it's requested by default).

## Production

Register the **public HTTPS** callbacks (`https://YOUR_AUTH_URL/auth/google/callback`,
`/auth/github/callback`), set `AUTH_BASE_URL` to that URL, set the env vars on your host, and publish
the Google consent screen. See the security checklist in `AUTH.md`.
