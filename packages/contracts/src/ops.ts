import { z } from 'zod';

export const ScalarValue = z.union([z.string(), z.number(), z.boolean()]);

export const FilterOp = z.object({
  op: z.literal('filter'),
  column: z.string().min(1),
  test: z.enum(['eq', 'ne', 'gt', 'lt', 'ge', 'le', 'contains']),
  value: ScalarValue,
});
export const SortOp = z.object({ op: z.literal('sort'), column: z.string().min(1), dir: z.enum(['asc', 'desc']).default('asc') });
export const SelectOp = z.object({ op: z.literal('select'), columns: z.array(z.string().min(1)).min(1) });
export const LimitOp = z.object({ op: z.literal('limit'), n: z.number().int().positive() });
export const Measure = z.object({
  column: z.string().min(1),
  fn: z.enum(['sum', 'avg', 'count', 'min', 'max']),
  as: z.string().optional(),
});
export const AggregateOp = z.object({ op: z.literal('aggregate'), groupBy: z.array(z.string()).default([]), measures: z.array(Measure).min(1) });

export const DataOp = z.discriminatedUnion('op', [FilterOp, SortOp, SelectOp, LimitOp, AggregateOp]);
export const DataPlan = z.object({ source: z.string().optional(), ops: z.array(DataOp).default([]) });

export type DataOp = z.infer<typeof DataOp>;
export type DataPlan = z.infer<typeof DataPlan>;
export type Measure = z.infer<typeof Measure>;
