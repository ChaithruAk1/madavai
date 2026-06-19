import { describe, it, expect } from "vitest";
import { coreChatTurn } from "../../core/chat-loop.js";

// Minimal adapter: the model returns `answer` (no tool calls) on the first stream; the cleanup pass is
// the SECOND stream call — recognised by its "text cleaner" system prompt — and returns `cleaned`.
function makeAdapter({ answer, cleaned }) {
  const events = [];
  let cleanupCalls = 0;
  const adapter = {
    stream: async (_profile, messages, _tools, { onDelta } = {}) => {
      const sys = (messages[0] && messages[0].content) || "";
      if (/text cleaner/i.test(sys)) { cleanupCalls++; return { content: cleaned, tool_calls: [] }; }
      if (onDelta) onDelta(answer);
      return { content: answer, tool_calls: [] };
    },
    runTool: async () => "",
    emit: (e) => events.push(e),
  };
  return { adapter, events, getCleanupCalls: () => cleanupCalls };
}

const LEAKY = "The user asked me to search the web. I should pick the most recent result. I'll present that as the headline. Headline: Mars rover finds frozen water. Source: https://example.com/mars";
const CLEAN = "Headline: Mars rover finds frozen water. Source: https://example.com/mars";
const tools = [{ type: "function", function: { name: "web_search", parameters: { type: "object", properties: {} } } }];
const run = (h, model, opts) => coreChatTurn({ adapter: h.adapter, prompt: "hi", model, tools, opts });

describe("Option-2 cleanup pass — strips weak-model reasoning that leaks into the answer", () => {
  it("weak model + leaked reasoning -> runs cleanup, returns only the answer (display + final event)", async () => {
    const h = makeAdapter({ answer: LEAKY, cleaned: CLEAN });
    const res = await run(h, "stepfun-ai/step-3.5-flash", { cleanupReasoning: true });
    expect(res.text).toBe(CLEAN);
    expect(h.getCleanupCalls()).toBe(1);
    expect(h.events.some((e) => e.type === "cleanup")).toBe(true);
    expect(h.events.find((e) => e.type === "final").text).toBe(CLEAN);
  });

  it("capable model -> never runs cleanup, even on the same leaky text", async () => {
    const h = makeAdapter({ answer: LEAKY, cleaned: CLEAN });
    const res = await run(h, "claude-opus-4", { cleanupReasoning: true });
    expect(h.getCleanupCalls()).toBe(0);
    expect(res.text).toContain("The user asked");
  });

  it("weak model + already-clean answer -> no cleanup (no marker, no cost)", async () => {
    const h = makeAdapter({ answer: CLEAN, cleaned: "x" });
    const res = await run(h, "gpt-4o-mini", { cleanupReasoning: true });
    expect(h.getCleanupCalls()).toBe(0);
    expect(res.text).toBe(CLEAN);
  });

  it("opt-out (default) -> cleanup never runs", async () => {
    const h = makeAdapter({ answer: LEAKY, cleaned: CLEAN });
    const res = await run(h, "stepfun-ai/step-3.5-flash", {});
    expect(h.getCleanupCalls()).toBe(0);
    expect(res.text).toContain("The user asked");
  });

  it("rejects a cleanup result that still leaks / is longer — keeps the original, never worse", async () => {
    const h = makeAdapter({ answer: LEAKY, cleaned: LEAKY + " and the user asked again so I should add more" });
    const res = await run(h, "stepfun-ai/step-3.5-flash", { cleanupReasoning: true });
    expect(h.getCleanupCalls()).toBe(1);
    expect(res.text).toContain("Mars rover");
  });
});
