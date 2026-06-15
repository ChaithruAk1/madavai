// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// xlsxKit — Claude-grade design helpers for the bespoke spreadsheet engine, adapted from Anthropic's
// xlsx skill conventions (financial colour code, number-format standards, Arial, bordered/banded tables,
// frozen headers). The model CALLS these instead of hand-writing styling — so output is consistently
// polished AND there's far less raw code to get wrong (quality + reliability in one).
export function makeKit(ExcelJS) {
  const FONT = "Arial";
  // Industry-standard financial colour code (from Claude's xlsx skill).
  const colors = {
    input: "FF0000FF",     // blue  — hardcoded inputs / scenario numbers
    formula: "FF1A1A1A",   // black — formulas / calculations
    link: "FF008000",      // green — links pulling from another sheet in the workbook
    external: "FFFF0000",  // red   — external links
    keyfill: "FFFFF2CC",   // yellow bg — key assumptions needing attention
    header: "FF1F3864",    // deep navy header band
    headerText: "FFFFFFFF",
    band: "FFF4F7FB",      // subtle zebra banding
    accent: "FF2F6FED",
    total: "FFEAF0FB",     // light fill for total/subtotal rows
  };
  // Number-format standards (zeros render as "-", negatives in parens, units belong in the header text).
  const fmt = {
    usd: '"$"#,##0;("$"#,##0);"-"',
    usd2: '"$"#,##0.00;("$"#,##0.00);"-"',
    num: '#,##0;(#,##0);"-"',
    num1: '#,##0.0;(#,##0.0);"-"',
    pct: '0.0%;(0.0%);"-"',
    pct0: '0%;(0%);"-"',
    mult: '0.0"x"',
    year: "@",            // years as text, never 2,024
  };
  const hex = (c) => String(c == null ? "" : c).replace(/^#/, "");
  const col = (n) => { let s = ""; n = Number(n) || 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || "A"; };
  const thin = (argb) => ({ style: "thin", color: { argb: argb || "FFD4D9E2" } });
  const allBorders = () => ({ top: thin(), left: thin(), bottom: thin(), right: thin() });
  const font = (o) => ({ name: FONT, size: 10, ...o });

  // A big title row at the top of a sheet (merged across `span` columns).
  function title(ws, text, span) {
    const r = ws.addRow([text]); const n = ws.rowCount;
    if (span > 1) ws.mergeCells(n, 1, n, span);
    r.getCell(1).font = font({ size: 15, bold: true, color: { argb: colors.header } });
    r.height = 22; ws.addRow([]); return r;
  }
  // A small accent section label.
  function sectionTitle(ws, text) {
    const r = ws.addRow([text]);
    r.getCell(1).font = font({ bold: true, size: 11, color: { argb: colors.accent } });
    return r;
  }
  // A styled header row (navy fill, white bold, centred-ish, bordered). Returns the row.
  function headerRow(ws, labels, opt) {
    opt = opt || {}; const r = ws.addRow(labels);
    r.eachCell((c, ci) => {
      c.font = font({ bold: true, color: { argb: colors.headerText } });
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: hex(opt.fill || colors.header).length === 8 ? hex(opt.fill || colors.header) : "FF" + hex(opt.fill || colors.header) } };
      c.alignment = { vertical: "middle", horizontal: ci === 1 ? "left" : (opt.align || "right"), wrapText: true };
      c.border = allBorders();
    });
    r.height = opt.height || 20; return r;
  }
  // Cell stylers that apply the colour convention + a number format.
  function input(cell, value, numFmt) { cell.value = value; cell.font = font({ color: { argb: colors.input } }); if (numFmt) cell.numFmt = numFmt; }
  function formula(cell, f, numFmt) { cell.value = { formula: String(f).replace(/^=/, "") }; cell.font = font({ color: { argb: colors.formula } }); if (numFmt) cell.numFmt = numFmt; }
  function link(cell, f, numFmt) { cell.value = { formula: String(f).replace(/^=/, "") }; cell.font = font({ color: { argb: colors.link } }); if (numFmt) cell.numFmt = numFmt; }

  // The high-leverage finisher: borders + zebra banding on the used range, frozen header, Arial default,
  // sensible auto column widths, a bold/total fill on rows whose first cell starts with Total/Subtotal.
  function finishTable(ws, opt) {
    opt = opt || {}; const headerRows = opt.headerRows == null ? 1 : opt.headerRows;
    const firstData = opt.firstDataRow || headerRows + 1;
    const maxR = ws.rowCount, maxC = ws.actualColumnCount || ws.columnCount || 1;
    for (let R = 1; R <= maxR; R++) {
      const row = ws.getRow(R); let any = false;
      for (let C = 1; C <= maxC; C++) { if (row.getCell(C).value != null && row.getCell(C).value !== "") { any = true; break; } }
      if (!any) continue;
      const isTotal = R >= firstData && /^\s*(total|subtotal|net|ending)\b/i.test(String(row.getCell(1).value || ""));
      const band = opt.band !== false && R >= firstData && ((R - firstData) % 2 === 1);
      for (let C = 1; C <= maxC; C++) {
        const c = row.getCell(C);
        c.border = allBorders();
        if (!c.font || !c.font.name) c.font = font(c.font || {});
        if (isTotal) { c.font = font({ ...(c.font || {}), bold: true }); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.total } }; }
        else if (band && (!c.fill || !c.fill.fgColor)) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.band } };
      }
    }
    // auto column widths from content
    for (let C = 1; C <= maxC; C++) {
      let w = 9;
      for (let R = 1; R <= maxR; R++) { const v = ws.getRow(R).getCell(C).value; const t = v && v.formula ? "" : (v == null ? "" : String(v)); if (t) w = Math.max(w, Math.min(46, t.length + 2)); }
      ws.getColumn(C).width = C === 1 ? Math.max(w, 22) : w;
    }
    ws.views = [{ state: "frozen", ySplit: headerRows, xSplit: opt.freezeFirstCol ? 1 : 0 }];
  }
  // Conditional-format data bar (ExcelJS supports these; native charts it does not).
  function dataBar(ws, ref, argb) {
    ws.addConditionalFormatting({ ref, rules: [{ type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }], color: { argb: argb || colors.accent } }] });
  }
  const _charts = [];
  // Record a chart spec; the engine injects a REAL native Excel chart after ExcelJS serialises the file.
  // spec: { type:"col"|"bar"|"line"|"pie", title, categories:"A4:A15", series:[{name, values:"B4:B15"}], anchor:"O3" }
  function chart(ws, spec) { try { _charts.push({ sheet: ws.name, ...(spec || {}) }); } catch (e) {} }
  return { FONT, colors, fmt, hex, col, title, sectionTitle, headerRow, input, formula, link, finishTable, dataBar, chart, _charts };
}
