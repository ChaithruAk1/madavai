// @madav/core — lane decision for project runs. A task takes ONE of three lanes by what it NEEDS. Pure logic.
//   A DOCUMENT  -> deterministic engine (generative, no data to fabricate)
//   B JOB       -> replay a saved recipe
//   C IMPROVISE -> caged agent loop (reads & crunches real data)
export const LANE = { DOCUMENT: 'A', JOB: 'B', IMPROVISE: 'C', CHAT: 'D' } as const;

const DATA_VERB = /\b(execute|run|refresh|reconcile|analy[sz]e|process|aggregate|pivot|summari[sz]e|extract|parse|clean|merge|import|recalc|recompute|update|compute)\b/;
const DATA_NOUN = /\b(data|dataset|datasets|csv|xlsx|workbook|records?|rows?|ledger|export|actuals|the folder|these files|the files|the data)\b/;
const MAKE_VERB = /\b(make|build|create|draft|write|generate|design|prepare|produce)\b/;
const GEN_NOUN = /\b(template|model|one[- ]?pager|memo|letter|proposal|plan|deck|slides?|presentation|budget|forecast|invoice|agenda|checklist|outline|brief)\b/;
const DOC_AMBIG = /\b(report|spreadsheet|sheet|document|doc)\b/;

export function decideLane(
  { recipe = null, hasDataFiles = false, task = '' }: { recipe?: unknown; hasDataFiles?: boolean; task?: string } = {},
): string {
  if (recipe) return LANE.JOB;
  const t = String(task || '').toLowerCase();
  if (DATA_VERB.test(t) || DATA_NOUN.test(t)) return LANE.IMPROVISE;
  if (MAKE_VERB.test(t) && GEN_NOUN.test(t)) return LANE.DOCUMENT;
  if (!hasDataFiles && MAKE_VERB.test(t) && DOC_AMBIG.test(t)) return LANE.DOCUMENT;
  if (DOC_AMBIG.test(t)) return LANE.IMPROVISE;
  return LANE.CHAT;
}
