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

/** One operand of a calculated column: an existing column, or a constant number. */
export const DeriveArg = z.union([z.object({ col: z.string().min(1) }), z.object({ val: z.number() })]);
/**
 * A calculated column, evaluated deterministically per row as: as = left <fn> right.
 * Division by zero yields an EMPTY cell (never NaN/Infinity). Compose for complex math:
 * derive a temp = b + c, then derive ratio = a / temp.
 */
export const DeriveOp = z.object({
  op: z.literal('derive'),
  as: z.string().min(1),
  left: DeriveArg,
  fn: z.enum(['add', 'sub', 'mul', 'div']),
  right: DeriveArg,
});

/** Rename one column (alias) — lets differently-named keys line up before a join. */
export const RenameOp = z.object({ op: z.literal('rename'), from: z.string().min(1), to: z.string().min(1) });

export const DataOp = z.discriminatedUnion('op', [FilterOp, SortOp, SelectOp, LimitOp, AggregateOp, DeriveOp, RenameOp]);

/** A named pipeline step over a source table OR a prior step's result. */
export const Step = z.object({
  name: z.string().min(1),
  from: z.string().min(1),
  ops: z.array(DataOp).default([]),
});
/** Combine two or more tables/steps by matching key columns, then optionally transform the joined result. */
export const JoinStep = z.object({
  name: z.string().min(1),
  join: z.array(z.string().min(1)).min(2),
  on: z.array(z.string().min(1)).min(1),
  how: z.enum(['left', 'inner']).default('left'),
  ops: z.array(DataOp).default([]),
});
/** A step is EITHER a join (has `join`) OR a single-source pipeline (has `from`). Join tried first. */
export const AnyStep = z.union([JoinStep, Step]);

/** The general multi-file plan: a dataflow of named steps, with chosen step results emitted as sheets. */
export const MultiPlan = z.object({
  steps: z.array(AnyStep).min(1),
  output: z.array(z.object({ sheet: z.string().min(1), table: z.string().min(1) })).min(1),
});

/** The simple single-table plan (unchanged shape; now also accepts derive ops). */
export const DataPlan = z.object({ source: z.string().optional(), ops: z.array(DataOp).default([]) });
/** Alias — the simple plan, named for clarity at call sites that route simple-vs-multi. */
export const SimplePlan = DataPlan;

export type DeriveArg = z.infer<typeof DeriveArg>;
export type RenameOp = z.infer<typeof RenameOp>;
export type DataOp = z.infer<typeof DataOp>;
export type Step = z.infer<typeof Step>;
export type JoinStep = z.infer<typeof JoinStep>;
export type AnyStep = z.infer<typeof AnyStep>;
export type MultiPlan = z.infer<typeof MultiPlan>;
export type DataPlan = z.infer<typeof DataPlan>;
export type Measure = z.infer<typeof Measure>;
