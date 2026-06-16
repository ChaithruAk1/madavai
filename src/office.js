// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// office.js — IN-CHAT OFFICE FILE CREATION. The model emits a fenced ```officedoc
// block containing a small JSON spec; the chat renders it as a file card; clicking
// Download builds a REAL .xlsx / .docx / .pptx / .pdf entirely on this device
// (dynamic imports keep the heavy libraries out of the main bundle until used).
// Works identically on web and desktop — no server, no upload, BYO nothing.
//
// Spec shapes the model is taught (see OFFICE_RULE in the engines):
//   xlsx: { type:"xlsx", name:"sales.xlsx", sheets:[{ name:"Q1", rows:[["Region","Sales"],["NA",1200]] }] }
//   docx: { type:"docx", name:"report.docx", title:"…", sections:[{ heading:"…", text:"…" }] }
//   pptx: { type:"pptx", name:"deck.pptx", title:"…", slides:[{ title:"…", bullets:["…"] }] }
//   pdf : { type:"pdf",  name:"doc.pdf",  title:"…", sections:[{ heading:"…", text:"…" }] }

import { renderTemplatePreview } from "./doc/xlsxTemplatePreview.js";

// Office-suite brand colour (the navy in headers/titles). Settings → Office Suite Theme color
// updates this via setOfficeAccent; a spec's own accent still overrides it. Financial cell
// colours (blue inputs / black formulas / green links) are NOT themed.
let _OFFICE_ACCENT = "1F3864";
export function setOfficeAccent(hex) { try { _OFFICE_ACCENT = _hx(hex, "1F3864"); } catch { _OFFICE_ACCENT = "1F3864"; } }

export function parseOfficeSpec(jsonText) {
  try {
    const spec = JSON.parse(String(jsonText || ""));
    if (!spec || !["xlsx", "docx", "pptx", "pdf"].includes(spec.type)) return null;
    spec.name = String(spec.name || ("document." + spec.type)).replace(/[^\w. ()-]/g, "_").slice(0, 80);
    if (!spec.name.toLowerCase().endsWith("." + spec.type)) spec.name += "." + spec.type;
    return spec;
  } catch { return null; }
}

const _XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const _sheetName = (s) => String(s || "Sheet").slice(0, 28).replace(/[\\/?*[\]:]/g, " ");
const _normRows = (sh) => (Array.isArray(sh.rows) ? sh.rows : []).slice(0, 5000).map((r) => (Array.isArray(r) ? r.slice(0, 64) : [r]));
// Styled spreadsheets via ExcelJS (header fill, banded rows, auto widths, frozen header,
// auto-filter, numeric formatting) — this is what gives Excel the "designed" look. Falls
// back to the SheetJS writer if ExcelJS can't load (e.g. a trimmed public web bundle).
function _isRichXlsx(spec) {
  return !!(spec && Array.isArray(spec.sheets) && spec.sheets.some((s) => s && (s.inputs || s.metrics || s.columns || s.kpis || s.charts)));
}
async function buildXlsxTemplate(spec) {
  const m = await import("exceljs"); const ExcelJS = m.default || m;
  const tpl = await import("./doc/xlsxTemplate.js");
  const { wb, charts } = tpl.buildTemplateWorkbook(ExcelJS, spec, { accent: "FF" + _hx(spec.accent, _OFFICE_ACCENT) });
  let buf = await wb.xlsx.writeBuffer();
  if (charts && charts.length) { try { const ch = await import("./doc/xlsxChart.js"); buf = await ch.injectCharts(buf, charts); } catch (e) {} }
  return new Blob([buf], { type: _XLSX_MIME });
}
async function buildXlsx(spec) {
  if (_isRichXlsx(spec)) { try { return await buildXlsxTemplate(spec); } catch (e) {} }
  let ExcelJS = null;
  try { const m = await import("exceljs"); ExcelJS = m.default || m; } catch { ExcelJS = null; }
  if (!ExcelJS) return buildXlsxBasic(spec);
  const accent = _hx(spec.accent, _OFFICE_ACCENT);
  const wb = new ExcelJS.Workbook(); wb.creator = "Madav"; wb.created = new Date();
  const sheets = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [{ name: "Sheet1", rows: spec.rows || [] }];
  for (const sh of sheets.slice(0, 12)) {
    const ws = wb.addWorksheet(_sheetName(sh.name));
    const rows = _normRows(sh); if (!rows.length) rows.push(["(empty)"]);
    const ncols = rows.reduce((mx, r) => Math.max(mx, r.length), 1);
    rows.forEach((r, i) => {
      const row = ws.addRow(r);
      row.eachCell((cell, col) => {
        if (i === 0) {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + accent } };
          cell.alignment = { vertical: "middle", horizontal: "left" };
        } else {
          cell.font = { size: 11, name: "Calibri", color: { argb: "FF1F2933" } };
          if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F6FB" } };
          if (typeof cell.value === "number" && Math.abs(cell.value) >= 1000) cell.numFmt = "#,##0.##";
        }
      });
      if (i === 0) row.height = 20;
    });
    for (let c = 1; c <= ncols; c++) {
      let w = 9;
      rows.forEach((r) => { const v = r[c - 1]; if (v != null) w = Math.max(w, Math.min(52, String(v).length + 2)); });
      ws.getColumn(c).width = w;
    }
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (rows.length > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ncols } };
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: _XLSX_MIME });
}
async function buildXlsxBasic(spec) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheets = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [{ name: "Sheet1", rows: spec.rows || [] }];
  for (const sh of sheets.slice(0, 12)) {
    const rows = _normRows(sh);
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [["(empty)"]]);
    const ncols = rows.reduce((mx, r) => Math.max(mx, r.length), 1);
    ws["!cols"] = Array.from({ length: ncols }, (_, c) => { let w = 9; rows.forEach((r) => { const v = r[c]; if (v != null) w = Math.max(w, Math.min(52, String(v).length + 2)); }); return { wch: w }; });
    if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: ncols - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, _sheetName(sh.name));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: _XLSX_MIME });
}

