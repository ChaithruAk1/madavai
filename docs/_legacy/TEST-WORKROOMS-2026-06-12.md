# Workrooms — Test Guide (2026-06-12 build)

Covers the Projects → Workrooms redesign: room identity + agent crews (engine), run
tagging, shelf UI, room interior (brief · work feed · crew), "Put to work", the
Scheduler room+agent combo, web parity, and regressions. Work top to bottom — later
sections assume the example room from §2.

---

## 0. Gate (do this first)

```powershell
npm run build        # the whole redesign is uncompiled
# then FULLY quit Madav (tray too) and relaunch — main.cjs, preload.cjs and the
# stores changed; a renderer-only reload will NOT pick up the new IPC handlers.
```

Smoke: app opens, no white screen, DevTools console free of red errors.

---

## 1. Migration — old projects become rooms (no data loss)

If you have pre-existing projects:

| Step | Expect |
|---|---|
| Open the sidebar's Projects entry | Screen is titled **Workrooms**; every old project appears as a wide horizontal **banner**, not a card |
| Look at any old project's banner | It has a colored spine + glyph (auto-assigned, deterministic — same every restart), a pulse line, "no crew", and a knowledge meter matching its old files |
| Open it | Instructions are intact in **Brief**; old knowledge items show as book-spine rows; the linked folder/repo survived; old chats appear in the **work feed** |
| Check `%APPDATA%/madav/projects-data/projects.json` | Old records now carry `"identity": {…}` and `"agentIds": []` after first list/save — nothing else changed |

PASS = zero data loss, identity auto-assigned. FAIL if any old chat, knowledge item, or linked source is missing.

---

## 2. Example setup (used by everything below)

1. **Agents** → create (or reuse) two agents:
   - **Reviewer** — Files ON, Shell OFF (a file-tools agent). Instructions: "You review code and report issues by severity."
   - **Pitchwright** — all tools OFF (a chat-only agent). Instructions: "You write crisp one-paragraph product pitches."
2. **Workrooms** → **New workroom**:
   - Name: `Launch Marketing`
   - Brief: `We are launching madav.ai. Tone: confident, no hype words. Always mention the tagline "Built to think with you".`
   - Expect: dialog says "Open a new workroom"; the room opens with its own color/glyph header.
3. In the room, **Knowledge** → "Paste text…": `Pricing: early-bird, announced at launch. Audience: indie builders and small teams.` → click the add button.
   - Expect: a book-spine row named "Note" appears (colored spine edge, size in `k`).
