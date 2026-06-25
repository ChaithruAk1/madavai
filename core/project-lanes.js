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

export const LANE = { DOCUMENT: "A", JOB: "B", IMPROVISE: "C", CHAT: "D" };

const DATA_VERB = /\b(execute|run|refresh|reconcile|analy[sz]e|process|aggregate|pivot|summari[sz]e|extract|parse|clean|merge|import|recalc|recompute|update|compute)\b/;
const DATA_NOUN = /\b(data|dataset|datasets|csv|xlsx|workbook|records?|rows?|ledger|export|actuals|the folder|these files|the files|the data)\b/;
const MAKE_VERB = /\b(make|build|create|draft|write|generate|design|prepare|produce)\b/;
// Clearly generative artifacts — built from the model's own content -> engine, EVEN if the folder has files.
const GEN_NOUN = /\b(template|model|one[- ]?pager|memo|letter|proposal|plan|deck|slides?|presentation|budget|forecast|invoice|agenda|checklist|outline|brief)\b/;
// Ambiguous nouns that could be data-backed -> engine ONLY when no data files are present.
const DOC_AMBIG = /\b(report|spreadsheet|sheet|document|doc)\b/;
// A question ABOUT the files themselves (list them, how many, which is biggest, their names/sizes/dates,
// "what's in this folder") is a FILE-SYSTEM task — answered by the agent loop with a directory listing,
// for ANY model. It must NEVER hit the report engine, even though it mentions "files".
const FILE_QUERY = /\b(list|show|display|name|count|how many|which|what)\b[^.?!]{0,40}\b(files?|folders?|documents?|directory)\b|\b(files?|folders?|documents?)\b[^.?!]{0,40}\b(sizes?|names?|count|dates?|listed?|present)\b|\b(biggest|largest|smallest|newest|oldest|latest)\b[^.?!]{0,25}\bfiles?\b|\bfiles?\b[^.?!]{0,25}\b(biggest|largest|smallest|newest|oldest|latest)\b|what'?s? (in|inside) (this|the) (folder|directory)|contents? of (this|the) (folder|directory)/

// Decide the lane. Inputs are facts the caller already knows; all optional.
//  - recipe:       a saved recipe matching this task (Stage 3). Truthy -> Lane B.
//  - hasDataFiles: does the linked project folder contain real input data files?
//  - task:         the user's request text.
export function decideLane({ recipe = null, hasDataFiles = false, task = "", capable = false } = {}) {
  if (recipe) return LANE.JOB;
  const t = String(task || "").toLowerCase();
  // A CAPABLE model (Opus / Sonnet / GPT-4+ / Gemini-Pro / DeepSeek / ...) follows the user's prompt
  // directly in the agent loop with full file + data tools — it does NOT need the weak-model data-engine
  // scaffolding, and routing it through that engine OVERRIDES the request (e.g. "list the files" gets
  // hijacked into a report). So for capable models, data work goes to CHAT (the plain agent loop); only
  // WEAK models get the deterministic engine (IMPROVISE). Generative docs (A) and saved recipes (B) are
  // unchanged. This is the single switch that makes the engine a weak-model crutch, not a global override.
  const dataLane = capable ? LANE.CHAT : LANE.IMPROVISE;
  // A real data verb (analyze / reconcile / aggregate / execute a report / ...). First, so data work wins.
  if (DATA_VERB.test(t)) return dataLane;
  // A question about the files THEMSELVES (list / how many / which is biggest / names / sizes) -> agent
  // loop directory listing, for any model. Beats the "the files" data-noun just below.
  if (FILE_QUERY.test(t)) return LANE.CHAT;
  // Names data nouns (csv / records / the data / ...) -> read & crunch (engine for weak, loop for capable).
  if (DATA_NOUN.test(t)) return dataLane;
  // A clearly generative document (template/model/deck/budget/...) -> the deterministic engine. It builds
  // from the model's own content, so files already in the folder don't matter (nothing is fabricated).
  if (MAKE_VERB.test(t) && GEN_NOUN.test(t)) return LANE.DOCUMENT;
  // Ambiguous "make a report/spreadsheet" -> engine ONLY when there are no data files (else it may need them).
  if (!hasDataFiles && MAKE_VERB.test(t) && DOC_AMBIG.test(t)) return LANE.DOCUMENT;
  // Names a report/spreadsheet/document WITH data present -> a FILE deliverable (engine for weak, loop for capable).
  if (DOC_AMBIG.test(t)) return dataLane;
  // Default: the agent loop. Safe — it can do anything; it is just less deterministic.
  return LANE.CHAT;
}
