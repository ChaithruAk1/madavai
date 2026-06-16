// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// In-chat PREVIEW for a code-built deck. We re-run the model's deckjs against a RECORDING shim
// (no real pptx, no DOM, no I/O) that just captures every addText/addShape/addChart/addImage call,
// then render those to scaled HTML slides — a faithful preview from the exact same code.
import { icon } from "./deckIcons.js";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const _hx = (c, d) => { const s = String(c == null ? "" : c).replace(/^#/, ""); return /^[0-9A-Fa-f]{6}$/.test(s) ? "#" + s : ("#" + (d || "0B0E15")); };
const _esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Review M2: the preview re-runs MODEL-written code on the main thread. We cannot null window.fetch
// globally (it is the app's own thread), so we SHADOW the dangerous globals as function parameters
// bound to undefined — a casual fetch()/XHR/WebSocket exfil of the auth token or API keys throws.
// (Defense-in-depth: the rendered output is also shown in a sandboxed, opaque-origin iframe. A fully
// isolated preview Worker is the airtight follow-up.)
const _BLOCK = ["fetch","XMLHttpRequest","WebSocket","EventSource","importScripts","eval","Function",
  "window","document","globalThis","self","top","parent","frames","navigator","location",
  "localStorage","sessionStorage","indexedDB","caches","Worker","SharedWorker","postMessage","crypto"];
// Only recognised inline image data (data:image/* base64, or http/https) reaches <img src>; strip
// quotes/brackets so a crafted value cannot break out of the single-quoted attribute. Else placeholder.
const _imgSrc = (v) => {
  const x = String(v == null ? "" : v).trim();
  const ok = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(x) || /^https?:\/\/[^\s'"<>]+$/i.test(x);
  return ok ? x.replace(/['"<>]/g, "") : "";
};

function mkSlide() {
  const sl = { _items: [] };
  sl.addText = (t, o) => sl._items.push({ k: "text", t: Array.isArray(t) ? t.map((x) => (x && x.text) || "").join("") : String(t == null ? "" : t), o: o || {} });
  sl.addShape = (type, o) => sl._items.push({ k: "shape", type: String(type || "rect"), o: o || {} });
  sl.addChart = (type, data, o) => sl._items.push({ k: "chart", data: data || [], o: o || {} });
  sl.addImage = (o) => sl._items.push({ k: "image", o: o || {} });
  return sl;
}

export async function deckPreviewHTML(code) {
  const slides = [];
  const pptx = {
    layout: "", author: "", company: "",
    ShapeType: new Proxy({}, { get: (_t, n) => String(n) }),
    ChartType: new Proxy({}, { get: (_t, n) => String(n) }),
    addSlide: () => { const s = mkSlide(); slides.push(s); return s; },
    write: async () => {}, writeFile: async () => {},
  };
  const helpers = { hex: (c) => String(c == null ? "" : c).replace(/^#/, ""), icon };
  try {
    let c = String(code || "").replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n```\s*$/i, "");
    const fn = new AsyncFunction("pptx", "helpers", "ShapeType", "ChartType", ..._BLOCK, c);
    await fn(pptx, helpers, pptx.ShapeType, pptx.ChartType, ..._BLOCK.map(() => undefined));
  } catch {}
  return render(slides);
}

function render(slides) {
  const W = 13.33, H = 7.5, PXW = 900, SC = PXW / W;
  const css = "*{box-sizing:border-box;margin:0}body{background:#0a0c10;padding:18px;font-family:'Segoe UI',system-ui,sans-serif}"
    + ".slide{position:relative;width:" + PXW + "px;height:" + Math.round(H * SC) + "px;margin:0 auto 18px;border-radius:10px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.5)}"
    + ".el{position:absolute;overflow:hidden}";
  const body = slides.map((sl) => {
    const bg = _hx(sl.background && sl.background.color, "0B0E15");
    const els = sl._items.map((it) => {
      const o = it.o || {};
      const x = (+o.x || 0) * SC, y = (+o.y || 0) * SC, w = (o.w != null ? +o.w : 2) * SC, h = (o.h != null ? +o.h : 0.5) * SC;
      const base = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px;";
      if (it.k === "text") {
        const fs = ((o.fontSize ? +o.fontSize : 14) * SC / 72 * 1.33).toFixed(1);
        const al = o.align === "center" ? "center" : o.align === "right" ? "right" : "left";
        const jc = al === "center" ? "center" : al === "right" ? "flex-end" : "flex-start";
        const va = o.valign === "middle" ? "center" : o.valign === "bottom" ? "flex-end" : "flex-start";
        return "<div class='el' style='" + base + "display:flex;align-items:" + va + ";justify-content:" + jc + ";font-size:" + fs + "px;font-weight:" + (o.bold ? 700 : 400) + ";font-style:" + (o.italic ? "italic" : "normal") + ";color:" + _hx(o.color, "FFFFFF") + ";line-height:1.12;text-align:" + al + "'>" + _esc(it.t) + "</div>";
      }
      if (it.k === "shape") {
        const fill = o.fill && o.fill.color ? _hx(o.fill.color) : "transparent";
        const line = o.line && o.line.color ? ("border:" + Math.max(1, (o.line.width || 1)) + "px solid " + _hx(o.line.color) + ";") : "";
        const rad = it.type === "ellipse" ? "border-radius:50%;" : (o.rectRadius ? ("border-radius:" + (+o.rectRadius) * SC + "px;") : "");
        return "<div class='el' style='" + base + "background:" + fill + ";" + line + rad + "'></div>";
      }
      if (it.k === "chart") {
        const series = (it.data && it.data[0]) || {};
        const labels = series.labels || [], vals = series.values || [];
        const max = Math.max(1, ...vals.map(Number));
        const cc = (o.chartColors && o.chartColors[0]) ? _hx(o.chartColors[0]) : "#5B8DEF";
        const lfs = (9 * SC / 72 * 1.33).toFixed(0);
        const bars = labels.map((lb, i) => { const v = Number(vals[i]) || 0; const bw = 100 / Math.max(1, labels.length); return "<div style='display:inline-flex;flex-direction:column;justify-content:flex-end;align-items:center;width:" + bw + "%;height:100%'><div style='width:55%;height:" + (v / max * 78).toFixed(0) + "%;background:" + cc + ";border-radius:3px 3px 0 0'></div><div style='font-size:" + lfs + "px;color:#9AA7BD;margin-top:3px'>" + _esc(lb) + "</div></div>"; }).join("");
        return "<div class='el' style='" + base + "display:flex;align-items:flex-end'>" + bars + "</div>";
      }
      if (it.k === "image") { const dd = _imgSrc(it.o && it.o.data); return dd ? "<img class='el' src='" + dd + "' style='" + base + "object-fit:contain'/>" : "<div class='el' style='" + base + "background:rgba(255,255,255,0.06);border:1px dashed rgba(255,255,255,0.2);border-radius:6px'></div>"; }
      return "";
    }).join("");
    return "<div class='slide' style='background:" + bg + "'>" + els + "</div>";
  }).join("");
  return "<!doctype html><html><head><meta charset='utf-8'><style>" + css + "</style></head><body>" + (body || "<div style='color:#888;padding:30px'>Nothing to preview yet.</div>") + "</body></html>";
}
