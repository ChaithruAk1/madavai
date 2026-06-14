---
name: pptx
description: Build PowerPoint (.pptx) decks in Madav — pitch decks, summaries, training, readouts. Use when the user wants slides or a presentation they can download.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Presentations in Madav

Madav builds real, *designed* `.pptx` decks on-device from an `officedoc` spec — no
server, no upload. You supply structured content; Madav's engine handles the theme,
layout, spacing, colour and contrast. Emit ONE fenced `officedoc` block:

```officedoc
{"type":"pptx","name":"deck.pptx","accent":"76B900","theme":"dark","brand":"2025 Lineup",
 "title":"AI Model Portfolio","subtitle":"From silicon to inference",
 "stats":[{"value":"3,500+","label":"TOPS"},{"value":"80 GB","label":"HBM3"},{"value":"900 GB/s","label":"Memory BW"}],
 "slides":[
   {"layout":"cards","kicker":"Deep Dive","title":"Key models",
    "cards":[{"badge":"Data Center","title":"H100 SXM5","lines":["80 GB HBM3","3.35 TB/s","700W"]},
             {"badge":"Blackwell","title":"GB200 NVL72","lines":["1.4 TB HBM3e","NVLink 5.0"]}]},
   {"layout":"stats","title":"Why it matters","stats":[{"value":"4×","label":"training"},{"value":"30×","label":"inference"}]},
   {"title":"Where this goes","bullets":["Point one","Point two","Point three"]}
 ]}
```

## Top-level fields
- `title`, `subtitle` — render a designed title slide (add `stats` for a right-hand KPI panel).
- `accent` — ONE hex colour that fits the topic (no `#`). Drives titles, rules, badges, numbers.
- `theme` — `"dark"` (default, high-contrast) or `"light"`.
- `brand` — small footer label on every slide.

## Per-slide `layout`
- **bullets** (default) — `title` + 3–5 tight `bullets`, or a single `text` statement.
- **cards** — `title` + `cards:[{badge?,title,lines:[…]}]`. A responsive 2–3 column grid. Use for product/option/feature/comparison grids.
- **stats** — `title` + `stats:[{value,label}]`. Big-number KPIs (2–4).
- **section** — a divider: big `title` (+ optional `kicker`/`subtitle`).
- `kicker` — a small uppercase eyebrow above any slide title.

## Make decks that land
- One idea per slide; lead the title with the takeaway ("Revenue up 40%"), not a label ("Revenue").
- Use real numbers and specifics — never placeholders, never a "sample" the user must rewrite.
- Reach for `cards` and `stats`; bullets alone read as a draft.
- Re-emit the WHOLE spec on any edit. Keep the JSON only inside the fenced block.

A download card appears for the user; the engine renders the designed `.pptx` on their device.
