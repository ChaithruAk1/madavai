# Workrooms — First-Timer's Test Walkthrough

A plain-language, click-by-click version of the test guide. No testing experience needed.
Do the tests in order — each one builds on the previous. For every test, note **PASS** or
**FAIL** (and take a screenshot when something looks wrong).

**What you're testing, in one sentence:** Projects became "Workrooms" — a room remembers
its own instructions (the *brief*) and reference material (*knowledge*), and you can staff
it with agents (the *crew*) who automatically use all of that when they work.

**Words used below**
- **Run** = any piece of work the room produced: a chat, or a Collaborate task.
- **Feed** = the list in the middle of a room showing every run.
- **Crew** = the agents assigned to the room (right side).
- **Brief** = the room's standing instructions (left side).

---

## Before you start (5 minutes — do not skip)

1. Open a terminal in the Madav folder and run: `npm run build`
   Wait for it to finish without red errors.
2. **Fully quit Madav** — not just close the window. Right-click the tray icon (near the
   Windows clock) and exit if it's there. Then start Madav again.
   *Why: the engine files changed; a simple window reload won't load them.*
3. Check your model works: look at the **model selector** (top right). There's a small
   status dot — it must be **green**. If it's grey or red, pick a different model (a cloud
   one, or Madav Starter if you're signed in). Quick test: go to Let's Chat, send "hello".
   If you get a reply, you're good. **If the model is broken, every test below will
   "fail" for the wrong reason** — like the "fetch failed" you saw in the Designer.

### What you've already set up (from earlier — just confirm)
- ✅ A workroom called **Launch Marketing** with the brief about madav.ai and the tagline.
- ✅ A knowledge note about early-bird pricing.
- ✅ A linked folder (C:\Marketing Launch).
- ✅ Two agents on the crew: **Code Reviewer** (Files toggle ON) and **Pitchwright** (all
  toggles OFF).

If any of these is missing, redo it first — the tests use them.

---

## Test 1 — The room obeys its brief

**Goal:** prove a chat started inside the room secretly carries the room's instructions.

1. Open **Workrooms** → click the **Launch Marketing** banner.
2. In the big "Ask Madav" box in the middle, type exactly:
   `Write one tweet announcing our launch.`
3. Press Enter. The screen switches to a chat and a reply streams in.

**PASS if:** the reply contains the tagline **"Built to think with you"** and sounds
confident without hype words — you never told it that in your message; it came from the
brief.
**FAIL if:** the reply is generic and never mentions the tagline.

---

## Test 2 — The room knows its knowledge

**Goal:** prove the pasted note is available to every chat in the room.

1. Still in the same chat, type: `What do we know about pricing?`

**PASS if:** the answer mentions **early-bird pricing announced at launch** (that text
exists only in your knowledge note).
**FAIL if:** it says it doesn't know, or invents different pricing.

---

## Test 3 — The work feed collects everything

**Goal:** prove the room keeps a record of work done inside it.

1. Click the **← back** control to leave the chat, then open **Launch Marketing** again.
2. Look at the middle column (the feed).

**PASS if:**
- Your conversation from Tests 1–2 is listed with a 💬 speech-bubble icon, a message
  count, and "just now".
- The header under "Launch Marketing" now says something like **"1 run today · just
  now"** — no longer "quiet — put the crew to work".
  *(If it still says "quiet", that's the pulse bug I fixed after your screenshot — make
  sure you rebuilt and restarted in "Before you start".)*
3. Click that feed row. **PASS if** the old conversation reopens with your messages intact.

---

## Test 4 — Put a chat agent to work (Pitchwright)

**Goal:** prove an agent launched from the room blends BOTH personalities — its own
instructions AND the room's brief.

1. In the room, find **Pitchwright** in the Crew column (right side).
2. Click its **"Put to work"** button.
3. A fresh chat opens with Pitchwright attached (you'll see its name/chip near the top).
4. Type: `Pitch us in one paragraph.`

**PASS if the reply shows BOTH:**
- one tight paragraph in pitch style → that's *Pitchwright's* instruction, and
- the tagline "Built to think with you" or the launch context → that's the *room's* brief.

This is the single most important test in the whole guide — it proves agents + rooms
combine.

5. Go back to the room. **Also PASS if:**
- the feed now has a row tagged **Pitchwright**,
- Pitchwright's crew card says **"1 mission here · 100% clean"** instead of "no missions
  in this room yet",
- its portrait looks cheerful (it just finished a clean run).

---

## Test 5 — Put a file agent to work (Code Reviewer)

**Goal:** prove agents with the Files toggle work inside the room's linked folder.

*Prep:* make sure `C:\Marketing Launch` contains at least one or two text files
(anything — a .md, a .txt). An empty folder makes a boring test.

1. In the room, click **"Put to work"** on **Code Reviewer**.
2. This time a **Let's Collaborate** screen opens, and the folder bar shows
   `C:\Marketing Launch` — it picked the room's folder by itself. That alone is a PASS
   point.
3. Type: `List the files here and summarize each in one line.`

**PASS if:** it actually reads YOUR files from that folder and names them.
**FAIL if:** it says it has no folder, or works in some other directory.

4. Back in the room: the feed has a 🔨 hammer-icon row tagged **Code Reviewer**, and its
   crew card now shows a mission count.

---

## Test 6 — The folder guard

**Goal:** prove a file agent refuses to launch in a room with no folder.

1. Go to **Workrooms** → **New workroom** → name it `Guard Test`, leave everything
   default, create it. Do NOT link a folder.
2. Assign **Code Reviewer** to its crew ("+ Assign an agent to this room…").
3. Click **Put to work**.

**PASS if:** a popup says you must **link a folder to this room first** — and nothing
launches.
**FAIL if:** it opens a session anyway.

(You can delete Guard Test afterwards: trash icon in its header → confirm.)

---

## Test 7 — Feed filters

**Goal:** the chips above the feed slice it correctly.

In Launch Marketing's feed you should now have at least 3 rows (chat, Pitchwright run,
Code Reviewer run). Click each chip:

