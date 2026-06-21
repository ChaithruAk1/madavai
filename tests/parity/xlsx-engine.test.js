import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTemplateWorkbook } from "../../src/doc/xlsxTemplate.js";
import { injectCharts } from "../../src/doc/xlsxChart.js";

// The deterministic Excel engine must be BULLETPROOF: a values-only spec renders clean; a spec that
// (mis)uses labels/bare-names where a number/reference belongs can NEVER produce a formula Excel rejects;
// per-row "inputs" carry their own format; and charts bind to their data even across sheets.
const spec = {
  type: "xlsx", name: "t.xlsx", sheets: [
    { name: "Assumptions", title: "Assumptions", inputs: [
      { label: "Starting MRR", value: 25000, fmt: "usd" },
      { label: "Monthly Churn", value: 0.035, fmt: "pct" },   // must render 3.5%, not 0.035
      { label: "New Customers", value: 12, fmt: "num" },
    ] },
    { name: "Projection",
      columns: [{ key: "month", header: "Month" }, { key: "mrr", header: "MRR", fmt: "usd" }],
      rows: [{ month: "M1", mrr: 10000 }, { month: "M2", mrr: 11500 }, { month: "M3", mrr: 12925 }],
      charts: [{ type: "line", title: "MRR", x: "month", series: [{ col: "mrr" }] }] },
    { name: "Summary", title: "SaaS Unit Economics", kpis: [
      { label: "LTV", value: 1600, fmt: "usd" },
      { label: "CAC", value: 800, fmt: "usd" },
      { label: "LTV:CAC", value: 2, fmt: "mult" },
      { label: "Bad", value: "CAC:LTV Ratio", fmt: "num" },   // a LABEL where a number belongs
    ], charts: [{ type: "line", title: "MRR (dashboard)", x: "month", series: [{ col: "mrr" }] }] }, // cross-sheet -> Projection
    { name: "BadF", derived: [{ label: "x", expr: "ending_mrr" }, { label: "y", expr: "gross_margin_pu Months" }] }, // bare names
  ],
};
const isFormula = (v) => !!(v && typeof v === "object" && v.formula != null);

