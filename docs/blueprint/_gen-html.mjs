import { readFileSync, writeFileSync } from 'node:fs';
const md = readFileSync('docs/blueprint/Madav-Blueprint.md', 'utf8');
const head = [
'<!doctype html><html lang="en"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>The Madav Blueprint</title>',
'<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>',
'<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";window.__mermaid=mermaid;</script>',
'<style>',
':root{--ink:#1b1b2b;--muted:#5b5b73;--bg:#f7f7fb;--card:#fff;--accent:#5b4bd6;--accent2:#8b5cf6;--line:#e6e6f0;--warn:#b45309;--ok:#15803d}',
'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
'.wrap{max-width:920px;margin:0 auto;padding:0 22px 120px}',
'header.hero{background:linear-gradient(135deg,#4c1d95,#6d28d9 55%,#8b5cf6);color:#fff;padding:54px 22px;margin-bottom:34px}',
'header.hero .inner{max-width:920px;margin:0 auto}header.hero h1{margin:0 0 6px;font-size:38px;letter-spacing:-.5px}header.hero p{margin:0;opacity:.92;font-size:18px}',
'.badge{display:inline-block;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);border-radius:999px;padding:4px 12px;font-size:13px;margin-top:14px}',
'h2{margin:42px 0 14px;padding-left:14px;border-left:5px solid var(--accent2);font-size:26px;letter-spacing:-.3px}',
'h3{margin:26px 0 10px;font-size:19px;color:#3b2f6b}',
'a{color:#6d28d9}hr{border:none;border-top:1px solid var(--line);margin:34px 0}',
'p,li{color:#26263a}strong{color:#1b1b2b}',
'blockquote{margin:18px 0;padding:14px 18px;background:#efeafd;border-left:5px solid var(--accent2);border-radius:0 10px 10px 0;color:#3b2f6b}',
'blockquote p{margin:.3em 0}',
'table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14.5px;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}',
'th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f0edfb;color:#3b2f6b;font-weight:600}tr:last-child td{border-bottom:none}tr:nth-child(even) td{background:#fafaff}',
'code{background:#eee9fb;color:#5b21b6;padding:.1em .4em;border-radius:5px;font-size:.88em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
'pre{background:#1e1b2e;color:#e8e6f3;padding:16px;border-radius:12px;overflow:auto;font-size:13.5px;line-height:1.5}pre code{background:none;color:inherit;padding:0}',
'pre.mermaid{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;justify-content:center}',
'.foot{margin-top:50px;color:var(--muted);font-size:13px;text-align:center}',
'</style></head><body>',
'<header class="hero"><div class="inner"><h1>The Madav Blueprint</h1><p>One product. Three runtimes. One brain.</p><div class="badge">Living document &middot; rendered edition</div></div></header>',
'<div class="wrap" id="doc"></div>',
'<div class="wrap foot">Generated from <code>docs/blueprint/Madav-Blueprint.md</code> &middot; built by and for Madav</div>'
].join('\n');
const tail = [
'<script>window.__MD__=' + JSON.stringify(md) + ';</script>',
'<script>',
'const r=new marked.Renderer();',
'r.code=function(code,lang){if((lang||"").trim()==="mermaid"){return "<pre class=\\"mermaid\\">"+code+"</pre>";}return "<pre><code>"+code.replace(/&/g,"&amp;").replace(/</g,"&lt;")+"</code></pre>";};',
'marked.setOptions({renderer:r,gfm:true,breaks:false});',
'document.getElementById("doc").innerHTML=marked.parse(window.__MD__);',
'function go(){if(window.__mermaid){window.__mermaid.initialize({startOnLoad:false,theme:"neutral",themeVariables:{fontSize:"14px"}});window.__mermaid.run({querySelector:".mermaid"});}else{setTimeout(go,120);}}go();',
'</script></body></html>'
].join('\n');
writeFileSync('docs/blueprint/Madav-Blueprint.html', head + '\n' + tail + '\n');
console.log('html bytes:', (head+tail).length);
