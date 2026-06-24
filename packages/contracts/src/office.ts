import { z } from 'zod';

/** Hard limits. We clamp to these, but NEVER silently — every clamp emits a warning. */
export const LIMITS = {
  sheets: 24,
  rowsPerSheet: 10000,
  columnsPerRow: 256,
  periods: 120,
} as const;

export const CellFormat = z.enum(['text', 'number', 'usd', 'pct', 'date']);

export const Metric = z
  .object({
    id: z
      .string()
      .min(1)
      .regex(/^[A-Za-z0-9_]+$/, 'metric id must be letters, digits or underscore'),
    label: z.string().min(1),
    value: z.number().optional(),
    expr: z.string().optional(),
    fmt: CellFormat.optional(),
  })
  .refine((m) => m.value !== undefined || m.expr !== undefined, {
    message: 'metric needs either a value or an expr',
  });

/** A structured "model" sheet: named metrics with values or formulas. */
export const Sheet = z.object({
  name: z.string().min(1),
  periods: z.number().int().positive().optional(),
  metrics: z.array(Metric).default([]),
});

/** A single freeform cell value. */
export const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * A freeform "table" sheet: optional header columns + a grid of rows. This is the shape the live
 * spreadsheet path emits, so the engine can validate (and VISIBLY clamp) it — instead of the old
 * code silently slicing rows/columns away.
 */
export const TableSheet = z.object({
  name: z.string().min(1),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(Cell)),
});

/**
 * A sheet is EITHER a freeform table OR a structured metric sheet. TableSheet is tried first because
 * it is the only variant carrying `rows`; metric sheets never do, so the union is unambiguous.
 */
export const AnySheet = z.union([TableSheet, Sheet]);

export const OfficeSpec = z.object({
  kind: z.literal('workbook').default('workbook'),
  name: z.string().min(1).default('Workbook'),
  sheets: z.array(AnySheet).min(1, 'a workbook needs at least one sheet'),
});

export type OfficeSpec = z.infer<typeof OfficeSpec>;
export type Sheet = z.infer<typeof Sheet>;
export type TableSheet = z.infer<typeof TableSheet>;
export type AnySheet = z.infer<typeof AnySheet>;
export type Metric = z.infer<typeof Metric>;
export type Cell = z.infer<typeof Cell>;