4. **Linked folder & repo** → Link folder → pick any small test folder (e.g. a scratch repo).
5. **Crew** (right zone) → "+ Assign an agent…" → Reviewer, then again → Pitchwright.
   - Expect: two crew cards with living portraits (waving "hello" — they haven't run here), name, role line, and "no missions in this room yet".

Back out (**All workrooms**): the banner now shows both faces in the crew strip and "1 sources" on the meter.

---

## 3. Shelf (landing)

| Test | Expect |
|---|---|
| Banner layout | Full-width row: spine+glyph left → name + pulse → crew faces → knowledge meter right. NOT a card grid |
| Pulse, fresh room | "quiet — put the crew to work" |
| Hover a banner | Slight lift, border tints toward the room color |
| Search `laun` | Filters live to Launch Marketing; clearing restores all |
| Sort toggle | Flips date-order (most recently *active* first) ⇄ A–Z; tooltip names the order you'd switch to |
| Crew strip overflow | Assign 6+ agents to one room → 5 faces + "+1"; unassigned room shows "no crew" |
| Empty state (fresh install) | "No workrooms yet. Open one, brief it, shelve some knowledge, and staff a crew." |

---

## 4. Room chat + brief injection

1. In Launch Marketing, type in the composer: `Write one launch tweet.` → send.
2. Expect: chat surface opens, reply **mentions "Built to think with you"** and respects the brief's tone (brief + knowledge were injected).
3. Ask: `What do we know about pricing?` → reply should cite the early-bird note (knowledge injection).
4. "← Projects"/back → reopen the room → the conversation sits in the **work feed** with a speech-bubble icon, message count, relative time.
5. Pulse on the banner now reads "1 run today · just now".

**Work in the room's folder:** click "Work in the room's folder (Let's Collaborate)" → Collaborate opens pointed at the linked folder; ask it to list files. Return to the room: the task is in the feed with a **hammer** icon.

---

## 5. Crew — Put to work

### 5a. Chat-only agent (Pitchwright)
1. Crew card → **Put to work**.
2. Expect: a fresh **chat** opens with Pitchwright attached (agent chip visible). Send: `Pitch us in one paragraph.`
3. Reply must show BOTH personalities: pitch format (agent instructions) AND the tagline/tone (room brief) — proof agentSystem + projectSystem combined.
4. Back in the room: the run is in the feed **with a "Pitchwright" chip**; Pitchwright's card now reads "1 mission here · 100% clean" and its portrait looks **happy** (fresh clean run).

### 5b. File-tools agent (Reviewer)
1. Reviewer → **Put to work** → expect a **Collaborate** session in the room's linked folder (folder bar shows the path). Send: `Review the files here briefly.`
2. It reads files from the room's folder. Back in the room: feed row with "Reviewer" chip; Reviewer's record updates.

### 5c. Folder guard
1. Make a second room with **no** linked folder, assign Reviewer, Put to work.
2. Expect alert: "Link a folder to this room first (Brief → Linked folder & repo)…" — no session starts.

### 5d. Feed filters
In Launch Marketing the chips row shows: All · Chats · Tasks · Reviewer · Pitchwright.
- "Chats" → only speech-bubble rows. "Tasks" → only hammer rows.
- Click "Pitchwright" → only its runs; click again → back to All.

---

## 6. Per-room track record (engine check)

1. `%APPDATA%/madav/agent-history.jsonl` — the newest lines for Reviewer/Pitchwright must contain `"projectId": "prj_…"` matching the room.
2. Run Pitchwright once OUTSIDE the room (Agents → launch directly). That event must have **no** projectId, and the room's "missions here" count must NOT increase — only the room-launched runs count.

---

## 7. Scheduler — room + agent combo

1. Scheduler → New task → Set up manually.
2. Name `room-pitch`, description `test`, prompt: `Write today's one-line launch message.`
3. Target: **Work in a project** → "Select workroom…" → Launch Marketing. A second select appears: **"Run as: the room itself"** with agents listed — crew members marked **"· crew"** and listed first.
4. Pick **Pitchwright · crew**, Frequency Manual, Save → press **Play**.
5. Expect: run completes; output (click the row / run history) shows the tagline + pitch style (room + agent both injected). agent-history gains a `source: "schedule"` event **with the room's projectId**, and the room's feed/pulse reflect nothing new (headless runs land in history/track record, not the feed) — but Pitchwright's "missions here" count on the crew card increases after reopening the room.
6. Repeat with "Run as: the room itself" → output is room-grounded, no agent persona, no history event.
7. Wizard path: New task → Create with Madav → untick "Ask me adaptively" → target step now offers workroom + "Run as" selects; review step says "Workroom · run by a crew agent".

---

## 8. Crew management edge cases

| Test | Expect |
|---|---|
| Unassign Reviewer (trash on crew card) | Card disappears; agent still exists in Agents; its room history remains in the feed/record data |
| Delete an agent (in Agents) that's on a crew | Room still opens; the crew card for it vanishes (id no longer resolves); no crash; its feed rows remain (agentName is stored on the session) |
| Assign dropdown | Lists only non-crew agents; disappears (or empties) when everyone is staffed |
| Close workroom (header trash) | Confirm dialog warns conversations are deleted too; room + its chats gone; Collaborate sessions remain in normal history but no longer list in any room |

---

## 9. Web build parity

`npm run web:dev` (or the deployed build):

- Workrooms shelf renders; create a room → identity color/glyph appears (localStorage).
- Assign/unassign crew works; banners show faces.
- Knowledge: "Add files" uses the browser picker (xlsx/docx/txt OK, PDFs refuse with the desktop hint); paste-text works.
- Link folder / GitHub buttons return the "desktop app" notices gracefully.
- Crew cards show "no missions in this room yet" (per-room history is desktop-only) — no errors.

---

## 10. Regressions

- **Old route stub:** nothing imports `ProjectsBrowser.jsx` anymore, but it must still resolve (it re-exports Workrooms) — build succeeds, no Vite warning about missing module.
- **Back-from-task:** open a room-scoped Collaborate task from the feed, then use the "← Launch Marketing" chip → you land back INSIDE that room, not the shelf.
- **Plain Collaborate** (started from the sidebar, no room): no projectId tag, not in any feed — unchanged behavior.
- **Scheduler old targets:** chat / folder / agent / team / brief targets all still run.
- **styles.css integrity:** `git diff --stat src/styles.css` shows ~58 insertions, 0 deletions; the app's other screens (Agents, Settings, composer) look untouched in BOTH themes — the `.wr-*` block is append-only.
- **Sage:** ask Sage "what are workrooms?" and "how do I put an agent to work in a room?" — answers should match the new 06 knowledge, not old Projects wording.

---

## Known v1 limits (don't file as bugs)

- Headless scheduled room runs don't create feed entries (by design — they live in run history + track record).
- Per-room track record is desktop-only; web shows the empty-state line.
- Crew moods are inferred from the latest room run (hello / happy ≤24h / focused after a failure / calm) — not live "working now" status.
- Deleting a room deletes its chats but intentionally leaves Collaborate sessions in global history.