| Chip | Should show |
|---|---|
| **Chats** | only the 💬 conversation(s) |
| **Tasks** | only the 🔨 runs |
| **Pitchwright** | only Pitchwright's run |
| **Code Reviewer** | only Code Reviewer's run |
| **All** (or clicking an agent chip again) | everything |

PASS = each chip filters as listed.

---

## Test 8 — The shelf tells the truth

**Goal:** the banner reflects reality at a glance.

1. Go back to **All workrooms** (the shelf).
2. Look at the Launch Marketing banner.

**PASS if:**
- the pulse line counts today's activity (e.g. "3 runs today · just now"),
- the crew strip shows two little faces (hover them — names appear),
- the knowledge meter shows "1 sources" with a small fill,
- typing `laun` in the search box filters to this room only.

---

## Test 9 — Schedule a room + agent combo

**Goal:** the Scheduler can make a crew agent do room work automatically.

1. Open **Scheduler** (sidebar) → **New task** → **Set up manually**.
2. Fill in:
   - Name: `room-pitch-test`
   - Description: `combo test`
   - Big prompt box: `Write today's one-line launch message.`
3. In the target dropdown (says "Let's Chat (plain)"), pick **Work in a project**.
4. Two new dropdowns appear:
   - first: pick **Launch Marketing**
   - second ("Run as"): notice Pitchwright and Code Reviewer say **"· crew"** and sit at
     the top — pick **Pitchwright · crew**.
5. Leave Frequency on **Manual**. Click **Save**.
6. On the task's row, press the **▶ Play** button and wait for the spinner to finish.
   A **"Run history"** window opens by itself showing the result (you can reopen it
   anytime with the list icon on the task row — each run shows a green/red status
   dot, when it ran, and the full output).

**PASS if:** the newest run in that window is a launch message in Pitchwright's
style that references the room context/tagline.
**Bonus check:** reopen the room — Pitchwright's crew card mission count went up by one.
*(Scheduled runs deliberately do NOT appear in the feed — only the count grows. That's
by design, not a bug.)*

---

## Test 10 — Deleting is safe and honest

1. In Launch Marketing's feed, hover a row → click its trash 🗑 → **PASS if** just that
   row disappears, instantly.
2. Crew column → trash on Code Reviewer's card → **PASS if** it leaves the crew, but
   still exists in the **Agents** screen (it was unassigned, not deleted).
3. Room header trash → **PASS if** the confirm message warns conversations are deleted
   too. Click Cancel (keep your room!).

---

## Test 11 — Connectors work inside a room chat

**Goal:** prove a room chat can pull from your connected apps (Gmail, drives, repos,
finance-data…) while still carrying the room's instructions and knowledge.

*Prep:* at least one connector enabled (Connectors screen — e.g. finance-data). Connector
tool-calls need an OpenAI-compatible model (OpenRouter/Starter are fine).

1. Open **Launch Marketing** → click into the composer and type `@`.
   **PASS point:** the mention menu lists your enabled connectors.
2. Pick one and ask something it can answer, e.g.
   `@finance-data what can you tell me right now?`
3. Send. Approve the tool card when it appears.

**PASS if:** the reply is built from the connector's data (you saw its tool card run),
AND the conversation still lands in the room's feed afterwards (room tagging intact).
**FAIL if:** the menu shows no connectors, or the reply claims it has no tools.

---

## Test 12 — A team works inside a room

**Goal:** prove a TEAM staffed into a room runs with the room's context, and the
mission lands in the room's feed.

*Prep — build a tiny team once:*
1. **Agents** → Teams → New team → **Relay** line.
2. Add **Pitchwright** then **Code Reviewer**, name it `Launch Duo`, save.

*The test:*
1. Open **Launch Marketing** → right column → **TEAMS** → "+ Assign a team to this
   room…" → pick `Launch Duo`. Its card appears with stacked member faces.
2. Click the team's **Put to work** → a chat opens with the team attached
   (top bars show "← Launch Marketing · Workroom task" and "← Agents · Launch Duo").
3. Brief it: `Produce a short launch blurb: first draft the pitch, then review it.`
4. Watch **Mission Control**: both stations should light up and pass the baton.

**PASS if:**
- the final output reflects the room (tagline / launch context) — the room's
  instructions reached the team without you pasting them,
- back in the room, the feed has a row tagged **Launch Duo**,
- the pulse line counts the run.
**FAIL if:** the output ignores the room context, or the run never appears in the feed.

---

## Done — scoring

| # | Test | PASS/FAIL |
|---|---|---|
| 1 | Brief obeyed in room chat | |
| 2 | Knowledge answered | |
| 3 | Feed + pulse update | |
| 4 | Pitchwright = agent + room blend | |
| 5 | Code Reviewer uses room folder | |
| 6 | Folder guard popup | |
| 7 | Filter chips | |
| 8 | Shelf banner truth | |
| 9 | Scheduler combo | |
| 10 | Delete behaviors | |
| 11 | Connectors in a room chat | |
| 12 | Team in a room | |

**If something fails:** screenshot it, note the test number and what you typed, and bring
it back to the session. Most common false failure: the model is offline (grey dot) — then
Tests 1, 2, 4, 5, 9 all fail with empty/error replies even though Workrooms itself is fine.
