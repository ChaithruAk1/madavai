# Madav Document Engine — Capability Roadmap
### From a reliable Excel engine to professional Excel · Word · PowerPoint · PDF — on any model, weak or strong

---

## 1. The one idea this roadmap is built on

Every item below funds one of **three layers**. Keeping them separate is what makes "stunning on any topic" a finite, fundable program instead of an impossible one.

| Layer | Who does it | What we fund |
|---|---|---|
| **Intent** | the AI model | a *plan* (what to make) — never code. A weak model can do this if the vocabulary is well‑designed. |
| **Execution** | the deterministic engine | correctly computing + assembling. Tested. This is where reliability lives. |
| **Design** | curated assets (built once) | templates, themes, layouts, styling rules — reused deterministically forever. **This is where "stunning" comes from.** |

We are **not** trying to teach the engine "every possible skill" (Excel alone is infinite). We fund a curated, growing **vocabulary** of operations plus a library of **design assets**. That combination covers the vast majority of real documents with professional quality.

---

## 2. Where we are today (the proven baseline — already shipped & tested)

| Capability | Status |
|---|---|
| Deterministic ingest (.xlsx / .csv / multi‑sheet, file‑named) | ✅ tested |
| Transform: filter · sort · select · limit · aggregate (sum/avg/count/min/max) | ✅ tested |
| **Calculated columns** (add/sub/mul/div, safe divide) | ✅ tested |
| **Multi‑file joins** (combine several files on key columns) | ✅ tested |
| **Multi‑sheet output** | ✅ tested |
| Styled Excel authoring (header fills, banding, frozen panes, auto‑filter, widths) | ✅ tested |
| Schema‑gate + repair loop (bad plan → repair or clean fail, never a crash) | ✅ tested |
| **Verified on real data:** reproduced an independent pandas result on the live KPI2 files (41 consultants, 0 mismatches) | ✅ proven |

This baseline already covers most single‑and‑multi‑file Excel *reports*. Everything below extends it.

---

## 3. How to read this roadmap

- **Effort unit = engineer‑weeks (ew).** 1 ew ≈ 5 focused days of one engineer. Estimates are **moderate confidence, ±40%**.
- **"Done" for any skill = the same proven pattern:** plan‑operation contract → deterministic executor → automated tests → checked against an independent oracle → teach the model the new shape. Each skill ships independently.
- **Value** = how much real‑world document need it unlocks. **Fit** = how naturally it suits the deterministic approach.
- Value lands **continuously** — each wave is usable the moment it ships; nothing waits for the end.

---

## 4. The build order at a glance

| Wave | Theme | Value | Fit | Effort | Cumulative |
|---|---|---|---|---|---|
| Foundations | Recipe replay + plan‑explanation | High | — | ~2 ew | 2 ew |
| **1** | Excel analytical depth | **High** | Excellent | ~5 ew | 7 ew |
| **2** | Excel polish (stunning data docs) | High | Excellent | ~7.5 ew | 14.5 ew |
| **3** | Word block‑document engine | High | Great | ~6 ew | 20.5 ew |
| **5a** | PDF render (export any doc) | High | Great | ~1 ew | 21.5 ew |
| **4** | PowerPoint layout + theme system | Medium‑High | Partial | ~7.5 ew | 29 ew |
| **5b** | PDF manipulation (merge/split/forms) | Medium | Excellent | ~2.5 ew | 31.5 ew |

**Whole program ≈ 30 engineer‑weeks (~6–8 months solo, ~3–4 months with two), shipped incrementally.** Band: ~22–44 ew.

---

## 5. Wave‑by‑wave detail

### Foundations (cheap, do first — they multiply everything after)

| Item | What it unlocks | Effort |
|---|---|---|
| **Recipe save & replay** | A verified plan is saved; the next monthly run re‑uses it on fresh data — **deterministic, weak‑model‑independent**. This is the single biggest reliability lever for recurring reports. | 1.5 ew |
| **Plan‑explanation step** | Before running, the model restates its plan in one plain‑English line ("counting submitted tickets per consultant, dividing by resolved…") so you can confirm it picked the right columns. Kills the "valid but wrong interpretation" risk cheaply. | 0.5 ew |

