import { describe, it, expect } from "vitest";
import { replay, assertReplay } from "../../core/harness/replay.js";

// A tiny reference runTurn standing in for the real core during Phase 0: ask the model; if it
// returns a tool call, run it via the adapter and loop; otherwise return the text.
async function toyRunTurn({ model, adapter }) {
  for (let i = 0; i < 8; i++) {
    const out = await model();
    if (out.toolCall) { await adapter.exec.run(out.toolCall.input); continue; }
    return out.text;
  }
  return "";
}

const cassette = {
  name: "toy-exec",
  system: "you are a tool runner",
  input: "run it",
  modelSteps: [
    { toolCall: { name: "exec", input: { code: "print(1)" } } },
    { text: "done: 1" },
  ],
  toolResults: { "exec.run": [{ stdout: "1", stderr: "", code: 0 }] },
  expect: { toolSequence: ["exec.run"], finalText: "done: 1" },
};

describe("turn-replay harness", () => {
  it("replays a turn and reports the observed sequence + final text", async () => {
    const got = await replay(cassette, toyRunTurn);
    expect(got.observedToolSequence).toEqual(["exec.run"]);
    expect(got.finalText).toBe("done: 1");
  });

  it("assertReplay passes when behavior matches the cassette", async () => {
    await expect(assertReplay(cassette, toyRunTurn)).resolves.toBeTruthy();
  });

  it("DETECTS a wrong final text (drift)", async () => {
    const wrong = async () => "WRONG ANSWER";
    await expect(assertReplay(cassette, wrong)).rejects.toThrow(/final text/);
  });

  it("DETECTS a wrong tool sequence (drift)", async () => {
    async function extraTool({ adapter }) {
      await adapter.exec.run({});
      await adapter.exec.run({}); // one tool call too many
      return "done: 1";
    }
    await expect(assertReplay(cassette, extraTool)).rejects.toThrow(/tool sequence/);
  });
});