const _DOCX = { NAVY: "1F3864", BODY: "1F2933", MUT: "6B7280", BAND: "F2F6FB", LINE: "D7DEEA", FONT: "Calibri" };
function _docxTable(docx, rows, accent) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle, ShadingType } = docx;
  const { BODY, BAND, LINE, FONT } = _DOCX;
  const NAVY = accent;
  const b = { style: BorderStyle.SINGLE, size: 2, color: LINE };
  const borders = { top: b, bottom: b, left: b, right: b };
  const trs = rows.slice(0, 120).map((r, ri) => new TableRow({
    tableHeader: ri === 0,
    children: (Array.isArray(r) ? r : [r]).slice(0, 12).map((c) => new TableCell({
      borders, margins: { top: 60, bottom: 60, left: 120, right: 120 },
      shading: ri === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: NAVY } : (ri % 2 === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: BAND } : undefined),
      children: [new Paragraph({ children: [new TextRun({ text: String(c == null ? "" : c), bold: ri === 0, color: ri === 0 ? "FFFFFF" : BODY, size: 21, font: FONT })] })],
    })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trs });
}
async function buildDocx(spec) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, BorderStyle, AlignmentType, ShadingType, Footer, PageNumber, LevelFormat } = docx;
  const { BODY, MUT, BAND, LINE, FONT } = _DOCX;
  const accent = _hx(spec.accent, _OFFICE_ACCENT);
  const NAVY = accent;
  const children = [];
  if (spec.title) {
    children.push(new Paragraph({ spacing: { after: spec.subtitle ? 40 : 60 }, children: [new TextRun({ text: String(spec.title), bold: true, color: NAVY, size: 52, font: FONT })] }));
    if (spec.subtitle) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: String(spec.subtitle), bold: true, color: accent, size: 26, font: FONT })] }));
    if (Array.isArray(spec.meta) && spec.meta.length) {
      const runs = [];
      spec.meta.slice(0, 6).forEach((m, i) => { if (i) runs.push(new TextRun({ text: "      ", size: 18, font: FONT })); runs.push(new TextRun({ text: (m.label ? m.label + ": " : ""), color: MUT, size: 18, font: FONT })); runs.push(new TextRun({ text: String(m.value == null ? "" : m.value), bold: true, color: BODY, size: 18, font: FONT })); });
      children.push(new Paragraph({ spacing: { after: 60 }, children: runs }));
    }
    children.push(new Paragraph({ border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 16, space: 6 } }, spacing: { after: 240 }, children: [] }));
  }
  for (const sec of (spec.sections || []).slice(0, 120)) {
    if (sec.heading) { const lvl = sec.level === 2 ? 2 : 1; children.push(new Paragraph({ heading: lvl === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, border: lvl === 1 ? { bottom: { color: LINE, style: BorderStyle.SINGLE, size: 8, space: 4 } } : undefined, children: [new TextRun({ text: String(sec.heading), bold: true, color: lvl === 1 ? NAVY : accent, size: lvl === 1 ? 30 : 26, font: FONT })] })); }
    if (sec.leadIn || sec.text) { const paras = String(sec.text || "").split(/\n{2,}/); paras.forEach((para, pi) => { if (!para.trim() && !(pi === 0 && sec.leadIn)) return; const runs = []; if (pi === 0 && sec.leadIn) runs.push(new TextRun({ text: String(sec.leadIn) + "  ", bold: true, color: BODY, size: 22, font: FONT })); if (para.trim()) runs.push(new TextRun({ text: para.trim(), size: 22, color: BODY, font: FONT })); if (runs.length) children.push(new Paragraph({ spacing: { after: 150, line: 288 }, children: runs })); }); }
    for (const bl of (sec.bullets || []).slice(0, 60)) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 276 }, children: [new TextRun({ text: String(bl), size: 22, color: BODY, font: FONT })] }));
    for (const nb of (sec.numbered || []).slice(0, 60)) children.push(new Paragraph({ numbering: { reference: "mn", level: 0 }, spacing: { after: 80, line: 276 }, children: [new TextRun({ text: String(nb), size: 22, color: BODY, font: FONT })] }));
    if (sec.callout) { const co = sec.callout; const runs = []; if (co.title) { runs.push(new TextRun({ text: String(co.title), bold: true, color: NAVY, size: 22, font: FONT })); runs.push(new TextRun({ break: 1 })); } runs.push(new TextRun({ text: String(co.text || ""), size: 22, color: BODY, font: FONT })); children.push(new Paragraph({ shading: { type: ShadingType.CLEAR, color: "auto", fill: BAND }, border: { left: { color: accent, style: BorderStyle.SINGLE, size: 24, space: 10 } }, spacing: { before: 120, after: 160, line: 276 }, children: runs })); }
    if (sec.quote) children.push(new Paragraph({ border: { left: { color: accent, style: BorderStyle.SINGLE, size: 18, space: 10 } }, indent: { left: 240 }, spacing: { before: 120, after: 160 }, children: [new TextRun({ text: String(sec.quote), italics: true, size: 24, color: MUT, font: FONT })] }));
    if (Array.isArray(sec.table) && sec.table.length) { children.push(_docxTable(docx, sec.table, accent)); children.push(new Paragraph({ spacing: { after: 160 }, children: [] })); }
  }
  if (!children.length) children.push(new Paragraph({ text: "(empty document)" }));
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ["Page ", PageNumber.CURRENT], size: 16, color: MUT, font: FONT }), ...(spec.brand ? [new TextRun({ text: "      " + String(spec.brand), size: 16, color: MUT, font: FONT })] : [])] })] });
  const doc = new Document({ creator: "Madav", numbering: { config: [{ reference: "mn", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] }, styles: { default: { document: { run: { font: FONT } } } }, sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, footers: { default: footer }, children }] });
  return await Packer.toBlob(doc);
}

