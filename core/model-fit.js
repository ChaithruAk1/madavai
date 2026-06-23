// core/model-fit.js — SINGLE SOURCE for "does this model fit THIS task?"
// Pure ESM. Imported by the ONE shared renderer picker (src/components/ModelPicker.jsx),
// so web AND desktop inherit identical fit verdicts. Reuses isDeckCapable so there is
// exactly ONE definition of "capable" across the whole app.
import { isDeckCapable } from "./office-rules.js";

// Modes that mean multi-step, tool-using work (everything except plain chat).
const HEAVY_MODES = new Set(["agent", "team", "project", "cowork", "code"]);

// Does this task need a strong, tool-using model?
export function taskNeedsStrong(task = {}) {
  if (!task) return false;
  if (HEAVY_MODES.has(task.mode)) return true;
  if (task.needsData) return true;
  return false;
}

// modelId : raw model string, e.g. "stepfun-ai/step-3.5-flash"
// caps    : { agentic, fast, free } detected by the picker from live catalog data
// task    : { mode, needsData, hasFolder }
// returns : { fit: "good" | "recipe" | "weak", label, why }
export function modelFit(modelId, caps = {}, task = {}) {
  const heavy = taskNeedsStrong(task);
  if (!heavy) return { fit: "good", label: "Good", why: "Handles chat and everyday tasks." };
  const strong = isDeckCapable(modelId);
  const isProject = !!(task && task.mode === "project");
  // Projects: the model writes ONE script (a single completion), so tool-calling is NOT required -- judge by raw
  // capability. Agents/teams run a real tool loop, so there a capable-but-non-tool-calling model is downgraded.
  const capable = isProject ? strong : (strong && caps.agentic !== false);
  if (capable) return { fit: "good", label: "Recommended", why: isProject ? "Strong enough to build the report directly." : "Strong at multi-step, tool-using work." };
  if (task && task.mode === "project") return { fit: "recipe", label: "Needs a recipe", why: "A lighter model — reliable on repeat project tasks once Madav has saved a recipe from one good run." };
  return { fit: "weak", label: "May struggle", why: "Better for quick chat and drafts than multi-step data work." };
}

// Picker sort order: recommended first, then recipe-capable, then weak.
export const FIT_RANK = { good: 0, recipe: 1, weak: 2 };
