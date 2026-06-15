// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Render a built ExcelJS workbook to an HTML preview for the side panel. Formula cells are EVALUATED
// best-effort (a small, dependency-free engine — common financial subset) so View shows real numbers like
// Claude's pre-recalc'd files. PREVIEW ONLY — never mutates the saved file; Excel recomputes on open, so a
// value the engine can't derive falls back to showing the formula.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function makeEngine(wb) {
  const grid = new Map();
  (wb.worksheets || []).forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (c) => {
      const v = c.value; let f = null, lit = null;
      if (v && typeof v === "object" && v.formula != null) f = String(v.formula);
      else if (typeof v === "string" && v[0] === "=") f = v.slice(1);
      else if (typeof v === "number") lit = v;
      else if (v instanceof Date) lit = v;
      else if (typeof v === "string") lit = v;
      else if (typeof v === "boolean") lit = v;
      grid.set(ws.name + "|" + c.row + "|" + c.col, { f, v: lit });
    }));
  });
  const A1 = (s) => { const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(s); if (!m) return null; let col = 0; for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64); return { row: +m[2], col }; };
  const cache = new Map(), inprog = new Set();
  function cellVal(sheet, row, col) {
    const key = sheet + "|" + row + "|" + col;
    if (cache.has(key)) return cache.get(key);
    if (inprog.has(key)) return 0;
    const g = grid.get(key);
    if (!g) { cache.set(key, 0); return 0; }
    if (g.f == null) { const val = g.v == null ? 0 : g.v; cache.set(key, val); return val; }
    inprog.add(key); let r = null;
    try { r = evalStr(g.f, sheet); } catch (e) { r = null; }
    inprog.delete(key); cache.set(key, r); return r;
  }
  function tokenize(f) {
    const T = [], re = /\s+|("(?:[^"]|"")*")|([A-Za-z][A-Za-z0-9_.]*)\s*(?=\()|((?:'[^']+'|[A-Za-z0-9_]+)!\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+)|((?:'[^']+'|[A-Za-z0-9_]+)!\$?[A-Za-z]+\$?\d+)|(\$?[A-Za-z]+\$?\d+:\$?[A-Za-z]+\$?\d+)|(\$?[A-Za-z]+\$?\d+)|(\d+(?:\.\d+)?)|(<=|>=|<>|[+\-*/^%&=<>(),])/g;
    let m; while ((m = re.exec(f))) {
      if (m[0].trim() === "") continue;
      if (m[1]) T.push({ t: "str", v: m[1].slice(1, -1).replace(/""/g, '"') });
      else if (m[2]) T.push({ t: "fn", v: m[2].toUpperCase() });
      else if (m[3]) T.push({ t: "range", v: m[3] });
      else if (m[4]) T.push({ t: "cell", v: m[4] });
      else if (m[5]) T.push({ t: "range", v: m[5] });
      else if (m[6]) T.push({ t: "cell", v: m[6] });
      else if (m[7]) T.push({ t: "num", v: +m[7] });
      else T.push({ t: "op", v: m[8] });
    }
    return T;
  }
  function splitRef(ref, sheet) { const i = ref.indexOf("!"); if (i < 0) return { sheet, a: ref }; let sh = ref.slice(0, i); if (sh[0] === "'") sh = sh.slice(1, -1); return { sheet: sh, a: ref.slice(i + 1) }; }
  function rangeVals(ref, sheet) {
    const r = splitRef(ref, sheet); const parts = r.a.split(":"); const c1 = A1(parts[0]), c2 = A1(parts[1]); if (!c1 || !c2) return [];
    const out = []; for (let R = Math.min(c1.row, c2.row); R <= Math.max(c1.row, c2.row); R++) for (let C = Math.min(c1.col, c2.col); C <= Math.max(c1.col, c2.col); C++) { const v = cellVal(r.sheet, R, C); if (typeof v === "number") out.push(v); }
    return out;
  }
  function evalStr(f, sheet) {
    const T = tokenize(f); let i = 0;
    const peek = () => T[i], next = () => T[i++];
    const num = (x) => (typeof x === "number" ? x : (typeof x === "boolean" ? (x ? 1 : 0) : (x == null || x === "" ? 0 : (isNaN(+x) ? null : +x))));
    function callFn(name) {
      next();
      const raw = []; if (!(peek() && peek().v === ")")) { raw.push(argRaw()); while (peek() && peek().v === ",") { next(); raw.push(argRaw()); } }
      if (peek() && peek().v === ")") next();
      const nums = () => raw.flatMap((r) => Array.isArray(r) ? r : (typeof r === "number" ? [r] : []));
      switch (name) {
        case "SUM": return nums().reduce((s, x) => s + x, 0);
        case "AVERAGE": { const n = nums(); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : 0; }
        case "MIN": { const n = nums(); return n.length ? Math.min.apply(null, n) : 0; }
        case "MAX": { const n = nums(); return n.length ? Math.max.apply(null, n) : 0; }
        case "COUNT": return nums().length;
        case "ABS": return Math.abs(num(raw[0]));
        case "ROUND": { const p = Math.pow(10, num(raw[1]) || 0); return Math.round(num(raw[0]) * p) / p; }
        case "IF": return num(raw[0]) ? raw[1] : (raw.length > 2 ? raw[2] : false);
        case "AND": return nums().every((x) => x) ? 1 : 0;
        case "OR": return nums().some((x) => x) ? 1 : 0;
        case "NOT": return num(raw[0]) ? 0 : 1;
        case "SUMPRODUCT": { const arrs = raw.filter(Array.isArray); if (!arrs.length) return 0; let s = 0; for (let k = 0; k < arrs[0].length; k++) { let p = 1; for (const ar of arrs) p *= (ar[k] || 0); s += p; } return s; }
        default: return null;
      }
    }
    function argRaw() { if (peek() && peek().t === "range") { const r = next(); return rangeVals(r.v, sheet); } return expr(); }
    function expr() { return compare(); }
    function compare() { let l = concat(); while (peek() && peek().t === "op" && /^(<=|>=|<>|=|<|>)$/.test(peek().v)) { const op = next().v; const r = concat(); const a = num(l), b = num(r); l = (op === "=" ? a === b : op === "<>" ? a !== b : op === "<" ? a < b : op === ">" ? a > b : op === "<=" ? a <= b : a >= b) ? 1 : 0; } return l; }
    function concat() { let l = addsub(); while (peek() && peek().v === "&") { next(); const r = addsub(); l = String(l == null ? "" : l) + String(r == null ? "" : r); } return l; }
    function addsub() { let l = muldiv(); while (peek() && (peek().v === "+" || peek().v === "-")) { const op = next().v; const r = muldiv(); l = op === "+" ? num(l) + num(r) : num(l) - num(r); } return l; }
    function muldiv() { let l = pow(); while (peek() && (peek().v === "*" || peek().v === "/")) { const op = next().v; const r = pow(); l = op === "*" ? num(l) * num(r) : (num(r) === 0 ? null : num(l) / num(r)); } return l; }
    function pow() { let l = unary(); while (peek() && peek().v === "^") { next(); l = Math.pow(num(l), num(unary())); } return l; }
    function unary() { if (peek() && (peek().v === "-" || peek().v === "+")) { const op = next().v; const x = num(unary()); return op === "-" ? -x : x; } return primary(); }
    function primary() {
      const t = peek(); if (!t) return null;
      if (t.t === "num") { next(); return t.v; }
      if (t.t === "str") { next(); return t.v; }
      if (t.t === "fn") { return callFn(next().v); }
      if (t.t === "cell") { next(); const r = splitRef(t.v, sheet); const c = A1(r.a); return c ? cellVal(r.sheet, c.row, c.col) : null; }
      if (t.t === "range") { next(); const r = rangeVals(t.v, sheet); return r.length ? r[0] : null; }
      if (t.v === "(") { next(); const e = expr(); if (peek() && peek().v === ")") next(); return e; }
      next(); return null;
    }
    return expr();
  }
  return { value: (sheet, row, col) => cellVal(sheet, row, col) };
}

