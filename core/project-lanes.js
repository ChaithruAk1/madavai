// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// core/project-lanes.js — SINGLE SOURCE lane decision for project runs (desktop + web).
//
// A project task takes ONE of three lanes, chosen by what the task actually NEEDS — not by model
// strength. This is the spine of the "stable projects" design:
//   A DOCUMENT  — produce a file from the model's own content (no input data) -> deterministic engine.
//   B JOB       — a saved, tested recipe exists for this task               -> replay it (Stage 3).
//   C IMPROVISE — anything else / real data to read & crunch                -> caged agent loop.
//
// SAFETY PROPERTY: Lane A is chosen ONLY when there are no data files to read, so there is nothing to
// fabricate — the task is inherently generative. Any task that touches real data falls to B or C, where
// the model actually reads the files. When unsure we return C (it can do anything). Pure logic; no deps.

export const LANE = { DOCUMENT: "A", JOB: "B", IMPROVISE: "C" };

const DATA_VERB = /\b(execute|run|refresh|reconcile|analy[sz]e|process|aggregate|pivot|summari[sz]e|extract|parse|clean|merge|import|recalc|recompute|update|compute)\b/;
const DATA_NOUN = /\b(data|dataset|datasets|csv|xlsx|workbook|records?|rows?|ledger|export|actuals|the folder|these files|the files|the data)\b/;
const MAKE_VERB = /\b(make|build|create|draft|write|generate|design|prepare|produce)\b/;
const DOC_NOUN = /\b(template|model|one[- ]?pager|memo|letter|proposal|plan|deck|slides?|presentation|document|doc|spreadsheet|sheet|budget|forecast|invoice|agenda|checklist|outline|brief|report)\b/;

// Decide the lane. Inputs are facts the caller already knows; all optional.
//  - recipe:       a saved recipe matching this task (Stage 3). Truthy -> Lane B.
//  - hasDataFiles: does the linked project folder contain real input data files?
//  - task:         the user's request text.
export function decideLane({ recipe = null, hasDataFiles = false, task = "" } = {}) {
  if (recipe) return LANE.JOB;
  const t = String(task || "").toLowerCase();
  // Real data work -> the agent loop must read & compute (Stage 3 turns a success into a saved recipe).
  if (hasDataFiles && (DATA_VERB.test(t) || DATA_NOUN.test(t))) return LANE.IMPROVISE;
  // From-scratch document, no data to read -> the deterministic engine (safe: there is nothing to fabricate).
  if (!hasDataFiles && MAKE_VERB.test(t) && DOC_NOUN.test(t)) return LANE.DOCUMENT;
  // Default: the caged agent loop. Safe — it can do anything; it is just less deterministic.
  return LANE.IMPROVISE;
}