### Wave 1 — Excel analytical depth (highest leverage; your actual pain)

| Operation | What it unlocks (plain English) | Effort |
|---|---|---|
| **Pivot** (rows × columns × value) | Cross‑tabs: e.g. revenue by region across months | 1 ew |
| **Running total / moving average** | Cumulative and trend columns | 1 ew |
| **Rank · % of total · rank‑within‑group** | "Top performer," "share of total," league tables | 1 ew |
| **Date / number bucketing** | Group by month/quarter/year; bin amounts into ranges | 0.5 ew |
| **Top‑N per group** | "Top 3 products in each region" | 0.5 ew |
| **Richer filters** (between, in‑list, date ranges, blanks) | Real‑world slicing | 0.5 ew |
| **Multi‑key & by‑measure sort** | Sort by computed columns, several keys | 0.5 ew |

Unlocks the bulk of analytical reports and dashboards. **Fit: excellent** (this is relational algebra — exactly what the approach is best at).

### Wave 2 — Excel polish (turns correct reports into *beautiful* ones)

| Operation | What it unlocks | Effort |
|---|---|---|
| Number / currency / % / date formats | Numbers that read correctly | 0.5 ew |
| **Conditional formatting** (color scales, data bars, rules) | Heatmaps, RAG status, highlights | 1 ew |
| **Charts: bar / column / line / pie** | The core visual vocabulary | 2 ew |
| Charts: combo / stacked / scatter + axes/legend/titles | Richer visuals | 1.5 ew |
| Titles, merged header bands, sections, notes | Report structure & branding | 0.5 ew |
| **KPI cards + sparklines** | Dashboard "top strip" | 1 ew |
| **Theme/palette system** (accent, fonts, banding presets) | One‑switch professional look | 1 ew |

**Fit: excellent.** This is where Excel output becomes genuinely stunning.

### Wave 3 — Word (block‑document engine)

The model writes the **prose** (its real strength); the engine deterministically **assembles** a perfectly‑formatted document from ordered blocks.

| Operation | What it unlocks | Effort |
|---|---|---|
| Block model + assembler core | The whole "document = ordered blocks" engine | 1.5 ew |
| Heading / paragraph / list / quote blocks + styles | Structured prose | 1 ew |
| **Table block** (from a computed table) | Drop Excel results into a report | 1 ew |
| Image / figure + captions | Visuals & screenshots | 0.5 ew |
| TOC · header/footer · page numbers · cover page | Long‑form professional docs | 1 ew |
| Theme/styles + 2 document templates (report, letter) | Consistent, branded output | 1 ew |

**Fit: great.** Covers reports, memos, letters, specs.

### Wave 4 — PowerPoint (layout + theme system)

A deck = ordered slides; each slide = a **layout** + content blocks, on a **master theme**. The model picks a layout and fills it; design comes from the curated themes.

| Operation | What it unlocks | Effort |
|---|---|---|
| Deck / slide / block model + master/theme core | The rendering engine | 2 ew |
| **8 curated layouts** (title, section, bullets, two‑column, image‑right, chart, table, big‑number/quote) | The everyday deck vocabulary | 2 ew |
| Chart‑on‑slide + table‑on‑slide (reuse Excel charts) | Data slides | 1 ew |
| **3 professional themes** (color/font/spacing systems) | The "stunning" layer | 2 ew |
| Speaker notes, auto‑fit text, transitions‑off | Polish & robustness | 0.5 ew |

**Fit: partial.** Reaches *consistently professional* reliably; *bespoke art‑directed* design is the ceiling (see §7). Most design‑heavy wave — do it after Excel + Word patterns are mature.

### Wave 5 — PDF (render + manipulate)

PDF isn't a content type — it's an **output** and a **utility** layer.

