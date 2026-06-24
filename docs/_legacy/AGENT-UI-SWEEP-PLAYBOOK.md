# Madav — Agent UI-Sweep Playbook (reusable)

_Hand this whole file to an agent and say: "Perform a UI sweep of Madav using this playbook and return the report." Works for the desktop app (computer-use agent) and the web app (browser agent). Last updated 18 June 2026._

---

## What this is
A repeatable script an **AI agent** can follow to click through every main screen of Madav, confirm each one loads and its key action works, and hand back a **Pass/Fail report**. Use it after any release or big change.

## Two ways to run it (pick what fits)

**Path A — Madav's built-in tester (the agent that lives *inside* Madav — use this first).**
Madav already has this. Open the **desktop app signed in as an admin** and go to **Test Center**. It has two testers:
- **UI sweep** — a driver that pilots the REAL interface itself: it clicks every tab, types in the composer, pastes an image, opens every area, and checks what a user would see. Click **UI sweep** and don't touch the mouse for ~1 minute while the app drives itself; you get a pass/fail report per area, saved in Test Center.
- **Engine cycle** — the deeper tester that makes real model calls (instruction-following, agent identity, team planning, file tools, JSON/markdown discipline, etc.).

**Grow the tests with no coding:** in the **Scenario library**, add a scenario, **describe what to check in plain English**, and Madav's **AI drafts the click-by-click steps**; you click **Simulate** (a dry-run on the live UI), review, then **Add**. Your scenarios then run in every sweep alongside the built-ins. *(That AI drafting is the "agent inside Madav" writing the tests.)* Ready-to-paste descriptions are in the Appendix below.

> Honest scope: the in-app **UI sweep** is best at breadth — "does every screen open and respond." Deep judgments (did the web search really work, did the image actually render, is the answer good) need the **Engine cycle** tester and/or the human/agent deep-dives in `CHAT-ENGINE-TEST-PLAN.md`.

**Path B — Agent-driven sweep (for anything hands-on).**
The agent drives the real UI — computer-use for the desktop app, or the browser tools for the web app — following the **Checklist** below.

---

