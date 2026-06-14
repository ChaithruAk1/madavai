---
name: pdf
description: Produce PDF documents in Madav — one-pagers, summaries, formatted handouts the user can share. Use when the user wants a downloadable PDF.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# PDFs in Madav

Madav builds real `.pdf` files on-device from an `officedoc` spec. Emit ONE fenced `officedoc` block:

```officedoc
{"type":"pdf","name":"summary.pdf","title":"One-pager","sections":[{"heading":"Overview","text":"…","bullets":["…"]}]}
```

Notes:
- Same shape as a `docx` (`title` + `sections`). Choose PDF when the user wants a fixed, shareable handout.
- Complete content only — no placeholders.
- Madav can CREATE PDFs in chat but does not extract text from an uploaded PDF. To READ a PDF, add it
  to a Project's knowledge (Projects parse PDFs) and work there.
- Re-emit the whole spec on any edit.

A download card appears for the user. Keep the JSON only inside the fenced block.