| Operation | What it unlocks | Effort |
|---|---|---|
| **Render any authored doc/report → PDF** (reuse Word/Excel layout) | One‑click PDF export — high demand, cheap | 1 ew |
| Merge / split / extract / rotate pages | Everyday PDF surgery | 1 ew |
| Detect + fill forms | Auto‑filled PDF forms | 1 ew |
| Watermark / stamp / page numbers / headers | Finishing touches | 0.5 ew |

**Fit: excellent** for manipulation; render reuses the Word/Excel layout work.

---

## 6. The design‑asset track — where "stunning" actually comes from

Built **once** (by a designer or a strong model), then applied deterministically forever. This is curation, not per‑document improvisation — which is exactly why a *weak* model can produce beautiful output.

| Format | Assets to curate | Rough effort |
|---|---|---|
| Excel | 3–4 report/dashboard themes (palette, fonts, banding, KPI‑card styles) | folded into Wave 2 |
| Word | 2–3 document templates (report, letter, one‑pager) + a style system | folded into Wave 3 |
| PowerPoint | 3 deck themes + 8 layouts (the visual heart of "stunning decks") | folded into Wave 4 |
| Shared | one color/typography system reused across all formats | ~1 ew, pays back everywhere |

---

## 7. The honest limits (read before funding)

- **The escape hatch stays.** For the genuinely exotic 5% — bespoke one‑off computations or art‑directed design — the truthful architecture keeps a **strong‑model code path** alongside the deterministic one. The deterministic engine owns the reliable common path; the hatch covers the long tail. This is correct design, not a compromise.
- **The weak‑model design ceiling is real.** The engine guarantees documents are *correct and on‑template*. It does **not** turn a weak model into a brilliant designer. "Stunning" for **data documents** (Excel/dashboards/reports) is very achievable; "stunning" for **art‑directed marketing decks** comes from your template library, not from the weak model improvising.
- **More skills = a bigger menu for the model to choose from.** Mitigated by: layered vocabulary (simple shapes for simple tasks), the plan‑explanation confirm step, and recipe‑replay for anything recurring.

---

## 8. Recommended funding sequence (what to fund first, and why)

**Fund now — "Excel that actually handles your projects" (~7 ew):** Foundations (recipe replay + plan‑explanation) **+ Wave 1**. This attacks your real, stated pain — complex Excel in projects — and recipe‑replay makes recurring reports (like KPI2) weak‑model‑proof on every re‑run. Highest value per week, lowest risk, best fit.

**Fund next — "Excel that looks stunning" (~7.5 ew):** Wave 2. Turns correct reports into beautiful ones; this is where the visual "wow" lands for the format you use most.

**Then — "professional written documents" (~7 ew):** Wave 3 + the cheap PDF‑render slice (5a). Reports, memos, letters, with one‑click PDF export.

**Then — "professional decks" (~7.5 ew):** Wave 4. Most design‑heavy; do it once the engine and asset patterns are mature, so the deck themes inherit a proven design system.

**Anytime, low urgency (~2.5 ew):** PDF manipulation (5b) — independent of everything else; fund when a concrete need appears.

---

## 9. Decision summary (one screen)

| If you want… | Fund | Effort | Confidence |
|---|---|---|---|
| Your KPI2‑class reports to *just work* on a weak model, every month | Foundations + Wave 1 | ~7 ew | High |
| Those reports to also look beautiful | + Wave 2 | ~7.5 ew | High |
| Professional Word docs + PDF export | + Wave 3 + 5a | ~7 ew | High |
| Professional slide decks | + Wave 4 | ~7.5 ew | Med‑High |
| Full PDF toolkit | + Wave 5b | ~2.5 ew | High |
| **Everything** | all waves | **~30 ew (~6–8 months solo)** | Moderate (±40%) |

**Bottom line:** not "every possible skill," but **every common document — correct, professional, and often stunning — with a strong‑model hatch for the rest.** Start with Excel depth; it's your pain, the best fit, and the highest return per week.
