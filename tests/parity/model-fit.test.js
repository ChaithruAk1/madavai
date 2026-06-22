import { describe, it, expect } from "vitest";
import { modelFit, taskNeedsStrong, FIT_RANK } from "../../core/model-fit.js";

describe("model-fit — task-aware model fit (single source)", () => {
  it("plain chat: every model fits", () => {
    expect(modelFit("stepfun-ai/step-3.5-flash", {}, { mode: "chat" }).fit).toBe("good");
    expect(modelFit("claude-opus", {}, { mode: "chat" }).fit).toBe("good");
  });
  it("heavy task + capable model = recommended", () => {
    expect(modelFit("claude-opus", { agentic: true }, { mode: "agent" }).fit).toBe("good");
    expect(modelFit("deepseek-chat", { agentic: true }, { mode: "project", hasFolder: true }).fit).toBe("good");
    expect(modelFit("openai/gpt-oss-120b", {}, { mode: "agent" }).fit).toBe("good"); // 120B clears the gate
  });
  it("project + weak model = recipe path (not a dead end)", () => {
    expect(modelFit("stepfun-ai/step-3.5-flash", {}, { mode: "project", hasFolder: true }).fit).toBe("recipe");
    expect(modelFit("qwen-2.5-7b", {}, { mode: "project" }).fit).toBe("recipe");
  });
  it("agent/team + weak model = may struggle", () => {
    expect(modelFit("gemma-2-2b", {}, { mode: "agent" }).fit).toBe("weak");
    expect(modelFit("phi-3-mini", {}, { mode: "team" }).fit).toBe("weak");
  });
  it("data task in plain chat + weak model = may struggle", () => {
    expect(modelFit("llama-3-8b", {}, { mode: "chat", needsData: true }).fit).toBe("weak");
  });
  it("a capable model flagged non-agentic downgrades on heavy tasks", () => {
    expect(modelFit("deepseek-r1", { agentic: false }, { mode: "agent" }).fit).toBe("weak");
  });
  it("taskNeedsStrong reflects mode + needsData", () => {
    expect(taskNeedsStrong({ mode: "chat" })).toBe(false);
    expect(taskNeedsStrong({ mode: "chat", needsData: true })).toBe(true);
    expect(taskNeedsStrong({ mode: "project" })).toBe(true);
    expect(taskNeedsStrong({ mode: "cowork" })).toBe(true);
    expect(taskNeedsStrong({ mode: "agent" })).toBe(true);
    expect(taskNeedsStrong(null)).toBe(false);
  });
  it("FIT_RANK orders recommended first", () => {
    expect(FIT_RANK.good).toBeLessThan(FIT_RANK.recipe);
    expect(FIT_RANK.recipe).toBeLessThan(FIT_RANK.weak);
  });
});
