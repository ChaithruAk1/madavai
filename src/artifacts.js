import { renderOfficeHTML } from "./office.js";

// Detect "artifacts" in assistant text — fenced code blocks worth rendering in the side panel:
// live HTML/SVG, Mermaid diagrams, Markdown docs, React/JSX components, or substantial code.
export function extractArtifacts(text) {
  if (!text) return [];
  const out = [];
  const re = /```([\w-]+)?\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "").toLowerCase();
    if (lang === "officedoc") continue; if (lang === "deckjs") continue; if (lang === "xlsxjs") continue; if (lang === "docxjs") continue; if (lang === "pdfjs") continue; // already shown as a downloadable file card — never a raw "snippet" pill
    const code = m[2].replace(/\s+$/, "");
    if (/"type"\s*:\s*"(?:xlsx|docx|pptx|pdf)"/.test(code)) continue; // an office spec emitted with a non-officedoc fence is a file card, not a snippet pill
    const looksSvg = /^\s*<svg/i.test(code);
    const looksHtml = /^\s*<(!doctype|html|body|div|section|main|head)/i.test(code);
    let kind = "code";
    if (lang === "mermaid") kind = "mermaid";
    else if (["jsx", "tsx", "react"].includes(lang)) kind = "react";
    else if (["md", "markdown"].includes(lang)) kind = "markdown";
    else if (looksSvg || lang === "svg") kind = "svg";
    else if (["html", "htm", "xml"].includes(lang) || looksHtml) kind = "html";
    const previewable = kind !== "code";
    const big = code.trim().length > 280;
    if (previewable || big) out.push({ kind, lang: lang || kind, code, previewable, title: titleFor(kind, lang) });
  }
  return out;
}

function titleFor(kind, lang) {
  return ({ html: "Web page", svg: "Graphic", mermaid: "Diagram", markdown: "Document", react: "Component" })[kind]
    || (lang ? lang.toUpperCase() + " snippet" : "Code");
}

const CDN = {
  react: "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  reactDom: "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js",
  babel: "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js",
  tailwind: "https://cdn.tailwindcss.com",
  mermaid: "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js",
  marked: "https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js",
  // Libraries commonly used by generated React artifacts (the set frontier chat products preload).
  reactIs: "https://cdnjs.cloudflare.com/ajax/libs/react-is/18.3.1/umd/react-is.production.min.js",
  propTypes: "https://cdnjs.cloudflare.com/ajax/libs/prop-types/15.8.1/prop-types.min.js",
  lodash: "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js",
  d3: "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
  recharts: "https://cdnjs.cloudflare.com/ajax/libs/recharts/2.12.7/Recharts.js",
  papaparse: "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js",
  chartjs: "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.3/chart.umd.min.js",
  mathjs: "https://cdnjs.cloudflare.com/ajax/libs/mathjs/13.0.3/math.min.js",
  lucide: "https://cdnjs.cloudflare.com/ajax/libs/lucide/0.378.0/lucide.min.js",
};

// Bare-module imports → global assignments, so transpiled artifact code can use the
// libraries loaded above (Babel-standalone doesn't resolve ESM specifiers). React's own
// imports are handled specially to avoid clashing with the hooks we pre-declare.
const BLANKET_HOOKS = ["useState", "useEffect", "useRef", "useMemo", "useCallback", "useReducer", "Fragment"];
const MODULE_GLOBALS = { recharts: "Recharts", "lucide-react": "LucideReact", lodash: "_", d3: "d3", papaparse: "Papa", mathjs: "math", "chart.js": "Chart" };
function rewriteImports(src) {
  const out = [];
  for (const raw of String(src).split("\n")) {
    const line = raw;
    if (/^\s*import\s+["'][^"']+["'];?\s*$/.test(line)) continue;            // side-effect import → drop
    const m = line.match(/^\s*import\s+(.+?)\s+from\s+["']([^"']+)["'];?\s*$/);
    if (!m) { out.push(line); continue; }
    const clause = m[1].trim(); const mod = m[2];
    // Parse the clause into default + named.
    let def = null, named = null, ns = null;
    let mm;
    if ((mm = clause.match(/^\*\s+as\s+(\w+)$/))) ns = mm[1];
    else if ((mm = clause.match(/^(\w+)\s*,\s*\{([^}]*)\}$/))) { def = mm[1]; named = mm[2]; }
    else if (/^\{([^}]*)\}$/.test(clause)) named = clause.replace(/^\{|\}$/g, "");
    else if (/^\w+$/.test(clause)) def = clause;
    const namedToDecl = (s) => s.split(",").map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/\s+as\s+/, ": ")).join(", ");
    if (mod === "react") {
      if (named) { const extra = named.split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter((n) => n && !BLANKET_HOOKS.includes(n)); if (extra.length) out.push(`const { ${namedToDecl(named)} } = React;`); }
      continue; // default React + blanket hooks already provided
    }
    if (mod.startsWith("react-dom")) continue;
    const g = MODULE_GLOBALS[mod];
    if (!g) continue; // unknown module → drop (can't resolve); code that needs it will surface a clear error
    if (ns && ns !== g) out.push(`const ${ns} = ${g};`);       // skip "const d3 = d3" self-decl
    if (def && def !== g) out.push(`const ${def} = (${g} && ${g}.default) || ${g};`); // skip "const _ = _ || _"
    if (named) out.push(`const { ${namedToDecl(named)} } = ${g};`);
  }
  return out.join("\n");
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Graceful CDN failure: if a preview library can't load (strict/offline network), say so
// plainly instead of showing a blank white frame. Attached as an onerror attribute.
const CDN_FAIL = `onerror="document.body.innerHTML='<div style=&quot;font-family:system-ui;padding:26px;color:#444;line-height:1.6&quot;><b>Preview library blocked</b><br>This preview needs a small library from the internet and your network blocked it.<br>The full source is still in the <b>Code</b> tab.</div>'"`;

// Build the srcDoc for a previewable artifact, by kind.
export function artifactSrcDoc(a) {
  switch (a.kind) {
    case "office":
      // The card's spec rendered to HTML — a faithful preview of the .pptx/.docx/.xlsx/.pdf.
      return renderOfficeHTML(a.code);

    case "svg":
      return `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${a.code}</body>`;

    case "html":
      return /^\s*<!doctype|^\s*<html/i.test(a.code) ? a.code
        : `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui">${a.code}</body>`;

    case "mermaid":
      return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;display:grid;place-items:center;min-height:100vh">
<div class="mermaid">${esc(a.code)}</div>
<script src="${CDN.mermaid}" ${CDN_FAIL}></script><script>window.addEventListener("load",()=>{ if (window.mermaid) mermaid.initialize({startOnLoad:true,theme:"default"}); });</script></body>`;

    case "markdown":
      return `<!doctype html><meta charset="utf-8">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;line-height:1.65;color:#1a1a1a;background:#fff;padding:28px 36px;max-width:780px}
h1,h2,h3{line-height:1.25;margin-top:1.4em}pre{background:#f4f4f5;padding:12px 14px;border-radius:8px;overflow:auto}
code{background:#f4f4f5;padding:2px 5px;border-radius:4px;font-size:.9em}pre code{background:none;padding:0}
table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #e2e2e5;padding:6px 12px}img{max-width:100%}
blockquote{border-left:3px solid #ddd;margin:1em 0;padding-left:14px;color:#555}a{color:#2563eb}</style>
<body><div id="c"></div><script src="${CDN.marked}" ${CDN_FAIL}></script>
<script>
// Defense-in-depth: sanitize marked's HTML output before it touches innerHTML —
// strip active elements, on*-handlers and javascript: URLs (the iframe sandbox is layer one).
function sanitizeHtml(html){
  var t=document.createElement("template"); t.innerHTML=html;
  var BAD={SCRIPT:1,IFRAME:1,OBJECT:1,EMBED:1};
  (function walk(node){
    var kids=Array.prototype.slice.call(node.children||[]);
    for(var i=0;i<kids.length;i++){
      var el=kids[i];
      if(BAD[el.tagName]){ el.remove(); continue; }
      var attrs=Array.prototype.slice.call(el.attributes||[]);
      for(var j=0;j<attrs.length;j++){
        var n=attrs[j].name, v=attrs[j].value;
        if(/^on/i.test(n) || /^\\s*javascript:/i.test(v)) el.removeAttribute(n);
      }
      walk(el);
    }
  })(t.content);
  return t.innerHTML;
}
window.addEventListener("load",()=>{ if (window.marked) document.getElementById("c").innerHTML=sanitizeHtml(marked.parse(${JSON.stringify(a.code).replace(/<\//g, "<\\/")})); });</script></body>`;

    case "react": {
      let comp = "App";
      const m1 = a.code.match(/export\s+default\s+function\s+(\w+)/);
      const m2 = a.code.match(/export\s+default\s+(\w+)\s*;?/);
      if (m1) comp = m1[1]; else if (m2) comp = m2[1];
      let body = rewriteImports(a.code).replace(/export\s+default\s+/g, "");
      // Optional libraries load WITHOUT the fatal onerror — a blocked optional lib just
      // leaves its global undefined (a clear runtime error if used), instead of nuking the page.
      return `<!doctype html><html><head><meta charset="utf-8">
<script src="${CDN.tailwind}"></script>
<script src="${CDN.react}" ${CDN_FAIL}></script><script src="${CDN.reactDom}" ${CDN_FAIL}></script>
<script src="${CDN.reactIs}"></script><script src="${CDN.propTypes}"></script>
<script src="${CDN.lodash}"></script><script src="${CDN.d3}"></script><script src="${CDN.papaparse}"></script>
<script src="${CDN.recharts}"></script><script src="${CDN.chartjs}"></script><script src="${CDN.mathjs}"></script>
<script src="${CDN.lucide}"></script>
<script src="${CDN.babel}" ${CDN_FAIL}></script>
<style>body{margin:0;font-family:system-ui}</style></head>
<body><div id="root"></div>
<script type="text/babel" data-presets="react">
const {useState,useEffect,useRef,useMemo,useCallback,useReducer,Fragment} = React;
// lucide-react shim: any icon name → a React component rendering the matching lucide glyph
// (falls back to an empty box if the icon set didn't load), so icon imports never crash.
const LucideReact = new Proxy({}, { get(_t, name) {
  return function LucideIcon(props) {
    props = props || {};
    const size = props.size || 24;
    const set = (window.lucide && window.lucide.icons) || {};
    const node = set[name] || set[String(name).replace(/([a-z])([A-Z])/g, "$1-$2")] || [];
    const base = { xmlns: "http://www.w3.org/2000/svg", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    const kids = (Array.isArray(node) ? node : []).map((c, i) => React.createElement(c[0], Object.assign({ key: i }, c[1])));
    return React.createElement("svg", Object.assign(base, props, { width: size, height: size }), kids);
  };
}});
try {
${body}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(${comp}));
} catch (e) { document.getElementById("root").innerHTML = '<pre style="color:#c00;padding:16px;white-space:pre-wrap">'+ (e && e.message || e) +'</pre>'; }
</script></body></html>`;
    }

    default:
      return `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:ui-monospace,monospace;white-space:pre-wrap;padding:14px">${esc(a.code)}</body>`;
  }
}