// ── Presentation design system ────────────────────────────────────────────
// A small, self-contained theme + layout engine so decks look *designed* — dark
// panels, an accent system, card grids and stat callouts — instead of bare
// bullets on a white slide. The model emits structured content; the brilliance
// lives here, in code that runs identically on web and desktop (no Python, no
// sandbox). Slides can declare a `layout`; if they don't, we infer one from the
// fields present, so even a plain {title,bullets} spec still renders beautifully.
const PW = 13.33, PH = 7.5;                       // 16:9 canvas (inches)
const _hx = (c, d) => { const s = String(c == null ? "" : c).replace(/^#/, ""); return /^[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : d; };
function pptTheme(spec) {
  const light = (spec.theme || "dark") === "light";
  const accent = _hx(spec.accent, light ? "2F6FED" : "5B8DEF");
  return light
    ? { light: true, bg: "FFFFFF", panel: "F3F6FC", line: "DCE3F0", fg: "0B1320", mut: "5A647A", accent, accentFg: "FFFFFF", head: "Calibri", body: "Calibri" }
    : { light: false, bg: "0B0E15", panel: "161C29", line: "2A3344", fg: "F2F5FA", mut: "9AA7BD", accent, accentFg: "0B0E15", head: "Calibri", body: "Calibri" };
}
function _slide(p, t, idx, total, brand) {
  const s = p.addSlide();
  s.background = { color: t.bg };
  s.addShape(p.ShapeType.rect, { x: 0, y: PH - 0.32, w: PW, h: 0.045, fill: { color: t.accent } });
  if (brand) s.addText(String(brand), { x: 0.7, y: PH - 0.42, w: 9, h: 0.3, fontSize: 9, color: t.mut, fontFace: t.body });
  if (idx && total) s.addText(idx + " / " + total, { x: PW - 1.5, y: PH - 0.42, w: 1.1, h: 0.3, fontSize: 9, color: t.mut, align: "right", fontFace: t.body });
  return s;
}
function _header(p, s, t, sl) {
  const ky = !!sl.kicker;
  if (ky) s.addText(String(sl.kicker).toUpperCase(), { x: 0.8, y: 0.5, w: PW - 1.6, h: 0.32, fontSize: 12, bold: true, color: t.accent, charSpacing: 2, fontFace: t.body });
  s.addText(String(sl.title || ""), { x: 0.8, y: ky ? 0.84 : 0.55, w: PW - 1.6, h: 0.8, fontSize: 28, bold: true, color: t.fg, fontFace: t.head });
  s.addShape(p.ShapeType.rect, { x: 0.82, y: ky ? 1.56 : 1.3, w: 1.1, h: 0.06, fill: { color: t.accent } });
}
function _statPanel(p, s, t, stats, x, y, w, h) {
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, fill: { color: t.panel }, line: { color: t.line, width: 1 }, rectRadius: 0.12 });
  const n = stats.length || 1, slot = h / n;
  stats.forEach((st, i) => {
    const cy = y + i * slot + slot * 0.18;
    s.addText(String(st.value != null ? st.value : ""), { x: x + 0.3, y: cy, w: w - 0.6, h: slot * 0.5, fontSize: 30, bold: true, color: t.accent, align: "center", fontFace: t.head });
    s.addText(String(st.label != null ? st.label : ""), { x: x + 0.3, y: cy + slot * 0.5, w: w - 0.6, h: slot * 0.32, fontSize: 13, color: t.mut, align: "center", fontFace: t.body });
  });
}
function _renderTitle(p, t, spec) {
  const s = _slide(p, t, 0, 0, spec.brand);
  const stats = Array.isArray(spec.stats) ? spec.stats.slice(0, 3) : [];
  const leftW = stats.length ? 7.7 : PW - 1.6;
  s.addShape(p.ShapeType.rect, { x: 0.8, y: 1.7, w: 1.6, h: 0.16, fill: { color: t.accent } });
  s.addText(String(spec.title || "Untitled"), { x: 0.8, y: 2.05, w: leftW, h: 2.1, fontSize: 44, bold: true, color: t.fg, fontFace: t.head, valign: "top", lineSpacingMultiple: 1.02 });
  if (spec.subtitle) s.addText(String(spec.subtitle), { x: 0.8, y: 4.2, w: leftW, h: 1.0, fontSize: 20, italic: true, color: t.mut, fontFace: t.body, valign: "top" });
  if (stats.length) _statPanel(p, s, t, stats, 8.85, 1.55, 3.7, 4.4);
}
function _renderSection(p, t, sl, idx, total, brand) {
  const s = _slide(p, t, idx, total, brand);
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: PH, fill: { color: t.accent } });
  if (sl.kicker) s.addText(String(sl.kicker).toUpperCase(), { x: 1.0, y: 2.55, w: 11.3, h: 0.4, fontSize: 13, bold: true, color: t.accent, charSpacing: 2, fontFace: t.body });
  s.addText(String(sl.title || ""), { x: 1.0, y: 2.95, w: 11.3, h: 1.3, fontSize: 40, bold: true, color: t.fg, fontFace: t.head, valign: "top" });
  if (sl.subtitle || sl.text) s.addText(String(sl.subtitle || sl.text), { x: 1.0, y: 4.3, w: 11.3, h: 1.2, fontSize: 18, italic: true, color: t.mut, fontFace: t.body, valign: "top" });
}
function _renderBullets(p, t, sl, idx, total, brand) {
  const s = _slide(p, t, idx, total, brand); _header(p, s, t, sl);
  const items = (sl.bullets || []).slice(0, 8).map((b) => ({ text: String(b), options: { bullet: { code: "2022", indent: 20 }, color: t.fg, fontSize: 18, breakLine: true, paraSpaceAfter: 10 } }));
  if (items.length) s.addText(items, { x: 0.9, y: 1.85, w: PW - 1.8, h: 4.9, valign: "top", fontFace: t.body });
  else if (sl.text) s.addText(String(sl.text), { x: 0.9, y: 1.85, w: PW - 1.8, h: 4.9, color: t.fg, fontSize: 18, valign: "top", lineSpacingMultiple: 1.25, fontFace: t.body });
}
function _renderCards(p, t, sl, idx, total, brand) {
  const s = _slide(p, t, idx, total, brand); _header(p, s, t, sl);
  const cards = (sl.cards || []).slice(0, 6), n = cards.length || 1;
  const cols = n <= 2 ? n : (n <= 4 ? 2 : 3), rows = Math.ceil(n / cols), gap = 0.4;
  const x0 = 0.8, y0 = 1.9, gw = PW - x0 * 2, gh = PH - y0 - 0.55;
  const cw = (gw - gap * (cols - 1)) / cols, ch = (gh - gap * (rows - 1)) / rows;
  cards.forEach((c, i) => {
    const r = Math.floor(i / cols), col = i % cols, x = x0 + col * (cw + gap), y = y0 + r * (ch + gap);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, fill: { color: t.panel }, line: { color: t.line, width: 1 }, rectRadius: 0.1 });
    s.addShape(p.ShapeType.rect, { x, y: y + 0.14, w: 0.08, h: ch - 0.28, fill: { color: t.accent } });
    let ty = y + 0.28;
    if (c.badge) { const bw = Math.min(2.6, 0.12 * String(c.badge).length + 0.55); s.addShape(p.ShapeType.roundRect, { x: x + 0.32, y: ty, w: bw, h: 0.34, fill: { color: t.accent }, rectRadius: 0.17 }); s.addText(String(c.badge), { x: x + 0.32, y: ty, w: bw, h: 0.34, fontSize: 11, bold: true, color: t.accentFg, align: "center", valign: "middle", fontFace: t.body }); ty += 0.52; }
    s.addText(String(c.title || ""), { x: x + 0.32, y: ty, w: cw - 0.6, h: 0.5, fontSize: 18, bold: true, color: t.fg, fontFace: t.head, valign: "top" }); ty += 0.56;
    const lines = Array.isArray(c.lines) ? c.lines : (c.desc ? String(c.desc).split(/\n+/) : []);
    if (lines.length) { const li = lines.slice(0, 5).map((l) => ({ text: String(l), options: { bullet: { code: "2022", indent: 14 }, color: t.mut, fontSize: 13, breakLine: true, paraSpaceAfter: 5 } })); s.addText(li, { x: x + 0.32, y: ty, w: cw - 0.6, h: ch - (ty - y) - 0.2, valign: "top", fontFace: t.body }); }
  });
}
function _renderStats(p, t, sl, idx, total, brand) {
  const s = _slide(p, t, idx, total, brand); _header(p, s, t, sl);
  const stats = (sl.stats || []).slice(0, 4), n = stats.length || 1, gap = 0.4;
  const x0 = 0.8, gw = PW - x0 * 2, cw = (gw - gap * (n - 1)) / n, y = 2.7, h = 2.5;
  stats.forEach((st, i) => {
    const x = x0 + i * (cw + gap);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h, fill: { color: t.panel }, line: { color: t.line, width: 1 }, rectRadius: 0.12 });
    s.addText(String(st.value != null ? st.value : ""), { x: x + 0.2, y: y + 0.45, w: cw - 0.4, h: 1.1, fontSize: 40, bold: true, color: t.accent, align: "center", fontFace: t.head });
    s.addText(String(st.label != null ? st.label : ""), { x: x + 0.2, y: y + 1.55, w: cw - 0.4, h: 0.8, fontSize: 14, color: t.mut, align: "center", valign: "top", fontFace: t.body });
  });
}
async function buildPptx(spec) {
  // Import the concrete browser ESM build, not the bare package specifier — pptxgenjs's package
  // entry doesn't resolve as a runtime ES module in the web bundle ("Failed to resolve module
  // specifier 'pptxgenjs'"); the explicit dist path bundles cleanly on web and desktop.
  const mod = await import("pptxgenjs/dist/pptxgen.es.js");
  const Pptx = mod.default || mod;
  const p = new Pptx();
  p.layout = "LAYOUT_WIDE";
  try { p.author = "Madav"; p.company = "Madav"; } catch {}
  const t = pptTheme(spec);
  const brand = spec.brand || "";
  const slides = (spec.slides || []).slice(0, 40);
  const total = slides.length + (spec.title ? 1 : 0);
  let n = spec.title ? 1 : 0;
  if (spec.title) _renderTitle(p, t, spec);
  for (const sl of slides) {
    n++;
    const layout = sl.layout || (Array.isArray(sl.cards) && sl.cards.length ? "cards" : Array.isArray(sl.stats) && sl.stats.length ? "stats" : sl.section ? "section" : "bullets");
    if (layout === "section") _renderSection(p, t, sl, n, total, brand);
    else if (layout === "cards") _renderCards(p, t, sl, n, total, brand);
    else if (layout === "stats") _renderStats(p, t, sl, n, total, brand);
    else _renderBullets(p, t, sl, n, total, brand);
  }
  if (!total) { const s = _slide(p, t, 0, 0, brand); s.addText("(empty deck)", { x: 1, y: 3, w: 11, h: 1, color: t.fg, fontSize: 24, fontFace: t.head }); }
  return await p.write({ outputType: "blob" });
}

