# External Testing — Steps & Guidelines
*The safety net that lives OUTSIDE the application. Use it when the app is healthy (to save checkpoints) and when the app is broken (to get back to a working state). No programming knowledge needed.*

---

## 1. What this is, in one paragraph
The in-app Test Center is excellent — but it lives inside Madav, so if the app is too broken to start, the Test Center dies with it. External testing is the independent inspector: it runs from outside, checks that every code file is valid and that the app actually builds, and — the key part — **every time everything is green, it automatically saves a checkpoint** (a complete copy of the working source code). When something later breaks badly, **one click restores the last working state.**

## 2. Two ways to run it

### A. The QA Console (recommended — no terminal)
1. Open the Madav project folder in Windows Explorer.
2. **Double-click `QA-Console.cmd`.** A dashboard opens in your browser.
3. Use the buttons:
   - **▶ Full verification** — all checks + the real build (~1–2 min). Green saves a checkpoint.
   - **⚡ Fast check** — same minus the build (seconds). Good for quick confidence.
   - **🗂 Checkpoints** — list what's saved; ● marks the last known good.
   - **⏪ Restore last working state** — the parachute. Asks for confirmation first.
4. Watch the output stream live; the status line ends green (all clear) or red (problems listed).

### B. The terminal (same engine, four commands)
```
npm run qa            full verification + auto-checkpoint on green
npm run qa:fast       skip the slow build step
npm run qa:list       show saved checkpoints
npm run qa:restore    restore the last green state (reversible)
```

## 3. What gets checked
| Check | Question it answers |
|---|---|
| Every engine/server/CLI/script file parses | "Is any code file saved broken?" |
| package.json valid + versions pinned | "Can a surprise update change the app overnight?" |
| `npm run build` succeeds + output exists | "Does the application actually assemble?" |

## 4. Checkpoints — how "last working condition" works
- A checkpoint = a full copy of the source (engine, UI, server, CLI, scripts, configs) in `.checkpoints/good-<date-time>/`.
- Saved **automatically on every all-green run** — you never have to remember.
- The newest **5** good checkpoints are kept; older ones rotate away.
- **Restore is reversible:** before restoring, your *current* (broken) state is itself saved to `.checkpoints/pre-restore-<time>` — nothing is ever lost.
- Checkpoints cover **code only**. Your chats, agents, settings and keys live elsewhere and are never touched by a restore. (For those, use Settings → Backup.)

## 5. After a restore — three steps
1. `npm install` — only needed if package.json changed between then and now.
2. `npm run build` (or just run Full verification again — it builds anyway).
3. Start the app normally. Run the in-app Test Center cycle to confirm health.

## 6. Guidelines (the habits that make this work)
- **Run Full verification while things WORK** — today, ideally. A checkpoint can only save a state that existed; the safety net is only as good as your last green run.
- **Before every risky change** (big feature, dependency update): run it once so the parachute is fresh.
- **Before every commit/release:** Full verification must be green — this is Gate 0 of the deployment pipeline (see TESTING-BLUEPRINT.md).
- **When the app won't start:** don't debug in panic. QA Console → Full verification to see *what* is broken; if you need the app back NOW, Restore, and hand the saved `pre-restore` folder to your developer/AI later.
- `.checkpoints/` is ignored by git on purpose — git is your deep history; checkpoints are the instant local layer.

## 6½. Restore is protected by a one-time code (OTP)
Restore changes your source code, so the QA Console won't run it on a bare click:
1. Click **⏪ Restore** → a 6-digit code is generated (valid 5 minutes, single use).
2. The code is delivered **out-of-band**: by **email** and/or **text message to your phone** when configured — or, with zero setup, it prints in the **terminal window** that launched the console.
3. Type the code into the box → the restore runs.

