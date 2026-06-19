import { describe, it, expect } from "vitest";
import { coreChatTurn } from "../../core/chat-loop.js";

// Weak-model follow-through nudge: when a model ANNOUNCES a next step ("let me search again") but
// emits no tool call, coreChatTurn nudges it ONCE to actually act — but only when opts.nudgeFollowThrough
// is on (default off keeps recorded-turn parity byte-identical). The desktop + web runners enable it.

function makeAdapter(turns) {
  const ipc = [];
  let i = 0;
  return {
    _ipc: ipc,
    tools: () => [{ type: "function", function: { name: "web_search", parameters: { properties: { query: { type: "string" } } } } }],
    stream: async () => turns[i++] || { content: "" },
    runTool: async () => "RESULTS: \"SpaceX Starship reaches space\" — Space.com",
    emit: (e) => ipc.push(e),
  };
}

const trailOff = { content: "I searched and found only general space sites. Let me try a more specific search." };

describe("coreChatTurn — weak-model follow-through nudge", () => {
  it("OFF by default: a trail-off finalizes immediately, no nudge (parity unchanged)", async () => {
    const a = makeAdapter([trailOff, { content: "should not be reached" }]);
    const res = await coreChatTurn({ adapter: a, prompt: "find a headline", model: "weak", tools: a.tools() });
    expect(res.text).toContain("Let me try a more specific search");
    expect(a._ipc.some((e) => e.type === "nudge")).toBe(false);
    expect(res.steps).toBe(1);
  });

  it("ON: nudges once, the model then calls the tool and finishes", async () => {
    const a = makeAdapter([
      trailOff,
      { content: "", tool_calls: [{ id: "s1", function: { name: "web_search", arguments: '{"query":"recent space headline"}' } }] },
      { content: "\"SpaceX Starship reaches space\" — Space.com (2024)" },
    ]);
    const res = await coreChatTurn({ adapter: a, prompt: "find a headline", model: "weak", tools: a.tools(), opts: { nudgeFollowThrough: true } });
    expect(a._ipc.filter((e) => e.type === "nudge")).toHaveLength(1);
    expect(res.observedTools).toEqual(["web_search"]);
    expect(res.text).toContain("Space.com");
  });

  it("nudges AT MOST once: after one nudge, a second trail-off is finalized as-is (no nagging)", async () => {
    const a = makeAdapter([trailOff, { content: "Hmm, let me search once more for it." }]);
    const res = await coreChatTurn({ adapter: a, prompt: "find a headline", model: "weak", tools: a.tools(), opts: { nudgeFollowThrough: true } });
    expect(a._ipc.filter((e) => e.type === "nudge")).toHaveLength(1);
    expect(res.text).toContain("search once more");
  });

  it("does NOT nudge a normal complete answer, even when ON", async () => {
    const a = makeAdapter([{ content: "The capital of Australia is Canberra." }]);
    const res = await coreChatTurn({ adapter: a, prompt: "capital?", model: "weak", tools: a.tools(), opts: { nudgeFollowThrough: true } });
    expect(a._ipc.some((e) => e.type === "nudge")).toBe(false);
    expect(res.text).toContain("Canberra");
  });
});
