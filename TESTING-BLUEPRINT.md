# The BrainEdge Testing Bible
### A blueprint for zero-bug deployment — told as the story it actually is

*Version 1.0 · June 2026 · For everyone — no programming knowledge needed.*

---

## Prologue — the machine that checks itself

Every factory has a quality inspector. Most software companies hire people to click every button before a release, hoping to catch what broke. BrainEdge does something better: **it inspects itself**.

Inside the app lives a quality engine. When the admin presses one button, the app walks through its own body — its code, its memory, its file hands, its AI brain, its agent teams, its server heart — and reports, honestly, what works and what doesn't. AI agents do the testing. Humans only read the verdict.

This document is the complete blueprint of that machine: what it is, how it's built, how information flows through it, and exactly how to run it every day. Read it once and you will understand the whole system.

---

## Chapter 1 — The cast of characters

Four characters run this story:

**The Test Center** (what you see) — a page in BrainEdge, visible only to admins, at the bottom of the sidebar. It has one big button — *Run full test cycle* — a live progress board, an issues list, and a history of past runs. Think of it as the cockpit.

**The QA Engine** (what does the work) — an inspector living in the app's engine room (`electron/qa-runner.cjs`). It owns the checklist of ~32 tests, runs them one by one, times each, and reports every result the moment it has one. Think of it as the inspector walking the factory floor.

**The Seven Departments** (what gets inspected) — the tests are grouped into seven areas, each guarding one part of the application. Chapter 3 tours all seven.

**The Ledger** (what remembers) — every completed run is written into a history file (last 30 runs). This is what turns a single test into a *daily practice*: a check that was green yesterday and is red today is a regression, with a timestamp.

And one guard at the door: **the Admin Gate**. The Test Center exercises every part of the app, so only admin accounts can see or run it. The gate uses the same door as the Admin Analytics screen — if your account can read admin statistics, you're in.

---

## Chapter 2 — The architecture: how it's wired

