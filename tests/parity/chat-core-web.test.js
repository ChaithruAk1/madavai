import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runWebChatTurnViaCore } from "../../src/bridge/chatCoreWeb.js";

// ADR-0001 / M2d.2. The SAME core (coreChatTurn + makeChatAdapter) driven over the WEB platform
// wiring must reproduce the recorded desktop turn — final text, tool sequence, and (modulo web's
// 3-arg emit) the tool_use/tool_result events. This is the web half of single-source: one core, two
// thin platform shims.
const here = path.dirname(fileURLToPath(import.meta.url));
const cassette = JSON.parse(fs.readFileSync(path.join(here, "fixtures/desktop-chat-tool.json"), "utf8"));

function makeDeps() {
  const ipc = [];
  let i = 0;
  const results = {};
  for (const k of Object.keys(cassette.toolResults || {})) results[k] = cassette.toolResults[k].slice();
  const history = [{ role: "system", content: cassette.system }, { role: "user", content: cassette.input }];
  return {
    deps: {
      streamChatTools: async (_p, _m, _t, { onDelta } = {}) => {
        const turn = cassette.modelTurns[i++] || { content: "" };
        if (turn.content && onDelta) onDelta(turn.content);
        return { content: turn.content || "", toolCalls: (turn.tool_calls || []).map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })) };
      },
      streamChat: async () => ({ text: "" }),
      executeTool: async (name) => { const q = results[name]; return q && q.length ? q.shift() : ""; },
      webGenImage: async () => "img",
      emit: (sid, kind, data) => ipc.push({ sid, kind, data }),
      sessId: "s1", sess: { id: "s1" }, tools: cassette.tools, history,
      profile: { model: cassette.model, baseUrl: "https://openrouter.ai/api" }, mode: "chat", signal: undefined,
    },
    ipc, history,
  };
}

describe("web chat-core runner — same core over the web platform (M2d.2)", () => {
  it("reproduces final text + tool sequence + the recorded events via web's 3-arg emit", async () => {
    const { deps, ipc } = makeDeps();
    const res = await runWebChatTurnViaCore(deps);
    expect(res.text).toBe(cassette.expect.finalText);
    expect(res.observedTools).toEqual(cassette.expect.toolSequence);
    const structural = ipc.filter((e) => e.kind === "tool_use" || e.kind === "tool_result").map((e) => ({ kind: e.kind, data: e.data }));
    const recorded = cassette.events.filter((e) => e.kind === "tool_use" || e.kind === "tool_result");
    expect(structural).toEqual(recorded);
    expect(ipc.every((e) => e.sid === "s1")).toBe(true); // every event carried the session id
  });

  it("persists the turn back into session history", async () => {
    const { deps, history } = makeDeps();
    expect(history).toHaveLength(2);
    await runWebChatTurnViaCore(deps);
    expect(history.length).toBeGreaterThan(2);
    expect(history.some((m) => m.role === "tool")).toBe(true);
  });
});
