import { describe, it, expect } from "vitest";
import { coreChatTurn } from "../../core/chat-loop.js";
import { parseTextToolCalls } from "../../core/turn-helpers.js";
import { makeChatAdapter } from "../../core/chat-adapter.js";

// ADR-0001 / M2c.2 — text-mode (tier-C / no-native-tools) parity. Without this the core path would
// BREAK on weak models (and the PROTECTED pipeline runs weak models). Tier-C tool results return as
// user-role "[result of ...]" messages, the text protocol is injected into the system prompt once,
// and the raw assistant text is preserved — exactly like the desktop loop.

function textModeAdapter(cassette) {
  const turns = cassette.modelTurns.slice();
  const results = {};
  for (const k of Object.keys(cassette.toolResults || {})) results[k] = cassette.toolResults[k].slice();
  const ipc = [];
  return {
    _ipc: ipc,
    tools: () => cassette.tools || [],
    stream: async (_p, _m, _t, { onDelta } = {}) => {
      const turn = turns.shift() || { content: "", textMode: true };
      if (turn.content && onDelta) onDelta(turn.content);
      return turn;
    },
    runTool: async (name) => { const q = results[name]; return q && q.length ? q.shift() : ""; },
    emit: (e) => ipc.push(e),
  };
}

const cassette = {
  tools: [{ type: "function", function: { name: "read_file", parameters: { properties: { path: { type: "string" } } } } }],
  system: "you are helpful",
  modelTurns: [
    { content: "let me read", tool_calls: [{ id: "t1", function: { name: "read_file", arguments: '{"path":"a"}' } }], textMode: true, _rawText: "let me read\n```tool\n{\"name\":\"read_file\",\"args\":{\"path\":\"a\"}}\n```" },
    { content: "done", textMode: true, _rawText: "done" },
  ],
  toolResults: { read_file: ["FILE BODY"] },
};
const run = () => coreChatTurn({ adapter: textModeAdapter(cassette), prompt: "read a", system: cassette.system, model: "weak", opts: { textMode: true } });

describe("coreChatTurn — text-mode (tier-C) parity", () => {
  it("returns tool results as user-role '[result of ...]' messages (never role:tool)", async () => {
    const res = await run();
    expect(res.text).toBe("done");
    const tr = res.messages.filter((m) => m.role === "user" && typeof m.content === "string" && m.content.startsWith("[result of "));
    expect(tr).toHaveLength(1);
    expect(tr[0].content).toBe("[result of read_file]\nFILE BODY");
    expect(res.messages.some((m) => m.role === "tool")).toBe(false);
  });
  it("injects the text protocol into the system message exactly once", async () => {
    const res = await run();
    const sys = res.messages.find((m) => m.role === "system");
    expect(sys.content).toContain("native function calling");
    expect(sys._protocolAdded).toBe(true);
    expect((sys.content.match(/native function calling/g) || []).length).toBe(1);
  });
  it("records the RAW assistant text (with the fence), without native tool_calls", async () => {
    const res = await run();
    const asst = res.messages.find((m) => m.role === "assistant" && m.content.includes("```tool"));
    expect(asst).toBeTruthy();
    expect(asst.tool_calls).toBeUndefined();
  });
});

describe("desktop adapter — native->text fallback", () => {
  it("falls back to the text protocol when native tool-calling errors, and stays sticky", async () => {
    let nativeCalls = 0, textCalls = 0;
    const adapter = makeChatAdapter({
      streamChatTools: async () => { nativeCalls++; throw new Error("tool calling not supported by this model"); },
      streamChat: async () => { textCalls++; return { text: "ok\n```tool\n{\"name\":\"read_file\",\"args\":{\"path\":\"a\"}}\n```" }; },
      parseTextToolCalls, execLeaf: async () => "x", ui: () => {}, toolset: [],
    });
    const r1 = await adapter.stream({}, [], [], {});
    expect(r1.textMode).toBe(true);
    expect(r1.tool_calls[0].function.name).toBe("read_file");
    expect(nativeCalls).toBe(1);
    expect(textCalls).toBe(1);
    const r2 = await adapter.stream({}, [], [], {});
    expect(r2.textMode).toBe(true);
    expect(nativeCalls).toBe(1); // sticky — no second native attempt
    expect(textCalls).toBe(2);
  });
});
