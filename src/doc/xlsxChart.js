// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Native Excel charts for the bespoke spreadsheet engine. ExcelJS can't WRITE charts, so after it
// serialises the workbook we inject real OOXML chart parts into the .xlsx zip (chart + drawing + rels +
// content-types). Result: genuine, editable, recalculating Excel charts — same kind Claude produces.
import JSZip from "jszip";

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const qsheet = (n) => /[^A-Za-z0-9_]/.test(n) ? "'" + String(n).replace(/'/g, "''") + "'" : String(n);
const absR = (r) => String(r).replace(/([A-Za-z]+)(\d+)/g, "$$$1$$$2"); // A2:A13 -> $A$2:$A$13
const fullRef = (sheet, range) => qsheet(sheet) + "!" + absR(range);
function colNum(letters) { let n = 0; for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function parseAnchor(a) { // 'P2' -> {col,row} 0-based; default size added by caller
  const m = /^([A-Za-z]+)(\d+)$/.exec(String(a || "P2")); const c = m ? colNum(m[1]) - 1 : 15; const r = m ? parseInt(m[2], 10) - 1 : 1; return { col: c, row: r };
}

function chartXml(spec) {
  const cat = fullRef(spec.sheet, spec.categories);
  const sers = (spec.series || []).map((s, i) => {
    const v = fullRef(spec.sheet, s.values);
    const nm = s.name ? `<c:tx><c:v>${esc(s.name)}</c:v></c:tx>` : "";
    const mk = spec.type === "line" ? `<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>` : "";
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>${nm}${mk}<c:cat><c:numRef><c:f>${esc(cat)}</c:f></c:numRef></c:cat><c:val><c:numRef><c:f>${esc(v)}</c:f></c:numRef></c:val>${spec.type==='line'?'<c:smooth val="0"/>':''}</c:ser>`;
  }).join("");
  const title = spec.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:t>${esc(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : `<c:autoTitleDeleted val="1"/>`;
  let plot;
  if (spec.type === "pie") {
    plot = `<c:pieChart><c:varyColors val="1"/>${sers}</c:pieChart>`;
  } else if (spec.type === "line") {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:axId val="111"/><c:axId val="222"/></c:lineChart>` + axes();
  } else { // col / bar
    plot = `<c:barChart><c:barDir val="${spec.type==='bar'?'bar':'col'}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${sers}<c:axId val="111"/><c:axId val="222"/></c:barChart>` + axes();
  }
  function axes() { return `<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="111"/></c:valAx>`; }
  const legend = spec.type === "pie" || (spec.series || []).length > 1 ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function anchorXml(spec, chartRelId, frameId) {
  const a = parseAnchor(spec.anchor); const w = spec.w || 8, h = spec.h || 15;
  return `<xdr:twoCellAnchor><xdr:from><xdr:col>${a.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.col+w}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row+h}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${frameId}" name="Chart ${frameId}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${chartRelId}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

// map worksheet NAME -> worksheets/sheetN.xml using workbook.xml + its rels
async function sheetFileMap(z) {
  const wbx = await z.file("xl/workbook.xml").async("string");
  const rels = await z.file("xl/_rels/workbook.xml.rels").async("string");
  const ridTarget = {}; for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) ridTarget[m[1]] = m[2];
  const out = {};
  for (const m of wbx.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) { const t = ridTarget[m[2]]; if (t) out[m[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"')] = "xl/" + t.replace(/^\//, ""); }
  return out;
}

export async function injectCharts(buf, charts) {
  if (!charts || !charts.length) return buf;
  const z = await JSZip.loadAsync(buf);
  const map = await sheetFileMap(z);
  // group charts by sheet
  const bySheet = {}; for (const c of charts) { if (!map[c.sheet]) continue; (bySheet[c.sheet] = bySheet[c.sheet] || []).push(c); }
  let chartN = 0, drawN = 0; const ctOverrides = [];
  for (const sheet of Object.keys(bySheet)) {
    drawN++; const sheetFile = map[sheet]; const sheetBase = sheetFile.split("/").pop(); // sheetX.xml
    const drawingFile = `xl/drawings/drawing${drawN}.xml`;
    const anchors = []; const drawRels = [];
    for (const spec of bySheet[sheet]) {
      chartN++; const chartFile = `xl/charts/chart${chartN}.xml`; const relId = "rId" + bySheet[sheet].indexOf(spec) + 1 + "";
      z.file(chartFile, chartXml({ ...spec, sheet }));
      ctOverrides.push(`<Override PartName="/${chartFile}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      anchors.push(anchorXml(spec, "rId" + (anchors.length + 1), chartN + 1));
      drawRels.push(`<Relationship Id="rId${drawRels.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartN}.xml"/>`);
    }
    z.file(drawingFile, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join("")}</xdr:wsDr>`);
    z.file(`xl/drawings/_rels/drawing${drawN}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${drawRels.join("")}</Relationships>`);
    ctOverrides.push(`<Override PartName="/${drawingFile}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    // sheet rels: add a drawing relationship (create or append)
    const relPath = `xl/worksheets/_rels/${sheetBase}.rels`;
    let relXml = z.file(relPath) ? await z.file(relPath).async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const existing = [...relXml.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]); const nextId = (existing.length ? Math.max(...existing) : 0) + 1;
    const drawRel = `<Relationship Id="rId${nextId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/>`;
    relXml = relXml.replace("</Relationships>", drawRel + "</Relationships>"); z.file(relPath, relXml);
    // worksheet xml: add <drawing r:id> before </worksheet>
    let sx = await z.file(sheetFile).async("string");
    sx = sx.replace("</worksheet>", `<drawing r:id="rId${nextId}"/></worksheet>`); z.file(sheetFile, sx);
  }
  // content types
  let ct = await z.file("[Content_Types].xml").async("string");
  ct = ct.replace("</Types>", ctOverrides.join("") + "</Types>"); z.file("[Content_Types].xml", ct);
  return await z.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