const _rgb = (hex) => { const h = String(hex).replace(/^#/, ""); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; };
async function buildPdf(spec) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595, PH = 842, M = 56, LW = W - M * 2;
  const acc = _rgb(_hx(spec.accent, _OFFICE_ACCENT));
  const BODY = [31, 41, 51], MUT = [107, 114, 128], LINE = [215, 222, 234], BAND = [242, 246, 251];
  let y = M;
  const ensure = (h) => { if (y + h > PH - M) { doc.addPage(); y = M; } };
  const setC = (c) => doc.setTextColor(c[0], c[1], c[2]);
  doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(0, 0, W, 10, "F");
  if (spec.title) { setC([17, 24, 39]); doc.setFont("helvetica", "bold"); doc.setFontSize(24); y = 88; for (const l of doc.splitTextToSize(String(spec.title), LW)) { doc.text(l, M, y); y += 28; } }
  if (spec.subtitle) { setC(acc); doc.setFont("helvetica", "bold"); doc.setFontSize(13); y += 2; for (const l of doc.splitTextToSize(String(spec.subtitle), LW)) { doc.text(l, M, y); y += 17; } }
  if (Array.isArray(spec.meta) && spec.meta.length) { y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); let x = M; for (const m of spec.meta.slice(0, 6)) { const lab = (m.label ? m.label + ": " : ""); setC(MUT); doc.text(lab, x, y); x += doc.getTextWidth(lab); const val = String(m.value == null ? "" : m.value); setC(BODY); doc.setFont("helvetica", "bold"); doc.text(val, x, y); x += doc.getTextWidth(val) + 18; doc.setFont("helvetica", "normal"); } y += 8; }
  y += 8; doc.setDrawColor(acc[0], acc[1], acc[2]); doc.setLineWidth(1.4); doc.line(M, y, W - M, y); y += 24;
  for (const sec of (spec.sections || []).slice(0, 120)) {
    if (sec.heading) { const lvl = sec.level === 2 ? 2 : 1; ensure(34); y += 8; setC(acc); doc.setFont("helvetica", "bold"); doc.setFontSize(lvl === 1 ? 15 : 13); doc.text(String(sec.heading), M, y); y += 6; if (lvl === 1) { doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); } y += 16; }
    if (sec.leadIn || sec.text) { const paras = String(sec.text || "").split(/\n{2,}/); paras.forEach((para, pi) => { if (!para.trim() && !(pi === 0 && sec.leadIn)) return; let x = M; ensure(15); if (pi === 0 && sec.leadIn) { setC(BODY); doc.setFont("helvetica", "bold"); doc.setFontSize(11); const lead = String(sec.leadIn) + "  "; doc.text(lead, x, y); x += doc.getTextWidth(lead); } setC(BODY); doc.setFont("helvetica", "normal"); doc.setFontSize(11); const wr = doc.splitTextToSize(para.trim(), LW - (x - M)); if (wr.length) { doc.text(wr[0], x, y); y += 15; for (let i = 1; i < wr.length; i++) { ensure(15); doc.text(wr[i], M, y); y += 15; } } else y += 15; y += 6; }); }
    for (const b of (sec.bullets || []).slice(0, 60)) { const lines = doc.splitTextToSize(String(b), LW - 16); lines.forEach((l, i) => { ensure(15); if (i === 0) { setC(acc); doc.text("•", M, y); } setC(BODY); doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(l, M + 16, y); y += 15; }); y += 3; }
    (sec.numbered || []).slice(0, 60).forEach((b, ni) => { const lines = doc.splitTextToSize(String(b), LW - 22); lines.forEach((l, i) => { ensure(15); if (i === 0) { setC(acc); doc.setFont("helvetica", "bold"); doc.text((ni + 1) + ".", M, y); } setC(BODY); doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.text(l, M + 22, y); y += 15; }); y += 3; });
    if (sec.callout) { const co = sec.callout; doc.setFontSize(11); const bodyLines = doc.splitTextToSize(String(co.text || ""), LW - 28); const boxH = 10 + (co.title ? 16 : 0) + bodyLines.length * 15 + 6; ensure(boxH); doc.setFillColor(BAND[0], BAND[1], BAND[2]); doc.rect(M, y, LW, boxH, "F"); doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(M, y, 4, boxH, "F"); let cy = y + 18; if (co.title) { setC(acc); doc.setFont("helvetica", "bold"); doc.text(String(co.title), M + 14, cy); cy += 16; } setC(BODY); doc.setFont("helvetica", "normal"); for (const l of bodyLines) { doc.text(l, M + 14, cy); cy += 15; } y += boxH + 12; }
    if (sec.quote) { doc.setFont("helvetica", "italic"); doc.setFontSize(12); setC(MUT); const ql = doc.splitTextToSize(String(sec.quote), LW - 22); const qh = ql.length * 16 + 4; ensure(qh); doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(M, y - 2, 3, qh, "F"); let qy = y + 12; for (const l of ql) { doc.text(l, M + 16, qy); qy += 16; } y += qh + 8; doc.setFont("helvetica", "normal"); }
    if (Array.isArray(sec.table) && sec.table.length) { y += 4; const rows = sec.table.slice(0, 80); const nc = Math.max(1, ...rows.map((r) => Array.isArray(r) ? r.length : 1)); const cw = LW / nc; const pad = 6, rowH = 20; rows.forEach((r, ri) => { ensure(rowH); const cells = Array.isArray(r) ? r : [r]; if (ri === 0) { doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(M, y, LW, rowH, "F"); } else if (ri % 2 === 0) { doc.setFillColor(BAND[0], BAND[1], BAND[2]); doc.rect(M, y, LW, rowH, "F"); } doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.6); for (let c = 0; c < nc; c++) { const x = M + c * cw; doc.rect(x, y, cw, rowH); setC(ri === 0 ? [255, 255, 255] : BODY); doc.setFont("helvetica", ri === 0 ? "bold" : "normal"); doc.setFontSize(10); const txt = String(cells[c] == null ? "" : cells[c]); const t = doc.splitTextToSize(txt, cw - pad * 2)[0] || ""; doc.text(t, x + pad, y + 13); } y += rowH; }); y += 12; }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); setC([150, 160, 175]); doc.text("Page " + i + " / " + pages, W - M, PH - 28, { align: "right" }); if (spec.brand) doc.text(String(spec.brand), M, PH - 28); }
  return doc.output("blob");
}

