import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { coreChatTurn } from "../../core/chat-loop.js";

// ADR-0001 / M2c. The capstone harness proof: a REAL desktop chat turn (captured by
// electron/turn-recorder.cjs, fixture below with the system prompt trimmed) is replayed through
// core/chat-loop.js coreChatTurn via a mock adapter. coreChatTurn must reproduce the recorded
// final text + tool sequence byte-equal. This is what gates the M2c flag cutover. It already
// caught one real gap — the desktop engine's stripReasoning() on the final answer — now closed by
// single-sourcing stripReasoning into core/turn-helpers.js.
const here = path.dirname(fileURLToPath(import.meta.url));
const cassette = JSON.parse(fs.readFileSync(path.join(here, "fixtures/desktop-chat-real.json"), "utf8"));

function adapterFromCassette(c) {
  const turns = (c.modelTurns || []).slice();
  const results = {};
  for (const k of Object.keys(c.toolResults || {})) results[k] = c.toolResults[k].slice();
  return {
    tools: () => c.tools || [],
    stream: async (_p, _m, _t, { onDelta } = {}) => {
      const t = turns.shift() || { content: "" };
      if (t.content && onDelta) onDelta(t.content);
      return t;
    },
    runTool: async (name) => { const q = results[name]; return q && q.length ? q.shift() : ""; },
    emit: () => {},
  };
}

describe("coreChatTurn replays a REAL recorded desktop chat turn (M2c harness proof)", () => {
  it("reproduces the recorded tool sequence", async () => {
    const res = await coreChatTurn({ adapter: adapterFromCassette(cassette), prompt: cassette.input, system: cassette.system, model: cassette.model });
    expect(res.observedTools).toEqual(cassette.expect.toolSequence);
  });
  it("reproduces the recorded final text byte-equal (locks the stripReasoning parity fix)", async () => {
    const res = await coreChatTurn({ adapter: adapterFromCassette(cassette), prompt: cassette.input, system: cassette.system, model: cassette.model });
    expect(res.text).toBe(cassette.expect.finalText);
  });
  it("reproduces the recorded step count", async () => {
    const res = await coreChatTurn({ adapter: adapterFromCassette(cassette), prompt: cassette.input, system: cassette.system, model: cassette.model });
    expect(res.steps).toBe(cassette.expect.numTurns);
  });
});
