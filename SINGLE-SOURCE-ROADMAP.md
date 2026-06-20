# Madav — Full Roadmap to a Single-Source App (plain English)

_Last updated: 18 June 2026. This is the complete plan to get the whole app onto one shared "brain," done in safe stages. Pair with `SINGLE-SOURCE-STATUS.md` (where we are today)._

---

## How every stage is done (the same safe method each time)
For each piece we merge, we follow the identical, low-risk recipe:

1. **I build the shared version** of that piece (one copy that both apps can use).
2. **I put it behind an on/off switch**, defaulting to the old way — so nothing changes until we choose.
3. **We test on desktop first, then web** — desktop is your priority surface, so it's always proven first.
4. **I run the automated test suite myself** and tell you in plain words if everything passed (zero work for you).
5. **You do a quick 2-minute sanity check** and confirm it feels right. There's always an instant "undo."
6. **Only then do I delete the old copy** — never before it's proven — and **add new automated tests** so it can't silently break later.

You barely have to lift a finger; I do all the code and the testing and give you simple steps. Every stage is reversible until you're happy.

## The shape we're aiming for
**One shared brain** (all the logic + all the screens) **+ a thin "plumbing" layer** for the few things that *must* differ (running code, storing files and passwords). The goal is to make the brain shared and shrink the plumbing to the smallest possible amount.

---

## The stages at a glance

| # | Stage | Status |
|---|-------|--------|
| 1 | Chat engine ("Let's Chat") | ✅ Done (desktop cleanup finishing) |
| 2 | Let's Collaborate (folder work) | 🔜 Next |
| 3 | Let's Build + Projects / Workrooms | ⬜ Planned (highest risk) |
| 4 | Team mode (multiple agents) | ⬜ Planned |
| 5 | Document / office files (Word, Excel, PDF, slides) | ⬜ Planned (rules written, not switched on) |
| 6 | Behind-the-scenes services (memory, skills, scheduler, connectors, research, images) | ⬜ Planned (several small merges) |
| 7 | Knowledgebase / Sage | ⬜ Planned |
| 8 | Models & providers | ⬜ Planned (partly shared already) |
| 9 | Consumption / usage / billing | ⬜ Planned (screens already shared) |
| 10 | Settings & accounts | ⬜ Planned (screens already shared) |
| 11 | **Final whole-app end-to-end (E2E) test** | ⬜ The last step — one big test of everything |
| — | Testing & safety net | 🔁 I run it after every stage |
| — | The thin plumbing + desktop-only features | ⚙️ Stays per-platform on purpose |

---

## Stage 1 — Chat engine ✅ (done / finishing)
**What it is:** the heart of the app — how it talks, uses tools, handles long conversations.
**Status:** Web fully done and live. Desktop now running the shared engine by default; the last step (removing the old desktop chat code) is queued, waiting on your "desktop feels good."
**Your part:** test-drive desktop, then I delete the old code and add the final tests.

## Stage 2 — Let's Collaborate (working in a folder) 🔜 next
**What it is:** the AI working inside a folder you choose — reading and writing your files to get a task done.
**Where it stands:** the web side already runs on the shared engine (we did that as part of stage 1); the **desktop side does not yet** — so this stage is "bring desktop onto the shared engine for folder work too."
**Size:** Small–Medium. **Risk:** Medium (it touches file tools).
**Your part:** use a folder task on desktop, confirm reading/writing files works exactly as today.

## Stage 3 — Let's Build + Projects / Workrooms ⬜ (the big one)
**What it is:** the larger build workflow and the Projects/Workrooms area — bigger, multi-step jobs.
**Why it's the riskiest:** this is where a delicate, protected part lives — the routine that lets even weak AI models reliably build a spreadsheet/report. We must **re-run the proven "build a report" test** and confirm it still works before/after.
**Size:** Large. **Risk:** High. We'll go extra-slow and extra-reversible here.
**Your part:** run a real project (including a "build a report" task) and confirm the file comes out correctly.

## Stage 4 — Team mode (several agents working together) ⬜
**What it is:** multiple AI agents coordinating on a job (a "crew").
**Where it stands:** the web side has the fuller version; desktop is partial. We unify into one shared coordinator.
**Size:** Medium–Large. **Risk:** Medium.
**Your part:** run a team/crew job on both and confirm they behave the same.

## Stage 5 — Document / office files (Word, Excel, PDF, slides) ⬜
**Two parts:**
- **(a) Switch on the shared rules.** The instructions the AI follows to build office files are *already written* as one shared copy — they just need turning on. This is tied to Stage 3 (same protected area), so we do it alongside or right after.
- **(b) Share the building logic** where it makes sense. The actual *file creation* partly depends on the platform (desktop can use more tools than a browser), so here "one source" mainly means the *decisions and rules* are shared, while the raw building may stay partly platform-specific.
**Size:** Medium. **Risk:** High (protected pipeline — re-test required).

