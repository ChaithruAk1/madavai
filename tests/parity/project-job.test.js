import { describe, it, expect } from "vitest";
import { schemaSignature, makeJob, findJob, decideRun, upsertJob, validateOutputs } from "../../core/project-job.js";
import { runProjectJob } from "../../core/project-runner.js";

describe("project-job — fingerprints & replay/author decision", () => {
  const A = [{ file: "Submitted.xlsx", columns: ["Number", "Priority"] }, { file: "Resolved.xlsx", columns: ["Number", "Resolved By"] }];
  const A2 = [{ file: "Resolved.xlsx", columns: ["Resolved By", "Number"] }, { file: "Submitted.xlsx", columns: ["Priority", "Number"] }];
  const B = [{ file: "Submitted.xlsx", columns: ["Number", "Priority", "NEWCOL"] }, { file: "Resolved.xlsx", columns: ["Number", "Resolved By"] }];
  const job = (() => { const j = makeJob({ task: "DTC report for March 2026", instructions: "3 sheets", schema: A, script: "print(1)", outputs: ["Report.xlsx"] }); j.status = "active"; return j; })();
  it("schema signature ignores order/values (new month = same shape)", () => { expect(schemaSignature(A)).toBe(schemaSignature(A2)); });
  it("schema signature catches an added/renamed column", () => { expect(schemaSignature(A)).not.toBe(schemaSignature(B)); });
  it("finds the job across months (same task key)", () => { expect(findJob(upsertJob([], job), "DTC report for April 2026")).not.toBe(null); });
  it("replays when nothing changed", () => { expect(decideRun(job, "3 sheets", A).action).toBe("replay"); });
  it("re-authors on instruction change", () => { expect(decideRun(job, "4 sheets", A).action).toBe("author"); });
  it("re-authors on schema change", () => { expect(decideRun(job, "3 sheets", B).action).toBe("author"); });
  it("authors when no job / unconfirmed", () => { expect(decideRun(null, "x", A).action).toBe("author"); expect(decideRun({ ...job, status: "provisional" }, "3 sheets", A).action).toBe("author"); });
  it("replays even after its own output file lands in the folder", () => {
    const j = makeJob({ task: "rep", instructions: "i", schema: A, script: "p", outputs: ["Report.xlsx"] }); j.status = "active";
    const withOut = [...A, { file: "Report.xlsx", columns: ["x"] }];
    expect(decideRun(j, "i", withOut).action).toBe("replay");
  });
  it("validates expected outputs", () => { expect(validateOutputs(job, ["Report.xlsx"]).ok).toBe(true); expect(validateOutputs(job, ["x.xlsx"]).ok).toBe(false); });
});

describe("project-runner — shared flow (fake adapters, single source for web+desktop)", () => {
  const schema = [{ file: "Submitted.xlsx", columns: ["Number", "Priority"] }];
  function mk(over = {}) {
    let saved = over.jobs || []; const calls = { author: 0 };
    return { calls, get saved() { return saved; }, model: "deepseek", provider: "X",
      inspect: async () => schema, loadJobs: async () => saved, saveJobs: async (j) => { saved = j; },
      author: async () => { calls.author++; return { script: "print(1)", outputs: ["Report.xlsx"] }; },
      run: over.run || (async () => ({ ok: true, produced: ["Report.xlsx"] })), emit: () => {} };
  }
  const activeJob = () => { const j = makeJob({ task: "DTC March", instructions: "3 sheets", schema, script: "print(1)", outputs: ["Report.xlsx"] }); j.status = "active"; return j; };
  it("authors + saves an active (reusable) job when none exists", async () => {
    const a = mk(); const r = await runProjectJob({ task: "DTC March", instructions: "3 sheets", folder: "/x" }, a);
    expect(r.mode).toBe("authored"); expect(a.saved[0].status).toBe("active"); expect(a.calls.author).toBe(1);
  });
  it("replays an active job on a new month WITHOUT calling the model", async () => {
    const b = mk({ jobs: upsertJob([], activeJob()) }); const r = await runProjectJob({ task: "DTC April", instructions: "3 sheets", folder: "/x" }, b);
    expect(r.mode).toBe("replay"); expect(b.calls.author).toBe(0);
  });
  it("re-authors when instructions change", async () => {
    const c = mk({ jobs: upsertJob([], activeJob()) }); const r = await runProjectJob({ task: "DTC April", instructions: "4 sheets now", folder: "/x" }, c);
    expect(r.mode).toBe("authored"); expect(c.calls.author).toBe(1);
  });
  it("repairs once then succeeds", async () => {
    let n = 0; const d = mk({ run: async () => { n++; return n === 1 ? { ok: false, error: "KeyError" } : { ok: true, produced: ["Report.xlsx"] }; } });
    const r = await runProjectJob({ task: "DTC March", instructions: "3 sheets", folder: "/x" }, d);
    expect(r.ok).toBe(true); expect(d.calls.author).toBe(2);
  });
  it("self-heals to authoring when a replay produces nothing", async () => {
    let n = 0; const e = mk({ jobs: upsertJob([], activeJob()), run: async () => { n++; return n === 1 ? { ok: true, produced: [] } : { ok: true, produced: ["Report.xlsx"] }; } });
    const r = await runProjectJob({ task: "DTC April", instructions: "3 sheets", folder: "/x" }, e);
    expect(r.mode).toBe("authored");
  });
});
