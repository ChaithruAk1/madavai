import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ADR-0001 / M2c.3. electron/chat-core-runner.cjs routes a chat turn through coreChatTurn + the
// desktop adapter (what the MADAV_CORE_CHAT branch in agent-openai.cjs calls). Driven here with the
// SAME desktop leaves mocked, against the REAL recorded cassette: it must reproduce the final text,
// the tool sequence, the desktop tool_use/tool_result events, AND persist the new turn back into
// the session history.
const require = createRequire(import.meta.url);
const { runChatTurnViaCore } = require("../../electron/chat-core-runner.cjs");
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
      parseTextToolCalls: (t) => ({ calls: [], stripped: t }),
      quickSearch: async () => { const r = results.web_search; return r && r.length ? r.shift() : "(no web results)"; },
      generateImage: async () => ({}),
      runTool: async (_cwd, name) => { const r = results[name]; return r && r.length ? r.shift() : ""; },
      askUserQuestion: async () => "answer",
      isAuto: () => true, isBlocked: () => false, askPermission: async () => true,
      emit: (ev) => ipc.push(ev), permissions: new Map(),
      tools: cassette.tools, history, profile: { model: cassette.model }, mode: "chat", caps: { shell: true },
      cwd: "/x", skillsDir: "", mission: {}, agentName: "", allowAskUser: false, imagegenOn: true,
      permMode: "default", textMode: false, MAX_STEPS: 12, signal: undefined,
    },
    ipc, history,
  };
}

describe("chat-core-runner — routes a real chat turn through the core, end to end (M2c.3)", () => {
  it("reproduces final text + tool sequence + the recorded tool_use/tool_result events", async () => {
    const { deps, ipc } = makeDeps();
    const res = await runChatTurnViaCore(deps);
    expect(res.text).toBe(cassette.expect.finalText);
    expect(res.observedTools).toEqual(cassette.expect.toolSequence);
    const structural = ipc.filter((e) => e.kind === "tool_use" || e.kind === "tool_result");
    const recorded = cassette.events.filter((e) => e.kind === "tool_use" || e.kind === "tool_result");
    expect(structural).toEqual(recorded);
  });

  it("persists the new turn back into session history (assistant + tool + assistant)", async () => {
    const { deps, history } = makeDeps();
    expect(history).toHaveLength(2); // [system, user] going in
    await runChatTurnViaCore(deps);
    expect(history.length).toBeGreaterThan(2);
    expect(history[history.length - 1].role).toBe("assistant");
    expect(history.some((m) => m.role === "tool")).toBe(true);
  });
});