BrainEdge has two halves: the **face** (the window you see — React) and the **engine room** (a background process that owns files, settings, models and agents — Electron's main process). The Test Center lives in the face; the QA Engine lives in the engine room, because that's where everything worth testing actually happens.

```
 ┌────────────────────────  THE FACE (what you see)  ───────────────────────┐
 │                                                                          │
 │   Sidebar ──(admin only)──▶  TEST CENTER page                            │
 │                              • Run button   • Progress board             │
 │                              • Issues list  • Run history                │
 └───────────────▲──────────────────────────────┬──────────────────────────┘
                 │  live events                 │  "start a cycle"
                 │  (one per test)              ▼
 ┌───────────────┴──────────  THE ENGINE ROOM  ─────────────────────────────┐
 │                                                                          │
 │                            QA ENGINE (qa-runner)                         │
 │                                    │                                     │
 │     ┌──────────┬──────────┬───────┼────────┬─────────────┬─────────┐     │
 │     ▼          ▼          ▼       ▼        ▼             ▼         ▼     │
 │   Code      Data       File    Live     Agents &      Skills    Auth     │
 │  integrity  stores     tools   engine    Teams        & tasks   server   │
 │   (parse    (save/     (sand-  (real    (real relay   (discov-  (web     │
 │    every    search/     box)    model    mission!)     ery,      checks) │
 │    file)    delete)             calls)                 tasks)            │
 │                                    │        │                            │
 │                                    ▼        ▼                            │
 │                              YOUR AI PROVIDER (the model you selected)   │
 │                                                                          │
 │                            THE LEDGER (qa-runs.json, last 30 runs)       │
 └──────────────────────────────────────────────────────────────────────────┘
```

### How information flows, step by step

1. **You press the button.** The Test Center sends one message to the engine room: *start a cycle*.
2. **The engine builds the checklist** — fresh every time, so it always reflects the current app (if a new engine file appears, it's automatically on the list).
3. **Tests run one at a time.** Before each test starts and the instant it finishes, the engine sends a small event back to the face: *test X is running… test X passed in 240ms… test Y failed: here's the exact error.*
4. **The face paints in real time.** Each event updates the progress bar and lights up one row on the board — you literally watch the inspection move through the factory.
5. **The verdict is written.** When the last test finishes, the totals (passed / failed / skipped / time) are appended to the Ledger, and the face shows either the red **Issues** panel or the green **"All clear — ship it"** banner.

One detail worth appreciating: failures don't stop the cycle. A failed test is *recorded* and the inspection moves on — so a single broken part never hides the condition of the rest of the factory.

---

## Chapter 3 — The seven departments (what is actually tested)

### 🏗 Department 1: Code Integrity — "does the machine even assemble?"
Every file of the engine room is checked for valid construction — the same check a compiler would make. The server's code is checked too, and the parts list (package.json) is verified to use *pinned* versions, so a surprise update can't change the machine overnight.
**A failure here means:** someone saved a broken file. Nothing else matters until it's fixed.

### 🗄 Department 2: Data Stores — "does the app remember?"
The inspector creates a fake conversation containing a secret canary phrase, saves it, *searches for the phrase*, finds it, deletes it, and confirms it's gone. It does the same dance with a project (plus a knowledge file), checks every saved agent and team for valid shape, and confirms the usage statistics still compute.
**A failure here means:** users could lose chats, projects, or agents. Highest priority after code integrity.

### 📁 Department 3: File Tools — "are the agent's hands safe?"
Agents read and write files for users. The inspector verifies write → read → edit works in a throwaway folder, and — more importantly — that the *escape guard* holds: an agent told to work in folder A must never be able to reach outside folder A.
**A failure here means:** a safety boundary cracked. Treat as an emergency.

### 🧠 Department 4: Live Engine — "is the brain answering, and obeying?"
Six real conversations with your selected AI model:
say *PONG* (is anyone home?) · answer in exactly three bullets (does it follow orders?) · stay in character as a custom agent that must end every reply with BANANA (do agent personalities hold?) · return clean machine-readable JSON (can the Designer and team Coordinator function?) · split a mission into a team plan (does orchestration work?) · produce a markdown table (will chat render beautifully?).
**A failure here means:** either your provider/key/model has a problem (most common), or the model is too weak to power agents — switch models and re-run before suspecting the app.

### 🤝 Department 5: Agents & Teams — "does the workforce actually work?"
The crown jewel. The inspector checks that knowledge files truly enter an agent's mind, that a member's pinned model resolves to the right provider, and then **runs a real two-agent relay mission through the genuine team engine**: agent *Lister* writes a list, agent *Counter* receives it and counts it. The test asserts both stations fired, the hand-off happened, and a deliverable came out. If this passes, your multi-agent feature works — proven, not assumed.
**A failure here means:** the Teams feature is broken for users. The error text says at which step.

### 🧰 Department 6: Skills & Tasks — "do the accessories function?"
A skill is created in a temporary folder and must be discovered and indexed; a Scheduler task is created, updated and deleted; the Via Mobile log accepts and removes entries; every CLI file parses.
**A failure here means:** a side feature broke — bad, but not launch-blocking.

### 🔐 Department 7: Auth Server — "is the front door locked?"
If an account server is configured, it must answer health checks, publish its app version, and — crucially — **refuse admin requests from strangers**. The inspector knocks on the admin door anonymously and passes only if it's turned away.
**A failure here means:** the business layer (logins, billing, admin) has a problem. The "refuses strangers" test failing is a security incident.
*(No server configured? These tests mark themselves "skipped" and say why — skipped is honest, not hidden.)*

---

## Chapter 4 — A day in the life: the daily ritual

```
   MORNING                       IF GREEN                  IF RED
 ┌──────────────┐  all pass  ┌──────────────┐         ┌─────────────────────┐
 │ Open Test    │───────────▶│ "All clear — │         │ Read the Issues     │
 │ Center,      │            │  ship it."   │         │ panel (top of page) │
 │ press RUN    │            │ Work freely. │         │ — exact error shown │
 └──────┬───────┘            └──────────────┘         └─────────┬───────────┘
        │ any fail                                              ▼
        └───────────────────────────────────────▶   Triage (Chapter 6 table)
                                                                │ fixed
                                                                ▼
                                                     RE-RUN until green.
                                                     Yesterday green + today red
                                                     = regression, timestamped.
```

The Ledger turns this into intelligence: ten runs of history are shown with mini pass-bars. The day a row turns red, you know *what* broke and *when* — the search space for the cause is "whatever changed since yesterday."

---

## Chapter 5 — The full deployment pipeline (where the Test Center fits)

The Test Center is the largest gate, but zero-bug deployment uses four:

```
 GATE 0            GATE 1                GATE 2              GATE 3
 Build check  ──▶  TEST CENTER      ──▶  Human pass     ──▶  Staging
 npm run build     full cycle,          30 min of real       deploy to a test
 must succeed      ZERO failures        eyes: TEST-          server with real
 (machine          (~32 automated       AGENTS.md            settings, run the
 assembles)        tests, agents        scenarios + one      cycle THERE, then
                   testing agents)      session per          promote to
                                        provider + light     production
                                        theme sweep
```

Only Gate 2 needs a human, and only for the one thing agents can't yet do: *look at pixels* (covered honestly in Chapter 7). Everything else is automated. The rule is absolute: **a red gate stops the line.** No exceptions, no "just this once."

---

## Chapter 6 — The runbook: exactly how to execute

**Daily cycle (5 minutes):**
1. Open BrainEdge (desktop) and sign in with your **admin** account.
2. In the model selector, pick a **cheap or free model** — a full cycle makes ~9 real AI calls.
3. Sidebar → **Test Center** (bottom; only admins see it).
4. Press **Run full test cycle**. Watch the board fill. (~1–3 minutes, mostly the live AI tests.)
5. Green banner → done for the day. Red issues → Chapter 6½ below.

**Pre-release cycle (the four gates):**
1. `npm run build` in a terminal — must end with "✓ built".
2. Run the Test Center cycle — must be zero failures (skipped-with-reason is acceptable).
3. The 30-minute human pass: the six scenarios in **TEST-AGENTS.md**, one chat + one folder session per provider you support, one sweep in light theme, and pull the network cable mid-answer once (the app must fail politely).
4. Deploy to staging with production settings, run the cycle against staging, then promote.

**Chapter 6½ — reading a failure (triage table):**

| What the issue says | What it really means | What to do |
|---|---|---|
| A file "doesn't parse" | A code file was saved broken | Fix that file first; nothing else is trustworthy |
| Round-trip / canary / CRUD failed | Saving or finding data broke | Stop — user data is at risk; fix before anything |
| "unexpected reply" / "no JSON found" | Model didn't obey | Switch to a stronger/cheaper-but-better model, re-run; if it persists across models, the prompt layer broke |
| "agent broke character" | Agent identities not holding | The agent system-prompt path changed — check recent edits there |
| "expected 2 teammate steps…" | Team engine misfired | The error names the step; Teams is broken for users |
| "health returned 500" / timeouts | Server down or misconfigured | Check the server terminal & environment variables |
| "anonymous admin call returned 200" | **Admin door open — security incident** | Fix immediately; rotate the admin key |
| Skipped (grey) | Feature not configured on this machine | Fine — but configure it on the machine you release from |

---

## Chapter 6⅔ — The Scenario Manager: growing the suite without code

The Test Center ships with built-in scenarios, but the suite is meant to grow with the app. In **Test Center → Scenario Library** an admin adds custom checks in plain English: describe what to verify, let the AI draft the steps, **Simulate** it live, tick the confirmation box, and **Add**. Saved scenarios can be reordered, edited, toggled off, and run in every sweep alongside the built-ins.

### The "Area" field — what it is and how to use it

When you add or draft a scenario, the first control is an **Area** dropdown (Agents, Let's Chat, Studio, Scheduler, …). It does two jobs, and only two:

1. **It tells the "Draft steps with AI" button which screen the check lives on**, so the AI begins the steps with the correct `navigate` action (e.g. Area = *Agents* → the draft starts by navigating to the Agents screen). Without it, the AI guesses the entry point.
2. **It labels the scenario for reporting** — the Area shows as the badge next to the scenario name and in every failure report, so a red row instantly tells you *which part of the app* broke.

It is a label + navigation hint only — it does **not** change what the test does. The *steps* do that.

**Pick the Area that matches the feature your check exercises:**

| You're testing… | Pick Area |
|---|---|
| The agent builder / roster / teams | **Agents** |
| The chat composer, slash menu, image paste | **Let's Chat** |
| Folder / cowork flows | **Let's Collaborate** |
| Repo / coding flows | **Let's Build** |
| Studio artifact previews | **Studio** |
| Scheduled tasks / webhooks | **Scheduler** |
| Models overview / search | **Models** |
| Usage dashboard | **Consumption** |
| Projects | **Projects** |
| Skills / Connectors / Via Mobile (the sidebar "Interface" group) | **Interface** |
| Anything cross-cutting, or a screen without its own area (e.g. **Terminal**) | **Custom** |

**Are the Area options all relevant?** Mostly — they map to the app's actual navigation. Two caveats:

- **"Interface" is a catch-all** for the sidebar's Skills / Connectors / Via Mobile group. If you write many skill- or connector-specific checks, those would read more clearly as their own areas.
- **Terminal isn't a dedicated option** even though it's a real screen (the AI prompt does know the "Terminal" nav label), so a Terminal check currently goes under **Custom**.

If the area list ever drifts from the real sidebar, align it to navigation: add **Terminal** and split **Skills** / **Connectors** out of "Interface" so every scenario tags to a precise screen.

---

## Chapter 6¾ — The Repair Bay: from red row to fixed code

Finding a bug is half the loop. The other half lives directly inside the Issues panel:

```
  RED ROW                 REPAIR AGENT                ADMIN (you)              MACHINE
 ┌───────────┐  click   ┌─────────────────┐  shows  ┌─────────────────┐ click ┌──────────────────┐
 │ Failed    │─────────▶│ Reads the error │────────▶│ Plain-English   │──────▶│ Backup saved →   │
 │ test +    │ Diagnose │ + the suspect   │         │ diagnosis +     │Approve│ patch applied →  │
 │ exact     │          │ source file,    │         │ the EXACT       │       │ re-run cycle.    │
 │ error     │          │ drafts ONE      │         │ before/after    │       │ Still red? one   │
 └───────────┘          │ minimal patch   │         │ change, with    │       │ click ROLLS BACK │
                        └─────────────────┘         │ confidence level│       └──────────────────┘
                                                    └─────────────────┘
```

The division of labor is deliberate: **diagnosis is autonomous, surgery is supervised.** The agent may read anything, but it may change *nothing* without your Approve click — that's the review-with-the-creator step, built in.

Five safety rails make this trustworthy:
1. **The patch must validate before you ever see it** — the proposed change has to match the real file exactly once; if it doesn't, it's demoted to "diagnosis only" with the reason shown.
2. **Every apply writes a backup first** (a timestamped copy next to the file), and **Roll back** is one click.
3. **The agent can only touch project files** of safe types — never your system, never your settings or keys.
4. **Honesty about environment:** if the cause is a dead provider, a missing key, or a stopped server, the agent says "not auto-fixable — here's what to check" instead of inventing a code change.
5. **Restart warnings:** fixes to the engine's core or the visual layer are labeled "restart/rebuild required" so a re-run doesn't test stale code.

The loop ends the way it started: re-run the cycle. Green = the fix held. Red = roll back and escalate to a human developer with the diagnosis already written.

---

## Chapter 7 — Honest boundaries, and what's next

A bible that overpromises is just marketing. Three truths:

1. **Pixels are still human.** The agents test everything *under* the glass — logic, data, AI behavior, security. They don't yet open windows and click buttons. That last mile is Gate 2's thirty minutes. It *can* be automated later (a browser-automation harness — Playwright — driving the real app as "Suite 8"); say the word when you want it.
2. **AI tests breathe.** Live-model tests are written leniently because models phrase things differently each run. A rare flaky failure can happen — re-run once before panicking. Twice red = real.
3. **The cycle tests one machine.** Run it on the machine you release from, with the settings you release with. A green cycle on your laptop says nothing about a misconfigured server in the cloud — that's exactly why Gate 3 (staging) exists.

**Roadmap, in order of value:** Suite 8 (UI automation) → scheduled automatic daily runs with a morning report → cycle-vs-cycle diffing ("what turned red since Tuesday?") → a staging-target switch so one click tests production config.

---

## Appendix — The complete test inventory

| # | Department | Test | Proves |
|---|---|---|---|
| 1–14 | Code integrity | Every engine file parses (one test per file) | The machine assembles |
| 15 | Code integrity | Server file parses | The business layer assembles |
| 16 | Code integrity | Parts list valid, versions pinned | No surprise upgrades |
| 17 | Data stores | Settings save/load round-trip | Configuration survives |
| 18 | Data stores | Agents & teams have valid shapes | The workforce roster is intact |
| 19 | Data stores | Conversation create → content-search → delete | Chats persist and are findable |
| 20 | Data stores | Project + knowledge round-trip | Projects remember |
| 21 | Data stores | Usage statistics compute | Consumption dashboard feeds |
| 22 | File tools | Write/read/edit in a sandbox | Agent hands work |
| 23 | File tools | Folder-escape stays blocked | Agent hands are safe |
| 24 | Live engine | PONG ping | The brain answers |
| 25 | Live engine | Exactly three bullets | The brain obeys |
| 26 | Live engine | BANANA character test | Agent identities hold |
| 27 | Live engine | Clean JSON config | The Designer can function |
| 28 | Live engine | Team plan JSON | The Coordinator can function |
| 29 | Live engine | Markdown table | Chat renders beautifully |
| 30 | Agents & Teams | Knowledge reaches the agent's mind | Agent knowledge works |
| 31 | Agents & Teams | Pinned models resolve correctly | Per-member models work |
| 32 | Agents & Teams | **Real 2-agent relay mission** | The multi-agent engine works, proven live |
| 33 | Skills & tasks | Skill created → discovered → indexed | Skills pipeline works |
| 34 | Skills & tasks | Scheduler task create/update/delete | Scheduling persists |
| 35 | Skills & tasks | Via Mobile log round-trip | Remote-control log works |
| 36 | Skills & tasks | All CLI files parse | The terminal product assembles |
| 37 | Auth server | /health answers | The heart beats |
| 38 | Auth server | /app-version answers | Update checks work |
| 39 | Auth server | Admin door refuses strangers | The vault is locked |

*Counts shift automatically as the app grows — the checklist is rebuilt from the real codebase on every run. That's the point: the bible never goes stale, because the machine reads itself.*

---

*End of blueprint. When something here stops matching reality, the Test Center will say so before this document does — trust the red rows, then update the bible.*
