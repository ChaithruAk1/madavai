# Madav Projects — E2E Test Script (Deterministic Job Engine)

## What this build changed (plain English)
A folder-linked Project task no longer "improvises" through an open agent loop. It now runs a **deterministic job engine**:

1. **Inspect** — Madav reads your files itself (names, columns, sample rows). No model.
2. **Decide** — if a saved, matching procedure exists → **replay** it; otherwise **author** a new one.
3. **Author (once)** — the model gets the schema up front and writes **ONE** script. No exploring.
4. **Run + validate** — Madav runs the script and checks the expected file(s) actually appeared.
5. **Save** — a validated run is saved as the project's **job** and reused next time.

Key guarantees:
- **Replay = consistency:** the 2nd run of the same task reuses the saved script with **no model call** → identical output, instant.
- **Auto re-author:** change the instructions OR the files (new/renamed columns) → it rebuilds, then is deterministic again.
- **Bounded:** a hard time limit means a run can **never spin forever**; you get a clear message.
- **Fail-open:** if the engine errors, Projects fall back to the old behavior — nothing else breaks.
- **Model isolation:** each chat keeps its own model; the workroom keeps the project's model.

---

## 0. Setup (do once)
1. In the `Madav` folder: `git pull`
2. `git log --oneline -1` should show the latest "Projects" commit.
3. **Full restart:** close the app → Ctrl+C in the terminal → `npm run electron:dev`.
4. For the **first** build of any report, pick a **Recommended** model (e.g. `deepseek-v4-pro`). Free models are fine for replay afterward.

---

## TEST 1 — Simple report (sanity check the engine)
**Setup:** a project linked to a folder containing ONE file `sales.csv` with columns `Region, Amount`.
**Instruction (project Instructions box):** `Create Summary.xlsx with total Amount per Region (one sheet, columns Region | Total).`

**Steps**
1. Open the project, model = deepseek-v4-pro, send: `Execute Report`.

**Expected**
- Short progress lines: `• Inspecting your files…` then `• Writing the script…`.
- A handful of steps (NOT a growing 12–16 step list).
- A `Summary.xlsx` Open/Download card appears.
- Final message: *"Done - built the report… the next run reuses it exactly."*

**PASS if:** `Summary.xlsx` opens and shows one row per region with correct totals.

---

## TEST 2 — Complex report (the real one: DTCKPI, 3 sheets)
**Setup:** project **Operations KPI**, folder `C:\DTCKPI` with `Submitted.xlsx, Resolved.xlsx, Backlog.xlsx, Chargeback.xlsx, Survey.xlsx`.
**Instruction:** your existing DTC spec — `Generate the DTC IT Service Performance report as Report_March.xlsx with 3 sheets: SUMMARY (incidents only)…, plus the Chargeback and Survey sheets…` (use your full wording).

**Steps**
1. Model = deepseek-v4-pro. Send: `Execute Report`.

**Expected**
- `• Inspecting your files…` → `• Writing the script…` → (maybe one `• Fixing the script and retrying…`) → result.
- `Report_March.xlsx` card appears.
- It completes in **bounded** steps — no endless `cd /d C:\DTCKPI &&` loop, no 9-minute spin.

**PASS if:** `Report_March.xlsx` opens with the 3 expected sheets and the numbers look right.
> Review the numbers now — this first output is the one you're trusting. If wrong, see TEST 4.

---

## TEST 3 — Replay = consistency (the headline)
**Steps**
1. Right after TEST 2 succeeds, send `Execute Report` **again** (same project, same files, same instructions).

**Expected**
- Progress line: `• Reusing this project's saved procedure…`
- It finishes **fast** and **without a model call**.
- Same `Report_March.xlsx` regenerated.

**PASS if:** the second run is near-instant, shows the "reused… (no model needed)" message, and produces the same report. **Try it on a FREE model too** — replay should still work (the model isn't used for replay).

---

## TEST 4 — Auto re-author on INSTRUCTION change
**Steps**
1. Edit the project Instructions (e.g. add: `Add a 4th sheet: Backlog aging by priority.`).
2. Send `Execute Report`.

**Expected**
- It detects the change: `• Writing the script…` (re-authors, NOT replay).
- New `Report_March.xlsx` with the 4th sheet.
- The next run after this replays the NEW procedure.

**PASS if:** the change is reflected and it rebuilt (didn't blindly replay the old script).

---

## TEST 5 — Auto re-author on FILE/COLUMN change
**Steps**
1. Add a new column to one of the source files (or drop in a new data file), keeping the task the same.
2. Send `Execute Report`.

**Expected**
- It re-authors (the data shape changed), producing a correct report against the new columns.

**PASS if:** it rebuilds instead of replaying a now-stale script (no `KeyError` on a renamed column).

---

## TEST 6 — Model isolation (the leak fix)
**Steps**
1. On the **workroom page**, set the model to **A** (e.g. deepseek-v4-pro).
2. Start a chat; inside it, change the model to **B** (e.g. a free one).
3. Go **Back** to the workroom page.
4. Re-open the chat from step 2.

**Expected**
- Step 3: the workroom shows **A** again (not B).
- Step 4: the chat shows **B** again (its own model).
- A brand-new chat opens on the **workroom's** model (A), not the last-used.

**PASS if:** the workroom and each chat each keep their OWN model — no bleed-through.

---

## TEST 7 — Bounded run (no infinite spin)
**Steps**
1. Switch to a **free** endpoint known to be slow/flaky (e.g. a `:free` model). Send `Execute Report`.

**Expected**
- If the endpoint stalls, the run **ends on its own within ~4 minutes** with: *"I stopped this run - it passed the time limit… for the first build use a capable paid model."*
- The Stop (blue square) also works at any time.

**PASS if:** it never spins indefinitely — it either completes or stops with a clear message.

---

## TEST 8 — Fail-open (no regression)
**Steps**
1. In a NON-data project chat (folder with no spreadsheets, or a plain "write me a note" task), send a normal request.

**Expected**
- Behaves exactly as before (the engine only takes over folder data tasks; everything else is unchanged).

**PASS if:** normal chat / generation tasks are unaffected.

---

## Pass/Fail tracker
| # | Test | Pass? | Notes |
|---|------|-------|-------|
| 1 | Simple report builds | | |
| 2 | DTCKPI 3-sheet builds (bounded) | | |
| 3 | 2nd run replays (no model, incl. free) | | |
| 4 | Re-authors on instruction change | | |
| 5 | Re-authors on file/column change | | |
| 6 | Model isolation (workroom vs chat) | | |
| 7 | Free model run is bounded (≤~4 min) | | |
| 8 | Non-data tasks unaffected (fail-open) | | |

**If any test fails:** expand the step, copy the command + output, and send it — with the engine in place, errors are now specific and fixable (a script mistake the model can correct), not a silent spin.