**Setting up email/SMS delivery:** copy `scripts/qa-config.example.json` to `scripts/qa-config.json` (gitignored) and fill in: Gmail App Password for email (Google Account → Security → 2-Step Verification → App passwords), and/or Twilio credentials for SMS to +1 615-906-8147. Honest note: texts arrive in the iPhone **Messages app via SMS** — Apple provides no public iMessage API, so true blue-bubble iMessage isn't possible from a server.

## 7. Troubleshooting
| Symptom | Meaning / fix |
|---|---|
| "node is not recognized" | Node.js isn't installed or not on PATH — install from nodejs.org |
| Console page doesn't open | Open http://127.0.0.1:7878/ in your browser manually |
| "already running" | A job is in progress — wait for the status line to finish |
| Restore says no checkpoint exists | You've never had a green run — fix the listed problems first; next green run creates the first checkpoint |
| Build fails with missing packages | Run `npm install`, then verify again |

## 8. What end users get (and don't): distribution policy
The testing machinery is **for you, not for your customers**. The installer people download from the Madav website ships **none of it**:

| Piece | In YOUR project folder | In the user installer |
|---|---|---|
| Test Center UI + functional sweep (screen code) | ✓ | ✗ **not even compiled in** — exists only in admin builds |
| Test engine (qa-runner) | ✓ | ✗ excluded from the package |
| Repair Bay (qa-fixer — can modify source) | ✓ | ✗ excluded from the package |
| QA Console, external script, checkpoints | ✓ | ✗ never packaged (only dist/electron/cli ship) |
| Blueprint & this document | ✓ | ✗ never packaged |

How the exclusion works (so you can verify it), in four layers:
1. **The QA screens aren't compiled into distributed builds at all.** The standard `npm run build` (used for installers and the website) drops the Test Center UI and sweep code at compile time. Only `npm run dev` and `npm run build:admin` include them.
2. The build recipe blocks the QA engine files from the package (`!electron/qa-runner.cjs`, `!electron/qa-fixer.cjs`).
3. The app loads QA defensively — a packaged build reports "Testing tools aren't included in this build" instead of crashing.
4. The **Test Center button only appears when BOTH are true** — admin account AND QA physically present in the build.

So in the customer's download: no button, no screen code, no engine code, no Repair Bay — the testing system isn't hidden from them, it isn't *there*.

**Build commands cheat-sheet:** `npm run build` = clean build for users/web (no QA) · `npm run build:admin` = your personal build WITH the Test Center · `npm run dev` = development (QA always on).

**Verify after every installer build:** install the fresh setup.exe on a clean login, sign in as admin — Test Center must NOT appear in the sidebar. (That check is itself a good Gate-3 item.)

## 8½. Restore authentication details (recap)
- Restore requires a **6-digit OTP**: 5-minute expiry, single use, refused codes return "wrong or expired".
- Delivery: **email** (chaithrodaya.sukruth@gmail.com via Gmail App Password) and/or **SMS to +1 615-906-8147** via Twilio (arrives in the iPhone Messages app — Apple offers no public iMessage API, so SMS is the legitimate ceiling), with the **terminal window as the zero-setup fallback**.
- Credentials live in `scripts/qa-config.json` — gitignored, local to your machine, never packaged, never sent anywhere except Google/Twilio.

## 9. How this fits the whole testing machine
```
 OUTSIDE the app                      INSIDE the app (admin)
 ┌──────────────────────────┐        ┌─────────────────────────────────┐
 │ QA Console / npm run qa  │        │ Test Center                     │
 │ • code parses            │  app   │ • engine cycle (7 suites)       │
 │ • app builds             │ healthy│ • functional UI sweep           │
 │ • AUTO-CHECKPOINT        │ ─────▶ │ • Repair Bay (AI fixes)         │
 │ • RESTORE (parachute)    │        │ • Scenario library              │
 └──────────────────────────┘        └─────────────────────────────────┘
        Gate 0 + safety net                   Gates 1 & 2
```
Full doctrine, diagrams and the daily ritual: **TESTING-BLUEPRINT.md**.
