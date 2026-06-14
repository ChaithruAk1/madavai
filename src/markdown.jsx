// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Dependency-free markdown → React renderer for chat bubbles.
// Safe by construction: we only ever build React elements (never innerHTML), so model
// output cannot inject markup or scripts. Covers the constructs models actually emit:
// headings, bold/italic/strikethrough, inline code, fenced code blocks, links,
// bullet/numbered lists, blockquotes, horizontal rules, tables (basic).
import { Fragment, useState } from "react";
import { parseOfficeSpec, downloadOffice } from "./office.js";

// ---- inline parsing: code spans first (their content is literal), then links/emphasis ----
function inline(text, keyBase = "i") {
  if (!text) return [];
  const out = [];
  let rest = String(text), k = 0;
  const push = (node) => out.push(<Fragment key={`${keyBase}-${k++}`}>{node}</Fragment>);
  const RX = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(__[^_\n]+__)|(_[^_\n]+_)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>"')\]]+)/;
  while (rest) {
    const m = RX.exec(rest);
    if (!m) { push(rest); break; }
    if (m.index > 0) push(rest.slice(0, m.index));
    const tok = m[0];
    if (m[1]) push(<code className="md-code">{tok.slice(1, -1)}</code>);
    else if (m[2]) push(<strong>{inline(tok.slice(2, -2), keyBase + k)}</strong>);
    else if (m[3]) push(<em>{inline(tok.slice(1, -1), keyBase + k)}</em>);
    else if (m[4]) push(<strong>{inline(tok.slice(2, -2), keyBase + k)}</strong>);
    else if (m[5]) push(<em>{inline(tok.slice(1, -1), keyBase + k)}</em>);
    else if (m[6]) push(<s>{tok.slice(2, -2)}</s>);
    else if (m[7]) { const t = tok.slice(1, tok.indexOf("]")); push(<a href={m[8]} target="_blank" rel="noopener noreferrer">{t}</a>); }
    else if (m[9]) push(<a href={tok} target="_blank" rel="noopener noreferrer">{tok}</a>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

function CodeBlock({ lang, code }) {
  const copy = (e) => {
    try { navigator.clipboard.writeText(code); const b = e.currentTarget; b.textContent = "✓ copied"; setTimeout(() => { b.textContent = "copy"; }, 1200); } catch {}
  };
  return (
    <div className="md-pre-wrap">
      <div className="md-pre-bar"><span>{lang || "code"}</span><button className="md-copy" onClick={copy}>copy</button></div>
      <pre className="md-pre"><code>{code}</code></pre>
    </div>
  );
}

// In-chat office files: an ```officedoc spec becomes a real downloadable file card.
// The document is built ON THIS DEVICE when clicked (dynamic import keeps libs lazy).
// Two-channel build flag: public builds without Office render the spec as a plain code block.
const FEAT_OFFICE = import.meta.env.VITE_FEAT_OFFICE !== "0";
const OFFICE_LABEL = { xlsx: "Excel spreadsheet", docx: "Word document", pptx: "PowerPoint deck", pdf: "PDF document" };
function OfficeCard({ code }) {
  const [state, setState] = useState(""); // "" | building | done | error:<msg>
  const parsed = parseOfficeSpec(code);
  if (!parsed) return <CodeBlock lang="officedoc" code={code} />; // mid-stream or invalid → raw view
  const dl = async () => {
    setState("building");
    try { await downloadOffice(parsed); setState("done"); setTimeout(() => setState(""), 2500); }
    catch (e) { setState("error:" + String((e && e.message) || e).slice(0, 120)); }
  };
  const count = parsed.type === "xlsx" ? `${(parsed.sheets || []).length || 1} sheet(s)`
    : parsed.type === "pptx" ? `${(parsed.slides || []).length + (parsed.title ? 1 : 0)} slide(s)`
    : `${(parsed.sections || []).length} section(s)`;
  return (
    <div className="md-office">
      <span className="md-office-ico">{parsed.type === "xlsx" ? "📊" : parsed.type === "pptx" ? "📽" : parsed.type === "pdf" ? "📕" : "📄"}</span>
      <span className="md-office-meta"><b>{parsed.name}</b><i>{OFFICE_LABEL[parsed.type]} · {count} · built on your device</i></span>
      <button className="md-office-btn" disabled={state === "building"} onClick={dl}>
        {state === "building" ? "Building…" : state === "done" ? "Saved ✓" : "Download"}
      </button>
      {state.startsWith("error:") && <span className="md-office-err">{state.slice(6)}</span>}
    </div>
  );
}

// ---- block parsing ----
export default function Markdown({ text }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const blocks = [];
  let i = 0, k = 0;
  const key = () => "b" + k++;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code block — tolerate content glued to the opening fence line, e.g.
    // weak models emit ```officedoc{...} with the JSON brace on the language tag line.
    const fence = /^```([\w-]*)(.*)$/.exec(line);
    if (fence) {
      const buf = []; const head = fence[2];
      if (head && head.trim()) buf.push(head); // first content line was glued to the fence
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence (or EOF — render what we have, mid-stream safe)
      if (fence[1] === "officedoc" && FEAT_OFFICE) blocks.push(<OfficeCard key={key()} code={buf.join("\n")} />);
      else blocks.push(<CodeBlock key={key()} lang={fence[1]} code={buf.join("\n")} />);
      continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const L = h[1].length; const Tag = `h${Math.min(L + 1, 5)}`; blocks.push(<Tag key={key()} className={`md-h md-h${L}`}>{inline(h[2], key())}</Tag>); i++; continue; }
    // horizontal rule
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { blocks.push(<hr key={key()} className="md-hr" />); i++; continue; }
    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={key()} className="md-quote">{inline(buf.join(" "), key())}</blockquote>);
      continue;
    }
    // lists (bulleted / numbered)
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items = []; const ordered = /^\s*\d/.test(line);
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        items.push(<li key={key()}>{inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""), key())}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key()} className="md-list">{items}</ol> : <ul key={key()} className="md-list">{items}</ul>);
      continue;
    }
    // table (| a | b | header + |---| separator)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key()} className="md-table-wrap"><table className="md-table">
          <thead><tr>{head.map((c, ci) => <th key={ci}>{inline(c, key())}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, key())}</td>)}</tr>)}</tbody>
        </table></div>
      );
      continue;
    }
    // blank line
    if (!line.trim()) { i++; continue; }
    // paragraph: gather consecutive plain lines
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*+]|\d+[.)])\s|\s*>|\s*\|.*\|\s*$|\s*---+\s*$)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key()} className="md-p">{inline(buf.join("\n"), key())}</p>);
  }
  return <div className="md">{blocks}</div>;
}
