// Madav shared-core — TURN-REPLAY HARNESS (the migration linchpin).
//
// Why this exists: migrating the validated desktop engine into the shared core is the
// riskiest work in the program, and this environment has no live app to validate against.
// A "cassette" captures one turn deterministically — system prompt, user input, the model's
// scripted steps (text / tool calls), and the tool results. `replay()` drives a runTurn-like
// function with a MOCK model + MOCK adapter and reports the observed adapter-call sequence and
// final text, so we can ASSERT a migrated core reproduces recorded desktop behavior — measured,
// not eyeballed. See docs/adr/0001-architecture.md.
//
// Pure + dependency-free except the adapter contract. The desktop *recorder* that produces real
// cassettes is a separate, permission-gated step (it touches electron/**) and is NOT here.

import { ADAPTER_SPEC } from "../adapter.contract.js";

/**
 * A scripted model. Each call returns the next step in order.
 * step = { text?: string, toolCall?: { name: string, input: any } }
 */
export function createMockModel(steps) {
  let i = 0;
  return async function model(/* messages */) {
    const step = steps[i] || { text: "" };
    i += 1;
    return { text: step.text || "", toolCall: step.toolCall || null };
  };
}

/**
 * A mock adapter implementing ADAPTER_SPEC. Every method records "ns.method" into `_calls`
 * (the observed tool sequence) and returns the next scripted result for that key (FIFO),
 * or a benign default. `results` is keyed by "ns.method", e.g. { "exec.run": [{stdout:"1"}] }.
 */
export function createMockAdapter(results = {}) {
  const calls = [];
  const queues = {};
  for (const k of Object.keys(results)) queues[k] = results[k].slice();
  const adapter = { _calls: calls };
  for (const [ns, methods] of Object.entries(ADAPTER_SPEC)) {
    adapter[ns] = {};
    for (const m of methods) {
      const key = `${ns}.${m}`;
      adapter[ns][m] = async (..._args) => {
        calls.push(key);
        const q = queues[key];
        if (q && q.length) return q.shift();
        return defaultFor(key);
      };
    }
  }
  return adapter;
}

function defaultFor(key) {
  switch (key) {
    case "env.now": return 0;
    case "env.randomId": return "id_0";
    case "exec.run": return { stdout: "", stderr: "", code: 0 };
    case "net.fetch": return { status: 200, text: "" };
    case "fs.exists": return false;
    case "fs.readFile": return "";
    case "fs.listDir": return [];
    default: return null;
  }
}

/** Drive `runTurn` with the cassette's mock model + adapter; return what happened. */
export async function replay(cassette, runTurn) {
  const model = createMockModel(cassette.modelSteps || []);
  const adapter = createMockAdapter(cassette.toolResults || {});
  const finalText = await runTurn({
    model,
    adapter,
    system: cassette.system || "",
    input: cassette.input || "",
  });
  return {
    finalText: finalText == null ? "" : String(finalText),
    observedToolSequence: adapter._calls.slice(),
  };
}

/** Assert `runTurn` reproduces the cassette's `expect` { toolSequence?, finalText? }; throws on drift. */
export async function assertReplay(cassette, runTurn) {
  const exp = cassette.expect || {};
  const got = await replay(cassette, runTurn);
  const mismatches = [];
  if (exp.toolSequence && !arrayEq(exp.toolSequence, got.observedToolSequence)) {
    mismatches.push(`tool sequence: expected [${exp.toolSequence.join(", ")}] got [${got.observedToolSequence.join(", ")}]`);
  }
  if (exp.finalText != null && exp.finalText !== got.finalText) {
    mismatches.push(`final text: expected ${JSON.stringify(exp.finalText)} got ${JSON.stringify(got.finalText)}`);
  }
  if (mismatches.length) {
    throw new Error(`replay drift for "${cassette.name || "cassette"}": ` + mismatches.join("; "));
  }
  return got;
}

function arrayEq(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
