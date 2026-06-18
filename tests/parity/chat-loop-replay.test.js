import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { coreChatTurn } from "../../core/chat-loop.js";

// ADR-0001 / M2c. The capstone harness proof: every REAL desktop chat turn captured by
// electron/turn-recorder.cjs (fixtures/desktop-chat-*.json) must replay through core/chat-loop.js
// coreChatTurn byte-equal — recorded final text + tool sequence + step count. This gates the M2c
// flag cutover. It already caught the desktop stripReasoning() gap (now single-sourced into core).
const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");
const files = fs.readdirSync(fixturesDir).filter((f) => /^desktop-chat.*\.json$/.test(f)).sort();

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
const run = (c) => coreChatTurn({ adapter: adapterFromCassette(c), prompt: c.input, system: c.system, model: c.model });

describe("coreChatTurn replays REAL recorded desktop chat turns (M2c harness proof)", () => {
  it("has at least one recorded cassette fixture", () => { expect(files.length).toBeGreaterThan(0); });
  for (const file of files) {
    const c = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
    describe(`${file} (${c.modelTurns.length} turns, tools=[${c.expect.toolSequence.join(",")}])`, () => {
      it("reproduces the recorded tool sequence", async () => {
        expect((await run(c)).observedTools).toEqual(c.expect.toolSequence);
      });
      it("reproduces the recorded final text byte-equal", async () => {
        expect((await run(c)).text).toBe(c.expect.finalText);
      });
      it("reproduces the recorded step count", async () => {
        expect((await run(c)).steps).toBe(c.expect.numTurns);
      });
    });
  }
});
