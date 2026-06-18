// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// electron/turn-recorder.cjs — ADR-0001 / M2c.0. Record-only capture of a REAL desktop CHAT turn
// into a replay "cassette" — the missing recorder half of core/harness/replay.js. It lets us prove
// (in tests) that core/chat-loop.js coreChatTurn reproduces a recorded desktop turn before the
// flag cutover (M2c.3).
//
// ZERO behavior change by default: makeTurnRecorder returns null unless MADAV_RECORD_TURN is set,
// so every `if (rec) rec.x()` hook in agent-openai.cjs is a no-op. Side-effect free at require
// (only fs/path). NEVER require('electron') — keeps this unit-testable off the main process.
//
// Cassette shape (what coreChatTurn replays):
//   { name, recordedAt, model, mode, system, input, tools:[name],
//     modelTurns:[{ content, tool_calls?:[{id,function:{name,arguments}}] }],
//     toolResults:{ name:[resultText] },
//     expect:{ toolSequence:[name], finalText, numTurns } }

const fs = require("fs");
const path = require("path");

// Destination from MADAV_RECORD_TURN: a value ending in .json is the exact output file (may overwrite —
// used by tests / power users); a directory value or a bare flag ("1") writes a UNIQUE timestamped file
// (<dir-or-repoRoot>/desktop-chat-<ts>.json) so no capture is ever overwritten. Null when recording is off.
function recorderDest(name) {
  const v = process.env.MADAV_RECORD_TURN;
  if (!v) return null;
  if (/\.json$/i.test(v)) return path.resolve(v); // explicit file -> exact path (may overwrite; tests + power users)
  const dir = /[\\/]/.test(v) ? path.resolve(v) : path.resolve(__dirname, ".."); // a directory value, else <repoRoot>
  return path.join(dir, (name || "recorded-chat-turn") + ".json"); // unique per turn -> never overwrites a prior capture
}

function makeTurnRecorder({ model = "" } = {}) {
  const name = "desktop-chat-" + new Date().toISOString().replace(/[:.]/g, "-");
  const dest = recorderDest(name);
  if (!dest) return null; // not recording -> caller sees null -> hooks are no-ops

  const cassette = {
    name,
    recordedAt: new Date().toISOString(),
    model, mode: "chat",
    system: "", input: "", tools: [],
    modelTurns: [], toolResults: {}, events: [],
    expect: { toolSequence: [], finalText: "", numTurns: 0 },
  };

  let saved = false;
  function save() {
    if (saved) return cassette; // idempotent across the success / max-steps exit paths
    saved = true;
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const fd = fs.openSync(dest, "w");
      try { fs.writeSync(fd, JSON.stringify(cassette, null, 2)); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      console.log("[madav] turn-recorder: wrote chat cassette -> " + dest +
        " (" + cassette.modelTurns.length + " model turns, " + cassette.expect.toolSequence.length + " tool calls, " + cassette.events.length + " events)");
    } catch (e) {
      console.error("[madav] turn-recorder: failed to write cassette:", (e && e.message) || e);
    }
    return cassette;
  }

  return {
    start({ system = "", input = "", model: m, mode = "chat", tools = [] } = {}) {
      cassette.system = String(system == null ? "" : system);
      cassette.input = String(input == null ? "" : input);
      if (m) cassette.model = m;
      cassette.mode = mode || "chat";
      cassette.tools = Array.isArray(tools) ? tools.slice() : [];
    },
    // One model step, as coreChatTurn's adapter.stream returns it: { content, tool_calls }.
    step({ content = "", toolCalls = [], textMode = false, rawText } = {}) {
      const tool_calls = (Array.isArray(toolCalls) ? toolCalls : []).map((tc) => ({
        id: tc.id, function: { name: tc.name, arguments: tc.arguments },
      }));
      const turn = { content: textMode ? String(rawText == null ? content : rawText) : String(content == null ? "" : content) };
      if (tool_calls.length) turn.tool_calls = tool_calls;
      cassette.modelTurns.push(turn);
    },
    // One tool result (name-keyed FIFO) + the observed execution order.
    toolResult(name, text) {
      const key = String(name == null ? "" : name);
      (cassette.toolResults[key] || (cassette.toolResults[key] = [])).push(String(text == null ? "" : text));
      cassette.expect.toolSequence.push(key);
    },
    // One UI event (desktop emits { kind, data }); trimmed so cassettes stay small.
    event(ev) {
      if (!ev || typeof ev !== "object") return;
      const e = { kind: ev.kind };
      if (ev.data && typeof ev.data === "object") {
        const d = {};
        for (const [k, v] of Object.entries(ev.data)) {
          if (k === "image") continue; // drop base64 image blobs
          d[k] = (typeof v === "string" && v.length > 600) ? (v.slice(0, 600) + "…(trimmed)") : v;
        }
        e.data = d;
      } else if (ev.data !== undefined) { e.data = ev.data; }
      cassette.events.push(e);
    },
    finish({ text = "", numTurns = 0, capped = false } = {}) {
      cassette.expect.finalText = String(text == null ? "" : text);
      cassette.expect.numTurns = numTurns;
      if (capped) cassette.expect.capped = true;
      return save();
    },
    _cassette: cassette, // in-memory handle for unit tests (no file needed)
  };
}

module.exports = { makeTurnRecorder, recorderDest };
