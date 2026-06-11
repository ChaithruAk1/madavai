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

async function buildXlsx(spec) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheets = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [{ name: "Sheet1", rows: spec.rows || [] }];
  for (const sh of sheets.slice(0, 12)) {
    const rows = (Array.isArray(sh.rows) ? sh.rows : []).slice(0, 5000).map((r) => (Array.isArray(r) ? r.slice(0, 64) : [r]));
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [["(empty)"]]);
    XLSX.utils.book_append_sheet(wb, ws, String(sh.name || "Sheet").slice(0, 28).replace(/[\\/?*[\]:]/g, " "));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function buildDocx(spec) {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const children = [];
  if (spec.title) children.push(new Paragraph({ text: String(spec.title), heading: HeadingLevel.TITLE }));
  for (const sec of (spec.sections || []).slice(0, 60)) {
    if (sec.heading) children.push(new Paragraph({ text: String(sec.heading), heading: HeadingLevel.HEADING_1 }));
    for (const para of String(sec.text || "").split(/\n{2,}/).slice(0, 40)) {
      if (para.trim()) children.push(new Paragraph({ children: [new TextRun(para.trim())] }));
    }
    for (const b of (sec.bullets || []).slice(0, 40)) children.push(new Paragraph({ text: String(b), bullet: { level: 0 } }));
  }
  if (!children.length) children.push(new Paragraph({ text: "(empty document)" }));
  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}

async function buildPptx(spec) {
  const mod = await import("pptxgenjs");
  const Pptx = mod.default || mod;
  const p = new Pptx();
  if (spec.title) { const s = p.addSlide(); s.addText(String(spec.title), { x: 0.5, y: 1.8, w: 9, h: 1.5, fontSize: 34, bold: true }); if (spec.subtitle) s.addText(String(spec.subtitle), { x: 0.5, y: 3.2, w: 9, h: 0.8, fontSize: 16, color: "666666" }); }
  for (const sl of (spec.slides || []).slice(0, 40)) {
    const s = p.addSlide();
    if (sl.title) s.addText(String(sl.title), { x: 0.5, y: 0.35, w: 9, h: 0.8, fontSize: 24, bold: true });
    const bullets = (sl.bullets || []).slice(0, 12).map((b) => ({ text: String(b), options: { bullet: true, fontSize: 14, breakLine: true } }));
    if (bullets.length) s.addText(bullets, { x: 0.6, y: 1.3, w: 8.8, h: 4.4, valign: "top" });
    else if (sl.text) s.addText(String(sl.text), { x: 0.6, y: 1.3, w: 8.8, h: 4.4, fontSize: 14, valign: "top" });
  }
  return await p.write({ outputType: "blob" });
}

async function buildPdf(spec) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = 595, M = 56, LW = W - M * 2;
  let y = M;
  const ensure = (h) => { if (y + h > 842 - M) { doc.addPage(); y = M; } };
  if (spec.title) { doc.setFontSize(20); doc.setFont("helvetica", "bold"); ensure(28); doc.text(String(spec.title), M, y); y += 30; }
  for (const sec of (spec.sections || []).slice(0, 80)) {
    if (sec.heading) { doc.setFontSize(14); doc.setFont("helvetica", "bold"); ensure(22); y += 6; doc.text(String(sec.heading), M, y); y += 18; }
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    const body = String(sec.text || "") + (sec.bullets || []).map((b) => "\n• " + b).join("");
    for (const line of doc.splitTextToSize(body, LW)) { ensure(15); doc.text(line, M, y); y += 15; }
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

// Engine prompt rule — taught to the model alongside the artifact rule.
export const OFFICE_RULE = ` When the user asks for a REAL office file — a spreadsheet/Excel, Word document, PowerPoint deck, or PDF — output ONE fenced block tagged officedoc containing ONLY the JSON spec, like:
\`\`\`officedoc
{"type":"xlsx","name":"sales.xlsx","sheets":[{"name":"Q1","rows":[["Region","Sales"],["NA",1200]]}]}
\`\`\`
Types: xlsx {sheets:[{name,rows:[[…]]}]} · docx {title,sections:[{heading,text,bullets?}]} · pptx {title,subtitle?,slides:[{title,bullets?|text?}]} · pdf {title,sections:[{heading,text,bullets?}]}. Fill it with COMPLETE real content (never placeholders); the app turns it into a downloadable file. On change requests, re-emit the whole updated spec.`;
