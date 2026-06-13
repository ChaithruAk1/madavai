// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Automated tests for the observability backend (trace-store + alerts). Runs under plain Node
// (no Electron) by stubbing the `electron` module. Run:  node test/observability.test.cjs
const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

// --- Stub `electron` BEFORE requiring the modules under test ---
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "madav-obs-"));
const notifications = [];
let fetchCalls = [];
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request) {
  if (request === "electron") {
    return {
      app: { getPath: () => TMP },
      Notification: class { constructor(o) { this.o = o; } static isSupported() { return true; } show() { notifications.push(this.o); } },
      safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(String(s)), decryptString: (b) => Buffer.from(b).toString() },
    };
  }
  return origLoad.apply(this, arguments);
};
global.fetch = async (url, opts) => { fetchCalls.push({ url, opts }); return { ok: true, json: async () => ({ ok: true }) }; };

const trace = require("../electron/trace-store.cjs");
const alerts = require("../electron/alerts.cjs");

let passed = 0;
const ok = (name) => { console.log("  ✓ " + name); passed++; };

trace.clear();

// 1) A successful run is recorded with steps, tokens, and a positive cloud cost.
(() => {
  const sid = "s1";
  const turn = { model: "claude-sonnet-4", provider: "Anthropic", mode: "cowork", promptChars: 4000, replyChars: 2000 };
  trace.onEvent(sid, "init", { model: turn.model, provider: turn.provider, mode: turn.mode });
  trace.onEvent(sid, "tool_use", { id: "t1", name: "read_file" });
  trace.onEvent(sid, "tool_result", { id: "t1", output: "ok" });
  trace.onEvent(sid, "result", { subtype: "success" }, turn);
  const runs = trace.list();
  assert.strictEqual(runs.length, 1, "one run recorded");
  const r = runs[0];
  assert.strictEqual(r.status, "ok");
  assert.strictEqual(r.steps.length, 1);
  assert.strictEqual(r.tokens, Math.round(6000 / 4)); // ~4 chars/token
  assert.ok(r.costUSD > 0, "cloud run has cost > 0");
  assert.ok(r.steps[0].durationMs >= 0);
  ok("successful run: steps + tokens + cost recorded");
})();

// 2) An errored run is captured as status:error with the message.
(() => {
  const sid = "s2";
  trace.onEvent(sid, "init", { model: "gpt-4o", provider: "OpenAI", mode: "chat" });
  trace.onEvent(sid, "error", { message: "boom" }, { model: "gpt-4o", provider: "OpenAI", mode: "chat", promptChars: 100, replyChars: 0 });
  const r = trace.list()[0];
  assert.strictEqual(r.status, "error");
  assert.ok(/boom/.test(r.error));
  ok("errored run: status=error + message captured");
})();

// 3) Local-model runs are $0 and counted as savings vs cloud price.
(() => {
  const sid = "s3";
  const turn = { model: "qwen2.5-coder", provider: "Ollama (local)", mode: "code", promptChars: 8000, replyChars: 4000 };
  trace.onEvent(sid, "init", { model: turn.model, provider: turn.provider, mode: turn.mode });
  trace.onEvent(sid, "result", { subtype: "success" }, turn);
  const r = trace.list()[0];
  assert.strictEqual(r.costUSD, 0, "local run costs $0");
  assert.strictEqual(r.local, true);
  const sum = trace.summary(0);
  assert.ok(sum.localSavedUSD > 0, "local savings tracked");
  assert.strictEqual(sum.errors, 1, "summary counts the one error");
  assert.ok(sum.latencyP50 >= 0 && sum.latencyP99 >= 0);
  ok("local run: $0 cost + savings + summary aggregates");
})();

// 4) Cost is deterministic from the pricing table.
(() => {
  assert.strictEqual(trace.costUSD("gpt-4o", 1e6, 1e6, false), 12.5); // 2.5 in + 10 out
  assert.strictEqual(trace.costUSD("gpt-4o", 1e6, 1e6, true), 0);     // local override
  assert.strictEqual(trace.costUSD("totally-unknown-model", 1e6, 1e6, false), 0); // unknown → $0
  ok("cost calc: deterministic + unknown/local => $0");
})();

// 5) Alerts fire a desktop notification on an errored run.
(() => {
  notifications.length = 0;
  alerts.onRunFinalized({ status: "error", error: "kaboom", model: "gpt-4o", mode: "chat", durationMs: 100, costUSD: 0 });
  assert.strictEqual(notifications.length, 1, "one notification fired on error");
  assert.ok(/failed/i.test(notifications[0].title));
  ok("alerts: desktop notification fires on errored run");
})();

// 6) Alerts fire on a failed scheduled task.
(() => {
  notifications.length = 0;
  alerts.onTaskResult({ name: "Nightly digest" }, { status: "error", output: "provider down" });
  assert.strictEqual(notifications.length, 1);
  assert.ok(/Nightly digest/.test(notifications[0].title));
  ok("alerts: notification fires on failed scheduled task");
})();

console.log(`\nAll ${passed} observability tests passed.`);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
