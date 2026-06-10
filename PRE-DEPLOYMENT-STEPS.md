# Pre-Deployment Steps
*The exact sequence to run before anything reaches production. Follow top to bottom; every gate must be green before the next. Plain English, copy-paste commands.*

---

## 0. Your build vocabulary (know what each command produces)

| Command | What it is | QA tools inside? |
|---|---|---|
| `npm run dev` | Daily development (browser UI, hot reload) | ✓ always on |
| `npm run electron:dev` | Daily development (full desktop app) | ✓ always on |
| `npm run build` | **Clean production build** — for installers & the website | ✗ none |
| `npm run build:admin` | Your personal build WITH the Test Center | ✓ included |
| `npm run electron:build` | Windows installer (runs a clean build first) → `release/` | ✗ none |
| `npm run rebuild` | Recompile the terminal's native module (node-pty) — only after Node/Electron upgrades | — |
| `npm run qa` | External verification + auto-checkpoint on green | outside the app |
| `npm run qa:fast` | Same, skipping the slow build step | outside the app |
| `npm run qa:ui` (or double-click `QA-Console.cmd`) | The external QA dashboard in a browser | outside the app |
| `npm run qa:restore` | Restore source code to the last green checkpoint (OTP-protected in the console) | outside the app |
| `npm run qa:list` | Show saved checkpoints | outside the app |
| `node server/auth-server.mjs` | Start the account/billing server locally | — |

---

## 1. GATE 0 — the machine assembles (5 min)
```powershell
cd C:\Projects\ClaudeCodeUI\BrainEdge
npm install          # only if package.json changed since last time
npm run qa           # external verification: every file parses + clean build + checkpoint
```
**Must end with:** `ALL CLEAR` + `Checkpoint saved`. Red? Fix or `npm run qa:restore`. Do not continue on red.

## 2. GATE 1 — the app tests itself (10 min)
```powershell
npm run electron:dev
```
Sign in as **admin** → **Test Center**:
1. Pick a **cheap/free model** in the selector (the cycle makes ~9 live AI calls).
2. **Run engine cycle** → must be zero failures (skipped-with-reason is OK).
3. **Run UI sweep** → must be zero failures; read the skips, confirm they're known gaps.
4. Any red row → fix (Repair Bay or manually) → re-run until green.

## 3. GATE 2 — the human pass (30 min, the only manual gate)
- Run the six scenarios in **TEST-AGENTS.md** (Save smoke test first).
- One real chat + one folder session per provider you ship (OpenRouter, NIM, Gemini, local).
- Sweep every screen once in **light theme**.
- Kill the network mid-answer once — the app must fail politely, not freeze.
- Markdown check: ask for "a table + a code sample" — must render rich, with a copy button.

## 4. Secrets & accounts (one-time per release, 10 min)
- [ ] **Rotate any OAuth secrets** that were ever pasted into chat/tests (Google, GitHub).
- [ ] **Remove/disable the Anthropic subscription toggle** path (API-key only) — ToS requirement.
- [ ] 2-FA enabled on Google, GitHub, Stripe, Render accounts.
- [ ] `git status` shows NO `server/.env`, `users.json`, `free-emails.txt`, `admin-emails.txt`, `scripts/qa-config.json`.
- [ ] Production env vars set on the host: `SESSION_SECRET` + `ADMIN_KEY` (strong values — **the server refuses to boot with defaults**), OAuth client ids/secrets, Stripe keys, `ALLOWED_REDIRECTS`, optional `APP_VERSION` + `APP_DOWNLOAD_URL` (powers the update banner).

## 5. Build the artifacts
**Web:**
```powershell
npm run build        # CLEAN build — no QA inside
node server/auth-server.mjs   # smoke it locally once against the dist build
```
**Desktop installer:**
```powershell
# bump "version" in package.json first (e.g. 0.3.0 → 0.4.0)
npm run electron:build        # → release/BrainEdge-Setup-x.y.z.exe + portable
```

## 6. GATE 3 — verify the artifacts (15 min)
- [ ] Install the fresh setup.exe on a **clean Windows login**.
- [ ] App starts, onboarding wizard appears for a keyless profile, chat works after adding a key.
- [ ] Sign in as **admin** → **Test Center must NOT appear** (QA is excluded from user builds).
- [ ] PowerShell spot-check the clean bundle: `Select-String -Path dist\assets\*.js -Pattern "Repair Bay" -List` → must return nothing.
- [ ] Deploy web to **staging** with production env vars → server boots (secret guard passes), sign-in works, `/health` and `/app-version` answer.
- [ ] Only then promote staging → production.

## 7. After deploying
- [ ] Tag the release in git: `git tag v0.4.0` + `git push --tags`.
- [ ] Run `npm run qa` once more so the released state is the saved checkpoint.
- [ ] Next morning: daily Test Center cycle — a red row tomorrow that's green today is a regression with a timestamp.

## The iron rule
**A red gate stops the line.** No exceptions, no "just this once." The order matters: Gate 0 (assembles) → Gate 1 (tests itself) → Gate 2 (human eyes) → secrets → build → Gate 3 (verify artifacts) → ship.

*Companions: TESTING-BLUEPRINT.md (the doctrine) · EXTERNAL-TESTING.md (the safety net) · TEST-AGENTS.md (Gate 2 scenarios) · GO-LIVE-FINAL.md (hosting runbook).*