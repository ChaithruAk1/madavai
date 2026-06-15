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
async function buildXlsx(spec) {
  let ExcelJS = null;
  try { const m = await import("exceljs"); ExcelJS = m.default || m; } catch { ExcelJS = null; }
  if (!ExcelJS) return buildXlsxBasic(spec);
  const accent = _hx(spec.accent, "2F6FED");
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

function _docxTable(docx, rows, accent) {
  const { Table, TableRow, TableCell, Paragraph, TextRun, WidthType, BorderStyle } = docx;
  const b = { style: BorderStyle.SINGLE, size: 2, color: "D7DEEA" };
  const borders = { top: b, bottom: b, left: b, right: b };
  const trs = rows.slice(0, 80).map((r, ri) => new TableRow({
    children: (Array.isArray(r) ? r : [r]).slice(0, 12).map((c) => new TableCell({
      borders, margins: { top: 60, bottom: 60, left: 120, right: 120 },
      shading: ri === 0 ? { fill: accent } : (ri % 2 === 0 ? { fill: "F4F6FB" } : undefined),
      children: [new Paragraph({ children: [new TextRun({ text: String(c == null ? "" : c), bold: ri === 0, color: ri === 0 ? "FFFFFF" : "1F2933", size: 21 })] })],
    })),
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: trs });
}
async function buildDocx(spec) {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, HeadingLevel, TextRun, BorderStyle, AlignmentType } = docx;
  const accent = _hx(spec.accent, "2F6FED");
  const children = [];
  if (spec.title) {
    children.push(new Paragraph({
      heading: HeadingLevel.TITLE, spacing: { after: spec.subtitle ? 40 : 220 },
      border: spec.subtitle ? undefined : { bottom: { color: accent, style: BorderStyle.SINGLE, size: 18, space: 8 } },
      children: [new TextRun({ text: String(spec.title), bold: true, color: "111827", size: 56 })],
    }));
    if (spec.subtitle) children.push(new Paragraph({
      spacing: { after: 260 }, border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 18, space: 8 } },
      children: [new TextRun({ text: String(spec.subtitle), bold: true, color: accent, size: 26 })],
    }));
  }
  for (const sec of (spec.sections || []).slice(0, 80)) {
    if (sec.heading) children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 },
      children: [new TextRun({ text: String(sec.heading), bold: true, color: accent, size: 30 })],
    }));
    for (const para of String(sec.text || "").split(/\n{2,}/).slice(0, 60)) {
      if (para.trim()) children.push(new Paragraph({ spacing: { after: 150, line: 288 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: para.trim(), size: 22, color: "1F2933" })] }));
    }
    for (const bl of (sec.bullets || []).slice(0, 60)) children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 276 }, children: [new TextRun({ text: String(bl), size: 22, color: "1F2933" })] }));
    if (Array.isArray(sec.table) && sec.table.length) { children.push(_docxTable(docx, sec.table, accent)); children.push(new Paragraph({ spacing: { after: 120 }, children: [] })); }
  }
  if (!children.length) children.push(new Paragraph({ text: "(empty document)" }));
  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } }, children }],
  });
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
  const W = 595, PHt = 842, M = 56, LW = W - M * 2;
  const acc = _rgb(_hx(spec.accent, "2F6FED"));
  let y = M;
  const ensure = (h) => { if (y + h > PHt - M) { doc.addPage(); y = M; } };
  if (spec.title) {
    doc.setFillColor(acc[0], acc[1], acc[2]); doc.rect(0, 0, W, 9, "F");      // top accent band
    doc.setTextColor(17, 24, 39); doc.setFont("helvetica", "bold"); doc.setFontSize(24);
    y = 92; for (const line of doc.splitTextToSize(String(spec.title), LW)) { doc.text(line, M, y); y += 28; }
    if (spec.subtitle) { doc.setTextColor(acc[0], acc[1], acc[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(13); y += 2; for (const line of doc.splitTextToSize(String(spec.subtitle), LW)) { doc.text(line, M, y); y += 17; } }
    y += 6; doc.setDrawColor(acc[0], acc[1], acc[2]); doc.setLineWidth(1.4); doc.line(M, y, W - M, y); y += 26;
  }
  for (const sec of (spec.sections || []).slice(0, 80)) {
    if (sec.heading) { ensure(34); y += 10; doc.setTextColor(acc[0], acc[1], acc[2]); doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(String(sec.heading), M, y); y += 18; }
    doc.setTextColor(31, 41, 51); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    for (const para of String(sec.text || "").split(/\n{2,}/)) { if (!para.trim()) continue; for (const line of doc.splitTextToSize(para.trim(), LW)) { ensure(15); doc.text(line, M, y); y += 15; } y += 6; }
    for (const b of (sec.bullets || [])) {
      const lines = doc.splitTextToSize(String(b), LW - 16);
      lines.forEach((line, idx) => { ensure(15); if (idx === 0) { doc.setTextColor(acc[0], acc[1], acc[2]); doc.text("•", M, y); doc.setTextColor(31, 41, 51); } doc.text(line, M + 16, y); y += 15; });
      y += 3;
    }
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 160, 175);
    doc.text(i + " / " + pages, W - M, PHt - 28, { align: "right" });
    if (spec.brand) doc.text(String(spec.brand), M, PHt - 28);
  }
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
  const acc = "#" + _hx(spec.accent, "2F6FED");
  const secs = (spec.sections || []).slice(0, 80).map((sec) => {
    let h = sec.heading ? `<h2>${_eh(sec.heading)}</h2>` : "";
    h += String(sec.text || "").split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${_eh(p.trim())}</p>`).join("");
    if ((sec.bullets || []).length) h += `<ul>${sec.bullets.map((b) => `<li>${_eh(b)}</li>`).join("")}</ul>`;
    if (Array.isArray(sec.table) && sec.table.length) h += `<table>${sec.table.map((r, ri) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => ri === 0 ? `<th>${_eh(c)}</th>` : `<td>${_eh(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    return h;
  }).join("");
  const css = `body{margin:0;background:#9aa0aa;padding:26px;font-family:'Calibri',system-ui,sans-serif}
  .page{max-width:760px;margin:0 auto;background:#fff;color:#1f2933;padding:54px 64px;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.3);line-height:1.6}
  h1{font-size:30px;color:#111827;margin:0 0 6px;border-bottom:3px solid ${acc};padding-bottom:12px}
  .stitle{color:${acc};font-weight:700;font-size:15px;margin:-2px 0 22px}
  h2{font-size:18px;color:${acc};margin:26px 0 8px}p{margin:0 0 12px;font-size:15px}
  ul{margin:0 0 12px;padding-left:24px}li{font-size:15px;margin-bottom:5px}
  table{border-collapse:collapse;width:100%;margin:14px 0}th{background:${acc};color:#fff;text-align:left;padding:8px 12px;font-size:14px}
  td{border:1px solid #d7deea;padding:8px 12px;font-size:14px}tr:nth-child(even) td{background:#f4f6fb}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="page">${spec.title ? `<h1>${_eh(spec.title)}</h1>` : ""}${spec.subtitle ? `<div class="stitle">${_eh(spec.subtitle)}</div>` : ""}${secs}</div></body></html>`;
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
    if (spec.type === "xlsx") return _previewXlsx(spec);
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
// Single source of truth — web + desktop both consume shared/office-rules.cjs (see CLAUDE.md).
export { officeRule, isDeckCapable } from "../shared/office-rules.cjs";