## Rules the agent MUST follow (safety)
1. **Read-only by default.** Don't delete or change the user's real data, settings, projects, agents, files, or API keys.
2. **Use throwaway inputs**, prefixed `QA-sweep` (e.g. a project named "QA-sweep project"), and **delete anything you create** at the end.
3. **Never** send money, place an order, send a message/email, or approve a payment — even if a screen offers it.
4. **Don't sign out** or change the selected provider/model permanently (if you must, restore it after).
5. **On any failure:** capture a screenshot and the exact error text, then **continue** to the next check (don't stop the whole sweep).
6. Run on **both desktop and web** when possible, and note any difference between them.

---

## The Checklist (one block per screen)
For each area: open it → confirm it loads → do the key action → record Pass/Fail. Navigation labels below match the app's buttons.

1. **Let's Chat** — Open it. ✅ the message box appears and is ready. Type a short message and send. ✅ a reply streams in and finishes. Type `/`. ✅ the shortcut/skill menu opens. Click **New chat**. ✅ the conversation clears.
2. **Let's Collaborate** — Open it. ✅ a folder chooser and a permission control appear. (Don't pick a real sensitive folder; a throwaway test folder is fine.)
3. **Let's Build** — Open it. ✅ a coding-task composer appears (and, if shown, the repo/environment picker).
4. **Projects** — Open it. ✅ a "create project / New" action is present. Create `QA-sweep project` → ✅ it appears in the list → **delete it**.
5. **Agents (Agent Studio)** — Open it. ✅ the Agent Studio surface loads (guide or roster). ✅ existing agents/teams still listed (don't edit them).
6. **Studio** — Open it. ✅ tiles load; click a tile (e.g. "Blank canvas") → ✅ it seeds a fresh chat composer. Then **New chat** to reset.
7. **Scheduler** — Open it. ✅ the Scheduler page loads. (Optionally create a `QA-sweep task`, confirm it appears, then **delete it** — only if safe.)
8. **Skills** (under the **Interface** group) — Open it. ✅ the Skills page lists skills / shows the create-skill entry.
9. **Models** (Models overview) — Open it. ✅ the search box and insight tiles load. Type nonsense in search → ✅ the table filters to fewer/zero rows → clear it.
10. **Consumption** — Open it. ✅ the usage dashboard renders KPI cards (or a clean "no activity yet" empty state).
11. **Connectors** — Open it. ✅ the connectors list/registry loads. (Don't disconnect anything; just confirm it renders. If a test connector exists, confirm its status shows.)
12. **Settings** — Open it. ✅ settings load; the provider/model and Extras (e.g. Image generation) toggles are visible. (Don't change keys.)

> Coverage tie-in: a deeper, conversation-level check of chat is in `CHAT-ENGINE-TEST-PLAN.md`, and spreadsheet-building in `EXCEL-GENERATION-TEST-PLAN.md`. This playbook is the broad "does every screen work" sweep; those two are the deep dives.

---

## Report the agent returns
End with this exact structure so results are comparable across runs.

**Summary:** `X / Y checks passed` on **<desktop|web>**, app build/version if visible, date/time.

**Results table:**

| # | Area | Check | Result | Evidence / notes |
|---|------|-------|:------:|------------------|
| 1 | Let's Chat | Opens + composer ready | Pass/Fail | … |
| 1 | Let's Chat | Message sends + reply streams | Pass/Fail | … |
| … | … | … | … | … |

**Failures (detail):** for each Fail — area, what was expected, what happened, the exact error text, and a screenshot.

**Differences between desktop and web:** list anything that behaved differently on the two.

**Cleanup confirmation:** confirm every `QA-sweep` item created during the sweep was deleted.

---

## Appendix — Ready-to-paste scenarios for Madav's Scenario library
In **Test Center → Scenario library**, add a scenario, pick the **Area**, and paste one line below into the "describe what to check" box. Madav's AI turns it into steps; **Simulate**, then **Add**. (Many basics are already built in — these add depth and the newer features.)

- **Let's Chat:** Open Let's Chat, type a message, and confirm a reply appears on screen.
- **Let's Chat:** Open Let's Chat, type "/", and confirm the slash shortcut menu appears.
- **Let's Chat:** Open Let's Chat, paste an image, and confirm an attachment preview appears.
- **Let's Chat:** Open Let's Chat, click New chat, and confirm the conversation clears and the greeting shows.
- **Let's Collaborate:** Open Let's Collaborate and confirm the folder chooser and permission control appear.
- **Let's Build:** Open Let's Build and confirm the coding-task composer appears.
- **Projects:** Open Projects and confirm a Create / New project action is present.
- **Agents:** Open Agents and confirm the Agent Studio surface appears.
- **Studio:** Open Studio, click a tile, and confirm a chat composer appears.
- **Scheduler:** Open Scheduler and confirm the scheduler page loads.
- **Skills:** Open Skills and confirm the skills page loads.
- **Models:** Open Models overview and confirm the search box and tiles appear.
- **Models:** Open Models overview, type "zzzz" in the search, and confirm the table shows fewer rows.
- **Connectors:** Open Connectors and confirm the connectors list loads.
- **Consumption:** Open Consumption and confirm the dashboard or a "no activity yet" message appears.

---

## Notes for whoever runs the agent
- Give the agent access to the app first (the desktop app for a computer-use agent; the web app URL for a browser agent — signed in).
- For a quick health check, Path A alone is enough. For a thorough release sign-off, run Path A **and** Path B, on **both** surfaces.
- This file is reusable as-is every release. To extend it, add a numbered block per new screen and a matching row to the report table — and, if you like, add the new checks to `src/qa/functional.js` so the automated sweep covers them too.
