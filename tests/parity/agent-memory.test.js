import { describe, it, expect } from "vitest";
import { getAgentMem, addAgentNote, recordAgentRun, agentMemoryBlock , getAgentHistory, getAgentStats} from "../../src/bridge/agentMemory.js";

describe("agentMemory — notes", () => {
  it("default record for an unknown agent", () => {
    expect(getAgentMem({}, "a")).toMatchObject({ notes: [], runs: 0 });
  });
  it("adds + trims + dedupes; immutable; capped", () => {
    const s0 = {};
    const s1 = addAgentNote(s0, "a", "  prefers   metric units  ", () => 1);
    expect(getAgentMem(s1, "a").notes).toEqual([{ text: "prefers metric units", ts: 1 }]);
    expect(s0).toEqual({});                                   // original unchanged
    const s2 = addAgentNote(s1, "a", "prefers metric units", () => 2); // duplicate -> no growth
    expect(getAgentMem(s2, "a").notes.length).toBe(1);
    let s = {}; for (let i = 0; i < 50; i++) s = addAgentNote(s, "a", "note " + i, () => i, 40);
    expect(getAgentMem(s, "a").notes.length).toBe(40);        // capped at 40
    expect(getAgentMem(s, "a").notes[39].text).toBe("note 49");
  });
  it("ignores an empty note or missing agent id", () => {
    expect(addAgentNote({}, "a", "   ")).toEqual({});
    expect(addAgentNote({}, "", "hi")).toEqual({});
  });
});

describe("agentMemory — track record", () => {
  it("counts runs, lastRunAt, ok/fail", () => {
    let s = recordAgentRun({}, "a", { ok: true, now: () => 100 });
    s = recordAgentRun(s, "a", { ok: false, now: () => 200 });
    const r = getAgentMem(s, "a");
    expect(r.runs).toBe(2); expect(r.ok).toBe(1); expect(r.fail).toBe(1); expect(r.lastRunAt).toBe(200);
  });
});

describe("agentMemory — injection block", () => {
  it("empty when the agent has no history", () => { expect(agentMemoryBlock({}, "a")).toBe(""); });
  it("includes learnings + the track record", () => {
    let s = addAgentNote({}, "a", "user is based in Berlin", () => 1);
    s = recordAgentRun(s, "a", { now: () => 2 });
    const b = agentMemoryBlock(s, "a");
    expect(b).toContain("user is based in Berlin");
    expect(b).toContain("Track record: 1 prior run");
  });
});

import { describe as d2, it as i2, expect as e2 } from "vitest";
import { recordAgentRun as rar, getAgentHistory as gah, getAgentStats as gas } from "../../src/bridge/agentMemory.js";
d2("agentMemory A1 — run history + stats", () => {
  i2("recordAgentRun keeps a bounded history (<=20), newest last in store / first via getAgentHistory", () => {
    let store = {};
    for (let k = 0; k < 25; k++) store = rar(store, "ag1", { ok: k % 2 === 0, now: () => 1000 + k });
    e2(store.ag1.history.length).toBe(20);
    const hist = gah(store, "ag1");
    e2(hist.length).toBe(20);
    e2(hist[0].at).toBe(1000 + 24); // most recent first
    e2(store.ag1.runs).toBe(25);
  });
  i2("getAgentStats derives runs/ok/fail/lastAt/cleanRate per agent", () => {
    let store = {};
    store = rar(store, "ag2", { ok: true, now: () => 10 });
    store = rar(store, "ag2", { ok: true, now: () => 20 });
    store = rar(store, "ag2", { ok: false, now: () => 30 });
    const st = gas(store);
    e2(st.ag2).toEqual({ runs: 3, ok: 2, fail: 1, lastAt: 30, cleanRate: 67 });
  });
  i2("getAgentHistory is [] for an unknown agent", () => { e2(gah({}, "nope")).toEqual([]); });
});
