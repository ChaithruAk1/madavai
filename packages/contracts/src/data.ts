import { z } from 'zod';
import { Cell } from './office.js';

/** What a column holds, inferred deterministically by the Ingestor (never by the model). */
export const ColumnType = z.enum(['string', 'number', 'boolean', 'empty', 'mixed']);
export type ColumnType = z.infer<typeof ColumnType>;

export const Column = z.object({ name: z.string(), type: ColumnType });
export type Column = z.infer<typeof Column>;

/**
 * A normalized, app-owned table — the deterministic Ingestor's output and the ONLY shape the
 * compute + authoring stages operate on. The model never produces or parses this; a fixed loader does.
 * This is the deterministic-I/O principle in Madav's terms: deterministic I/O, the model kept out of the parser.
 */
export const Table = z.object({
  name: z.string(),
  columns: z.array(Column),
  rows: z.array(z.array(Cell)),
  rowCount: z.number().int().nonnegative(), // true source row count, BEFORE any cap
  truncated: z.boolean(),                   // true if the source had more rows than were ingested
});
export type Table = z.infer<typeof Table>;
