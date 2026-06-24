import { OfficeSpec as OfficeSpecSchema } from '@madav/contracts';
import type { OfficeSpec } from '@madav/contracts';
import { type Issue, err } from './issues.js';
import { applyLimits } from './limits.js';
import { validateFormulas } from './formula.js';

export interface BuildPlan {
  ok: boolean;
  spec: OfficeSpec | null;
  issues: Issue[];
}

/**
 * Deterministic, schema-gated workbook planning — the fix for silent Excel failures.
 *   1) validate the model's spec against the contract (reject malformed BEFORE building)
 *   2) clamp to limits with VISIBLE warnings (never drop data silently)
 *   3) validate formulas at build time (unresolved refs + cycles) so the user never opens a #REF! file
 */
export function planWorkbook(input: unknown): BuildPlan {
  const parsed = OfficeSpecSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => err('SPEC_INVALID', i.message, i.path.join('.')));
    return { ok: false, spec: null, issues };
  }
  const limited = applyLimits(parsed.data);
  const issues = [...limited.issues, ...validateFormulas(limited.spec)];
  return { ok: !issues.some((i) => i.level === 'error'), spec: limited.spec, issues };
}

export { LIMITS } from '@madav/contracts';
export type { OfficeSpec, Sheet, Metric } from '@madav/contracts';
export type { Issue } from './issues.js';
