import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { coreChatTurn } from "../../core/chat-loop.js";

// ADR-0001 / M2c.2 — auto-compaction parity (the last legacy chat behavior). coreChatTurn summarizes
// history near the model's window (via adapter.summarize, which the desktop adapter wires to streamChat),
// rebuilds it as [system, notes, ...last turns], and hard-trims oversized kept messages — exactly like
// the desktop loop. Guarded: only fires when the adapter provides summarize, so other adapters are unaffected.
const require = createRequire(import.meta.url);
const { makeDesktopChatAdapter } = require("../../electron/chat-core-adapter.cjs");

function build() {
  const ipc = [];
  const state = { summarize: 0 };
  let i = 0;
  const turns = [{ content: "final answer" }];
  const adapter = {
    tools: () => [],
    stream: async (_p, _m, _t, { onDelta } = {}) => { const t = turns[i++] || { content: "" }; if (t.content && onDelta) onDelta(t.content); return t; },
    runTool: async () => "",
    summarize: async () => { state.summarize++; return "GOAL: weather\nDECISIONS: searched\nFILES:\nDONE: answered\nREMAINS:"; },
    emit: (e) => ipc.push(e),
  };
  const history = [
    { role: "system", content: "sys" },
    { role: "user", content: "old question" },
    { role: "assistant", content: "old answer" },
    { role: "tool", tool_call_id: "x", content: "X".repeat(20000) },
    { role: "user", content: "new question" },
  ];
  return { adapter, ipc, state, history };
}

describe("coreChatTurn — auto-compaction (Wave 1.3)", () => {
  it("compacts near the window: summarize called, notes inserted, oversized message trimmed", async () => {
    const { adapter, ipc, state, history } = build();
    const res = await coreChatTurn({ adapter, history, prompt: "", system: "", model: "test", opts: { exactCtx: 4096 } });
    expect(state.summarize).toBe(1);
    expect(res.text).toBe("final answer");
    expect(res.messages.some((m) => typeof m.content === "string" && m.content.includes("[context notes"))).toBe(true);
    expect(res.messages.every((m) => typeof m.content !== "string" || m.content.length <= 6200)).toBe(true);
    expect(ipc.some((e) => e.type === "compacting")).toBe(true);
    expect(ipc.some((e) => e.type === "compacted")).toBe(true);
  });

  it("skips gracefully when the adapter cannot summarize", async () => {
    const { history } = build();
    const adapter = { tools: () => [], stream: async () => ({ content: "ok" }), runTool: async () => "", emit: () => {} };
    const res = await coreChatTurn({ adapter, history, prompt: "", system: "", model: "test", opts: { exactCtx: 4096 } });
    expect(res.text).toBe("ok");
    expect(res.messages.some((m) => typeof m.content === "string" && m.content.length === 20000)).toBe(true);
  });
});

describe("desktop adapter — compaction emit mapping", () => {
  it("maps compacting/compacted -> compact_context tool_use + tool_result (shared id)", () => {
    const ipc = [];
    const adapter = makeDesktopChatAdapter({
      streamChatTools: async () => ({}), streamChat: async () => ({ text: "" }),
      parseTextToolCalls: () => ({ calls: [], stripped: "" }), execLeaf: async () => "",
      emit: (e) => ipc.push(e), now: () => 0,
    });
    adapter.emit({ type: "compacting", reason: "near window" });
    adapter.emit({ type: "compacted" });
    const use = ipc.find((e) => e.kind === "tool_use");
    const result = ipc.find((e) => e.kind === "tool_result");
    expect(use.data.name).toBe("compact_context");
    expect(use.data.auto).toBe(true);
    expect(result.data.output).toContain("compacted into working notes");
    expect(result.data.id).toBe(use.data.id);
  });
});
