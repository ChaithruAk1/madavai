import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { stripReasoning } = require("../../electron/providers.cjs");

describe("stripReasoning", () => {
  it("returns empty-ish input unchanged", () => {
    expect(stripReasoning("")).toBe("");
    expect(stripReasoning(null)).toBe("");
  });

  it("removes a matched <think>…</think> block", () => {
    expect(stripReasoning("<think>secret reasoning</think>Hello")).toBe("Hello");
  });

  it("drops everything before an orphan </think>", () => {
    expect(stripReasoning("reasoning with no opener</think>Final answer")).toBe("Final answer");
  });

  it("drops an orphan <think> with no close to end (leading ws trimmed, trailing kept)", () => {
    expect(stripReasoning("Visible text <think>then rambling to the end")).toBe("Visible text ");
  });

  it("trims leading whitespace from the cleaned result", () => {
    expect(stripReasoning("<think>x</think>\n\n  Answer")).toBe("Answer");
  });

  it("leaves clean text alone", () => {
    expect(stripReasoning("Just a normal answer.")).toBe("Just a normal answer.");
  });
});
