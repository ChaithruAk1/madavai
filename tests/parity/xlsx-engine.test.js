import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildTemplateWorkbook } from "../../src/doc/xlsxTemplate.js";
import { injectCharts } from "../../src/doc/xlsxChart.js";

// The deterministic Excel engine must be BULLETPROOF: a values-only spec renders clean, and a spec that
// (mis)uses labels/bare-names where a number/reference belongs can NEVER produce a formula Excel rejects.
// This guards the corruption + #NAME? class of bug (the "we found a problem with content" recover prompt).
const spec = {
  type: "xlsx", name: "t.xlsx", sheets: [
    { name: "Summary", title: "SaaS Unit Economics", kpis: [
      { label: "LTV", value: 1600, fmt: "usd" },
      { label: "CAC", value: 800, fmt: "usd" },
      { label: "LTV:CAC", value: 2, fmt: "mult" },
      { label: "Bad", value: "CAC:LTV Ratio", fmt: "num" },   // a LABEL where a number belongs
    ] },
    { name: "Projection",
      columns: [{ key: "month", header: "Month" }, { key: "mrr", header: "MRR", fmt: "usd" }],
      rows: [{ month: "M1", mrr: 10000 }, { month: "M2", mrr: 11500 }, { month: "M3", mrr: 12925 }],
      charts: [{ type: "line", title: "MRR", x: "month", series: [{ col: "mrr" }] }] },
    { name: "BadF", derived: [{ label: "x", expr: "ending_mrr" }, { label: "y", expr: "gross_margin_pu Months" }] }, // bare names
  ],
};
const isFormula = (v) => !!(v && typeof v === "object" && v.formula != null);

describe("xlsxTemplate — values-only build is bulletproof", () => {
  it("writes KPI tiles as literal numbers", () => {
    const { wb } = buildTemplateWorkbook(ExcelJS, spec, {});
    const sw = wb.getWorksheet("Summary");
    expect(sw.getCell("B3").value).toBe(1600);          // LTV tile
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

  it("resolves a column-bound chart, injects it, and the base workbook re-opens cleanly", async () => {
    const { wb, charts } = buildTemplateWorkbook(ExcelJS, spec, {});
    expect(charts.length).toBe(1);                       // the MRR line chart resolved off the columns
    const buf = await wb.xlsx.writeBuffer();
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buf);                             // throws if the base .xlsx is structurally malformed
    expect(wb2.getWorksheet("Projection").getCell("B4").value).toBe(10000); // first MRR value present
    const withChart = await injectCharts(buf, charts);   // native-chart injection runs without throwing…
    expect(withChart.byteLength).toBeGreaterThan(buf.byteLength); // …and adds the chart parts
  });
});
