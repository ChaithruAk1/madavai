// @madav/core/models — "does this model fit THIS task?" (provider layer). Reuses isDeckCapable so there is
// exactly ONE definition of "capable" across the app.
import { isDeckCapable } from './capability.js';

const HEAVY_MODES = new Set(['agent', 'team', 'project', 'cowork', 'code']);

export interface FitTask { mode?: string; needsData?: boolean; hasFolder?: boolean; }
export interface FitCaps { agentic?: boolean; fast?: boolean; free?: boolean; }
export interface FitVerdict { fit: 'good' | 'recipe' | 'weak'; label: string; why: string; }

export function taskNeedsStrong(task: FitTask = {}): boolean {
  if (!task) return false;
  if (task.mode && HEAVY_MODES.has(task.mode)) return true;
  if (task.needsData) return true;
  return false;
}

export function modelFit(modelId: string | undefined, caps: FitCaps = {}, task: FitTask = {}): FitVerdict {
  if (!taskNeedsStrong(task)) return { fit: 'good', label: 'Good', why: 'Handles chat and everyday tasks.' };
  const strong = isDeckCapable(modelId);
  const isProject = !!(task && task.mode === 'project');
  const capable = isProject ? strong : strong && caps.agentic !== false;
  if (capable) return { fit: 'good', label: 'Recommended', why: isProject ? 'Strong enough to build the report directly.' : 'Strong at multi-step, tool-using work.' };
  if (task && task.mode === 'project') return { fit: 'recipe', label: 'Needs a recipe', why: 'A lighter model — reliable on repeat project tasks once Madav has saved a recipe from one good run.' };
  return { fit: 'weak', label: 'May struggle', why: 'Better for quick chat and drafts than multi-step data work.' };
}

export const FIT_RANK: Record<string, number> = { good: 0, recipe: 1, weak: 2 };
