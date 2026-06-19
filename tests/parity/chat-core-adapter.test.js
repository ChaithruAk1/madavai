import { describe, it, expect } from "vitest";
import { makeChatAdapter } from "../../core/chat-adapter.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { coreChatTurn } from "../../core/chat-loop.js";

// ADR-0001 / M2c.1. The desktop adapter (electron/chat-core-adapter.cjs) wraps desktop primitives
// into coreChatTurn's stream/runTool/tools/emit interface and maps the loop's semantic events to
// desktop IPC events. Validated against a REAL recorded turn: coreChatTurn + the desktop adapter
// must reproduce the recorded desktop tool_use/tool_result event sequence — the emit-parity proof
// the flag cutover (M2c.3) depends on. DI runs it off the main process with mock primitives.
const here = path.dirname(fileURLToPath(import.meta.url));
const cassette = JSON.parse(fs.readFileSync(path.join(here, "fixtures/desktop-chat-tool.json"), "utf8"));

function build(c) {
  const ipc = [];
  let i = 0;
  const results = {};
  for (const k of Object.keys(c.toolResults || {})) results[k] = c.toolResults[k].slice();
  const streamChatTools = async (_p, _m, _t, { onDelta } = {}) => {
    const turn = c.modelTurns[i++] || { content: "" };
    if (turn.content && onDelta) onDelta(turn.content);
    return {
      content: turn.content || "",
      toolCalls: (turn.tool_calls || []).map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })),
    };
  };
  const execLeaf = async (name) => { const q = results[name]; return q && q.length ? q.shift() : ""; };
  const adapter = makeChatAdapter({
    streamChatTools, execLeaf, ui: (kind, data) => ipc.push({ kind, data }),
    toolset: c.tools, isAuto: () => true, now: () => 0,
  });
  return { adapter, ipc };
}
const run = (adapter) => coreChatTurn({ adapter, prompt: cassette.input, system: cassette.system, model: cassette.model });

describe("desktop chat adapter — emit parity against a real recorded turn (M2c.1)", () => {
  it("reproduces the recorded tool_use/tool_result event sequence exactly", async () => {
    const { adapter, ipc } = build(cassette);
    const res = await run(adapter);
    expect(res.text).toBe(cassette.expect.finalText);
    expect(res.observedTools).toEqual(cassette.expect.toolSequence);
    const structural = ipc.filter((e) => e.kind === "tool_use" || e.kind === "tool_result");
    const recorded = cassette.events.filter((e) => e.kind === "tool_use" || e.kind === "tool_result");
    expect(structural).toEqual(recorded);
  });

  it("streams deltas and closes with assistant_message + result(success)", async () => {
    const { adapter, ipc } = build(cassette);
    await run(adapter);
    expect(ipc.some((e) => e.kind === "assistant_delta")).toBe(true);
    expect(ipc.some((e) => e.kind === "assistant_message")).toBe(true);
    expect((ipc.find((e) => e.kind === "result") || {}).data.subtype).toBe("success");
  });

  it("does NOT double-render the loop's semantic tool_call/tool_result (adapter owns tool UI)", async () => {
    const { adapter, ipc } = build(cassette);
    await run(adapter);
    expect(ipc.filter((e) => e.kind === "tool_use")).toHaveLength(1);
    expect(ipc.filter((e) => e.kind === "tool_result")).toHaveLength(1);
  });

  it("satisfies the chat-loop adapter interface", () => {
    const { adapter } = build(cassette);
    for (const m of ["stream", "runTool", "tools", "emit"]) expect(typeof adapter[m]).toBe("function");
  });
});
