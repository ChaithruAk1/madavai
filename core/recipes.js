// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// core/recipes.js — SINGLE SOURCE "learn once, replay" recipes for project runs (desktop + web).
//
// The first time a project task SUCCEEDS we remember HOW (the proven script(s) it wrote + the output it
// produced). The next time the SAME task is asked — even for a new month/period — we hand the model that
// proven recipe so it reproduces the known-good result instead of re-improvising (where weak models flail).
// This is the bridge that makes repetitive jobs stable on cheap models. Pure logic; storage is injected
// per surface (desktop file store / web localStorage). No DOM / Node / Electron here. ONE copy.

// Normalize a task into a KEY so repetitive runs collapse to ONE recipe: the month / year / number is a
// PARAMETER, not identity. "DTC report for March 2026" and "DTC report for April" -> the same key.
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;
export function taskKeyOf(task) {
  return String(task || "")
    .toLowerCase()
    .replace(MONTHS, "{month}")
    .replace(/\bq[1-4]\b/g, "{quarter}")
    .replace(/\b20\d\d\b/g, "{year}")
    .replace(/\b\d+(\.\d+)?\b/g, "{n}")
    .replace(/[^\w{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build a recipe record from a successful run. scripts = [{ name, content }] the run produced (may be
// empty); outputs = produced file names; lane / model = how it ran.
export function makeRecipe({ task = "", scripts = [], outputs = [], lane = "C", model = "" } = {}) {
  return {
    taskKey: taskKeyOf(task),
    task: String(task || "").slice(0, 300),
    scripts: (scripts || []).filter((s) => s && s.content).map((s) => ({ name: String(s.name || "script.py").slice(0, 120), content: String(s.content).slice(0, 20000) })).slice(0, 4),
    outputs: (outputs || []).map((o) => String(o).slice(0, 200)).slice(0, 8),
    lane: String(lane || "C"),
    model: String(model || ""),
    createdAt: Date.now(),
  };
}

// Find a saved recipe whose key matches this task (newest match wins; recipes self-heal on re-success).
export function matchRecipe(recipes, task) {
  if (!Array.isArray(recipes) || !recipes.length) return null;
  const key = taskKeyOf(task);
  if (!key) return null;
  let best = null;
  for (const r of recipes) if (r && r.taskKey === key && (!best || (r.createdAt || 0) > (best.createdAt || 0))) best = r;
  return best;
}

// Merge a recipe into the list — ONE per taskKey, newest wins. Returns the new (capped) array.
export function upsertRecipe(recipes, recipe) {
  if (!recipe || !recipe.taskKey) return Array.isArray(recipes) ? recipes : [];
  const list = (Array.isArray(recipes) ? recipes : []).filter((r) => r && r.taskKey !== recipe.taskKey);
  list.push(recipe);
  return list.slice(-50);
}

// Is a recipe SAFE to use in this project's folder? A recipe must NEVER carry another project's path.
// Returns true only if its scripts/outputs reference paths under `folder` (or no absolute paths at all).
// This keeps every project's operations scoped to its OWN folder. Pure logic.
export function recipeInScope(recipe, folder) {
  if (!recipe) return false;
  if (!folder) return true; // nothing to scope against (e.g. web projects have no local folder)
  const norm = (s) => String(s || "").replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  const root = norm(folder);
  const text = (recipe.scripts || []).map((s) => (s && s.content) || "").join("\n") + "\n" + (recipe.outputs || []).join("\n");
  const paths = text.match(/[a-zA-Z]:[\\/][^\s"'`]*/g) || [];
  for (const p of paths) { const np = norm(p); if (np !== root && !np.startsWith(root + "\\")) return false; } // a path outside the project folder
  return true;
}

// Render the proven recipe as a system-prompt block: hand the model the known-good script(s) to reuse.
export function recipePromptBlock(recipe) {
  if (!recipe) return "";
  let b = "\n\nPROVEN RECIPE — this exact task succeeded before; reproduce it the SAME way rather than starting from scratch.";
  if (recipe.outputs && recipe.outputs.length) b += ` Last time it produced: ${recipe.outputs.join(", ")}.`;
  if (recipe.scripts && recipe.scripts.length) {
    b += " Reuse the script(s) below that worked last time — change ONLY the inputs (e.g. the month/period), keep the same logic, and save the same output file name(s):";
    for (const s of recipe.scripts) b += `\n\n--- ${s.name} ---\n${s.content}`;
  } else {
    b += " Follow the same approach and produce the same kind of output.";
  }
  return b;
}
