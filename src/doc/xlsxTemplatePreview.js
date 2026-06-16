// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved.
// SYNC, dependency-free HTML preview for the rich Excel TEMPLATE spec (Institutional look).
// Evaluates the same id-based relationships the build engine compiles to A1 — preview-only; the
// downloaded .xlsx is recomputed by Excel itself, so this never has to be the source of truth.
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NF = {
  usd: (n) => (n < 0 ? "(" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US") + (n < 0 ? ")" : ""),
  usd2: (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  num: (n) => Math.round(n).toLocaleString("en-US"),
  num1: (n) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  pct: (n) => (n * 100).toFixed(1) + "%",
  pct0: (n) => Math.round(n * 100) + "%",
  mult: (n) => n.toFixed(1) + "x",
  year: (n) => String(n),
};
const fmtVal = (v, fmt) => { if (v == null || v === "") return ""; if (typeof v !== "number" || !isFinite(v)) return esc(v); const fn = NF[fmt]; if (!fn) return v.toLocaleString("en-US"); try { return fn(v); } catch { return String(v); } };

function evaluate(spec) {
  const inp = {}, der = {}, model = {}, table = {};
  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [];
  const nameOf = (sh) => String(sh.name || "Sheet");
  const SAFE = /^[\d.+\-*/(),\seE]*$/;
  function num(x) { return typeof x === "number" && isFinite(x) ? x : 0; }
  function evalExpr(expr, resolve) {
    let bad = false;
    const sub = String(expr == null ? "" : expr).replace(/^=/, "").replace(/\[([^\]]+)\]/g, (_, t) => { const v = resolve(t.trim()); if (v == null || !isFinite(v)) { return "0"; } return "(" + v + ")"; });
    if (!/^[\dA-Za-z.+\-*/(),\s]*$/.test(sub)) return null;
    const cleaned = sub.replace(/SUM/g, "").trim(); // SUM already reduced to its numeric arg by resolve
    if (!SAFE.test(cleaned)) return null;
    try { const r = Function('"use strict";return (' + (cleaned || "0") + ");")(); return isFinite(r) ? r : 0; } catch { return null; }
  }
  // inputs
  for (const sh of sheets) { const nm = nameOf(sh); inp[nm] = inp[nm] || {}; for (const i of (sh.inputs || [])) if (i.id) inp[nm][i.id] = num(i.value); }
  // single-cell resolver (assumptions/kpi ctx)
  const resolveCell = (curSheet) => (tok) => {
    let sheetPart = null, body = tok; const b = tok.indexOf("!"); if (b >= 0) { sheetPart = tok.slice(0, b); body = tok.slice(b + 1); }
    const sh = sheetPart || curSheet;
    const rng = body.match(/^(.+?)#(\d+)(?::(\d+))?$/);
    if (rng) { const id = rng[1], a = +rng[2], e = rng[3] ? +rng[3] : a; let s = 0; for (let p = a; p <= e; p++) s += num((model[sh] || {})[id] && model[sh][id][p]); return s; }
    if (inp[sh] && inp[sh][body] != null) return inp[sh][body];
    if (der[sh] && der[sh][body] != null) return der[sh][body];
    return 0;
  };
  // derived
  for (const sh of sheets) { const nm = nameOf(sh); der[nm] = der[nm] || {}; (sh.derived || []).forEach((d, i) => { const v = evalExpr(d.expr, resolveCell(nm)); der[nm][d.id || ("_d" + i)] = v; d._val = v; }); }
  // models
  for (const sh of sheets) {
    if (!Array.isArray(sh.metrics)) continue; const nm = nameOf(sh); model[nm] = {}; const count = Math.min(Math.max(1, (sh.periods && sh.periods.count) || 12), 60);
    for (const mt of sh.metrics) model[nm][mt.id] = {};
    for (let p = 1; p <= count; p++) for (const mt of sh.metrics) {
      const resolve = (tok) => {
        let sheetPart = null, body = tok; const b = tok.indexOf("!"); if (b >= 0) { sheetPart = tok.slice(0, b); body = tok.slice(b + 1); }
        if (sheetPart) return resolveCell(nm)(tok);
        const m = body.match(/^(.+?)@(-?\d+)$/); let id = body, off = 0; if (m) { id = m[1]; off = +m[2]; }
        const pp = p + off; return num(model[nm][id] && model[nm][id][pp]);
      };
      const expr = (p === 1 && mt.firstExpr) ? mt.firstExpr : mt.expr;
      model[nm][mt.id][p] = num(evalExpr(expr, resolve));
    }
  }
  // tables
  for (const sh of sheets) {
    if (!Array.isArray(sh.columns)) continue; const nm = nameOf(sh); const cols = sh.columns;
    const rows = Array.isArray(sh.rows) ? sh.rows : (Array.isArray(sh.data) ? sh.data.map((a) => { const o = {}; cols.forEach((c, ci) => o[c.key] = a[ci]); return o; }) : []);
    table[nm] = rows.map((ro, ri) => {
      const out = {};
      for (const c of cols) {
        const v = ro[c.key];
        if (v && typeof v === "object" && v.expr != null) {
          const resolve = (tok) => { if (tok.indexOf("!") >= 0) return resolveCell(nm)(tok); const m = tok.match(/^(.+?)@(-?\d+)$/); let key = tok, off = 0; if (m) { key = m[1]; off = +m[2]; } const tr = table[nm] && table[nm][ri + off]; return tr ? num(tr[key]) : 0; };
          out[c.key] = num(evalExpr(v.expr, resolve));
        } else out[c.key] = v;
      }
      return out;
    });
    sh._rows = rows;
  }
  return { inp, der, model, table };
}

export function renderTemplatePreview(spec, opts) {
  const NAVY = "#" + ((opts && opts.accent) || "1F3864");
  let V; try { V = evaluate(spec); } catch (e) { V = { inp: {}, der: {}, model: {}, table: {} }; }
  const sheets = Array.isArray(spec.sheets) ? spec.sheets : [];
  let body = "";
  for (const sh of sheets) {
    const nm = String(sh.name || "Sheet");
    body += `<div class="sh">`;
    if (sh.title) body += `<div class="title">${esc(sh.title)}</div>`;
    body += `<div class="sname">${esc(nm)}</div>`;
    // KPI tiles
    if (Array.isArray(sh.kpis) && sh.kpis.length) {
      body += `<div class="kpis">` + sh.kpis.map((k) => {
        const resolve = (tok) => { let sp = null, bo = tok; const b = tok.indexOf("!"); if (b >= 0) { sp = tok.slice(0, b); bo = tok.slice(b + 1); } const sh2 = sp || nm; const rng = bo.match(/^(.+?)#(\d+)(?::(\d+))?$/); if (rng) { const id = rng[1], a = +rng[2], e = rng[3] ? +rng[3] : a; let s = 0; for (let p = a; p <= e; p++) s += (V.model[sh2] && V.model[sh2][id] && V.model[sh2][id][p]) || 0; return s; } return (V.inp[sh2] && V.inp[sh2][bo]) ?? (V.der[sh2] && V.der[sh2][bo]) ?? 0; };
        let val = 0; try { val = Function('R','"use strict";return (' + String(k.ref || k.expr || "0").replace(/^=/, "").replace(/\[([^\]]+)\]/g, (_, t) => "(" + resolve(t.trim()) + ")").replace(/SUM/g, "") + ");")(); } catch { val = 0; }
        return `<div class="tile"><div class="tv">${esc(fmtVal(val, k.fmt))}</div><div class="tl">${esc(String(k.label || "").toUpperCase())}</div></div>`;
      }).join("") + `</div>`;
    }
    // inputs + derived
    if ((sh.inputs && sh.inputs.length) || (sh.derived && sh.derived.length)) {
      body += `<table class="grid">`;
      let lastSec = null;
      for (const i of (sh.inputs || [])) {
        if (i.section && i.section !== lastSec) { lastSec = i.section; body += `<tr class="sec"><td colspan="3">${esc(i.section.toUpperCase())}</td></tr>`; }
        body += `<tr><td>${esc(i.label)}</td><td class="r blue">${esc(fmtVal(i.value, i.fmt))}</td><td class="note">${esc(i.note || "")}</td></tr>`;
      }
      if (sh.derived && sh.derived.length) {
        body += `<tr class="sec"><td colspan="3">DERIVED METRICS</td></tr>`;
        for (const d of sh.derived) body += `<tr><td>${esc(d.label)}</td><td class="r">${esc(fmtVal(d._val, d.fmt))}</td><td class="note">${esc(d.note || "")}</td></tr>`;
      }
      body += `</table>`;
    }
    // model (wide)
    if (Array.isArray(sh.metrics) && sh.metrics.length) {
      const count = Math.min(Math.max(1, (sh.periods && sh.periods.count) || 12), 60);
      const labels = (sh.periods && Array.isArray(sh.periods.label)) ? sh.periods.label : Array.from({ length: count }, (_, i) => String((sh.periods && sh.periods.label) || "P%d").replace("%d", i + 1));
      body += `<div class="scroll"><table class="grid"><tr class="hd"><th>${esc(sh.rowHeader || "Metric")}</th>${labels.map((l) => `<th class="r">${esc(l)}</th>`).join("")}</tr>`;
      sh.metrics.forEach((mt, mi) => {
        body += `<tr class="${mt.total ? "tot" : (mi % 2 ? "band" : "")}"><td class="${mt.total ? "b" : ""}">${esc(mt.label)}</td>`;
        for (let p = 1; p <= count; p++) { const v = (V.model[nm] && V.model[nm][mt.id] && V.model[nm][mt.id][p]); body += `<td class="r ${mt.role === "link" ? "grn" : ""} ${mt.total ? "b" : ""}">${esc(fmtVal(v, mt.fmt))}</td>`; }
        body += `</tr>`;
      });
      body += `</table></div>`;
    }
    // tall table
    if (Array.isArray(sh.columns) && sh.columns.length) {
      const cols = sh.columns; const rows = V.table[nm] || [];
      body += `<div class="scroll"><table class="grid"><tr class="hd">${cols.map((c, ci) => `<th class="${ci ? "r" : ""}">${esc(c.header || c.key)}</th>`).join("")}</tr>`;
      rows.forEach((ro, ri) => { body += `<tr class="${ri % 2 ? "band" : ""}">` + cols.map((c, ci) => `<td class="${ci ? "r" : ""} ${c.role === "link" ? "grn" : ""}">${esc(fmtVal(ro[c.key], c.fmt))}</td>`).join("") + `</tr>`; });
      body += `</table></div>`;
    }
    body += `</div>`;
  }
  const css = `body{margin:0;background:#eef1f6;padding:22px;font-family:Arial,'Calibri',system-ui,sans-serif;color:#1f2933}
  .sh{max-width:1000px;margin:0 auto 26px}.title{font-size:17px;font-weight:800;color:${NAVY};margin-bottom:2px}
  .sname{font-size:12px;font-weight:700;color:#5B6B82;margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px}
  .kpis{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
  .tile{background:#F2F6FB;border:1px solid ${NAVY};border-radius:8px;padding:14px 16px;text-align:center}
  .tv{font-size:24px;font-weight:800;color:${NAVY}}.tl{font-size:11px;font-weight:700;color:#5B6B82;margin-top:4px;letter-spacing:.4px}
  .scroll{overflow:auto;border:1px solid #B7C4D6;border-radius:8px;background:#fff}
  table.grid{border-collapse:collapse;width:100%;background:#fff}
  .grid td,.grid th{border:1px solid #DCE3F0;padding:6px 12px;font-size:13px;white-space:nowrap}
  .grid th{background:${NAVY};color:#fff;font-weight:700;text-align:left}
  .grid .hd th.r,.grid td.r{text-align:right}
  .grid tr.band td{background:#F2F6FB}.grid tr.tot td{background:#EAF0FB;font-weight:700}
  .grid tr.sec td{background:#F2F6FB;color:${NAVY};font-weight:700;font-size:12px;letter-spacing:.3px}
  .blue{color:#0000FF}.grn{color:#008000}.b{font-weight:700}.note{color:#8A8A9A;font-style:italic;font-size:12px}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body || "<p style='opacity:.6'>Nothing to preview yet.</p>"}</body></html>`;
}
