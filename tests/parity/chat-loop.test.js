import { describe, it, expect } from "vitest";
import { coreChatTurn, validateChatAdapter, DEFAULT_STEP_CAP } from "../../core/chat-loop.js";

// ADR-0001 / M2b. coreChatTurn is the platform-agnostic chat turn-loop. It is exercised here by a
// MOCK adapter replaying a RECORDED turn (a "cassette": scripted model stream responses + scripted
// tool results), mirroring core/harness/replay.js but against the chat-loop's stream/runTool/emit
// interface. Nothing in production calls coreChatTurn yet (M2c wires the desktop adapter).

// A mock chat adapter that replays a cassette. stream() shifts the next scripted model turn;
// runTool() shifts the next scripted result for that tool name; emit() records every event.
function replayAdapter(cassette) {
  const turns = (cassette.modelTurns || []).slice();
  const results = {};
  for (const k of Object.keys(cassette.toolResults || {})) results[k] = cassette.toolResults[k].slice();
  const events = [];
  const deltas = [];
  return {
    _events: events,
    _deltas: deltas,
    tools: () => cassette.tools || [],
    stream: async (_profile, _messages, _tools, { onDelta } = {}) => {
      const turn = turns.shift() || { content: "" };
      if (turn.content && onDelta) onDelta(turn.content);
      return turn;
    },
    runTool: async (name) => {
      const q = results[name];
      const r = q && q.length ? q.shift() : { content: "(no scripted result for " + name + ")" };
      if (r && r.__throw) throw new Error(r.__throw);
      return r;
    },
    emit: (e) => events.push(e),
  };
}
const types = (a) => a.map((e) => e.type);

describe("validateChatAdapter / coreChatTurn guards", () => {
  it("accepts a complete adapter", () => {
    expect(validateChatAdapter({ stream() {}, runTool() {}, emit() {} })).toEqual({ ok: true, missing: [] });
  });
  it("reports missing methods", () => {
    const r = validateChatAdapter({ stream() {} });
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["runTool", "emit"]);
  });
  it("coreChatTurn rejects an incomplete adapter", async () => {
    await expect(coreChatTurn({ adapter: {}, prompt: "hi" })).rejects.toThrow(/adapter incomplete/);
  });
  it("default step cap is exported", () => {
    expect(DEFAULT_STEP_CAP).toBe(14);
  });
});

describe("coreChatTurn — replays a native tool-call turn", () => {
  const cassette = {
    tools: [{ type: "function", function: { name: "run_python" } }],
    modelTurns: [
      { content: "Let me compute.", tool_calls: [{ id: "c1", type: "function", function: { name: "run_python", arguments: '{"code":"print(2+2)"}' } }] },
      { content: "The answer is 4." },
    ],
    toolResults: { run_python: [{ stdout: "4", stderr: "", code: 0 }] },
  };

  it("streams -> runs the tool -> loops -> returns the final text", async () => {
    const adapter = replayAdapter(cassette);
    const res = await coreChatTurn({ adapter, prompt: "what is 2+2?", system: "you are helpful", model: "test-model" });
    expect(res.text).toBe("The answer is 4.");
    expect(res.observedTools).toEqual(["run_python"]);
    expect(res.steps).toBe(2);
  });

  it("appends a well-formed tool-result message (normalized from stdout)", async () => {
    const adapter = replayAdapter(cassette);
    const res = await coreChatTurn({ adapter, prompt: "what is 2+2?", system: "sys" });
    const toolMsg = res.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeTruthy();
    expect(toolMsg.tool_call_id).toBe("c1");
    expect(toolMsg.content).toBe("4");
  });

  it("emits the expected UI event stream", async () => {
    const adapter = replayAdapter(cassette);
    await coreChatTurn({ adapter, prompt: "q" });
    const t = types(adapter._events);
    expect(t[0]).toBe("turn_start");
    expect(t).toContain("tool_call");
    expect(t).toContain("tool_result");
    expect(t).toContain("final");
    expect(t[t.length - 1]).toBe("turn_end");
    expect(adapter._events.find((e) => e.type === "tool_call").name).toBe("run_python");
  });
});

describe("coreChatTurn — replays a TEXT-MODE turn (fenced tool block, no native tool_calls)", () => {
  const cassette = {
    modelTurns: [
      { content: "ok let me read\n```tool\n{\"name\":\"read_file\",\"args\":{\"path\":\"a.txt\"}}\n```" },
      { content: "done reading" },
    ],
    toolResults: { read_file: [{ content: "FILE BODY" }] },
  };

  it("parses the fenced tool call, executes it, and strips the fence from the assistant text", async () => {
    const adapter = replayAdapter(cassette);
    const res = await coreChatTurn({ adapter, prompt: "read a.txt" });
    expect(res.observedTools).toEqual(["read_file"]);
    expect(res.text).toBe("done reading");
    const assistantWithFence = res.messages.find((m) => m.role === "assistant" && m.tool_calls);
    expect(assistantWithFence.content).toBe("ok let me read");
    expect(JSON.stringify(res.messages)).not.toContain("```tool");
  });
});

describe("coreChatTurn — discipline: repaired args, loop breaker + step cap", () => {
  it("repairs sloppy tool arguments via tolerantParse before runTool sees them", async () => {
    let seen = null;
    let i = 0;
    const adapter = {
      tools: () => [],
      stream: async () => {
        i += 1;
        return i === 1
          ? { content: "", tool_calls: [{ id: "c", function: { name: "do", arguments: '{"code":"x",}' } }] }
          : { content: "ok" };
      },
      runTool: async (_name, args) => { seen = args; return "done"; },
      emit: () => {},
    };
    const res = await coreChatTurn({ adapter, prompt: "go" });
    expect(seen).toEqual({ code: "x" }); // trailing comma repaired
    expect(res.text).toBe("ok");
  });

  it("blocks the 3rd identical call and stops at the step cap", async () => {
    const events = [];
    const spinAdapter = {
      tools: () => [],
      stream: async () => ({ content: "spinning", tool_calls: [{ id: "x", function: { name: "spin", arguments: "{}" } }] }),
      runTool: async () => ({ content: "still spinning" }),
      emit: (e) => events.push(e),
    };
    const res = await coreChatTurn({ adapter: spinAdapter, prompt: "go", opts: { stepCap: 5 } });
    expect(res.steps).toBe(5);
    expect(res.observedTools).toEqual(["spin", "spin"]); // ran twice, blocked from the 3rd on
    expect(res.text).toMatch(/step cap reached/);
    expect(events.some((e) => e.type === "tool_blocked")).toBe(true);
    expect(events.some((e) => e.type === "cap_reached")).toBe(true);
  });
});
