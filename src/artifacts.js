// Detect "artifacts" in assistant text — fenced code blocks worth rendering in the side panel:
// live HTML/SVG, Mermaid diagrams, Markdown docs, React/JSX components, or substantial code.
export function extractArtifacts(text) {
  if (!text) return [];
  const out = [];
  const re = /```([\w-]+)?\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const lang = (m[1] || "").toLowerCase();
    const code = m[2].replace(/\s+$/, "");
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
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Build the srcDoc for a previewable artifact, by kind.
export function artifactSrcDoc(a) {
  switch (a.kind) {
    case "svg":
      return `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#fff">${a.code}</body>`;

    case "html":
      return /^\s*<!doctype|^\s*<html/i.test(a.code) ? a.code
        : `<!doctype html><meta charset="utf-8"><body style="margin:0;font-family:system-ui">${a.code}</body>`;

    case "mermaid":
      return `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;display:grid;place-items:center;min-height:100vh">
<div class="mermaid">${esc(a.code)}</div>
<script src="${CDN.mermaid}"></script><script>mermaid.initialize({startOnLoad:true,theme:"default"});</script></body>`;

    case "markdown":
      return `<!doctype html><meta charset="utf-8">
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;line-height:1.65;color:#1a1a1a;background:#fff;padding:28px 36px;max-width:780px}
h1,h2,h3{line-height:1.25;margin-top:1.4em}pre{background:#f4f4f5;padding:12px 14px;border-radius:8px;overflow:auto}
code{background:#f4f4f5;padding:2px 5px;border-radius:4px;font-size:.9em}pre code{background:none;padding:0}
table{border-collapse:collapse;margin:1em 0}td,th{border:1px solid #e2e2e5;padding:6px 12px}img{max-width:100%}
blockquote{border-left:3px solid #ddd;margin:1em 0;padding-left:14px;color:#555}a{color:#2563eb}</style>
<body><div id="c"></div><script src="${CDN.marked}"></script>
<script>document.getElementById("c").innerHTML=marked.parse(${JSON.stringify(a.code)});</script></body>`;

    case "react": {
      let body = a.code.replace(/^\s*import[^\n]*\n/gm, "");   // React + hooks are provided as globals
      let comp = "App";
      const m1 = body.match(/export\s+default\s+function\s+(\w+)/);
      const m2 = body.match(/export\s+default\s+(\w+)\s*;?/);
      if (m1) comp = m1[1]; else if (m2) comp = m2[1];
      body = body.replace(/export\s+default\s+/g, "");
      return `<!doctype html><html><head><meta charset="utf-8">
<script src="${CDN.tailwind}"></script>
<script src="${CDN.react}"></script><script src="${CDN.reactDom}"></script><script src="${CDN.babel}"></script>
<style>body{margin:0;font-family:system-ui}</style></head>
<body><div id="root"></div>
<script type="text/babel" data-presets="react">
const {useState,useEffect,useRef,useMemo,useCallback,useReducer,Fragment} = React;
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
