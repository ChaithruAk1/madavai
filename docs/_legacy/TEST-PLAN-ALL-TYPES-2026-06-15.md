# Madav — Full Test Plan: every document type, web + desktop (2026-06-15)

Tests all five "objects" — **Excel, PowerPoint, Word, PDF, HTML** — across **both surfaces**, plus the robustness layers (validation, auto-repair, completion-gating, capability gate), chat sync, and the sidebar. Copy-paste each prompt, watch for the expected card/behaviour, tick the matrix at the bottom.

---

## 0. Setup (do this once)

| | Desktop | Web |
|---|---|---|
| Load the latest code | **Full restart**: stop, then `npm run electron:dev` (main-process changed) | `npm run build` → **redeploy to Render** |
| Sign in | same account on **both** (needed for chat-sync test) | same account |
| Have 3 models ready | a **strong** model (Claude Opus/Sonnet, GPT-4-class) · a **mid-tier 35B+** (`qwen2.5-32b`, `yi-34b`, `command-r-35b`) · a **weak** model (`*-7b`, `*-8b`, `*-mini`, or `:free`) | same |

**How the gate decides the path (keep in mind while reading results):**
- **Strong / mid-tier (30B+)** → **bespoke** (model writes code → real, designed file).
- **Weak / free** → **template** (deterministic; can't break, but static).
- **HTML** → always a **live preview** (no gate; rendered in a sandboxed frame).

**Universal rule for every card:** View/Download appear **only after the reply finishes**. While generating you'll see "Composing…" with no buttons. That's correct — don't click early (there's nothing to click).

---

## 1. Excel (xlsxjs) — strong model

**Prompt:**
> Build me an Excel model of unit economics for a SaaS startup — MRR, churn, CAC, LTV, and a 12-month projection with a separate Summary sheet.

**Steps:** send → wait for completion → **View** (table preview beside chat) → **Download** → open in Excel.
**Pass:** 📊 card; 3 sheets (Assumptions, Projection, Summary); months 2–12 actually compute (no `#NAME?`/`#REF!`); ARPA compounds month-over-month. Run on **web and desktop** — identical result.

---

## 2. PowerPoint (deckjs) — strong model

**Prompt:**
> Create a 5-slide investor pitch deck for a fictional climate-tech startup "TerraGrid" — problem, solution, market size, traction, and the ask. Dark theme, with a chart on the market-size slide.

**Steps:** send → wait → **View** (renders the slides beside chat) → **Download** → open in PowerPoint.
**Pass:** 📽 card; exactly 5 slides; dark design with cards/stat numbers/icons and a real chart; no `[object Object]` in any slide text. **Web and desktop** identical.

---

## 3. Word (docxjs) — strong model

**Prompt:**
> Write a polished 2-page Word document titled "State of AI — 2026 Executive Brief": a title, 4 section headings, real multi-paragraph prose, bold lead-ins, and a comparison table of three AI labs.

**Steps:** send → wait → **Download** → open in Word.
**Pass:** 📄 card; title + headings + genuine prose + a table; no `[object Object]` or blank runs. **Web and desktop** identical.

---

## 4. PDF (pdfjs) — strong model

**Prompt:**
> Create a one-page PDF investor one-pager for a fictional fintech "NovaPay": a coloured header band with the name, a tagline, 4 key metrics (ARR, growth, customers, runway), and two short descriptive paragraphs.

**Steps:** send → wait → **Download** → open the PDF.
**Pass:** 📕 card; one page; header band, the metrics, wrapped body text; no `NaN`/`[object Object]`. **Web and desktop** identical.

---

## 5. HTML (live page) — any capable model

**Prompt:**
> Build a landing page for a productivity app called "FlowState" — a hero section, 3 feature cards, a 3-tier pricing table, and a footer. Make it look like a shipped product (Tailwind or real CSS).

**Steps:** send → wait → the page opens as a **live preview** in the side panel (and a Code tab).
**Pass:** a designed, responsive page (not default-browser look); hero + 3 cards + pricing + footer; renders live. **Web and desktop** identical. (HTML uses no code-execution worker, so no Download card — it's a rendered artifact.)

---

## 6. Robustness (run a couple, both surfaces)

| Test | Prompt / action | Pass |
|---|---|---|
| **6a Weak → template** | Re-run Test 1 on a **weak/free** model | A styled **template** spreadsheet (not bespoke); **no errors, no hang**; it's a static table — correct for weak models |
| **6b Mid-tier 35B+** | Re-run Test 1 (or 2) on `qwen2.5-32b` / `yi-34b` | Routes to **bespoke** (📊/📽), same as a strong model |
| **6c Auto-repair** | Re-run Test 2 a few times on a strong model | If a generation is malformed you briefly see **"…rebuilding it…"** then a corrected card — no raw error. (Often it's just clean.) |
| **6d Completion-gate** | Watch any card during generation | Buttons stay hidden until the reply finishes |

---

## 7. Chat sync (web ⇄ desktop)

1. **Desktop:** new chat "Sync A", send a message → wait ~10s.
2. Open/refresh **web** (same account) → **Sync A appears** in Recents.
3. **Web:** new chat "Sync B", send a message → wait ~10s → reopen **desktop** → **Sync B appears**.

**Pass:** both directions show up (last-write-wins by `updatedAt`; existing chats upload on next app open). Note: web may need one refresh to render a freshly-merged chat.

---

## 8. Sidebar

| | Action | Pass |
|---|---|---|
| 8a | Look at Recents | tighter spacing than before |
| 8b | 15+ chats | the list scrolls; profile stays pinned at the bottom |
| 8c | Drag the sidebar's right edge | width changes live (200–460px) |
| 8d | Resize, restart app | width is remembered |

---

## Results matrix — every type × both surfaces

| # | Object | Desktop | Web | Notes |
|---|---|---|---|---|
| 1 | Excel (bespoke) | ☐ | ☐ | |
| 2 | PowerPoint (bespoke) | ☐ | ☐ | |
| 3 | Word (bespoke) | ☐ | ☐ | |
| 4 | PDF (bespoke) | ☐ | ☐ | |
| 5 | HTML (live preview) | ☐ | ☐ | |
| 6a | Weak → template | ☐ | ☐ | |
| 6b | Mid-tier 35B+ → bespoke | ☐ | ☐ | |
| 7 | Chat sync | ☐ (→web) | ☐ (→desktop) | |
| 8 | Sidebar | ☐ | n/a | |

---

## What's a pass vs. not-a-bug

- **Pass:** a real downloadable file (or live HTML page) that's correct and designed; the gate routing right; identical behaviour on web and desktop.
- **Not a bug:** the Excel **View** shows formulas (not computed numbers) — browsers can't evaluate Excel formulas; the real values appear when the file opens. Weak-model output being a *static* table (no live formulas) is also correct-by-design.
- **A real bug (tell me):** a raw error that doesn't self-repair or offer **Rebuild**; a result that differs between web and desktop; buttons appearing before the reply finishes; a blank/dead card after completion.
