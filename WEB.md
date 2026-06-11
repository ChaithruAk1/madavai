# Madav — Web app

The same React UI that runs in the desktop app also runs in a browser. There is **one codebase**;
a bridge layer decides at runtime whether it's talking to Electron or to the web.

## How it works

`src/bridge/index.js` picks the implementation:

```
bridge = window.madav   // desktop (Electron preload → main process)
       || webBridge         // browser (src/bridge/webBridge.js)
export const isWeb = !window.madav;
```

`webBridge` provides the **entire** bridge contract in the browser:

| Area | Desktop | Web |
| --- | --- | --- |
| Account / trial / billing / analytics | auth server (loopback OAuth) | **same auth server** (redirect OAuth) |
| Settings, chat history, projects, saved library, tasks | encrypted local files | **localStorage** (stays on device) |
| Chat + model listing | device → provider directly | **browser → provider directly** |
| Local folders, install skills, MCP connector processes, Telegram, local models | yes | **desktop only** (clear in‑app message) |

Two design choices keep parity and the privacy model intact:

1. **Keys never touch our servers.** On web, the user's API keys live in `localStorage` and the chat
   streams straight from the browser to the chosen provider (`src/shared/providers.js`, an ESM mirror
   of `electron/providers.cjs`). This matches the desktop "bring your own key" model.
2. **One origin.** The auth server also serves the built web app (`dist/`), so the UI and the API
   (`/me`, `/events`, `/auth/...`, `/billing/...`) share an origin — no CORS in production, and OAuth
   redirects come straight back to the app with a `?token=` the bridge captures and stores.

## Run it locally

1. Build the web bundle:
   ```
   npm run build         # outputs dist/
   ```
2. Start the auth server (it now serves dist/ too):
   ```
   node server/auth-server.mjs
   ```
   Make sure `server/.env` has your Google/GitHub OAuth credentials (see `server/.env.example`).
3. Open **http://127.0.0.1:8787/** — sign in with Google/GitHub, same 7‑day trial and paywall as
   desktop. Admins (see `server/admin-emails.txt`) get the analytics panel.

### Hot‑reload dev

For UI work with hot reload, run the Vite dev server and the auth server side by side:
```
npm run dev                 # http://localhost:5174  (UI)
node server/auth-server.mjs # http://127.0.0.1:8787  (API)
```
`webBridge` auto‑detects the `5174` dev port and calls the API on `8787` (CORS is enabled on the
auth server). OAuth redirects back to `localhost:5174`, which the loopback allow‑list permits.

## Deploy

Host the auth server with HTTPS (see `DEPLOY.md`), then:

- Set `WEB_DIR` to the built `dist/` path (or deploy `dist/` alongside the server; it defaults to
  `<cwd>/dist`).
- Add your web origin to `ALLOWED_REDIRECTS` (e.g. `https://app.yourdomain.com`).
- Add the same origin's `/auth/google/callback` and `/auth/github/callback` to the Google/GitHub
  consoles (or keep the auth server on its own domain and point the app there).
- Override the API base if the web app is served from a different origin than the API by setting
  `window.__MADAV_AUTH_BASE__` before the app script (otherwise it's same‑origin).

## What's desktop‑only (and why)

**Let's Collaborate now works on the web** in Chrome/Edge via the File System Access API: you pick a
real folder and the assistant can **list, read, write, and edit** files in it (a browser file‑tool
agent in `src/bridge/webfs.js` + the tool loop in `webBridge.js`). The one limit vs desktop: **no
terminal** — the web agent can't run shell commands, install packages, or run tests, because a browser
tab can't execute a shell. Firefox/Safari lack the API, so there folder access stays desktop‑only.

These remain desktop‑only (a browser can't spawn processes or run in the background) and show a clear
message on web:

- Uploading files into a project, running shell commands.
- Installing/running **Skills** and **MCP connectors** (these spawn local processes).
- **Telegram / Via Mobile** bot (a long‑running local process).
- **Local models** on `localhost` (the browser/your server can't reach the user's machine).
- **Scheduled task execution** (saved on web, executed by the always‑on desktop app).

Everything else — sign‑in, trial/subscription, the full chat experience with cloud providers, model
config, models overview, projects & knowledge (text), saved library, usage, the account/admin
panels — works in the browser.
