import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { coreChatTurn } from "../../core/chat-loop.js";

// ADR-0001 / M2c.0. electron/turn-recorder.cjs captures a real desktop CHAT turn into a replay
// cassette. This proves two things: (1) it is OFF (returns null) unless MADAV_RECORD_TURN is set,
// so the agent-openai.cjs hooks are no-ops by default; (2) the cassette it produces REPLAYS through
// core/chat-loop.js coreChatTurn and reproduces the recorded final text + tool sequence — the
// contract the M2c flag cutover depends on.
const require = createRequire(import.meta.url);
const { makeTurnRecorder, recorderDest } = require("../../electron/turn-recorder.cjs");

// Build a mock chat adapter that replays a cassette (same shape as chat-loop.test.js).
function adapterFromCassette(c) {
  const turns = (c.modelTurns || []).slice();
  const results = {};
  for (const k of Object.keys(c.toolResults || {})) results[k] = c.toolResults[k].slice();
  const events = [];
  return {
    _events: events,
    tools: () => c.tools || [],
    stream: async (_p, _m, _t, { onDelta } = {}) => {
      const t = turns.shift() || { content: "" };
      if (t.content && onDelta) onDelta(t.content);
      return t;
    },
    runTool: async (name) => {
      const q = results[name];
      return q && q.length ? q.shift() : "";
    },
    emit: (e) => events.push(e),
  };
}

let savedEnv;
beforeEach(() => { savedEnv = process.env.MADAV_RECORD_TURN; delete process.env.MADAV_RECORD_TURN; });
afterEach(() => { if (savedEnv === undefined) delete process.env.MADAV_RECORD_TURN; else process.env.MADAV_RECORD_TURN = savedEnv; });

describe("turn-recorder — OFF by default (no behavior change in the engine)", () => {
  it("makeTurnRecorder returns null when MADAV_RECORD_TURN is unset", () => {
    expect(recorderDest()).toBe(null);
    expect(makeTurnRecorder({ model: "x" })).toBe(null);
  });
});

describe("turn-recorder — records a chat turn into a replay cassette", () => {
  it("captures system/input/model/tools, model turns, tool results, and final text", () => {
    const recPath = path.join(os.tmpdir(), "madav-rec-" + Date.now() + "-" + Math.random().toString(36).slice(2) + ".json");
    process.env.MADAV_RECORD_TURN = recPath;
    const rec = makeTurnRecorder({ model: "test-model" });
    expect(rec).toBeTruthy();

    rec.start({ system: "you are helpful", input: "what is 2+2?", model: "test-model", mode: "chat", tools: ["web_search"] });
    rec.step({ content: "Let me search.", toolCalls: [{ id: "c1", name: "web_search", arguments: '{"query":"2+2"}' }] });
    rec.toolResult("web_search", "4 is the answer per the web");
    rec.step({ content: "The answer is 4." });
    const cassette = rec.finish({ text: "The answer is 4.", numTurns: 2 });

    expect(cassette.system).toBe("you are helpful");
    expect(cassette.input).toBe("what is 2+2?");
    expect(cassette.tools).toEqual(["web_search"]);
    expect(cassette.modelTurns).toHaveLength(2);
    expect(cassette.modelTurns[0].tool_calls[0].function).toEqual({ name: "web_search", arguments: '{"query":"2+2"}' });
    expect(cassette.modelTurns[1].tool_calls).toBeUndefined();
    expect(cassette.toolResults.web_search).toEqual(["4 is the answer per the web"]);
    expect(cassette.expect.toolSequence).toEqual(["web_search"]);
    expect(cassette.expect.finalText).toBe("The answer is 4.");

    // The cassette was written to disk and round-trips through JSON.
    const onDisk = JSON.parse(fs.readFileSync(recPath, "utf8"));
    expect(onDisk).toEqual(cassette);
    fs.unlinkSync(recPath);
  });

  it("records text-mode turns using the raw assistant text", () => {
    process.env.MADAV_RECORD_TURN = path.join(os.tmpdir(), "madav-rec-tm-" + Date.now() + ".json");
    const rec = makeTurnRecorder({});
    rec.start({ system: "s", input: "i", mode: "chat" });
    rec.step({ content: "stripped", textMode: true, rawText: "raw with fenced block" });
    const c = rec.finish({ text: "done", numTurns: 1 });
    expect(c.modelTurns[0].content).toBe("raw with fenced block");
    fs.unlinkSync(recorderDest());
  });
});

describe("turn-recorder -> coreChatTurn round-trip (the M2c contract)", () => {
  it("a recorded cassette replays and reproduces the final text + tool sequence", async () => {
    process.env.MADAV_RECORD_TURN = path.join(os.tmpdir(), "madav-rt-" + Date.now() + ".json");
    const rec = makeTurnRecorder({ model: "test-model" });
    rec.start({ system: "you are helpful", input: "what is 2+2?", model: "test-model", mode: "chat", tools: ["web_search"] });
    rec.step({ content: "Let me search.", toolCalls: [{ id: "c1", name: "web_search", arguments: '{"query":"2+2"}' }] });
    rec.toolResult("web_search", "the web says 4");
    rec.step({ content: "The answer is 4." });
    const cassette = rec.finish({ text: "The answer is 4.", numTurns: 2 });
    fs.unlinkSync(recorderDest());

    const adapter = adapterFromCassette(cassette);
    const res = await coreChatTurn({ adapter, prompt: cassette.input, system: cassette.system, model: cassette.model });

    expect(res.text).toBe(cassette.expect.finalText);
    expect(res.observedTools).toEqual(cassette.expect.toolSequence);
    expect(res.steps).toBe(2);
  });
});

describe("turn-recorder — captures the UI event stream (for adapter emit parity)", () => {
  it("records emit events, drops image blobs, trims long strings", () => {
    process.env.MADAV_RECORD_TURN = path.join(os.tmpdir(), "madav-ev-" + Date.now() + ".json");
    const rec = makeTurnRecorder({});
    rec.start({ system: "s", input: "i", mode: "chat" });
    rec.event({ kind: "tool_use", data: { id: "t1", name: "web_search", input: { query: "x" } } });
    rec.event({ kind: "tool_result", data: { id: "t1", output: "y".repeat(1000), image: "data:image/png;base64,AAAA" } });
    rec.event({ kind: "result", data: { subtype: "success" } });
    const c = rec.finish({ text: "done", numTurns: 1 });
    expect(c.events).toHaveLength(3);
    expect(c.events[0]).toEqual({ kind: "tool_use", data: { id: "t1", name: "web_search", input: { query: "x" } } });
    expect(c.events[1].data.image).toBeUndefined();            // base64 image dropped
    expect(c.events[1].data.output.length).toBeLessThan(700);  // long string trimmed
    expect(c.events[1].data.output.endsWith("(trimmed)")).toBe(true);
    fs.unlinkSync(recorderDest());
  });
});
