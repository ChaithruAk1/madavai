// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved.
// Deterministic, formula-SAFE Excel template engine ("Institutional" look — Proposal A).
// The model emits a structured spec (named inputs + metric/table relationships expressed by
// id, NOT by A1). THIS engine assigns every cell position and COMPILES the A1 formulas, so the
// model can never produce a #REF!/#DIV reference error. Styling is applied here, identically every
// run. Native charts are collected in the injectCharts() format and returned for post-processing.
// Framework-agnostic: pass the ExcelJS class; runs in the browser worker AND in Node for tests.

const PAL = {
  navy: "FF1F3864", white: "FFFFFFFF", blue: "FF0000FF", black: "FF1A1A1A",
  green: "FF008000", band: "FFF2F6FB", border: "FFB7C4D6", gray: "FF8A8A9A",
  tileFill: "FFF2F6FB", accent2: "FF2E75B6",
};
const FMT = {
  usd: '"$"#,##0;("$"#,##0);"-"', usd2: '"$"#,##0.00;("$"#,##0.00);"-"',
  num: '#,##0;(#,##0);"-"', num1: '#,##0.0;(#,##0.0);"-"',
  pct: '0.0%;(0.0%);"-"', pct0: '0%;(0%);"-"', mult: '0.0"x"', year: "@",
};
const FONT = "Arial";
const f = (o) => ({ name: FONT, size: 10, ...(o || {}) });
const fmtOf = (k) => FMT[k] || (typeof k === "string" && k.includes("#") ? k : null);
const thin = () => ({ style: "thin", color: { argb: PAL.border } });
const allB = () => ({ top: thin(), left: thin(), bottom: thin(), right: thin() });
function colLetters(n) { let s = ""; n = Number(n) || 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s || "A"; }
const qsheet = (n) => (/[^A-Za-z0-9_]/.test(n) ? "'" + String(n).replace(/'/g, "''") + "'" : String(n));

export function buildTemplateWorkbook(ExcelJS, spec, opts) {
  const ACCENT = (opts && opts.accent) || PAL.navy;
  const wb = new ExcelJS.Workbook(); wb.creator = "Madav"; wb.created = new Date();
  const named = {};       // named[sheet][id] = "$B$7" (sheet-local absolute single cell)
  const metricRow = {};   // metricRow[sheet][id] = R
  const periodCols = {};  // periodCols[sheet] = [2,3,...] (1-based col numbers per period)
  const periodHdrRow = {};// header row holding period labels
  const colKeyLetter = {};// colKeyLetter[sheet][colKey] = "C"
  const tableStart = {};  // tableStart[sheet] = first data row of a tall table
  const tableRowCount = {};
  const pending = [];     // { sheet, cellRef, expr, ctx }
  const chartsRaw = [];   // { sheet, ...spec }
  let _unresolved = 0;    // count of references that did not resolve (model spec incoherence)

  const sheets = (Array.isArray(spec.sheets) ? spec.sheets : []).slice(0, 12);
  const wsOf = {};
  for (const sh of sheets) {
    const name = String(sh.name || "Sheet").slice(0, 28).replace(/[\\/?*[\]:]/g, " ");
    const ws = wb.addWorksheet(name); wsOf[name] = ws; sh._name = name;
    named[name] = {}; metricRow[name] = {}; colKeyLetter[name] = {};
  }

  // ---- layout pass ----
  for (const sh of sheets) {
    const name = sh._name, ws = wsOf[name];
    let widthUsed = 3;
    // title
    if (sh.title) { ws.getCell("A1").value = String(sh.title); ws.getCell("A1").font = f({ size: 15, bold: true, color: { argb: ACCENT } }); ws.getRow(1).height = 24; }
    let r = 3;

    // KPI tiles (rendered as 2-wide merged blocks, two per row) — usually a summary sheet
    if (Array.isArray(sh.kpis) && sh.kpis.length) {
      const tiles = sh.kpis.slice(0, 24); // was 6 — the writer truncated KPIs the preview showed (preview/file mismatch). Layout below scales to any count.
      let i = 0;
      for (const k of tiles) {
        const colBlock = i % 2; // 0 -> B:C, 1 -> E:F
        const c1 = colBlock === 0 ? "B" : "E", c2 = colBlock === 0 ? "C" : "F";
        const rr = r + Math.floor(i / 2) * 4;
        ws.mergeCells(`${c1}${rr}:${c2}${rr + 1}`); ws.mergeCells(`${c1}${rr + 2}:${c2}${rr + 2}`);
        const num = ws.getCell(`${c1}${rr}`);
        // VALUES-FIRST: a KPI tile holds a FINISHED number — write it directly. Only a bracketed [id]
        // reference (legacy formula spec) goes through the compile pass, where the safety net guards it.
        const kraw = (k.value != null && k.value !== "") ? k.value : (k.ref != null ? k.ref : k.expr);
        const kstr = String(kraw == null ? "" : kraw);
        if (/\[/.test(kstr)) pending.push({ sheet: name, cellRef: `${c1}${rr}`, expr: kstr, ctx: { kind: "cell", sheet: name } });
        else { const kn = typeof kraw === "number" ? kraw : Number(kstr.replace(/[,$%\s]/g, "")); num.value = Number.isFinite(kn) ? kn : 0; }
        num.numFmt = fmtOf(k.fmt) || FMT.num; num.font = f({ size: 20, bold: true, color: { argb: ACCENT } });
        num.alignment = { horizontal: "center", vertical: "middle" };
        const lab = ws.getCell(`${c1}${rr + 2}`); lab.value = String(k.label || "").toUpperCase();
        lab.font = f({ size: 9, bold: true, color: { argb: PAL.gray } }); lab.alignment = { horizontal: "center" };
        for (const cc of [c1, c2]) for (let q = 0; q < 3; q++) {
          const cell = ws.getCell(`${cc}${rr + q}`); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.tileFill } };
          cell.border = { left: cc === c1 ? thin() : undefined, right: cc === c2 ? thin() : undefined, top: q === 0 ? thin() : undefined, bottom: q === 2 ? thin() : undefined };
        }
        ws.getRow(rr).height = 26; ws.getRow(rr + 2).height = 16;
        i++;
      }
      for (const [cn, wv] of [[1,3],[2,14],[3,14],[4,3],[5,14],[6,14],[7,3]]) ws.getColumn(cn).width = wv;
      r += Math.ceil(tiles.length / 2) * 4 + 1; widthUsed = 6;
    }

    // assumptions inputs (named) + derived
    if (Array.isArray(sh.inputs) && sh.inputs.length) {
      let lastSec = null;
      for (const inp of sh.inputs) {
        if (inp.section && inp.section !== lastSec) {
          lastSec = inp.section; ws.mergeCells(`A${r}:C${r}`);
          const sc = ws.getCell(`A${r}`); sc.value = String(inp.section).toUpperCase();
          sc.font = f({ bold: true, color: { argb: ACCENT } }); for (const cc of "ABC") ws.getCell(`${cc}${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.band } };
          ws.getRow(r).height = 18; r++;
        }
        ws.getCell(`A${r}`).value = String(inp.label || ""); ws.getCell(`A${r}`).font = f();
        const vc = ws.getCell(`B${r}`); vc.value = inp.value; vc.font = f({ color: { argb: PAL.blue } });
        vc.alignment = { horizontal: "right" }; const ff = fmtOf(inp.fmt); if (ff) vc.numFmt = ff;
        if (inp.note) { ws.getCell(`C${r}`).value = String(inp.note); ws.getCell(`C${r}`).font = f({ size: 9, italic: true, color: { argb: PAL.gray } }); }
        if (inp.id) named[name][inp.id] = `$B$${r}`;
        ws.getRow(r).height = 16; r++;
      }
      widthUsed = Math.max(widthUsed, 3);
    }
    if (Array.isArray(sh.derived) && sh.derived.length) {
      ws.mergeCells(`A${r}:C${r}`); const sc = ws.getCell(`A${r}`); sc.value = "DERIVED METRICS";
      sc.font = f({ bold: true, color: { argb: ACCENT } }); for (const cc of "ABC") ws.getCell(`${cc}${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.band } }; r++;
      for (const d of sh.derived) {
        ws.getCell(`A${r}`).value = String(d.label || ""); ws.getCell(`A${r}`).font = f();
        const vc = ws.getCell(`B${r}`); vc.font = f({ color: { argb: PAL.black } }); vc.alignment = { horizontal: "right" };
        const ff = fmtOf(d.fmt); if (ff) vc.numFmt = ff;
        pending.push({ sheet: name, cellRef: `B${r}`, expr: d.expr, ctx: { kind: "cell", sheet: name } });
        if (d.note) { ws.getCell(`C${r}`).value = String(d.note); ws.getCell(`C${r}`).font = f({ size: 9, italic: true, color: { argb: PAL.gray } }); }
        if (d.id) named[name][d.id] = `$B$${r}`;
        ws.getRow(r).height = 16; r++;
      }
    }

    // model (wide: metrics rows × periods cols)
    if (Array.isArray(sh.metrics) && sh.metrics.length) {
      const pc = sh.periods || { count: 12, label: "M%d" };
      const count = Math.min(Math.max(1, pc.count || 12), 60);
      const labels = Array.isArray(pc.label) ? pc.label : Array.from({ length: count }, (_, i) => String(pc.label || "P%d").replace("%d", i + 1));
      const hdr = r; periodHdrRow[name] = hdr; periodCols[name] = [];
      ws.getCell(`A${hdr}`).value = sh.rowHeader || "Metric";
      for (let p = 0; p < count; p++) { const cn = 2 + p; periodCols[name].push(cn); ws.getCell(`${colLetters(cn)}${hdr}`).value = labels[p]; }
      for (let cn = 1; cn <= 1 + count; cn++) { const c = ws.getCell(`${colLetters(cn)}${hdr}`); c.font = f({ bold: true, color: { argb: PAL.white } }); c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }; c.alignment = { horizontal: cn === 1 ? "left" : "right" }; c.border = allB(); }
      ws.getRow(hdr).height = 18; r = hdr + 1;
      sh.metrics.forEach((mt, mi) => {
        const row = r + mi; metricRow[name][mt.id] = row;
        ws.getCell(`A${row}`).value = String(mt.label || ""); ws.getCell(`A${row}`).font = f({ bold: !!mt.total, color: { argb: PAL.black } });
        for (let p = 1; p <= count; p++) {
          const cn = 1 + p, ref = `${colLetters(cn)}${row}`, cell = ws.getCell(ref);
          const ff = fmtOf(mt.fmt); if (ff) cell.numFmt = ff;
          cell.font = f({ bold: !!mt.total, color: { argb: mt.role === "link" ? PAL.green : PAL.black } });
          cell.alignment = { horizontal: "right" };
          const expr = (p === 1 && mt.firstExpr) ? mt.firstExpr : mt.expr;
          pending.push({ sheet: name, cellRef: ref, expr, ctx: { kind: "model", sheet: name, p } });
        }
      });
      const lastRow = r + sh.metrics.length - 1;
      // banding + totals + borders
      sh.metrics.forEach((mt, mi) => {
        const row = r + mi;
        for (let cn = 1; cn <= 1 + count; cn++) {
          const cell = ws.getCell(`${colLetters(cn)}${row}`); cell.border = allB();
          if (mt.total) { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.band } }; }
          else if (mi % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.band } };
        }
      });
      // widths
      ws.getColumn(1).width = 24; for (let p = 0; p < count; p++) ws.getColumn(2 + p).width = 11;
      ws.views = [{ state: "frozen", xSplit: 1, ySplit: hdr }];
      widthUsed = Math.max(widthUsed, 1 + count);
      r = lastRow + 2;
    }

    // tall table (rows × columns) — e.g. a pivot rollup
    if (Array.isArray(sh.columns) && sh.columns.length) {
      const cols = sh.columns.slice(0, 26); const hdr = r; periodHdrRow[name] = periodHdrRow[name] || hdr;
      cols.forEach((c, ci) => { const L = colLetters(1 + ci); colKeyLetter[name][c.key] = L; const cell = ws.getCell(`${L}${hdr}`); cell.value = String(c.header || c.key); cell.font = f({ bold: true, color: { argb: PAL.white } }); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }; cell.alignment = { horizontal: ci === 0 ? "left" : "right" }; cell.border = allB(); });
      ws.getRow(hdr).height = 18; const dataStart = hdr + 1; tableStart[name] = dataStart;
      const rows = Array.isArray(sh.rows) ? sh.rows : (Array.isArray(sh.data) ? sh.data.map((a) => { const o = {}; cols.forEach((c, ci) => { o[c.key] = Array.isArray(a) ? a[ci] : undefined; }); return o; }) : []);
      tableRowCount[name] = rows.length;
      rows.forEach((rowObj, ri) => {
        const rr = dataStart + ri;
        cols.forEach((c, ci) => {
          const L = colLetters(1 + ci), cell = ws.getCell(`${L}${rr}`); const ff = fmtOf(c.fmt); if (ff) cell.numFmt = ff;
          cell.font = f({ color: { argb: c.role === "link" ? PAL.green : PAL.black } }); cell.alignment = { horizontal: ci === 0 ? "left" : "right" };
          const v = rowObj[c.key];
          if (v && typeof v === "object" && v.expr != null) pending.push({ sheet: name, cellRef: `${L}${rr}`, expr: v.expr, ctx: { kind: "table", sheet: name, rowIndex: ri, dataStart } });
          else cell.value = v == null ? null : v;
          cell.border = allB();
          if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PAL.band } };
        });
        ws.getRow(rr).height = 16;
      });
      ws.getColumn(1).width = 14; for (let ci = 1; ci < cols.length; ci++) ws.getColumn(1 + ci).width = 14;
      widthUsed = Math.max(widthUsed, cols.length);
    }

    // collect charts (resolved in pass 2)
    if (Array.isArray(sh.charts)) for (const ch of sh.charts) chartsRaw.push({ sheet: name, def: ch });
    if (sh.title) { try { ws.mergeCells(1, 1, 1, Math.max(2, widthUsed)); } catch (e) {} }
    ws.views = ws.views || [{ state: "frozen", ySplit: 0 }];
  }

  // ---- compile pass: resolve [tokens] → A1 ----
  const periodColLetter = (sheet, p) => { const arr = periodCols[sheet]; if (!arr || p < 1 || p > arr.length) return null; return colLetters(arr[p - 1]); };
  function resolveToken(tok, ctx) {
    tok = tok.trim();
    let sheetPart = null, body = tok;
    const bang = tok.indexOf("!");
    if (bang >= 0) { sheetPart = tok.slice(0, bang); body = tok.slice(bang + 1); }
    // range / period suffix #a:b or #p
    let rangeM = body.match(/^(.+?)#[pP]?(\d+)(?::[pP]?(\d+))?$/);
    if (rangeM) {
      const id = rangeM[1], a = +rangeM[2], b = rangeM[3] ? +rangeM[3] : null;
      const sh = sheetPart || ctx.sheet; const row = metricRow[sh] && metricRow[sh][id];
      if (!row) return "#REF!";
      const ca = periodColLetter(sh, a); if (!ca) return "#REF!";
      const pre = sheetPart ? qsheet(sh) + "!" : "";
      if (b) { const cb = periodColLetter(sh, b); return `${pre}${ca}${row}:${cb}${row}`; }
      return `${pre}${ca}${row}`;
    }
    // previous-period / previous-row id@-1
    let prevM = body.match(/^(.+?)@(-?\d+)$/); let id = body, off = 0;
    if (prevM) { id = prevM[1]; off = parseInt(prevM[2], 10); }
    const sh = sheetPart || ctx.sheet;
    if (sheetPart) {
      // cross-sheet single named cell
      if (named[sh] && named[sh][id]) return `${qsheet(sh)}!${named[sh][id]}`;
      // cross-sheet model metric at ctx period (rare) — fall through
      if (metricRow[sh] && metricRow[sh][id] && ctx.p) { const L = periodColLetter(sh, ctx.p + off); return L ? `${qsheet(sh)}!${L}${metricRow[sh][id]}` : "#REF!"; }
      return "#REF!";
    }
    if (ctx.kind === "model") {
      const L = periodColLetter(sh, ctx.p + off); const row = metricRow[sh] && metricRow[sh][id];
      if (!L || !row) return "#REF!"; return `${L}${row}`;
    }
    if (ctx.kind === "table") {
      const L = colKeyLetter[sh] && colKeyLetter[sh][id]; if (!L) return "#REF!";
      return `${L}${ctx.dataStart + ctx.rowIndex + off}`;
    }
    // cell/derived/kpi ctx: local named cell (strip absolute $ for in-formula use is fine to keep)
    if (named[sh] && named[sh][id]) return `${named[sh][id]}`;
    return "#REF!";
  }
  // SAFETY NET — a formula is safe to write only if, after stripping quoted sheet names, valid cell/range
  // references, function-call names, numbers and operators, NOTHING is left over. Anything remaining is a
  // bare label or identifier the model put where a reference belongs (e.g. "CAC:LTV Ratio", "ending_mrr").
  // Excel rejects the WHOLE workbook for such a formula ("we found a problem with content"), so we refuse
  // to write it as a formula and the caller falls back to a literal instead — a corrupt file is impossible.
  function isSafeFormula(s) {
    let t = String(s == null ? "" : s);
    if (t === "") return true;
    t = t.replace(/'[^']*'/g, "Q");                                                                       // quoted sheet names
    t = t.replace(/(?:[A-Za-z_][\w.]*!|Q!)?\$?[A-Za-z]{1,3}\$?\d{1,7}(?::\$?[A-Za-z]{1,3}\$?\d{1,7})?/g, "R"); // cell/range refs (optional sheet!)
    t = t.replace(/[A-Za-z][\w.]*\s*\(/g, "(");                                                            // function calls: NAME( -> (
    t = t.replace(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, "N");                                                  // numbers
    t = t.replace(/[\sQRN()+\-*/^%,:.;&<>=!$"]/g, "");                                                      // operators / punctuation / placeholders
    return t.length === 0;                                                                                 // leftover letters/words → unsafe
  }
  function resolve(expr, ctx) {
    let out = String(expr == null ? "" : expr).replace(/^=/, "").replace(/\[([^\]]+)\]/g, (_, t) => resolveToken(t, ctx));
    // A model can reference an id/sheet/period that does not exist (resolveToken returns #REF! for those).
    // NEVER let #REF!/#NAME?/undefined/NaN reach a saved formula — Excel flags such a workbook as corrupt.
    if (/#REF!|#NAME\?|\bundefined\b|\bNaN\b/.test(out)) { _unresolved++; out = out.replace(/#REF!|#NAME\?/g, "0").replace(/\bundefined\b|\bNaN\b/g, "0"); }
    if (!isSafeFormula(out)) { _unresolved++; return null; }   // unsafe → caller writes a literal, never a broken formula
    return out;
  }
  for (const pd of pending) {
    const ws = wsOf[pd.sheet]; const cell = ws.getCell(pd.cellRef);
    const formula = resolve(pd.expr, pd.ctx);
    cell.value = (formula == null) ? 0 : { formula };   // safety net: an unverifiable formula becomes a safe literal 0
  }

  // ---- resolve charts ----
  // GLOBAL column index (by key AND header, case-insensitive) -> { sheet, letter }, so a chart declared on
  // a dashboard/Summary sheet still binds to its data columns wherever they live (cross-sheet). Without this,
  // a chart that references the projection from a Summary sheet silently dropped ("charts left out").
  const colIndex = {};
  for (const sh2 of sheets) {
    const nm = sh2._name, map = colKeyLetter[nm] || {};
    for (const key of Object.keys(map)) { const lk = String(key).toLowerCase(); if (!colIndex[lk]) colIndex[lk] = { sheet: nm, letter: map[key] }; }
    if (Array.isArray(sh2.columns)) for (const c of sh2.columns) { const L = map[c.key]; if (!L) continue; const h = String(c.header || "").toLowerCase(); if (h && !colIndex[h]) colIndex[h] = { sheet: nm, letter: L }; }
  }
  const findCol = (ref) => (ref == null ? null : colIndex[String(ref).toLowerCase()] || null);
  const charts = [];
  for (const { sheet, def } of chartsRaw) {
    try {
      if (def.x === "periods" && periodCols[sheet]) {   // legacy metrics path (values specs use columns)
        const cols = periodCols[sheet], hdr = periodHdrRow[sheet], ser0 = [];
        const cats0 = `${sheet}!${colLetters(cols[0])}${hdr}:${colLetters(cols[cols.length - 1])}${hdr}`;
        for (const s of (def.series || [])) { const row = metricRow[sheet][s.metric]; if (!row) continue; ser0.push({ name: s.name || s.metric, values: `${sheet}!${colLetters(cols[0])}${row}:${colLetters(cols[cols.length - 1])}${row}` }); }
        if (ser0.length) charts.push({ sheet, type: def.type || "line", title: def.title || "", categories: cats0, series: ser0, anchor: def.anchor || autoAnchor(sheet), w: def.w, h: def.h });
        continue;
      }
      const xc = findCol(def.x);
      if (!xc) { console.warn(`[xlsxTemplate] chart "${def.title || ""}" dropped \u2014 x column "${def.x}" not found on any sheet`); continue; }
      const dsheet = xc.sheet, ds = tableStart[dsheet], rows = tableRowCount[dsheet] || 0;
      if (!ds || rows < 1) { console.warn(`[xlsxTemplate] chart "${def.title || ""}" dropped \u2014 data sheet "${dsheet}" has no rows`); continue; }
      const categories = `${dsheet}!${xc.letter}${ds}:${xc.letter}${ds + rows - 1}`;
      const series = [];
      for (const s of (def.series || [])) {
        const sc = findCol(s.col != null ? s.col : s.metric);
        if (!sc || sc.sheet !== dsheet) continue;        // every series must live on the same data sheet as x
        series.push({ name: s.name || s.col || s.metric, values: `${dsheet}!${sc.letter}${ds}:${sc.letter}${ds + rows - 1}` });
      }
      if (series.length) charts.push({ sheet, type: def.type || "line", title: def.title || "", categories, series, anchor: def.anchor || autoAnchor(sheet), w: def.w, h: def.h });
      else console.warn(`[xlsxTemplate] chart "${def.title || ""}" dropped \u2014 no series columns resolved (series=${(def.series || []).length})`);
    } catch (e) { console.warn("[xlsxTemplate] chart resolve error:", (e && e.message) || e); }
  }
  // Put EVERY chart on ONE dedicated "Charts" dashboard sheet in a 2-up grid — consistent placement, no
  // overlap with data, independent of which sheet the model declared a chart on. The series/category refs
  // are already fully-qualified (cross-sheet), so each chart binds to its data wherever it lives.
  if (charts.length) {
    const cName = "Charts"; const cws = wb.addWorksheet(cName);
    cws.getCell("A1").value = "Charts"; cws.getCell("A1").font = f({ size: 15, bold: true, color: { argb: ACCENT } }); cws.getRow(1).height = 24;
    charts.forEach((ch, i) => { const r = Math.floor(i / 2), c = i % 2; ch.sheet = cName; ch.anchor = `${colLetters(2 + c * 9)}${2 + r * 16}`; ch.w = 8; ch.h = 15; });
  }
  function autoAnchor(sheet) {
    if (periodCols[sheet]) return `${colLetters((periodCols[sheet].slice(-1)[0]) + 2)}3`;
    if (colKeyLetter[sheet]) { const ds = tableStart[sheet] || 4; return `A${ds + 8}`; }
    return "H3";
  }
  return { wb, charts, unresolved: _unresolved };
}
