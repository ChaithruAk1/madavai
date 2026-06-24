# Hosting madav.ai — Private-Beta Launch Runbook

Goal: madav.ai live, sign-in restricted to **admin + complimentary** accounts only
(everyone else sees a polite "private beta" page). Stack per GO-LIVE-FINAL.md:
Render (web service) + Supabase (Postgres). ~45 minutes.

## 0 · Prerequisites (local, once)
1. `npm install` (regenerates package-lock.json under the new name "madav").
2. `npm run build` green → full restart smoke → commit + push.
3. Rename the GitHub repo to `madav` (GitHub → repo Settings → rename; old URLs
   redirect automatically). Optionally rename the local folder and re-point the
   remote: `git remote set-url origin https://github.com/chaithruak/madav.git`.

## 1 · Database (Supabase, free tier is fine for beta)
1. supabase.com → New project → region near you → copy the **connection string**
   (Settings → Database → URI, the "connection pooling" one).
2. That string becomes `DATABASE_URL` below. Tables are created automatically by
   server/store.mjs on first run.

## 2 · Render web service
1. render.com → New → Web Service → connect the GitHub repo (render.yaml is already
   in the repo with service name `madav`; or configure manually:)
   - Build command: `npm install && npm run build:public`
     (public channel — the web bundle respects your Extras switchboard)
   - Start command: `node server/auth-server.mjs`
   - Instance: Starter ($7/mo, always-on).
2. Environment variables (Render → Environment):
   - `SESSION_SECRET` — long random string (the server REFUSES to boot in prod with
     the factory default)
   - `ADMIN_KEY` — long random string
   - `BASE` = `https://madav.ai`
   - `APP_NAME` = `Madav`
   - `PRIVATE_BETA` = `1`   ← the beta gate: only admin/complimentary may sign in
   - `ADMIN_EMAILS` = `chaithru@gmail.com`
   - `FREE_EMAILS` = comma-separated tester emails (they become Complimentary)
   - `DATABASE_URL` = the Supabase URI
   - `ALLOW_DEV_LOGIN` = `0`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — NEW credentials (rotate the ones
     pasted during testing — standing pre-launch item)
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — same
   - Stripe keys can wait — beta users are admin/complimentary, nobody hits checkout.
3. Deploy → note the `madav.onrender.com` URL works first.

## 3 · Point madav.ai at Render
1. Render service → Settings → Custom Domains → add `madav.ai` and `www.madav.ai`.
2. Render shows the exact records. At your registrar's DNS panel:
   - `madav.ai` → A record to Render's IP (Render displays it, currently 216.24.57.1)
     or ALIAS/ANAME to the onrender hostname if your registrar supports it
   - `www` → CNAME to `<service>.onrender.com`
3. Wait for DNS + the automatic TLS certificate (minutes to ~1 hour).

## 4 · OAuth redirect URIs (or sign-in will fail)
- Google Cloud Console → your OAuth client → Authorized redirect URIs: add
  `https://madav.ai/auth/google/callback`
- GitHub → Developer settings → OAuth app → callback:
  `https://madav.ai/auth/github/callback`

## 5 · Verify the private beta
1. Visit https://madav.ai → sign in with the admin Google account → full app.
2. Sign in with a FREE_EMAILS tester → works, badge shows "Complimentary".
3. Sign in with any other account → "Madav is in private beta — this account isn't
   on the access list yet." and NO session is issued. That's the gate working.
4. Render logs should show `PRIVATE_BETA active` at boot.

## 6 · Managing testers
- Add/remove emails in `FREE_EMAILS` (Render env → redeploy), or comp an existing
  account live from Admin Analytics (the /comp action) — no redeploy needed.
- Going public later = set `PRIVATE_BETA=0` (or remove it) and wire Stripe per
  GO-LIVE-FINAL.md.

## Gotchas
- The server checks the beta list AT SIGN-IN: anyone already holding a valid session
  token from earlier testing keeps it until it expires (24h) — harmless for beta.
- Desktop installers are unaffected by PRIVATE_BETA until they sign in against
  madav.ai (set the account server URL in the app to https://madav.ai).
- 2FA on Google/GitHub/Render/Supabase — standing pre-launch item, do it now.
