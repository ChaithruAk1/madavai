// Projects E2E — the "stable projects" architecture (guard + lanes + recipes) wired together.
// Runs with NO live model: a fake adapter drives the shared chat loop, so we can prove the
// orchestration end-to-end (a stuck model is stopped; lanes route correctly; a success becomes a
// recipe that replays next time). Live behavior (real model, real files, UI) is covered by the
// manual playbook in TEST-PROJECTS-E2E.md.
//
//   npx vitest run tests/parity/projects-e2e.test.js
import { describe, it, expect } from "vitest";
import { coreChatTurn } from "../../core/chat-loop.js";
import { decideLane, LANE } from "../../core/project-lanes.js";
import { makeRecipe, matchRecipe, upsertRecipe, recipePromptBlock, taskKeyOf } from "../../core/recipes.js";

// A fake chat-loop adapter. `script` is a list of step responses; each is either
//   { tool: name, args }  -> the model calls a tool, or
//   { final: text }       -> the model answers and stops.
// When the script runs out it REPEATS the last step (used to simulate a model stuck in a loop).
function fakeAdapter(script) {
  const events = [];
  let i = 0;
  const adapter = {
    async stream() {
      const step = script[Math.min(i, script.length - 1)]; i++;
      if (step.final != null) return { content: step.final, tool_calls: [] };
      return { content: "", tool_calls: [{ id: "tc" + i, function: { name: step.tool, arguments: JSON.stringify(step.args || {}) } }] };
    },
    async runTool() { return "ok"; },
    emit: (e) => events.push(e),
  };
  return { adapter, events };
}
const TOOLS = [{ function: { name: "run_bash", parameters: {} } }];

describe("Projects E2E — a run can never hang, and routes correctly", () => {
  it("GUARD: a model stuck repeating the SAME call is stopped early (not infinite)", async () => {
    const h = fakeAdapter([{ tool: "run_bash", args: { command: "python inspect.py" } }]); // repeats forever
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "execute report", model: "weak", mode: "project", tools: TOOLS });
    const stop = h.events.find((e) => e.type === "guard_stop");
    expect(stop).toBeTruthy();
    expect(stop.code).toBe("loop");
    expect(res.steps).toBeLessThan(14); // stopped well before the step cap
  });

  it("GUARD: a normal run that answers is NOT stopped", async () => {
    const h = fakeAdapter([{ final: "Here is your answer." }]);
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "hi", model: "x", mode: "project", tools: [] });
    expect(h.events.find((e) => e.type === "guard_stop")).toBeFalsy();
    expect(res.text).toBe("Here is your answer.");
  });

  it("GUARD: VARIED tool calls are not a loop (no false stop on real work)", async () => {
    const h = fakeAdapter([
      { tool: "run_bash", args: { command: "python read_submitted.py" } },
      { tool: "run_bash", args: { command: "python read_resolved.py" } },
      { tool: "run_bash", args: { command: "python compute_kpis.py" } },
      { final: "Built the report." },
    ]);
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "execute report", model: "x", mode: "project", tools: TOOLS });
    expect(h.events.find((e) => e.type === "guard_stop")).toBeFalsy();
    expect(res.text).toBe("Built the report.");
  });
});

describe("Projects E2E — lane routing", () => {
  it("A (engine): a from-scratch document with no data files", () => {
    expect(decideLane({ task: "build a 12-month budget template", hasDataFiles: false })).toBe(LANE.DOCUMENT);
    expect(decideLane({ task: "create a SaaS unit economics model", hasDataFiles: false })).toBe(LANE.DOCUMENT);
  });
  it("C (caged loop): a data task with real files present", () => {
    expect(decideLane({ task: "execute the DTC report for March", hasDataFiles: true })).toBe(LANE.IMPROVISE);
  });
  it("B (replay): when a saved recipe exists", () => {
    expect(decideLane({ task: "execute the DTC report", hasDataFiles: true, recipe: { id: "r" } })).toBe(LANE.JOB);
  });
  it("SAFETY: a document ask with data files present is NOT sent to the engine (might need the data)", () => {
    expect(decideLane({ task: "build a report", hasDataFiles: true })).toBe(LANE.IMPROVISE);
  });
});

describe("Projects E2E — recipes: learn once, replay", () => {
  it("captures a successful run, then replays it for the SAME task next month", () => {
    let recipes = [];
    // 1) First run of a new data task -> no recipe yet -> lane C (caged improvisation).
    expect(decideLane({ task: "execute the DTC report for March", hasDataFiles: true, recipe: matchRecipe(recipes, "execute the DTC report for March") })).toBe(LANE.IMPROVISE);
    // 2) It succeeds (wrote a script + produced a file) -> capture a recipe.
    recipes = upsertRecipe(recipes, makeRecipe({
      task: "execute the DTC report for March",
      scripts: [{ name: "build_report.py", content: "import pandas as pd  # read the 5 files, compute KPIs, save the workbook" }],
      outputs: ["Report_March.xlsx"], lane: "C", model: "capable-model",
    }));
    // 3) Next month, the SAME task -> a recipe matches -> lane B (replay).
    const hit = matchRecipe(recipes, "execute the DTC report for April");
    expect(hit).toBeTruthy();
    expect(decideLane({ task: "execute the DTC report for April", hasDataFiles: true, recipe: hit })).toBe(LANE.JOB);
    // 4) The replay primes the model with the proven script (so a weaker model can reproduce it).
    const primed = recipePromptBlock(hit);
    expect(primed).toMatch(/PROVEN RECIPE/);
    expect(primed).toMatch(/build_report\.py/);
    expect(primed).toMatch(/compute KPIs/);
  });

  it("keeps ONE recipe per task (a later success self-heals the earlier one)", () => {
    let recipes = [];
    recipes = upsertRecipe(recipes, makeRecipe({ task: "weekly sales summary for week 1", outputs: ["w1.xlsx"] }));
    recipes = upsertRecipe(recipes, makeRecipe({ task: "weekly sales summary for week 2", outputs: ["w2.xlsx"] }));
    expect(recipes.length).toBe(1);
    expect(taskKeyOf("weekly sales summary for week 1")).toBe(taskKeyOf("weekly sales summary for week 9"));
  });
});
