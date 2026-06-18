import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runTaskOnce, nextRunAfter, isTaskDue } from "../../server/task-run.mjs";

const task = { id: "t1", userId: "u1", prompt: "hello", model: "m", provider: "starter", intervalMs: 15 * 60000, enabled: true, nextRunAt: 0 };

describe("task-run.runTaskOnce (single-shot, injected provider)", () => {
  it("success -> ok run with capped output + ids", async () => {
    const r = await runTaskOnce(task, { providerCall: async ({ prompt }) => "answer to: " + prompt, now: () => 1000 });
    expect(r).toMatchObject({ taskId: "t1", userId: "u1", ok: true, startedAt: 1000, finishedAt: 1000 });
    expect(r.output).toBe("answer to: hello");
    expect(r.id).toMatch(/^run_/);
  });
  it("caps stored output at 8000 chars", async () => {
    const r = await runTaskOnce(task, { providerCall: async () => "x".repeat(9000) });
    expect(r.output.length).toBe(8000);
  });
  it("provider error -> ok:false, never throws", async () => {
    const r = await runTaskOnce(task, { providerCall: async () => { throw new Error("upstream 502"); } });
    expect(r.ok).toBe(false); expect(r.error).toContain("upstream 502");
  });
  it("no prompt / no providerCall -> ok:false", async () => {
    expect((await runTaskOnce({ id: "t", userId: "u" }, { providerCall: async () => "x" })).ok).toBe(false);
    expect((await runTaskOnce(task, {})).ok).toBe(false);
  });
});

describe("task-run scheduler helpers (pure)", () => {
  it("nextRunAfter advances by interval, clamped to 15 min", () => {
    expect(nextRunAfter({ intervalMs: 20 * 60000 }, () => 1000)).toBe(1000 + 20 * 60000);
    expect(nextRunAfter({ intervalMs: 1000 }, () => 0)).toBe(15 * 60000);
  });
  it("isTaskDue: enabled + past nextRunAt only", () => {
    expect(isTaskDue({ enabled: true, nextRunAt: 500 }, () => 1000)).toBe(true);
    expect(isTaskDue({ enabled: false, nextRunAt: 500 }, () => 1000)).toBe(false);
    expect(isTaskDue({ enabled: true, nextRunAt: 5000 }, () => 1000)).toBe(false);
  });
});

describe("task-run stays single-shot (drift guard R7)", () => {
  const exsrc = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../server/task-run.mjs"), "utf8");
  it("imports none of the tool/agent/broker machinery and calls no tool loop", () => {
    expect(exsrc).not.toMatch(/import .*(mcp-broker|connector-|agentMemory|deepResearch|ragLite)/);
    expect(exsrc).not.toMatch(/listTools|callTool|runAgentTurn|runTeamTurn|executeTool/);
  });
});
