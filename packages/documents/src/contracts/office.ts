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

export const Sheet = z.object({
  name: z.string().min(1),
  periods: z.number().int().positive().optional(),
  metrics: z.array(Metric).default([]),
});

export const OfficeSpec = z.object({
  kind: z.literal('workbook'),
  name: z.string().min(1),
  sheets: z.array(Sheet).min(1, 'a workbook needs at least one sheet'),
});

export type OfficeSpec = z.infer<typeof OfficeSpec>;
export type Sheet = z.infer<typeof Sheet>;
export type Metric = z.infer<typeof Metric>;