describe("xlsxTemplate — values-only build is bulletproof", () => {
  it("writes KPI tiles as literal numbers", () => {
    const { wb } = buildTemplateWorkbook(ExcelJS, spec, {});
    const sw = wb.getWorksheet("Summary");
    expect(sw.getCell("B3").value).toBe(1600);
    expect(typeof sw.getCell("B3").value).toBe("number");
  });

  it("a label/bare-name where a number belongs becomes a literal 0 — NEVER a broken formula", () => {
    const { wb } = buildTemplateWorkbook(ExcelJS, spec, {});
    const bad = wb.getWorksheet("Summary").getCell("E7").value;   // KPI value "CAC:LTV Ratio"
    expect(isFormula(bad)).toBe(false);
    expect(bad).toBe(0);
    const x = wb.getWorksheet("BadF").getCell("B4").value;        // derived expr "ending_mrr"
    expect(isFormula(x)).toBe(false);
    expect(x).toBe(0);
  });

  it("inputs render as a per-row label/value list, each value keeping its own format", () => {
    const { wb } = buildTemplateWorkbook(ExcelJS, spec, {});
    const as = wb.getWorksheet("Assumptions");
    expect(as.getCell("B3").value).toBe(25000);     // Starting MRR
    expect(as.getCell("B4").value).toBe(0.035);     // Churn stored as 0.035…
    expect(String(as.getCell("B4").numFmt)).toContain("%"); // …but FORMATTED as a percent
  });

  it("resolves charts (incl. cross-sheet), puts them on one Charts sheet, re-opens cleanly", async () => {
    const { wb, charts } = buildTemplateWorkbook(ExcelJS, spec, {});
    expect(charts.length).toBe(2);                  // Projection chart + the Summary->Projection cross-sheet chart
    expect(wb.getWorksheet("Charts")).toBeTruthy(); // every chart lives on the dedicated Charts sheet
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);                        // throws if the base .xlsx is structurally malformed
    expect(wb2.getWorksheet("Projection").getCell("B4").value).toBe(10000);
    const withChart = await injectCharts(buf, charts);
    expect(withChart.byteLength).toBeGreaterThan(buf.byteLength); // native-chart injection runs + adds parts
  });

  it("forces recalc on open (fullCalcOnLoad) so formula cells and charts aren't blank until F9", async () => {
    const { wb, charts } = buildTemplateWorkbook(ExcelJS, spec, {});
    let buf = await wb.xlsx.writeBuffer();
    buf = await injectCharts(buf, charts);
    const JSZip = (await import("jszip")).default;
    const wx = await (await JSZip.loadAsync(buf)).file("xl/workbook.xml").async("string");
    expect(/fullCalcOnLoad="1"/.test(wx)).toBe(true);
  });

  it("compiles metric relationships into live Excel formulas (the formula-driven path)", () => {
    const fspec = { type: "xlsx", name: "f.xlsx", sheets: [
      { name: "Assumptions", title: "Assumptions", inputs: [
        { id: "start_mrr", label: "Starting MRR", value: 25000, fmt: "usd" },
        { id: "growth", label: "Monthly Growth", value: 0.05, fmt: "pct" },
      ] },
      { name: "Projection", title: "Projection", periods: { count: 3, label: "M%d" }, metrics: [
        { id: "mrr", label: "MRR", fmt: "usd", firstExpr: "[Assumptions!start_mrr]", expr: "[mrr@-1]*(1+[Assumptions!growth])" },
      ] },
      { name: "Summary", title: "Summary", kpis: [{ label: "End MRR", ref: "[Projection!mrr#3]", fmt: "usd" }] },
    ] };
    const { wb } = buildTemplateWorkbook(ExcelJS, fspec, {});
    const pj = wb.getWorksheet("Projection");
    expect(isFormula(pj.getCell("B4").value)).toBe(true);                      // period-1 MRR is a formula…
    expect(String(pj.getCell("B4").value.formula)).toContain("Assumptions");   // …referencing the assumption
    expect(isFormula(pj.getCell("C4").value)).toBe(true);                      // period-2 references the previous period
    const kpi = wb.getWorksheet("Summary").getCell("B3").value;                // a KPI pulls a metric at a period
    expect(isFormula(kpi)).toBe(true);
    expect(String(kpi.formula)).toContain("Projection");
  });

  it("a [ref] dropped into an input value compiles to a formula, never raw text", () => {
    const s = { type: "xlsx", name: "s.xlsx", sheets: [
      { name: "Projection", periods: { count: 2, label: "M%d" }, metrics: [{ id: "mrr", label: "MRR", firstExpr: "100", expr: "[mrr@-1]*2" }] },
      { name: "Summary", inputs: [{ label: "End MRR", value: "[Projection!mrr#2]", fmt: "usd" }] }, // ref placed in an INPUT value
    ] };
    const { wb } = buildTemplateWorkbook(ExcelJS, s, {});
    const cell = wb.getWorksheet("Summary").getCell("B3").value;
    expect(isFormula(cell)).toBe(true);
    expect(String(cell.formula)).toContain("Projection");
  });

  it("resolves a KPI however the model writes the reference — bracketed id, bare id, or raw Sheet!A1", () => {
    const s = { type: "xlsx", name: "k.xlsx", sheets: [
      { name: "Assumptions", title: "Assumptions", inputs: [{ id: "arpu", label: "ARPU", value: 490, fmt: "usd" }] },
      { name: "Summary", title: "Summary", kpis: [
        { label: "ARPU bracketed", ref: "[Assumptions!arpu]", fmt: "usd" }, // i0 -> B3
        { label: "ARPU bare", ref: "arpu", fmt: "usd" },                     // i1 -> E3  (no sheet -> cross-sheet search)
        { label: "ARPU raw A1", ref: "Assumptions!B3", fmt: "usd" },         // i2 -> B7
      ] },
    ] };
    const { wb } = buildTemplateWorkbook(ExcelJS, s, {});
    const sum = wb.getWorksheet("Summary");
    expect(isFormula(sum.getCell("B3").value)).toBe(true); // bracketed id resolves
    expect(isFormula(sum.getCell("E3").value)).toBe(true); // bare id resolves via cross-sheet fallback (no more 0)
    expect(isFormula(sum.getCell("B7").value)).toBe(true); // raw Sheet!A1 reference resolves
  });

  it("builds the generic cell-map (A1) format weak models emit — literals + safe formulas, self-refs neutralised, opens clean", async () => {
    const cellSpec = { type: "xlsx", name: "c.xlsx", sheets: [
      { name: "Inputs", cells: {
        "A1": "=BOLD(20) SaaS Model",   // weak-model pseudo-style directive -> bold text, not a broken formula
        "A3": "Starting MRR", "B3": 12000,
        "B4": "=B3*1.1",                // a safe formula -> kept
        "C8": "=C8+B6",                 // self-reference (circular) -> neutralised
        "A9": "=",                      // placeholder junk -> blank
      } },
    ] };
    const { wb } = buildTemplateWorkbook(ExcelJS, cellSpec, {});
    const ws = wb.getWorksheet("Inputs");
    expect(ws.getCell("B3").value).toBe(12000);                          // literal kept
    expect(isFormula(ws.getCell("B4").value)).toBe(true);               // safe formula kept
    expect(String(ws.getCell("B4").value.formula)).toBe("B3*1.1");
    expect(isFormula(ws.getCell("C8").value)).toBe(false);             // circular self-ref is NOT written as a formula…
    expect(ws.getCell("C8").value).toBe(0);                             // …it becomes a safe literal (no circular-ref error)
    expect(String(ws.getCell("A1").value)).toContain("SaaS Model");    // BOLD(20) stripped -> plain bold text
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(buf);       // throws if malformed -> proves the cell-map build can't corrupt
    expect(wb2.getWorksheet("Inputs").getCell("B3").value).toBe(12000);
  });
});
