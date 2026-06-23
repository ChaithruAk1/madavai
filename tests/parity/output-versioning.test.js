// Output versioning: every run keeps its OWN file, named <stem>_DDMMYYYY_HHMMSS.<ext>, in the same
// folder (old files never moved/deleted). Replay must still recognise a job across different timestamps.
import { describe, it, expect } from "vitest";
import { datedName, outputBase, validateOutputs } from "../../core/project-job.js";

const D = new Date(2026, 5, 23, 14, 30, 5); // 23 Jun 2026 14:30:05

describe("output versioning", () => {
  it("date+time stamp, same folder", () => {
    expect(datedName("Report.xlsx", D)).toBe("Report_23062026_143005.xlsx");
    expect(datedName("DTC_Summary.csv", D)).toBe("DTC_Summary_23062026_143005.csv");
  });
  it("same-second collision adds a counter", () => {
    expect(datedName("Report.xlsx", D, 2)).toBe("Report_23062026_143005_2.xlsx");
  });
  it("outputBase strips the stamp (date+time, date-only, or +counter)", () => {
    expect(outputBase("Report_23062026_143005.xlsx")).toBe("report.xlsx");
    expect(outputBase("Report_23062026.xlsx")).toBe("report.xlsx");
    expect(outputBase("Report_23062026_143005_2.xlsx")).toBe("report.xlsx");
    expect(outputBase("Report.xlsx")).toBe("report.xlsx");
  });
  it("replay validates the same deliverable across different timestamps", () => {
    expect(validateOutputs({ outputs: ["Report_22062026_090000.xlsx"] }, ["Report_23062026_143005.xlsx"]).ok).toBe(true);
    expect(validateOutputs({ outputs: ["Report.xlsx"] }, ["Wrong.xlsx"]).ok).toBe(false);
  });
});
