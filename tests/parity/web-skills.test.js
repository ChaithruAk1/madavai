import { describe, it, expect } from "vitest";
import { mergeSkills } from "../../src/webSkills.js";

const B = [{ dir: "bundled:edge", name: "EdgeTrader", description: "trade", body: "B", enabled: true }];
describe("webSkills mergeSkills (SK1) — bundled + user + prefs", () => {
  it("merges bundled + user; flags origin; both enabled by default", () => {
    const out = mergeSkills(B, [{ dir: "user/x", name: "Mine", description: "d", body: "U" }], {});
    expect(out.length).toBe(2);
    expect(out.find((s) => s.dir === "user/x")).toMatchObject({ user: true, bundled: false, enabled: true });
    expect(out.find((s) => s.dir === "bundled:edge")).toMatchObject({ bundled: true, enabled: true });
  });
  it("a user skill on the same dir overrides the bundled one", () => {
    const out = mergeSkills(B, [{ dir: "bundled:edge", name: "EdgeTrader", body: "OVER" }], {});
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ body: "OVER", user: true });
  });
  it("prefs.enabled=false benches a skill (bundled or user)", () => {
    expect(mergeSkills(B, [], { "bundled:edge": { enabled: false } })[0].enabled).toBe(false);
  });
  it("sorts by name", () => {
    const out = mergeSkills([{ dir: "b", name: "Zeta" }, { dir: "a", name: "Alpha" }], [], {});
    expect(out.map((s) => s.name)).toEqual(["Alpha", "Zeta"]);
  });
  it("tolerates empty/garbage input", () => {
    expect(mergeSkills(null, null, null)).toEqual([]);
    expect(mergeSkills(B, [{ name: "no dir" }], {}).length).toBe(1); // user entry without dir is dropped
  });
});
