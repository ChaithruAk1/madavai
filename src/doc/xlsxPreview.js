// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Render a built ExcelJS workbook to an HTML preview for the side panel (the spreadsheet equivalent of
// deckPreview.js). Shows each sheet as a styled table; formula cells (no cached result) appear as their
// formula in a muted style — the live numbers compute when the file is opened in Excel.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function cellText(cell) {
  const v = cell && cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.formula != null) return v.result != null && typeof v.result !== "object" ? String(v.result) : "=" + v.formula;
    if (v.sharedFormula != null) return v.result != null ? String(v.result) : "=" + v.sharedFormula;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.text != null) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (v.result != null && typeof v.result !== "object") return String(v.result);
    return "";
  }
  return String(v);
}
export function renderXlsxHTML(wb) {
  let body = "";
  (wb.worksheets || []).forEach((ws) => {
    body += `<h3 class="sh">${esc(ws.name)}</h3><table>`;
    const maxCol = Math.max(1, ws.columnCount || 1);
    ws.eachRow({ includeEmpty: false }, (row) => {
      body += "<tr>";
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        const isF = cell && cell.value && typeof cell.value === "object" && cell.value.formula != null && cell.value.result == null;
        let st = "";
        if (cell && cell.font && cell.font.bold) st += "font-weight:700;";
        try { const a = cell && cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb; if (a && a.length >= 6) st += "background:#" + a.slice(-6) + ";"; } catch {}
        try { const a = cell && cell.font && cell.font.color && cell.font.color.argb; if (a && a.length >= 6) st += "color:#" + a.slice(-6) + ";"; } catch {}
        if (isF) st += "opacity:.55;font-style:italic;";
        body += `<td style="${st}">${esc(cellText(cell))}</td>`;
      }
      body += "</tr>";
    });
    body += "</table>";
  });
  if (!body) body = "<p style='opacity:.6'>Empty workbook</p>";
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px 20px;background:#0f1115;color:#e8e8ea;font-family:system-ui,-apple-system,sans-serif;font-size:12.5px}h3.sh{margin:20px 0 8px;font-size:13px;color:#7fd1ff;font-weight:700;letter-spacing:.3px}table{border-collapse:collapse;margin-bottom:8px}td{border:1px solid #2a2e37;padding:4px 10px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}</style><body>${body}</body>`;
}
