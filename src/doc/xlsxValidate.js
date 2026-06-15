// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// LAYER 2 — output validation. Scans a BUILT ExcelJS workbook for formulas that will error in Excel:
// broken references (the model concatenated an undefined variable → "Bundefined"), stray NaN, #REF!,
// #NAME?. Turns a silently-wrong financial model into a caught, fixable problem.
//   - "undefined" matched anywhere (it is glued to a column letter: "Bundefined") — case-sensitive so a
//     legitimate label can't trip it.
//   - "NaN" matched only as a whole token (case-sensitive) so a sheet like "Finance" is NOT flagged.
const BAD = /undefined|\bNaN\b|#REF!|#NAME\?|#DIV\/0/;
export function findFormulaIssues(wb) {
  const issues = [];
  try {
    (wb.worksheets || []).forEach((ws) => {
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          const v = cell && cell.value;
          let f = cell && cell.formula;                                   // built formula cell (worker path)
          if (!f && v && typeof v === "object" && v.formula) f = v.formula;
          if (!f && typeof v === "string" && v[0] === "=") f = v.slice(1); // read path / string-typed formula
          if (typeof f === "string" && BAD.test(f)) issues.push({ sheet: ws.name, cell: cell.address || "", formula: ("=" + f).slice(0, 70) });
        });
      });
    });
  } catch {}
  return issues.slice(0, 25);
}
