# Test Guide — Workrooms & Agents space features (2026-06-12)

Click-by-click, with exact things to type and what PASS looks like. No testing
experience needed. **Rebuild + fully restart Madav first** (engine files changed):
`npm run build` → quit (tray too) → relaunch. Confirm the model's status dot is green.

Words: a **room** = a Workroom (Projects sidebar). Reuse your **Launch Marketing** room
from earlier; if it's gone, make a new room and add an instruction + one knowledge note.

---

# Part A — Workrooms space

## A1 — Room goals (objectives with progress)

1. Open **Projects** → open **Launch Marketing**.
2. Left column, under Instructions, find the new **Goals** card.
3. In "Add an objective…" type `Ship the launch tweet` → Enter.
4. Add a second: `Draft the FAQ` → Enter.

**PASS if:** both appear as unchecked rows with a thin progress bar at 0%.

5. Click the checkbox on "Ship the launch tweet".

**PASS if:** the row gets a checkmark + strikethrough, the header reads **"1/2 done"**,
and the bar fills to ~50%.

6. Go back to **All workrooms**. Look at the Launch Marketing banner's pulse line.

**PASS if:** it now ends with **"· 1/2 goals"**.

---

## A2 — Room digest (the room summarizes itself)

*Prep:* the room should have at least one past chat or run in its feed.

1. Open the room → in the header (top-right icons) click the **document-stack icon**
   (tooltip "Write a digest of this room's recent work").
2. A chat opens and a reply streams in.

**PASS if:** the reply is a short summary that references the room's recent chats/missions
and its goals, ending with one suggested next step — not a generic answer.
*(Needs a working model. If the dot is grey, this "fails" for the wrong reason.)*

---

## A3 — Save as template → New from template

1. In the room header click the **copy icon** (tooltip "Save this room as a reusable
   template").

**PASS if:** a popup confirms "Saved … as a room template."

2. Go to **All workrooms**. A new **"From template"** button appears in the header (next
   to Import). Click it.

**PASS if:** a menu lists your saved template (with the room's glyph + name).

3. Click the template.

**PASS if:** a new room opens named "Launch Marketing (copy)" that already has the same
instructions, the pricing knowledge note, the same goals (all unchecked), and the same
pinned plays — but its OWN empty feed. You just cloned a project skeleton.

4. (Cleanup) The "From template" menu has an × on each template to delete it.

---

## A4 — Archive + the active/archived shelf

1. Open the "(copy)" room → header → click the **archive icon** (box arrow).

**PASS if:** you return to the shelf and the copy is **gone from the default view**.

2. Above the banners, a chip row appeared: **Active · Archived · All**. Click **Archived**.

**PASS if:** the copy shows here with an **"archived"** badge; clicking **Active** hides it
again; **All** shows both.

3. Open the archived copy → header → archive icon again (now "Unarchive").

**PASS if:** it returns to the Active shelf.

*(Bonus — idle badge: any room with no activity for 30+ days shows a dim **"idle"** badge
on its banner. You won't see this on fresh rooms; it's date-driven.)*

---

## A5 — Cross-room search

*Prep:* you need 2+ rooms, and at least one chat whose title contains a distinctive word.
Example: in Launch Marketing, start a chat by typing `Pricing options for launch` (its
title becomes that text).

1. Go to **All workrooms**.
2. In the search box type `pricing` (a word that's in a chat title, NOT in any room name).

**PASS if:** Launch Marketing still appears — because the search matched a conversation
*inside* it, not just room names. Clear the box to restore all rooms.
**FAIL if:** searching a word that only exists inside a room's chats hides that room.

---

# Part B — Agents space

*Prep:* you have at least one agent with some run history (e.g. Pitchwright, which you put
to work earlier). If not, Put any agent to work once so it has a mission on record.

## B1 — Presence dot

1. Open **Agents**.
2. Look at the bottom-right of each agent's portrait.

**PASS if:** there's a small status dot — **green** for an agent that ran in the last 24h,
**blue** for one that ran within 30 days, **grey** for never-run or idect 30+ days. Hover
the portrait area; the dot's title reads active / ready / off-duty / new.

---

## B2 — The agent résumé

1. On any agent's card, click the **badge/check icon** (tooltip "Résumé").
2. A profile overlay opens.

**PASS if you see:**
- the agent's portrait + presence + description at the top, with **Put to work** and **Edit**,
- a 4-stat row: **missions · clean% · tokens · last run**,
- **Capabilities** (its tool pills + pinned model),
- **Signature plays** (the plays pinned to it — or "none pinned"),
- **Staffed in rooms** (rooms whose crew includes this agent — pin it to a room first via
  Workrooms if empty),
- **Recent missions** at the bottom: a list of past runs with green/red dots, time, source,
  and a one-line summary.

3. Click **Put to work** in the overlay.

**PASS if:** the overlay closes and a session starts with that agent attached.

---

## B3 — Coach → memory (the feedback loop)

1. Open an agent's résumé (B2). Find **Memory & coaching** (right column).
2. In the feedback box type `always lead with the risks` → click **👍 Do more**.

**PASS if:** a new memory row appears immediately reading **"👍 Do more of this: always
lead with the risks"**.

3. Add a 👎 one: type `don't use hype words` → click **👎 Avoid**.

**PASS if:** a second row appears: "👎 Avoid this: don't use hype words".

4. Close the résumé, reopen it.

**PASS if:** both coaching notes are still there (they persisted to the agent's memory).

5. **The real proof** (needs a model): Put that agent to work and give it a task its
   feedback applies to (e.g. for a writing agent: "summarize this week"). 

**PASS if:** the output reflects your coaching (leads with risks / avoids hype) — the
correction graduated into how it works, not just a note.

---

## Done — scoring

| # | Test | PASS/FAIL |
|---|---|---|
| A1 | Room goals + progress + banner | |
| A2 | Room digest | |
| A3 | Save / new from template | |
| A4 | Archive + scope chips | |
| A5 | Cross-room search | |
| B1 | Presence dot | |
| B2 | Agent résumé | |
| B3 | Coach → memory | |

**Most common false failure:** model offline (grey dot) — then A2 and B3's "real proof"
fail with empty replies even though the feature itself is fine. Everything else (goals,
templates, archive, search, résumé, the memory rows) works without a model.
