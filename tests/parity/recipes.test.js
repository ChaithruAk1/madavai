import { describe, it, expect } from "vitest";
import { taskKeyOf, makeRecipe, matchRecipe, upsertRecipe, recipePromptBlock } from "../../core/recipes.js";

describe("recipes — learn once, replay", () => {
  it("maps the same task across months/years/numbers to ONE key", () => {
    expect(taskKeyOf("Execute DTC report for March 2026")).toBe(taskKeyOf("Execute DTC report for April 2027"));
    expect(taskKeyOf("Q1 board deck")).toBe(taskKeyOf("Q3 board deck"));
  });
  it("gives different tasks different keys", () => {
    expect(taskKeyOf("DTC report")).not.toBe(taskKeyOf("payroll summary"));
  });
  it("matchRecipe finds the newest recipe with the same key", () => {
    const r1 = makeRecipe({ task: "DTC report for March", outputs: ["Report_March.xlsx"] }); r1.createdAt = 1;
    const r2 = makeRecipe({ task: "DTC report for April", outputs: ["Report_April.xlsx"] }); r2.createdAt = 2;
    expect(matchRecipe([r1, r2], "DTC report for May")).toBe(r2);
  });
  it("matchRecipe returns null when nothing matches", () => {
    expect(matchRecipe([makeRecipe({ task: "DTC report" })], "totally different task")).toBe(null);
    expect(matchRecipe([], "anything")).toBe(null);
  });
  it("upsertRecipe keeps one per key (newest wins)", () => {
    let list = [];
    list = upsertRecipe(list, makeRecipe({ task: "DTC report for March" }));
    list = upsertRecipe(list, makeRecipe({ task: "DTC report for April" }));
    expect(list.length).toBe(1);
  });
  it("recipePromptBlock includes the proven script when present", () => {
    const r = makeRecipe({ task: "DTC report", scripts: [{ name: "build.py", content: "print(1)" }], outputs: ["R.xlsx"] });
    const b = recipePromptBlock(r);
    expect(b).toMatch(/PROVEN RECIPE/);
    expect(b).toMatch(/build\.py/);
    expect(b).toMatch(/print\(1\)/);
  });
  it("recipePromptBlock is empty for no recipe", () => {
    expect(recipePromptBlock(null)).toBe("");
  });
});
