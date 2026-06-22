import { describe, it, expect } from "vitest";
import { decideLane, LANE } from "../../core/project-lanes.js";

describe("project lanes — route by what the task needs, safely", () => {
  it("A: a from-scratch document with no data files -> engine", () => {
    expect(decideLane({ task: "build a 12-month budget template", hasDataFiles: false })).toBe(LANE.DOCUMENT);
    expect(decideLane({ task: "create a SaaS unit economics model", hasDataFiles: false })).toBe(LANE.DOCUMENT);
    expect(decideLane({ task: "make a one-pager on our roadmap", hasDataFiles: false })).toBe(LANE.DOCUMENT);
  });
  it("C: real data work (folder has files + a data task) -> caged agent loop", () => {
    expect(decideLane({ task: "execute the DTC report for March", hasDataFiles: true })).toBe(LANE.IMPROVISE);
    expect(decideLane({ task: "reconcile these files", hasDataFiles: true })).toBe(LANE.IMPROVISE);
    expect(decideLane({ task: "analyze sales.csv", hasDataFiles: true })).toBe(LANE.IMPROVISE);
  });
  it("B: a saved recipe always wins", () => {
    expect(decideLane({ task: "execute the DTC report", hasDataFiles: true, recipe: { id: "r1" } })).toBe(LANE.JOB);
    expect(decideLane({ task: "build a budget template", recipe: { id: "r2" } })).toBe(LANE.JOB);
  });
  it("SAFETY: a document ask with data files present is NOT routed to the engine (might need the data)", () => {
    expect(decideLane({ task: "build a report", hasDataFiles: true })).toBe(LANE.IMPROVISE);
    expect(decideLane({ task: "create a spreadsheet", hasDataFiles: true })).toBe(LANE.IMPROVISE);
  });
  it("defaults to the caged loop when unsure", () => {
    expect(decideLane({ task: "do the thing", hasDataFiles: false })).toBe(LANE.IMPROVISE);
    expect(decideLane({ task: "", hasDataFiles: false })).toBe(LANE.IMPROVISE);
  });
});
