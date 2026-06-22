import { describe, it, expect } from "vitest";
import { createRunGuard, guardStopMessage } from "../../core/run-guard.js";

describe("run-guard — a run can never hang", () => {
  it("stops on the wall-clock cap", () => {
    let t = 0; const now = () => t;
    const g = createRunGuard({ maxMs: 1000, now });
    expect(g.check().stop).toBe(false);
    t = 999; expect(g.check().stop).toBe(false);
    t = 1000; const r = g.check(); expect(r.stop).toBe(true); expect(r.code).toBe("time");
  });
  it("stops on the step cap when enabled", () => {
    const g = createRunGuard({ maxMs: 0, maxSteps: 3 });
    g.note("a"); g.note("b"); g.note("c");
    const r = g.check(); expect(r.stop).toBe(true); expect(r.code).toBe("steps");
  });
  it("detects a tight loop (same signature repeated)", () => {
    const g = createRunGuard({ maxMs: 0, maxRepeat: 3 });
    expect(g.note("run_bash").stop).toBe(false);
    expect(g.note("run_bash").stop).toBe(false);
    const r = g.note("run_bash"); expect(r.stop).toBe(true); expect(r.code).toBe("loop");
  });
  it("does not false-trip on varied steps", () => {
    const g = createRunGuard({ maxMs: 0, maxRepeat: 3 });
    expect(g.note("read_file").stop).toBe(false);
    expect(g.note("run_bash").stop).toBe(false);
    expect(g.note("write_file").stop).toBe(false);
    expect(g.note("run_bash").stop).toBe(false);
  });
  it("never stops when all caps are disabled", () => {
    const g = createRunGuard({ maxMs: 0, maxSteps: 0, maxRepeat: 0 });
    for (let i = 0; i < 50; i++) g.note("x");
    expect(g.check().stop).toBe(false);
  });
  it("gives a plain-English reason for each stop code", () => {
    for (const c of ["time", "steps", "loop", "whatever"]) {
      expect(typeof guardStopMessage(c)).toBe("string");
      expect(guardStopMessage(c).length).toBeGreaterThan(10);
    }
  });
});
