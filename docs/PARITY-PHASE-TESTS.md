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

---

## Phase 1 — increment 2: honest web Projects (no silent degrade)

**What changed in plain words:** On web, a **Project** chat could not make files but never said so — it
just replied with text as if everything was fine. Now, on web only, the assistant is told up front
that web Projects can discuss the project's notes but **cannot read a local folder or create/save
files** (those need the desktop app or "Let's Collaborate" with a picked folder). So if you ask for a
spreadsheet in a web Project, it will say so plainly instead of pretending. Only `src/bridge/webBridge.js`
changed. **No desktop code changed** — desktop Projects still make real files exactly as before.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — See it on web (needs a web rebuild)
1. Build + open web:

       npm run build

   then open the web app (or `npm run preview`).
2. Open a **Project** (Workroom) on web.
3. Ask it: **"Make me an Excel file of this data."**

**You should see:** a clear, honest reply — it explains that creating/saving files isn't available in
web Projects and points you to the desktop app or "Let's Collaborate", and it still helps with the
content inline. (Before: it would silently answer in text as if it had made a file.)
Normal questions (no file requested) should still get normal answers.

### Test 3 — Desktop unchanged
Open a folder-linked Project in the **desktop** app, ask for a report → it still creates the real Excel
file and shows the Open card, exactly as before.

### Pass / fail
- **PASS** = parity tests green; web Project is honest about files; desktop Projects still make files.
- If PASS → commit this increment. If not → tell me what it said.

---

## Phase 1 — increment 3: file-output card web fallback

**What changed in plain words:** The "file produced" card (the one with **Folder** and **Open** buttons)
appears after a run makes a file. Those two buttons only work on the desktop app. On **web** they did
nothing. Now, on web, those dead buttons are simply **not shown** (on web the file is already saved in
the folder you picked, so you open it from there). On **desktop, the card is exactly the same as before** —
both buttons still there and working.

⚠️ This is the **first shared-screen change** (the file `src/components/Message.jsx` is used by both
desktop and web). It is gated so the **desktop part is unchanged**. Please check desktop carefully.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Desktop unchanged (important — this is the shared file)
1. Reload the desktop app (Ctrl+R), or rebuild it your normal way.
2. Run a folder-linked Project that makes a file (e.g. "Execute report for March").
3. Look at the file card that appears.

**You should see:** the **Folder** and **Open** buttons are still there and still work (open the file,
show it in the folder) — **exactly like before**. If anything is different on desktop, stop and tell me.

### Test 3 — Web has no dead buttons
1. Build + open web:

       npm run build

2. If a "file produced" card appears (e.g. in Let's Collaborate after making a file), it should show the
   file name and icon with **no dead buttons** — the file is in the folder you picked.

### Pass / fail
- **PASS** = parity tests green; desktop file card works exactly as before; web shows no dead buttons.
- If PASS → commit. If desktop changed in any way → stop and tell me.

---

## Phase 1 — increment 4: web "Let's Chat" tools (web search + image)

**What changed in plain words:** On web, plain **Let's Chat** could only talk — it couldn't search the
web or make an image, while the desktop app could. Now web chat can do both (and use web_fetch) for
normal chat models. It turns on only when: you're signed in (for web search) or image-gen is enabled,
the model is an OpenAI-style model, you're not in a Project, and your message has no attached image.
If a model can't do tools, chat **automatically falls back to the normal reply** (and remembers that
model so it won't slow down later messages). Only `src/bridge/webBridge.js` changed. **No desktop code
changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Web chat can now search / make an image (needs a web rebuild + sign-in)
1. Build + open web:

       npm run build

2. In **Let's Chat** (not a Project), signed in, ask something current, e.g.:
   **"Search the web for the latest Node.js LTS version and tell me the number."**
   → You should see a **web_search tool step** in the chat, then an answer using it.
3. If you have an image model selected and image-gen on, ask: **"Make an image of a red bicycle."**
   → You should see an image.

### Test 3 — Normal chat still works (the important safety check)
Ask a plain question with **no** web/image need, e.g. **"Explain recursion in two sentences."**
→ You should get a normal answer, same as before. Try your usual models. If a model you use **can't**
do tools, the reply should still come through normally (it quietly falls back).

### Test 4 — Desktop unchanged
Desktop wasn't touched — Let's Chat there behaves exactly as before.

### Pass / fail
- **PASS** = parity tests green; web chat can search/make images when relevant; **plain chat still works
  for all your models**; desktop unchanged.
- If any model's plain chat breaks or feels slower → tell me which model/provider and I'll tighten the
  trigger (or gate it behind a setting).

---

## Phase 1 — increment 5: web team members get tools

**What changed in plain words:** On web, agent **team members** could only write text — they couldn't
search the web or make an image (desktop members can use tools). Now each web team member can use the
same light tools as chat (web search, web fetch, image). Their tool steps show in the chat tagged with
the member's name (e.g. "↳ Researcher: web_search"). If a model can't do tools, that member just writes
a normal answer (safe fallback). Only `src/bridge/webBridge.js` changed. **No desktop code changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Team members can research (web rebuild + signed in)
1. Build + open web:

       npm run build

2. Make an **Agent Team** of 2 members (e.g. "Researcher" + "Writer"), signed in.
3. Run a mission that needs current info, e.g. **"Find the current stable Python version and write a one-paragraph note about it."**

**You should see:** member tool steps tagged with the member name (a **web_search**/**web_fetch** step),
then the team's combined answer using what they found.

### Test 3 — Teams still work with any model (safety check)
Run a team with your usual model(s). Even if a model can't use tools, each member should still produce a
normal text answer and the team should finish — same as before.

### Test 4 — Desktop unchanged
Desktop wasn't touched — agent teams there behave exactly as before.

### Pass / fail
- **PASS** = parity tests green; web team members can search/make images when relevant; teams still
  finish for all your models; desktop unchanged.
- If a team breaks or stalls on a model → tell me which provider/model.

---

## Phase 1 — increment 6: CORRECTION to increment 2 (web Projects CAN make files)

**What changed in plain words:** Increment 2 was too strict — it told web Projects "you cannot create
files." But web already makes real **downloadable** files (Excel/Word/PDF/slide decks) through the normal
office feature, and that prompt rule is also in a web Project — so the two instructions **contradicted**
each other. Fixed: a web Project now correctly **does make downloadable files** when asked. The only real
limit (now stated accurately) is that a web Project has **no linked local folder**, so it can't read or
compute over your existing local data files or save into a folder — that still needs the desktop app or
"Let's Collaborate". Only `src/bridge/webBridge.js` changed. **No desktop code changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Web Project now makes a file (web rebuild)
1. Build + open web:

       npm run build

2. Open a **Project** on web. Ask: **"Make me an Excel file with a 3-month sales forecast for a coffee shop."**

**You should see:** a real **downloadable file card** (an .xlsx you can download) — NOT a refusal.
(Before this fix it wrongly said it couldn't make files.)

### Test 3 — Folder-data limit is still honest
In a web Project ask: **"Read the sales file in my project folder and total it."**
**You should see:** it explains it can't read a local folder on web and points you to the desktop app or
"Let's Collaborate" — because that part really is desktop-only.

### Test 4 — Desktop unchanged
Desktop Projects still read folders and save real files exactly as before.

### Pass / fail
- **PASS** = parity green; a web Project produces a downloadable file when asked; it's still honest about
  not reading your local folder; desktop unchanged.
- If a web Project still refuses to make a file → tell me the model you used.