export function renderXlsxHTML(wb) {
  let engine = null; try { engine = makeEngine(wb); } catch (e) { engine = null; }
  const fmtNum = (n) => { if (typeof n !== "number" || !isFinite(n)) return null; if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 }); if (Number.isInteger(n)) return String(n); return n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  function cellText(cell, sheetName) {
    const v = cell && cell.value;
    if (v == null) return { txt: "", f: false };
    if (typeof v === "object") {
      if (v.formula != null || v.sharedFormula != null) {
        if (v.result != null && typeof v.result !== "object") return { txt: String(v.result), f: false };
        if (engine) { const r = engine.value(sheetName, cell.row, cell.col); const s = typeof r === "number" ? fmtNum(r) : (typeof r === "string" ? r : null); if (s != null) return { txt: s, f: false }; }
        return { txt: "=" + (v.formula || v.sharedFormula), f: true };
      }
      if (Array.isArray(v.richText)) return { txt: v.richText.map((r) => r.text).join(""), f: false };
      if (v.text != null) return { txt: String(v.text), f: false };
      if (v instanceof Date) return { txt: v.toISOString().slice(0, 10), f: false };
      if (v.result != null && typeof v.result !== "object") return { txt: String(v.result), f: false };
      return { txt: "", f: false };
    }
    return { txt: String(v), f: false };
  }
  let body = "";
  (wb.worksheets || []).forEach((ws) => {
    body += `<h3 class="sh">${esc(ws.name)}</h3><table>`;
    const maxCol = Math.max(1, ws.columnCount || 1);
    ws.eachRow({ includeEmpty: false }, (row) => {
      body += "<tr>";
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        const ct = cellText(cell, ws.name); const txt = ct.txt, isF = ct.f;
        let st = "";
        if (cell && cell.font && cell.font.bold) st += "font-weight:700;";
        try { const a = cell && cell.fill && cell.fill.fgColor && cell.fill.fgColor.argb; if (a && a.length >= 6) st += "background:#" + a.slice(-6) + ";"; } catch (e) {}
        try { const a = cell && cell.font && cell.font.color && cell.font.color.argb; if (a && a.length >= 6) st += "color:#" + a.slice(-6) + ";"; } catch (e) {}
        if (isF) st += "opacity:.55;font-style:italic;";
        body += `<td style="${st}">${esc(txt)}</td>`;
      }
      body += "</tr>";
    });
    body += "</table>";
  });
  if (!body) body = "<p style='opacity:.6'>Empty workbook</p>";
  return `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:18px 20px;background:#0f1115;color:#e8e8ea;font-family:system-ui,-apple-system,sans-serif;font-size:12.5px}h3.sh{margin:20px 0 8px;font-size:13px;color:#7fd1ff;font-weight:700;letter-spacing:.3px}table{border-collapse:collapse;margin-bottom:8px}td{border:1px solid #2a2e37;padding:4px 10px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}</style><body>${body}</body>`;
}