export async function buildOfficeBlob(spec) {
  switch (spec.type) {
    case "xlsx": return buildXlsx(spec);
    case "docx": return buildDocx(spec);
    case "pptx": return buildPptx(spec);
    case "pdf": return buildPdf(spec);
    default: throw new Error("Unknown document type");
  }
}

export async function downloadOffice(spec) {
  const blob = await buildOfficeBlob(spec);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = spec.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── In-app preview ─────────────────────────────────────────────────────────
// Render a spec to a self-contained HTML document for the side panel ("click →
// shows in a window next to it"). It mirrors the generated file's design so the
// preview is faithful; Download still produces the real .pptx/.docx/.xlsx/.pdf.
const _eh = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function _previewPptx(spec) {
  const t = pptTheme(spec);
  const brand = spec.brand ? `<div class="ft">${_eh(spec.brand)}</div>` : "";
  const slides = [];
  const head = (sl) => `${sl.kicker ? `<div class="kick">${_eh(sl.kicker)}</div>` : ""}<div class="h2">${_eh(sl.title)}</div><div class="rule"></div>`;
  if (spec.title) {
    const stats = Array.isArray(spec.stats) ? spec.stats.slice(0, 3) : [];
    const panel = stats.length ? `<div class="tpanel">${stats.map((s) => `<div class="tp"><div class="tpv">${_eh(s.value)}</div><div class="tpl">${_eh(s.label)}</div></div>`).join("")}</div>` : "";
    slides.push(`<div class="slide title"><div class="tleft"><div class="bar"></div><div class="h1">${_eh(spec.title)}</div>${spec.subtitle ? `<div class="sub">${_eh(spec.subtitle)}</div>` : ""}</div>${panel}${brand}<div class="foot"></div></div>`);
  }
  for (const sl of (spec.slides || []).slice(0, 40)) {
    const layout = sl.layout || (Array.isArray(sl.cards) && sl.cards.length ? "cards" : Array.isArray(sl.stats) && sl.stats.length ? "stats" : sl.section ? "section" : "bullets");
    let body = "";
    if (layout === "section") { body = `<div class="secbar"></div><div class="seccenter">${sl.kicker ? `<div class="kick">${_eh(sl.kicker)}</div>` : ""}<div class="h1 sec">${_eh(sl.title)}</div>${sl.subtitle || sl.text ? `<div class="sub">${_eh(sl.subtitle || sl.text)}</div>` : ""}</div>`; }
    else if (layout === "cards") { const cs = (sl.cards || []).slice(0, 6); body = head(sl) + `<div class="cards c${Math.min(cs.length <= 2 ? cs.length : (cs.length <= 4 ? 2 : 3), 3)}">${cs.map((c) => { const lines = Array.isArray(c.lines) ? c.lines : (c.desc ? String(c.desc).split(/\n+/) : []); return `<div class="card">${c.badge ? `<span class="badge">${_eh(c.badge)}</span>` : ""}<div class="ct">${_eh(c.title)}</div>${lines.length ? `<ul>${lines.slice(0, 5).map((l) => `<li>${_eh(l)}</li>`).join("")}</ul>` : ""}</div>`; }).join("")}</div>`; }
    else if (layout === "stats") { const ss = (sl.stats || []).slice(0, 4); body = head(sl) + `<div class="statrow">${ss.map((s) => `<div class="statbox"><div class="sv">${_eh(s.value)}</div><div class="sl">${_eh(s.label)}</div></div>`).join("")}</div>`; }
    else { const bl = (sl.bullets || []).slice(0, 8); body = head(sl) + (bl.length ? `<ul class="blist">${bl.map((b) => `<li>${_eh(b)}</li>`).join("")}</ul>` : sl.text ? `<div class="ptext">${_eh(sl.text)}</div>` : ""); }
    slides.push(`<div class="slide">${body}${brand}<div class="foot"></div></div>`);
  }
  const css = `*{box-sizing:border-box}body{margin:0;background:#0a0c10;padding:20px;font-family:'Segoe UI',system-ui,-apple-system,sans-serif}
  .slide{container-type:inline-size;position:relative;width:100%;max-width:880px;aspect-ratio:16/9;margin:0 auto 20px;background:#${t.bg};color:#${t.fg};border-radius:12px;overflow:hidden;padding:5.4% 6%;box-shadow:0 8px 30px rgba(0,0,0,.45);border:1px solid #${t.line}}
  .foot{position:absolute;left:0;bottom:0;width:100%;height:.55cqw;background:#${t.accent}}
  .ft{position:absolute;left:6%;bottom:2.4%;font-size:1.3cqw;color:#${t.mut}}
  .kick{font-size:1.5cqw;font-weight:700;letter-spacing:.12em;color:#${t.accent};text-transform:uppercase;margin-bottom:.6cqw}
  .h1{font-size:6cqw;font-weight:800;line-height:1.04}.h1.sec{font-size:5.4cqw}
  .h2{font-size:4cqw;font-weight:800;line-height:1.1}
  .rule{width:9%;height:.55cqw;background:#${t.accent};border-radius:3px;margin:1.4cqw 0 2.4cqw}
  .sub{font-size:2.3cqw;font-style:italic;color:#${t.mut};margin-top:1.6cqw}
  .bar{width:13%;height:1.2cqw;background:#${t.accent};border-radius:3px;margin-bottom:2.2cqw}
  .title{display:flex;gap:4%}.tleft{flex:1;display:flex;flex-direction:column;justify-content:center}
  .tpanel{width:31%;background:#${t.panel};border:1px solid #${t.line};border-radius:2cqw;display:flex;flex-direction:column;justify-content:space-evenly;padding:3cqw 1.5cqw}
  .tp{text-align:center}.tpv{font-size:4.6cqw;font-weight:800;color:#${t.accent}}.tpl{font-size:1.7cqw;color:#${t.mut};margin-top:.4cqw}
  ul.blist{margin:0;padding-left:3.4cqw}ul.blist li{font-size:2.5cqw;line-height:1.5;margin-bottom:1.4cqw}
  ul.blist li::marker{color:#${t.accent}}.ptext{font-size:2.5cqw;line-height:1.55}
  .cards{display:grid;gap:2cqw}.cards.c1{grid-template-columns:1fr}.cards.c2{grid-template-columns:1fr 1fr}.cards.c3{grid-template-columns:1fr 1fr 1fr}
  .card{position:relative;background:#${t.panel};border:1px solid #${t.line};border-radius:1.4cqw;padding:1.9cqw 1.9cqw 1.5cqw 2.4cqw;overflow:hidden}
  .card::before{content:"";position:absolute;left:0;top:12%;bottom:12%;width:.7cqw;background:#${t.accent};border-radius:3px}
  .badge{display:inline-block;background:#${t.accent};color:#${t.accentFg};font-size:1.5cqw;font-weight:700;padding:.4cqw 1cqw;border-radius:1cqw;margin-bottom:1cqw}
  .ct{font-size:2.7cqw;font-weight:800;margin-bottom:.8cqw}.card ul{margin:0;padding-left:2.4cqw}.card li{font-size:1.85cqw;color:#${t.mut};line-height:1.55;margin-bottom:.4cqw}.card li::marker{color:#${t.accent}}
  .statrow{display:flex;gap:2.4cqw;justify-content:center;margin-top:3cqw}
  .statbox{flex:1;background:#${t.panel};border:1px solid #${t.line};border-radius:1.6cqw;padding:3cqw 1cqw;text-align:center}
  .sv{font-size:6cqw;font-weight:800;color:#${t.accent}}.sl{font-size:2cqw;color:#${t.mut};margin-top:1cqw}
  .secbar{position:absolute;left:0;top:0;height:100%;width:2.6%;background:#${t.accent}}.seccenter{height:100%;display:flex;flex-direction:column;justify-content:center;padding-left:3%}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${slides.join("")}</body></html>`;
}
function _previewDoc(spec) {
  const acc = "#" + _hx(spec.accent, _OFFICE_ACCENT), NAVY = acc;
  const metaHtml = (Array.isArray(spec.meta) && spec.meta.length)
    ? `<div class="meta">${spec.meta.slice(0, 6).map((m) => `${m.label ? `<span class="ml">${_eh(m.label)}:</span> ` : ""}<b>${_eh(m.value)}</b>`).join('<span class="dot">·</span>')}</div>` : "";
  const secs = (spec.sections || []).slice(0, 120).map((sec) => {
    let h = "";
    if (sec.heading) h += sec.level === 2 ? `<h3>${_eh(sec.heading)}</h3>` : `<h2>${_eh(sec.heading)}</h2>`;
    const paras = String(sec.text || "").split(/\n{2,}/).filter((p) => p.trim());
    paras.forEach((p, pi) => { h += `<p>${pi === 0 && sec.leadIn ? `<b>${_eh(sec.leadIn)}</b> ` : ""}${_eh(p.trim())}</p>`; });
    if (!paras.length && sec.leadIn) h += `<p><b>${_eh(sec.leadIn)}</b></p>`;
    if ((sec.bullets || []).length) h += `<ul>${sec.bullets.map((b) => `<li>${_eh(b)}</li>`).join("")}</ul>`;
    if ((sec.numbered || []).length) h += `<ol>${sec.numbered.map((b) => `<li>${_eh(b)}</li>`).join("")}</ol>`;
    if (sec.callout) h += `<div class="callout">${sec.callout.title ? `<div class="ct">${_eh(sec.callout.title)}</div>` : ""}${_eh(sec.callout.text || "")}</div>`;
    if (sec.quote) h += `<blockquote>${_eh(sec.quote)}</blockquote>`;
    if (Array.isArray(sec.table) && sec.table.length) h += `<table>${sec.table.map((r, ri) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => ri === 0 ? `<th>${_eh(c)}</th>` : `<td>${_eh(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    return h;
  }).join("");
  const css = `body{margin:0;background:#9aa0aa;padding:26px;font-family:'Calibri',system-ui,sans-serif}
  .page{max-width:760px;margin:0 auto;background:#fff;color:#1f2933;padding:54px 64px;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.3);line-height:1.6}
  h1{font-size:30px;color:${NAVY};margin:0 0 4px}
  .stitle{color:${acc};font-weight:700;font-size:15px;margin:0 0 8px}
  .meta{font-size:12px;color:#6b7280;margin:0 0 14px;border-bottom:2px solid ${acc};padding-bottom:14px}
  .meta .ml{color:#6b7280}.meta .dot{margin:0 8px;color:#c0c6d0}
  h2{font-size:18px;color:${NAVY};margin:24px 0 8px;border-bottom:1px solid #d7deea;padding-bottom:5px}
  h3{font-size:15px;color:${acc};margin:20px 0 6px}
  p{margin:0 0 12px;font-size:15px}ul,ol{margin:0 0 12px;padding-left:24px}li{font-size:15px;margin-bottom:5px}
  .callout{background:#f2f6fb;border-left:4px solid ${acc};padding:12px 16px;margin:12px 0;font-size:15px}
  .callout .ct{font-weight:700;color:${NAVY};margin-bottom:4px}
  blockquote{border-left:3px solid ${acc};margin:12px 0;padding-left:14px;color:#6b7280;font-style:italic;font-size:15px}
  table{border-collapse:collapse;width:100%;margin:14px 0}th{background:${NAVY};color:#fff;text-align:left;padding:8px 12px;font-size:14px}
  td{border:1px solid #d7deea;padding:8px 12px;font-size:14px}tr:nth-child(even) td{background:#f2f6fb}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page">${spec.title ? `<h1>${_eh(spec.title)}</h1>` : ""}${spec.subtitle ? `<div class="stitle">${_eh(spec.subtitle)}</div>` : ""}${metaHtml}${secs}</div></body></html>`;
}
function _previewXlsx(spec) {
  const acc = "#" + _hx(spec.accent, "2F6FED");
  const sheets = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [{ name: "Sheet1", rows: spec.rows || [] }];
  const blocks = sheets.slice(0, 12).map((sh) => {
    const rows = (Array.isArray(sh.rows) ? sh.rows : []).slice(0, 200);
    const body = rows.map((r, ri) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => ri === 0 ? `<th>${_eh(c)}</th>` : `<td>${_eh(c)}</td>`).join("")}</tr>`).join("");
    return `<div class="sheet"><div class="sname">${_eh(sh.name || "Sheet")}</div><div class="scroll"><table>${body || "<tr><td>(empty)</td></tr>"}</table></div></div>`;
  }).join("");
  const css = `body{margin:0;background:#eef1f6;padding:22px;font-family:'Calibri',system-ui,sans-serif}
  .sheet{max-width:980px;margin:0 auto 26px}.sname{font-weight:700;color:${acc};font-size:14px;margin-bottom:8px}
  .scroll{overflow:auto;border:1px solid #d7deea;border-radius:8px;background:#fff}
  table{border-collapse:collapse;width:100%}th{background:${acc};color:#fff;position:sticky;top:0;text-align:left;padding:8px 14px;font-size:13px;white-space:nowrap}
  td{border:1px solid #e6ebf3;padding:7px 14px;font-size:13px;color:#1f2933;white-space:nowrap}tr:nth-child(even) td{background:#f4f6fb}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${blocks}</body></html>`;
}
export function renderOfficeHTML(specOrJson) {
  let spec = specOrJson;
  if (typeof specOrJson === "string") { try { spec = JSON.parse(specOrJson); } catch { spec = null; } }
  if (!spec || !spec.type) return "<!doctype html><meta charset='utf-8'><body style='font-family:system-ui;padding:30px;color:#666'>Nothing to preview yet.</body>";
  try {
    if (spec.type === "pptx") return _previewPptx(spec);
    if (spec.type === "xlsx") return _isRichXlsx(spec) ? renderTemplatePreview(spec, { accent: _hx(spec.accent, _OFFICE_ACCENT) }) : _previewXlsx(spec);
    return _previewDoc(spec); // docx + pdf share a document page look
  } catch (e) {
    return "<!doctype html><meta charset='utf-8'><body style='font-family:system-ui;padding:30px;color:#a00'>Preview error: " + _eh((e && e.message) || e) + "</body>";
  }
}

// Engine prompt rule — taught to the model alongside the artifact rule.
export const OFFICE_RULE = ` When the user asks for a REAL office file — a spreadsheet/Excel, Word document, PowerPoint deck, or PDF — output ONE fenced block tagged officedoc containing ONLY the JSON spec, like:
\`\`\`officedoc
{"type":"xlsx","name":"sales.xlsx","sheets":[{"name":"Q1","rows":[["Region","Sales"],["NA",1200]]}]}
\`\`\`
Types: xlsx {sheets:[{name,rows:[[…]]}]} · docx {title,subtitle?,accent?,sections:[{heading,text,bullets?,table?:[[…]]}]} · (SLIDE DECKS / .pptx are NOT made with officedoc — build them ONLY with a deckjs block, described below) · pdf {title,subtitle?,accent?,sections:[{heading,text,bullets?}]}. Fill it with COMPLETE real content (never placeholders); design decks with cards/stats and one accent colour. Produce EXACTLY the number of slides the user asks for — if they say "two slides", output 2, never more; put more depth INTO each slide rather than adding slides.  PRESENTATIONS and SLIDE DECKS (.pptx) MUST be built with a fenced deckjs block — do NOT use officedoc for slides (officedoc is for Excel, Word and PDF only; using officedoc for a deck is wrong and produces a flat template). Write JavaScript that composes the deck yourself with full design freedom. You are given pptx (a PptxGenJS instance; layout is already 13.33x7.5in widescreen). Madav runs it in a sandbox and shows a download card — never call pptx.write or writeFile. API: const s = pptx.addSlide(); s.background = { color: '0F1E3C' }; s.addText(t, { x, y, w, h, fontSize, bold, color, align, valign }); s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color }, line: { color, width }, rectRadius }) (also rect, ellipse, line); s.addChart(pptx.ChartType.bar, [{ name, labels, values }], { x, y, w, h, barDir, chartColors, showValue, showLegend }) (also line, pie, doughnut); s.addImage({ data: 'data:image/png;base64,...', x, y, w, h }) for icons. Coordinates are inches; colours are 6-hex strings without a hash. DESIGN like a top consultancy: a deliberate per-slide background, a SEMANTIC accent palette (teal metrics, gold highlights, red risk), oversized stat numbers, ellipse icon badges, a real chart for any data, generous spacing — compose every slide for ITS content, never a fixed template. Honor the requested slide COUNT exactly. Begin the script with a comment line: // name: Your Title.pptx. Worked example (yours should be richer and tailored to the topic): const s = pptx.addSlide(); s.background = { color: '0E1B2C' }; s.addText('EXECUTIVE BRIEFING', { x:0.6, y:0.45, w:8, h:0.3, fontSize:12, bold:true, color:'00C2FF', charSpacing:3 }); s.addText('The AI Landscape', { x:0.6, y:0.85, w:9, h:1, fontSize:40, bold:true, color:'FFFFFF' }); s.addText('$1.1T', { x:0.6, y:2.4, w:3, h:1, fontSize:54, bold:true, color:'00C2FF' }); s.addText('infra spend by 2027', { x:0.6, y:3.45, w:3.3, h:0.5, fontSize:13, color:'9AA7BD' }); s.addShape(pptx.ShapeType.roundRect, { x:6.7, y:2.4, w:6, h:1.1, fill:{ color:'14263A' }, line:{ color:'00C2FF', width:1 }, rectRadius:0.1 }); s.addShape(pptx.ShapeType.ellipse, { x:7.0, y:2.72, w:0.46, h:0.46, fill:{ color:'F5C842' } }); s.addText('Agentic AI goes production', { x:7.7, y:2.7, w:4.7, h:0.5, fontSize:15, bold:true, color:'FFFFFF' }); const s2 = pptx.addSlide(); s2.background = { color:'0E1B2C' }; s2.addText('Enterprise readiness', { x:0.6, y:0.5, w:9, h:0.7, fontSize:26, bold:true, color:'FFFFFF' }); s2.addChart(pptx.ChartType.bar, [{ name:'Readiness %', labels:['Platform','Governance','Talent'], values:[28,22,41] }], { x:0.7, y:1.6, w:11.9, h:4.8, barDir:'bar', chartColors:['00C2FF'], showValue:true, showLegend:false, catAxisLabelColor:'9AA7BD', valAxisHidden:true }); The app turns it into a downloadable file with a live preview. On change requests, re-emit the whole updated spec.`;

// ---- Capability-gated office rule (parity with electron officeRulePart; consumed by the web bridge) ----
// ESM copy of the shared rules for the RENDERER (Vite serves modules unbundled — a source .cjs with
// module.exports cannot run in the browser). The authoritative source for electron + server is
// shared/office-rules.cjs; test/rules-parity.test.cjs asserts this copy stays byte-identical to it.
export function isDeckCapable(model) {
  const m = String(model || "").toLowerCase();
  if (/(nano|mini|small|flash|haiku|lite|tiny|phi-|gemma-2-2b|\b[1-9]b\b|3b\b|7b\b|8b\b|9b\b|:free)/.test(m)) return false; // weak → reliable template
  return /(opus|sonnet|gpt-?5|gpt-?4|4o|\bo1\b|\bo3\b|gemini-(?:1\.5-pro|2|exp|pro)|deepseek|grok|3[0-9]b|[4-9][0-9]b|[1-9][0-9]{2}b|mistral-large|command-r-plus|qwen2?\.5-(?:32|72))/.test(m); // clearly-capable → bespoke; unknown → template
}

export function officeRule(model) {
  const head = " You CAN create real, downloadable office files. NEVER tell the user you cannot create a file, never tell them to copy text into PowerPoint / Word / Excel — that is wrong. For a Word document, PDF, or SPREADSHEET, output ONE fenced block tagged officedoc with ONLY the JSON spec, e.g.:\n```officedoc\n{\"type\":\"docx\",\"name\":\"brief.docx\",\"title\":\"Title\",\"sections\":[{\"heading\":\"Overview\",\"text\":\"…\"}]}\n```\nTypes: docx {title, subtitle?, accent?, meta?:[{label,value}], sections:[{heading?, level?:1|2, leadIn?, text?, bullets?, numbered?, table?:[[…]], callout?:{title?,text}, quote?}]} · pdf (same shape as docx: title, subtitle?, accent?, meta?, sections with heading/level/leadIn/text/bullets/numbered/table/callout/quote) · xlsx — a STRUCTURED model spec {type:\"xlsx\",name,sheets:[SHEET,…]} where each SHEET has a name, optional title, and one or more of: inputs:[{id,label,value,fmt,section?,note?}] (named hardcoded numbers, shown BLUE); derived:[{label,expr,fmt}] (computed from inputs); a financial MODEL via periods:{count,label:\"M%d\"} + metrics:[{id,label,fmt,role?,total?,expr,firstExpr?}] (metrics are rows and periods are columns — use firstExpr for period 1, [id@-1] for the previous period, total:true for a subtotal row, role:\"link\" to pull straight from another sheet); a TABLE/pivot via columns:[{key,header,fmt}] + rows:[{<key>:value or {expr}}] (or data:[[…]] of literals for a plain table); kpis:[{label,ref,fmt}] (headline tiles); and charts:[{type:\"line|col|bar|pie\",title,x:\"periods\" or a colKey,series:[{metric or col,name?}]}]. EXPRESSIONS use square-bracket ids and NEVER A1 cell addresses: [id]=same row/period of that id, [id@-1]=previous period, [Sheet!id]=a named input/metric on another sheet, [Sheet!metric#p]=that metric at period p, [Sheet!metric#a:b]=a periods range (wrap in SUM()). fmt is one of usd, usd2, num, num1, pct, pct0, mult, year. Put ALL assumptions on their OWN sheet as inputs and reference them by id — never hardcode a number inside a formula. Madav assigns every cell and writes every formula (so a reference can never break) and renders a polished, bordered, colour-coded Institutional sheet with native charts; you supply only the structure and relationships. Fill with COMPLETE real content, never placeholders. If a required topic is genuinely missing, ask ONE short question. ALWAYS tag the fenced block ```officedoc for a spreadsheet, Word document or PDF - never ```xlsx, ```json or ```docx; the JSON \"type\" field selects the format. Don't narrate that you're about to build it — just emit the block.";
  const deckBespoke = " For EVERY bespoke block below (deckjs / xlsxjs / docxjs / pdfjs): the script MUST be COMPLETE and valid JavaScript that runs without errors — never truncated or cut mid-statement; prefer loops and compact code over repetition so it finishes within the output limit; every text value must be a real string (never an object or undefined). SLIDE DECKS / PRESENTATIONS (.pptx): build with ONE fenced deckjs block and NOTHING else for the deck — never an officedoc block for slides. Write JavaScript that composes the deck with full design freedom. You are given pptx (a PptxGenJS instance; layout is already 13.33x7.5in widescreen). Do NOT call pptx.write or writeFile — Madav runs it and shows a download card. API: const s = pptx.addSlide(); s.background = { color: '0F1E3C' }; s.addText(t, { x, y, w, h, fontSize, bold, color, align, valign }); s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill:{ color }, line:{ color, width }, rectRadius }) (also rect, ellipse, line); s.addChart(pptx.ChartType.bar, [{ name, labels, values }], { x, y, w, h, barDir, chartColors, showValue, showLegend }) (also line, pie, doughnut); s.addImage({ data:'data:image/png;base64,...', x, y, w, h }) for a logo. For ICONS use s.addImage({ data: helpers.icon('NAME'), x, y, w, h }) — crisp white PNGs, best centred in a coloured circle/badge. Names: chip, cloud, shield, lock, bolt, bar, trending, gear, users, database, server, globe, rocket, brain, check, alert, target, layers, building, dollar, star, arrow (aliases: cpu, ai, security, chart, growth, settings, people, team, data, network, money, warning, success, company, stack). Coordinates in inches; colours are 6-hex without a hash. DESIGN like a top consultancy: a deliberate per-slide background — DEFAULT to a DARK background (deep navy / charcoal); use a WHITE/light background ONLY if the user explicitly asks for white, light or bright, a SEMANTIC accent palette (e.g. teal metrics, gold highlights, red risk), oversized stat numbers, ellipse icon badges, a real chart for any data, generous spacing, and DENSITY (CRITICAL — this is what separates a great deck from a sparse one): each slide MUST place 12-20 elements — a grid of 3-6 cards, a stat rail of 3-4 big numbers, a section band, a helpers.icon badge on EVERY card AND every stat (aim for 6-10 icons across the deck — icons are NOT optional; place each white icon centred inside a small coloured circle/roundRect), and a chart wherever there is data. A slide with under ~10 elements is a FAILURE — keep adding cards, stats and icons until the canvas is full edge-to-edge like a top-consultancy board slide — compose each slide for ITS content. If the user gave brand colours, fonts, or a logo, use them. Honor the requested slide COUNT exactly. Start the script with: // name: Your Title.pptx. Worked example (make yours richer): const s = pptx.addSlide(); s.background={ color:'0E1B2C' }; s.addText('EXECUTIVE BRIEFING',{ x:0.6,y:0.45,w:8,h:0.3,fontSize:12,bold:true,color:'00C2FF',charSpacing:3 }); s.addText('The AI Landscape',{ x:0.6,y:0.85,w:9,h:1,fontSize:40,bold:true,color:'FFFFFF' }); s.addText('$1.1T',{ x:0.6,y:2.4,w:3,h:1,fontSize:54,bold:true,color:'00C2FF' }); s.addShape(pptx.ShapeType.ellipse,{ x:7,y:2.7,w:0.5,h:0.5,fill:{ color:'F5C842' } }); const s2 = pptx.addSlide(); s2.background={ color:'0E1B2C' }; s2.addChart(pptx.ChartType.bar,[{ name:'Readiness', labels:['Platform','Governance','Talent'], values:[28,22,41] }],{ x:0.7,y:1.6,w:11.9,h:4.8,barDir:'bar',chartColors:['00C2FF'],showValue:true });";
  const deckTemplate = " For a PowerPoint deck / slides, emit ONE fenced officedoc block (NOTHING else for the deck): {\"type\":\"pptx\",\"name\":\"deck.pptx\",\"title\":\"…\",\"subtitle\":\"…\",\"accent\":\"2F6FED\",\"theme\":\"dark\",\"stats\":[{\"value\":\"…\",\"label\":\"…\"}],\"slides\":[{\"layout\":\"cards\",\"title\":\"…\",\"kicker\":\"…\",\"cards\":[{\"badge\":\"…\",\"title\":\"…\",\"lines\":[\"…\"]}]}]}. Layouts: \"bullets\" (title+bullets), \"cards\" (badge+title+lines grid), \"stats\" (big KPI numbers), \"section\" (divider). Design it: ONE accent hex fitting the topic, 2–3 headline numbers in the title stats, lead each slide title with the takeaway. Use real numbers, never placeholders. Honor the requested slide count exactly.";
  const tail = " The app turns the block into a downloadable file card. On change requests, re-emit the whole updated block.";
  const xlsxSimpleNote = " For a SPREADSHEET / Excel ONLY, IGNORE the structured model/formula spec above and instead output a PLAIN data table: {\"type\":\"xlsx\",\"name\":\"data.xlsx\",\"sheets\":[{\"name\":\"Sheet1\",\"rows\":[[\"Region\",\"Sales\"],[\"North America\",1200]]}]} - a header row then rows of the REAL finished numbers you work out yourself; do NOT use formulas, ids, expr, periods or cross-references.";
  return head + (isDeckCapable(model) ? deckBespoke : deckTemplate) + xlsxSimpleNote + tail;
}

export const ARTIFACT_RULE = " When you build or change something runnable — an HTML page, web app, tool, game, SVG, Mermaid diagram, React/JSX component, or a document — put the ENTIRE file in ONE fenced code block tagged with its language (```html, ```jsx, ```svg, ```mermaid, ```markdown). When the user asks for a change to it, return the COMPLETE updated file again in a single block — never a diff, snippet, or partial edit — so it re-renders as a live preview. For HTML pages and web UIs, DESIGN them to a professional standard — never the default-browser look: load Tailwind from CDN (<script src=\"https://cdn.tailwindcss.com\"></script>) or write real CSS; use a deliberate type scale and web fonts, generous whitespace, a cohesive accent-based colour system with strong contrast, responsive layout, and subtle depth (shadows, rounded corners, hover states). Build a complete, self-contained page (semantic sections, sensible placeholder imagery), not a bare snippet. Make it look like a shipped product.";
