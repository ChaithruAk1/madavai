---
name: xlsx
description: Create Excel (.xlsx) spreadsheets in Madav — tables, trackers, budgets, simple models. Use when the user wants a spreadsheet or tabular data they can download.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Spreadsheets in Madav

Madav builds real `.xlsx` files on-device from an `officedoc` spec. Emit ONE fenced `officedoc` block:

```officedoc
{"type":"xlsx","name":"data.xlsx","sheets":[{"name":"Q1","rows":[["Region","Sales"],["NA",1200],["EU",980]]}]}
```

For useful sheets:
- Row 0 is the header row; keep the column count consistent across every row.
- Split distinct datasets into separate `sheets`, each with a clear `name`.
- Transcribe any data the user supplied faithfully; put real values in, not placeholders.
- Keep it tabular — narrative prose belongs in a `docx`, not a sheet.
- Re-emit the whole spec on any edit.

A download card appears for the user. Keep the JSON only inside the fenced block.
