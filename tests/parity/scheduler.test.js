import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { makeScheduler } from "../../server/scheduler.mjs";

function fakeStore() {
  const cols = {};
  const mk = (name) => { const arr = cols[name] || (cols[name] = []); return {
    all: async () => arr.slice(),
    get: async (id) => arr.find((x) => x.id === id) || null,
    insert: async (d) => { arr.push(d); return d; },
    update: async (id, patch) => { const x = arr.find((y) => y.id === id); if (!x) return null; Object.assign(x, patch); return x; },
    remove: async (id) => { const i = arr.findIndex((y) => y.id === id); if (i >= 0) arr.splice(i, 1); return true; },
  }; };
  const users = {};
  return { col: mk, getUser: async (id) => users[id] || null, _cols: cols, _users: users };
}
const NOW = 1_700_000_000_000;
const dueTask = (over = {}) => ({ id: "tsk_1", userId: "u1", prompt: "do it", model: "x:free", provider: "starter", enabled: true, intervalMs: 15 * 60000, nextRunAt: NOW - 1, ...over });
const base = (store, over = {}) => makeScheduler({ store, providerCallFor: async () => "RESULT", getUser: (id) => store.getUser(id), statusOf: () => ({ status: "active" }), now: () => NOW, ...over });

describe("scheduler (S3b) — claim-first single-shot runner", () => {
  it("runs a DUE task and records an ok run with output", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" }; store._cols.tasks = [dueTask()];
    await base(store).tick();
    expect(store._cols.runs.length).toBe(1);
    expect(store._cols.runs[0]).toMatchObject({ taskId: "tsk_1", userId: "u1", ok: true, output: "RESULT" });
  });
  it("claims FIRST: a second immediate tick does not double-run", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" }; store._cols.tasks = [dueTask()];
    const sch = base(store);
    await sch.tick(); await sch.tick();
    expect(store._cols.runs.length).toBe(1);
    expect(store._cols.tasks[0].nextRunAt).toBeGreaterThan(NOW);
  });
  it("provider error -> ok:false run; the tick keeps going", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" }; store._cols.tasks = [dueTask()];
    await base(store, { providerCallFor: async () => { throw new Error("boom"); } }).tick();
    expect(store._cols.runs[0]).toMatchObject({ ok: false });
    expect(store._cols.runs[0].error).toMatch(/boom/);
  });
  it("daily quota: at the cap the task is skipped (no new run)", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" }; store._cols.tasks = [dueTask()];
    store._cols.runs = Array.from({ length: 3 }, (_, i) => ({ id: "r" + i, taskId: "old", userId: "u1", startedAt: NOW }));
    await base(store, { dailyCap: 3 }).tick();
    expect(store._cols.runs.length).toBe(3);
  });
  it("plan gate: an expired user is skipped", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" }; store._cols.tasks = [dueTask()];
    await base(store, { statusOf: () => ({ status: "expired" }) }).tick();
    expect((store._cols.runs || []).length).toBe(0);
  });
  it("ignores not-due and disabled tasks", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" };
    store._cols.tasks = [dueTask({ id: "a", nextRunAt: NOW + 60000 }), dueTask({ id: "b", enabled: false })];
    const n = await base(store).tick();
    expect(n).toBe(0);
    expect((store._cols.runs || []).length).toBe(0);
  });
  it("ring-buffers runs to <=50 per task", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" };
    const sch = base(store, { dailyCap: 100000 });
    for (let i = 0; i < 55; i++) await sch.runDue(dueTask());
    expect(store._cols.runs.filter((r) => r.taskId === "tsk_1").length).toBe(50);
  });
  it("force bypasses the gates (records a run even when expired)", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" };
    const run = await base(store, { statusOf: () => ({ status: "expired" }), providerCallFor: async () => "F" }).runDue(dueTask(), { force: true });
    expect(run).toMatchObject({ ok: true, output: "F" });
  });
});

describe("scheduler (S4) — schedule-aware claim", () => {
  it("claims the schedule's true next fire (daily in tz), not a flat interval", async () => {
    const store = fakeStore(); store._users.u1 = { id: "u1" };
    const noon = Date.UTC(2026, 0, 1, 12, 0);
    store._cols.tasks = [dueTask({ schedule: { mode: "daily", time: "09:00" }, tz: "UTC", nextRunAt: noon - 1000 })];
    await base(store, { now: () => noon }).tick();
    expect(store._cols.runs.length).toBe(1);
    expect(store._cols.tasks[0].nextRunAt).toBe(Date.UTC(2026, 0, 2, 9, 0)); // tomorrow 09:00 UTC, not noon+15m
  });
});

describe("scheduler.mjs — no agent/tool drift (R7)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.resolve(here, "../../server/scheduler.mjs"), "utf8");
  it("imports only task-run (no mcp/connector/agent/research/rag)", () => {
    expect(src).toMatch(/from "\.\/task-run\.mjs"/);
    expect(src).not.toMatch(/mcp-broker|connector-|agentMemory|deepResearch|ragLite/);
  });
  it("never calls tools or agent loops", () => {
    expect(src).not.toMatch(/listTools|callTool|executeTool|runAgentTurn|runTeamTurn/);
  });
});
