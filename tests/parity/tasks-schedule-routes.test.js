import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

// S4: the server stores the shared-UI's rich task fields and derives enabled + nextRunAt from the schedule.
describe("S4 — server schedule normalization (route contract)", () => {
  it("imports the tz-aware scheduler helpers", () => {
    expect(src).toMatch(/from "\.\/schedule-next\.mjs"/);
    expect(src).toMatch(/computeNextRunAt/);
    expect(src).toMatch(/sanitizeSchedule/);
  });
  it("normalizeTaskInput persists the rich fields + derives enabled/nextRunAt", () => {
    const seg = src.slice(src.indexOf("function normalizeTaskInput"), src.indexOf("function normalizeTaskInput") + 1500);
    for (const k of ["name", "description", "schedule", "target", "permission", "group", "tz"]) expect(seg).toContain(k);
    expect(seg).toMatch(/enabled = isActiveSchedule\(schedule\) && !!prompt/);
    expect(seg).toMatch(/computeNextRunAt\(schedule, now, tz\)/);
  });
  it("POST + PUT both route through the normalizer (drafts allowed)", () => {
    expect(src).toMatch(/normalizeTaskInput\(b, null, now\)/);          // POST (draft allowed)
    expect(src).toMatch(/normalizeTaskInput\(b, cur, Date\.now\(\)\)/); // PUT (merge over cur)
  });
  it("target is allow-listed (no arbitrary object persisted)", () => {
    const seg = src.slice(src.indexOf("function sanitizeTaskTarget"), src.indexOf("function sanitizeTaskTarget") + 400);
    expect(seg).toMatch(/"chat", "project", "agent", "team", "play", "folder", "brief"/);
  });
});
