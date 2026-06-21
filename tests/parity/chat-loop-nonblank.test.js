import { describe, it, expect } from "vitest";
import { coreChatTurn } from "../../core/chat-loop.js";

function adapterReturning(content) {
  const events = [];
  const adapter = { stream: async () => ({ content, tool_calls: [] }), runTool: async () => "", emit: (e) => events.push(e) };
  return { adapter, events };
}

describe("coreChatTurn — never exits blank (always an answer or a reason)", () => {
  it("empty model response -> a clear reason, surfaced as a final message", async () => {
    const h = adapterReturning("");
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "hi", model: "stepfun-ai/step-3.5-flash", tools: [] });
    expect(res.text.trim().length).toBeGreaterThan(0);
    expect(res.text).toMatch(/empty response/i);
    const fin = h.events.find((e) => e.type === "final");
    expect(fin && fin.text).toBe(res.text);
  });
  it("whitespace-only response -> a clear reason", async () => {
    const h = adapterReturning("   \n  ");
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "hi", model: "x", tools: [] });
    expect(res.text).toMatch(/empty response/i);
  });
  it("a normal answer is returned unchanged", async () => {
    const h = adapterReturning("The answer is 42.");
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "hi", model: "x", tools: [] });
    expect(res.text).toBe("The answer is 42.");
  });
  it("recovers a file spec the model buried inside (stripped) reasoning instead of going blank", async () => {
    const buried = '<think>Let me reason about this SaaS model step by step... ok here is the spec.\n```officedoc\n{"type":"xlsx","name":"m.xlsx","sheets":[{"name":"S","rows":[["Metric","Value"],["MRR",1000]]}]}\n```\nThat should cover it.</think>';
    const h = adapterReturning(buried);
    const res = await coreChatTurn({ adapter: h.adapter, prompt: "build a sheet", model: "stepfun-ai/step-3.7-flash", tools: [] });
    expect(res.text).not.toMatch(/empty response/i);      // a buried spec is no longer a dead-end…
    expect(res.text).toMatch(/```officedoc/);             // …the file spec is recovered…
    expect(res.text).toMatch(/"type"\s*:\s*"xlsx"/);      // …intact, so the renderer can build the file
  });
});
