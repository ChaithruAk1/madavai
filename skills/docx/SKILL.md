---
name: docx
description: Produce polished Word (.docx) documents in Madav — reports, memos, letters, proposals, one-pagers. Use whenever the user asks for a Word document or a formatted text deliverable they can download.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Word documents in Madav

Madav builds real `.docx` files on-device from an `officedoc` spec — no upload, no server. When the
user wants a Word document, emit ONE fenced `officedoc` block containing only the JSON spec:

```officedoc
{"type":"docx","name":"report.docx","title":"Q1 Review","sections":[{"heading":"Summary","text":"…","bullets":["…"]}]}
```

Write great documents:
- Give every document a clear `title` and logical `sections` (each a `heading` + `text`, optional `bullets`).
- Fill in COMPLETE prose — never placeholders like "[insert here]". Real content only.
- One idea per section; lead with the conclusion, then support it.
- Letters / memos: first section = greeting + purpose; final section = clear call to action or sign-off.
- On a change request, re-emit the WHOLE updated spec — Madav rebuilds the file in place.

A download card appears for the user. Never paste the JSON as prose — only inside the fenced block.
