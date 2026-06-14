---
name: pptx
description: Build PowerPoint (.pptx) decks in Madav — pitch decks, summaries, training, readouts. Use when the user wants slides or a presentation they can download.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Presentations in Madav

Madav builds real `.pptx` decks on-device from an `officedoc` spec. Emit ONE fenced `officedoc` block:

```officedoc
{"type":"pptx","name":"deck.pptx","title":"Madav","subtitle":"Built to think with you","slides":[{"title":"The problem","bullets":["…","…"]}]}
```

Make decks that land:
- One idea per slide; 3–5 tight bullets, not paragraphs. Use `text` instead of `bullets` for a single-statement slide.
- Open with a title slide (`title` + `subtitle`), then flow problem → insight → solution → ask.
- Lead each slide title with the takeaway ("Revenue up 40%"), not a bare label ("Revenue").
- Use real numbers and specifics; never placeholders.
- Re-emit the whole spec on any edit.

A download card appears for the user. Keep the JSON only inside the fenced block.
