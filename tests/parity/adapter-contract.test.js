import { describe, it, expect } from "vitest";
import { ADAPTER_SPEC, validateAdapter, assertAdapter } from "../../core/adapter.contract.js";

function makeComplete() {
  const a = {};
  for (const [ns, methods] of Object.entries(ADAPTER_SPEC)) {
    a[ns] = {};
    for (const m of methods) a[ns][m] = () => {};
  }
  return a;
}

describe("platform adapter contract", () => {
  it("a complete adapter validates", () => {
    const r = validateAdapter(makeComplete());
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("reports a missing method", () => {
    const a = makeComplete();
    delete a.exec.run;
    const r = validateAdapter(a);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("exec.run");
  });

  it("reports a missing namespace", () => {
    const a = makeComplete();
    delete a.fs;
    const r = validateAdapter(a);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("fs (namespace)");
  });

  it("assertAdapter throws on incomplete and returns the complete one", () => {
    expect(() => assertAdapter({})).toThrow(/incomplete/);
    const good = makeComplete();
    expect(assertAdapter(good)).toBe(good);
  });

  it("rejects non-objects", () => {
    expect(validateAdapter(null).ok).toBe(false);
    expect(validateAdapter(undefined).ok).toBe(false);
  });
});
