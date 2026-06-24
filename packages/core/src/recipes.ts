// @madav/core — "learn once, replay" recipes for repeatable project runs.
// The first time a task succeeds, remember HOW (the proven script(s) + output). Next time the SAME task
// is asked (even for a new month/period), hand the model that recipe so weak models reproduce the
// known-good result instead of re-improvising. Pure logic; storage is injected per runtime.

export interface RecipeScript {
  name: string;
  content: string;
}
export interface Recipe {
  taskKey: string;
  task: string;
  scripts: RecipeScript[];
  outputs: string[];
  lane: string;
  model: string;
  createdAt: number;
}

// Normalise a task into a KEY so repetitive runs collapse to ONE recipe (month/year/number = parameter, not identity).
const MONTHS =
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;

export function taskKeyOf(task: unknown): string {
  return String(task || '')
    .toLowerCase()
    .replace(MONTHS, '{month}')
    .replace(/\bq[1-4]\b/g, '{quarter}')
    .replace(/\b20\d\d\b/g, '{year}')
    .replace(/\b\d+(\.\d+)?\b/g, '{n}')
    .replace(/[^\w{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function makeRecipe(
  { task = '', scripts = [], outputs = [], lane = 'C', model = '' }:
  { task?: string; scripts?: { name?: string; content?: string }[]; outputs?: string[]; lane?: string; model?: string } = {},
): Recipe {
  return {
    taskKey: taskKeyOf(task),
    task: String(task || '').slice(0, 300),
    scripts: (scripts || [])
      .filter((s) => s && s.content)
      .map((s) => ({ name: String(s.name || 'script.py').slice(0, 120), content: String(s.content).slice(0, 20000) }))
      .slice(0, 4),
    outputs: (outputs || []).map((o) => String(o).slice(0, 200)).slice(0, 8),
    lane: String(lane || 'C'),
    model: String(model || ''),
    createdAt: Date.now(),
  };
}

export function matchRecipe(recipes: Recipe[] | null | undefined, task: unknown): Recipe | null {
  if (!Array.isArray(recipes) || !recipes.length) return null;
  const key = taskKeyOf(task);
  if (!key) return null;
  let best: Recipe | null = null;
  for (const r of recipes) {
    if (r && r.taskKey === key && (!best || (r.createdAt || 0) > (best.createdAt || 0))) best = r;
  }
  return best;
}

export function upsertRecipe(recipes: Recipe[] | null | undefined, recipe: Recipe | null | undefined): Recipe[] {
  if (!recipe || !recipe.taskKey) return Array.isArray(recipes) ? recipes : [];
  const list = (Array.isArray(recipes) ? recipes : []).filter((r) => r && r.taskKey !== recipe.taskKey);
  list.push(recipe);
  return list.slice(-50);
}

// A recipe must NEVER carry another project's path. True only if its scripts/outputs reference paths under `folder`.
export function recipeInScope(recipe: Recipe | null | undefined, folder?: string): boolean {
  if (!recipe) return false;
  if (!folder) return true;
  const norm = (s: string): string => String(s || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  const root = norm(folder);
  const text =
    (recipe.scripts || []).map((s) => (s && s.content) || '').join('\n') + '\n' + (recipe.outputs || []).join('\n');
  const paths = text.match(/[a-zA-Z]:[\\/][^\s"'`]*/g) || [];
  for (const p of paths) {
    const np = norm(p);
    if (np !== root && !np.startsWith(root + '\\')) return false;
  }
  return true;
}

export function recipePromptBlock(recipe: Recipe | null | undefined): string {
  if (!recipe) return '';
  let b = '\n\nPROVEN RECIPE — this exact task succeeded before; reproduce it the SAME way rather than starting from scratch.';
  if (recipe.outputs && recipe.outputs.length) b += ` Last time it produced: ${recipe.outputs.join(', ')}.`;
  if (recipe.scripts && recipe.scripts.length) {
    b += ' Reuse the script(s) below that worked last time — change ONLY the inputs (e.g. the month/period), keep the same logic, and save the same output file name(s):';
    for (const s of recipe.scripts) b += `\n\n--- ${s.name} ---\n${s.content}`;
  } else {
    b += ' Follow the same approach and produce the same kind of output.';
  }
  return b;
}
