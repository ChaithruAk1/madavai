# How to test each phase (plain English)

One section per phase. After each phase I add a new section here and tell you in chat.
You test, then decide whether to commit. Commands are one-per-line (PowerShell-friendly).

---

## Phase 0 — Foundations (the safety net)

**What changed in plain words:** Phase 0 only **added new files**. It did **not** change any code the
app already uses. So the goal of testing is simple: the new safety checks pass, and the app works
**exactly like before** — nothing broke.

**What got added:**
- A rule book for how shared code is allowed to talk to the computer (the "adapter contract").
- A tape recorder that can record a desktop answer and replay it to check new code gives the same
  answer (the "replay harness").
- One master list of which features work on web and what to tell users when they don't.
- 6 automatic test files that guard all of the above.
- A checklist + automatic checks that run when code is pushed.

### Test 1 — Run the new safety tests (about 2 minutes)
In the Madav folder, run:

    npx vitest run tests/parity

**You should see:** `Test Files  6 passed` and `Tests  30 passed`.
✅ If you see 30 passed, the Phase 0 safety net works.

⚠️ Note: if you run the **full** test set (`npx vitest run`) you will see **3 red tests in
"savedStore"**. Those were **already failing before this work** — they are not from Phase 0. I left
them alone on purpose (that file may be desktop code, which I won't touch without your OK). You can
ignore them for now.

### Test 2 — Desktop still works exactly like before (most important)
Start the desktop app the way you normally do (full restart):

    npm run electron:dev

Then check the everyday things:
- Open a chat, send a message → reply streams as normal.
- Open a Project linked to a folder, ask for a report → it makes the Excel file and the Open card
  appears, same as before.
- Open the file → it opens in Excel as before.

**You should see:** no difference at all. Phase 0 added no desktop code, so nothing should look or
behave differently. If anything is different, stop and tell me.

### Test 3 — Web still works, and the build is complete
Build the web app:

    npm run build

Then check the build produced all 4 document engines:

    node scripts/check-worker-chunks.mjs dist

**You should see:** `OK — all 4 worker chunks present`.
Then open the web app (your normal way, or `npm run preview`) and check that chat and making an
Excel/PDF still work as before.

### Test 4 — (optional) Look at the new files
If you want to see what was added:
- `core/adapter.contract.js`
- `core/harness/replay.js`
- `src/bridge/webCapabilities.js`

### Pass / fail
- **PASS** = Test 1 shows 30 passed, **and** desktop + web behave exactly like before.
- If PASS → safe to commit (ask me for the exact commands).
- If anything looks different or breaks → tell me what you saw and I'll fix it before any commit.

**Reminder:** nothing has been committed yet. Phase 0 is all new files; you can also just delete the
new folders (`core/`, `tests/parity/`, `.github/`, `docs/`, `scripts/check-worker-chunks.mjs`,
`src/bridge/webCapabilities.js`) to undo it completely.

---

## Phase 1 — increment 1: web team identity ("not Claude")

**What changed in plain words:** On web, agent **team members** and the **coordinator** now state they
are Madav (not Claude/ChatGPT/Gemini). Desktop already did this; web now matches. Only **one web file**
changed (`src/bridge/webBridge.js`). **No desktop code changed.** This is web-only, so desktop cannot
be affected.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — See it on web (needs a web rebuild)
1. Build + run the web app:

       npm run build

   then open the web app your normal way (or `npm run preview`).
2. Make a small **Agent Team** with 2 members and run any mission.
3. In that chat, ask: **"Who are you and who made you?"**

**You should see:** the answer says **Madav** (not "I'm Claude"). Before this fix, a Claude-distilled
model could reply "I'm Claude" on web.

### Test 3 — Desktop unchanged
Desktop was not touched. If you start the desktop app, agent teams behave exactly as before.

### Pass / fail
- **PASS** = parity tests green, and a web team member/coordinator identifies as Madav.
- If PASS → commit this increment (separate from Phase 0). If not → tell me what it said.