## Stage 6 — Behind-the-scenes services ⬜ (several small, independent merges)
These each share the screens already, but have two engines underneath. We merge them one at a time:
- **6a. Agent memory & history** — what your agents remember and their track record.
- **6b. Skills** — finding, drafting, and running your saved skills.
- **6c. Scheduler engine** — the part that actually runs your automated/scheduled tasks (screens already shared).
- **6d. Connectors (MCP)** — connecting outside tools/services.
- **6e. Deep research** — the multi-source research routine.
- **6f. Image generation** — making images ("one source" = shared decisions; the actual image call differs by platform).
**Size:** each Small–Medium. **Risk:** Low–Medium. Good "quick wins" between the bigger stages.

## Stage 7 — Knowledgebase / Sage ⬜
**What it is:** the knowledge the assistant draws on (including the in-app "Sage" helper and document knowledge).
**Where it stands:** different pieces on each side today. We unify the retrieval logic into one shared copy.
**Size:** Medium. **Risk:** Low–Medium.

## Stage 8 — Models & providers ⬜
**What it is:** choosing and talking to AI providers/models.
**Where it stands:** the model picker and some provider-call logic are already shared; the rest can be unified. **Local models** (run on your own machine) stay desktop-only by nature.
**Size:** Small–Medium. **Risk:** Low.

## Stage 9 — Consumption / usage / billing ⬜
**What it is:** tracking usage and costs.
**Where it stands:** the dashboard/screens are already shared; the tracking logic underneath can be unified.
**Size:** Small. **Risk:** Low.

## Stage 10 — Settings & accounts ⬜
**What it is:** your settings and sign-in.
**Where it stands:** the screens are already shared; only the *storage* differs (desktop saves to your computer with encryption; web saves in your browser). The logic can be shared with a thin storage adapter.
**Size:** Small. **Risk:** Low.

## Stage 11 — Final whole-app end-to-end (E2E) test ⬜ (the last step — your "once for all")
**What it is:** after everything above is merged, we do **one big, thorough test of the entire application** — every mode, every major feature, web and desktop — to confirm the whole thing works together as one.
**How:** I run the complete automated suite (which by then covers every stage), and we do a guided hands-on walkthrough of the real app together. This is your single, comprehensive, final sign-off.
**Result:** the whole app confirmed running on one shared brain.

---

## Testing & safety net 🔁 (I run this after every stage — your anti-drift guarantee)
- **After every stage, I run the full automated test suite myself** (~294 checks today, growing each stage) and report the result to you in plain English. **You don't run anything** for routine checks.
- If the workspace ever serves me stale/garbled files, I build a clean copy and run the tests from there — so the result is always trustworthy.
- Each stage **adds new automated tests** that lock in the behavior, plus a **"behavior stamp"** — if the two apps ever start drifting apart again, a test goes red immediately.
- You also have the in-app **Test Center / QA** for hands-on checks any time.
- **Stage 11** is the one big whole-app end-to-end test at the very end.
**The promise:** once a piece is merged and tested, it stays merged — drift can't creep back unnoticed, and you're never relying on a single test at the end alone.

## Stays different on purpose ⚙️ (the thin plumbing + desktop-only)
Not everything can or should be identical — these are limits of a browser, not gaps:
- **Desktop-only by physics:** the built-in terminal, running shell commands, running local AI models (Ollama/LM Studio), and a few OS extras (e.g. Telegram bridge, Windows voice). A browser isn't allowed to do these.
- **Thin plumbing that legitimately differs:** how code runs (desktop = your machine; web = a sealed sandbox), where files live, and how passwords/keys are stored (desktop = encrypted on your computer; web = in your browser, never on a server).
We keep this layer **as small and well-defined as possible**, and document it, so the brain above it stays fully shared.

---

## Honest notes on order and effort
- **Risk is front-loaded** on Stage 3 (Build/Projects) because of the protected file-building pipeline — we'll treat it with the most care and the most testing.
- The **small services in Stage 6** and the **light stages (8–10)** are good momentum-builders we can slot between the bigger ones.
- **Order is yours to set.** This is the recommended sequence (lowest risk to value), but you can pull any feature forward if it matters more to you.
- This is a **multi-stage effort**, deliberately. The payoff grows the whole time: every fix and improvement from here lands once and reaches both apps.

## What I need from you at each stage
1. I make the change, **run the automated tests**, and give you simple, numbered steps.
2. You restart/use the app and do a quick confirm ("looks good").
3. I remove the old copy and add the tests.
4. We move to the next stage — and finish with the one big end-to-end test (Stage 11).

That's the whole journey, end to end. Tell me when you're ready and we'll start **Stage 2 (Let's Collaborate)** — or name any stage you'd rather do first.
