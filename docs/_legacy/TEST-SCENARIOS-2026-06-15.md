# Madav — Test Scenarios (2026-06-15 build)

Covers everything shipped this session: bespoke **Word / PDF / Excel** (code-gen + validation + self-repair), **chat sync** (web ⇄ desktop), **web prompt parity**, the **35B+ capability gate**, and the **sidebar** (compress / scroll / resize). Copy-paste the prompts, watch for the expected result, tick Pass/Fail at the bottom.

---

## 0. Pre-test setup

| Step | Desktop | Web |
|---|---|---|
| Load new code | **Full restart**: stop, then `npm run electron:dev` (main-process prompts changed — Ctrl+R is not enough) | Redeploy `server/` (new `/conversations` endpoints) + rebuild client (`npm run build`) |
| Models to configure | A **strong** model (Claude Opus/Sonnet, GPT-4-class), a **mid-tier** 35B+ (e.g. `qwen2.5-32b`, `yi-34b`, `command-r-35b`), and a **weak** model (anything `*-7b`, `*-8b`, `*-mini`, or `:free`) | Same |
| Sign in | Same account on **both** desktop and web (required for chat sync) | Same account |

**The capability gate decides the path.** Strong + mid-tier (35B+) → **bespoke** (model writes code). Weak/free → **template** (deterministic, can't break). Keep this in mind when reading results.

---

## 1. Bespoke Excel (xlsxjs) — strong model

**Model:** strong (Opus/Sonnet)
**Prompt:**
> Build me an Excel model of unit economics for a SaaS startup — MRR, churn, CAC, LTV, and a 12-month projection with a separate Summary sheet.

**Steps:** send → wait for the reply to finish → click **View** → then **Download** → open in Excel.

**Expected / Pass:**
- A **📊 spreadsheet card** appears (not a raw code block, not the old template card).
- **View** opens a styled table preview beside the chat (formula cells shown as formulas — that's expected; numbers compute on open).
- **Download** saves a real `.xlsx` with 3 sheets (Assumptions, Projection, Summary).
- In Excel: Month 2–12 actually **compute** (no `#NAME?`/`#REF!`), ARPA **compounds** month over month, formulas reference the prior column.

---

## 2. Bespoke Word (docxjs) — strong model

**Model:** strong
**Prompt:**
> Write a polished 2-page Word document titled "State of AI — 2026 Executive Brief". Include a title, 3–4 section headings, real multi-paragraph prose, bold lead-ins, and a small comparison table of three AI labs.

**Steps:** send → wait → **Download** → open in Word.

**Expected / Pass:**
- A **📄 Word document card** appears with a Download button.
- Opens a real `.docx` with a title, headings, genuine prose, and a table.
- **No `[object Object]`** or blank text anywhere in the document.

---

## 3. Bespoke PDF (pdfjs) — strong model

**Model:** strong
**Prompt:**
> Create a one-page PDF investor one-pager for a fictional fintech called "NovaPay": a coloured header band with the name, a tagline, 4 key metrics (ARR, growth, customers, runway), and two short paragraphs describing the product and the market.

**Steps:** send → wait → **Download** → open the PDF.

**Expected / Pass:**
- A **📕 PDF card** appears.
- Opens a real `.pdf` (one page) with a header band, the metrics, and wrapped body text.
- No `[object Object]` / `NaN` in the rendered text.

---

## 4. Validation + self-repair (Layer 2 / Layer 3)

This is hard to force now that the guardrail works — but here's how to recognise it if a formula/text slips.

**Model:** strong
**Prompt (formula-heavy, higher chance to exercise the net):**
> Build an Excel cohort-retention model: 12 monthly cohorts down the rows, months 0–11 across the columns, each cell = the prior month's retained customers × (1 − monthly churn), plus a weighted-average retention curve and an NPV-of-LTV summary.

**Expected / Pass (either outcome is a pass):**
- **Clean first try:** card builds, every cell computes. (Guardrail worked.)
- **Repair path:** on Download you briefly see *"Found N formula issue(s) — Madav is rebuilding it…"*, then a **corrected card appears below**. Download that one. (Layers 2+3 worked.) It will **not** loop — at most one auto-repair; if still imperfect you get a **"Download anyway"** override.

---

## 5. Weak model → safe template (no code-gen)

**Model:** weak (a `:free` or `*-7b`/`*-mini` model)
**Prompt:** (reuse Test 1's SaaS Excel prompt)

**Expected / Pass:**
- You get a **styled template** spreadsheet card (officedoc path), **not** a bespoke one.
- It **cannot** show the `Bundefined`/formula errors — it's deterministic.
- Tradeoff to confirm: it's a **static styled table** (no live formulas). That's correct behaviour for weak models.
- **No errors, no hang, no broken card.**

---

## 6. Mid-tier 35B+ → bespoke (POC)

**Model:** `qwen2.5-32b` / `yi-34b` / `command-r-35b` (any 30B+)
**Prompt:** (reuse Test 1's SaaS Excel prompt, or Test 2's Word prompt)

**Expected / Pass:**
- Routes to **bespoke** (📊 xlsxjs / 📄 docxjs card), same as a strong model — not the template.
- Output quality may be a notch below Opus, but it should be a real formula-driven model / designed doc.
- Sanity check the other direction: a `*-8b` model on the same prompt must **still** get the template.

---

## 7. Web bespoke parity

**Where:** the deployed **web** build (not desktop).
**Model:** strong
**Prompts:** repeat Tests 1, 2, 3 on web.

**Expected / Pass:**
- Web now produces the **same bespoke cards** as desktop (📊/📄/📕), not the old flat template.
- A **weak** model on web gets the template (gate now applies on web too).
- No "bespoke error" on weak models anymore.

---

## 8. Chat sync (web ⇄ desktop)

**Pre:** signed into the **same account** on both, server redeployed.

**Test 8a — desktop → web:**
1. On **desktop**, start a new chat ("Sync test A — desktop") and send a message.
2. Wait ~5–10s (debounced push), then open/refresh **web**.
3. **Pass:** "Sync test A" appears in web Recents with its messages.

**Test 8b — web → desktop:**
1. On **web**, start "Sync test B — web" and send a message.
2. Wait ~5–10s, then restart/reopen **desktop** (pull runs on launch).
3. **Pass:** "Sync test B" appears in desktop Recents.

**Notes:**
- Merge is **last-write-wins by `updatedAt`** per conversation.
- Web-side merged chats may need one navigation/refresh to render in Recents (known minor refinement).
- Off / signed-out / offline = no-op; local chats never break.

---

## 9. Sidebar UX

| Test | Action | Pass |
|---|---|---|
| 9a Compress | Look at Recents | Items are tighter than before (less vertical gap) |
| 9b Scroll | Have 15+ chats | Recents scrolls within its area; profile stays pinned at the bottom |
| 9c Resize | Drag the sidebar's **right edge** left/right | Width changes live (200–460px) |
| 9d Persist | Resize, then restart the app | The width you set is remembered |
| 9e Reading | Narrow the sidebar | Chat reading column has more room (≈820px) |

---

## Results tracker

| # | Area | Model | Pass / Fail | Notes |
|---|---|---|---|---|
| 1 | Bespoke Excel | strong | | |
| 2 | Bespoke Word | strong | | |
| 3 | Bespoke PDF | strong | | |
| 4 | Validate + repair | strong | | |
| 5 | Weak → template | weak | | |
| 6 | Mid-tier 35B+ | 32–34B | | |
| 7 | Web parity | strong (web) | | |
| 8a | Sync desktop→web | — | | |
| 8b | Sync web→desktop | — | | |
| 9 | Sidebar (a–e) | — | | |

---

## What "good" looks like vs. what's out of scope

- **In scope (should pass):** real downloadable files, correct formulas, designed layouts, the gate routing correctly, sync round-tripping, the sidebar behaviours.
- **Out of scope (not a failure):** the validator catches *broken output* (`[object Object]`, `undefined`/`NaN`, broken refs, empty), **not** wrong-but-valid content (e.g. an economically debatable LTV formula). That's a model-quality matter, addressed by the prompt, not the safety net.
- **Preview limit:** the Excel **View** shows formulas, not computed values (browsers can't evaluate Excel formulas) — numbers are live once opened.
