// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Dependency-free markdown → React renderer for chat bubbles.
// Safe by construction: we only ever build React elements (never innerHTML), so model
// output cannot inject markup or scripts. Covers the constructs models actually emit:
// headings, bold/italic/strikethrough, inline code, fenced code blocks, links,
// bullet/numbered lists, blockquotes, horizontal rules, tables (basic).
import { Fragment, useState, useEffect, useRef, createContext, useContext } from "react";
import { parseOfficeSpec, downloadOffice, buildOfficeBlob } from "./office.js";
import { runDeckCode, deckNameFrom } from "./deck/deckRunner.js";
import { deckPreviewHTML } from "./deck/deckPreview.js";
import { bridge } from "./bridge/index.js";

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

// A cheap SYNTAX-ONLY check (construct the function, never run it) so a card can auto-repair broken
// code the moment the reply completes. Ignores CSP/EvalError (that is the unsafe-eval config, not the code).
function _codeSyntaxError(code, params) {
  try { const AF = Object.getPrototypeOf(async function () {}).constructor; new AF(...params, String(code || "")); return ""; }
  catch (e) { const m = String((e && e.message) || e); if (/unsafe-eval|Content Security Policy|EvalError/i.test(m)) return ""; return /Unexpected|Invalid or unexpected|SyntaxError/i.test(m) ? m.slice(0, 160) : ""; }
}
// In-chat office files: an ```officedoc spec becomes a real downloadable file card.
// The document is built ON THIS DEVICE when clicked (dynamic import keeps libs lazy).
// Two-channel build flag: public builds without Office render the spec as a plain code block.
const FEAT_OFFICE = import.meta.env.VITE_FEAT_OFFICE !== "0";
const OFFICE_LABEL = { xlsx: "Excel spreadsheet", docx: "Word document", pptx: "PowerPoint deck", pdf: "PDF document" };
export const OPEN_LABEL = { xlsx: "Open in Excel", docx: "Open in Word", pptx: "Open in PowerPoint", pdf: "Open PDF" };
// Real-looking Microsoft/Adobe file icons (full-color SVG, fixed brand colors — never theme-tinted),
// like Claude: a white page with a folded corner + a brand-colored label badge and the type letter.
export function OfficeIcon({ type, size = 36 }) {
  const COLOR = { xlsx: "#21A366", docx: "#2B579A", pptx: "#C43E1C", pdf: "#D32F2F" };
  const LETTER = { xlsx: "X", docx: "W", pptx: "P", pdf: "PDF" };
  const c = COLOR[type] || "#5B8DEF";
  const letter = LETTER[type] || "";
  const w = type === "pdf" ? 17 : 14.5;
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" style={{ flex: "none" }}>
      <path d="M7 3h9l5 5v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#ffffff" stroke="#dfe3e8" strokeWidth="1" />
      <path d="M16 3l5 5h-4a1 1 0 0 1-1-1V3z" fill="#cfd4da" />
      <rect x="3.5" y="13" width={w} height="9.5" rx="1.5" fill={c} />
      <text x={3.5 + w / 2} y="20.3" fontSize={type === "pdf" ? 6.2 : 9} fontWeight="700" fill="#ffffff" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif">{letter}</text>
    </svg>
  );
}
// A folder-linked room (Project / Collaborate / Agent) sets this to its folder path; an OfficeCard then
// auto-builds the file and SAVES it into that folder (instead of a download), matching the old script path's
// "the file lands in the folder" behaviour. Null in Let's Chat → the normal download/open card.
export const OfficeSaveDir = createContext(null);

function OfficeCard({ code, streaming }) {
  const saveDir = useContext(OfficeSaveDir);            // non-null in a folder-linked room → save INTO the folder
  const [state, setState] = useState(""); // "" | building | done | saved | error:<msg>
  const [stuck, setStuck] = useState(false);
  const [savedPath, setSavedPath] = useState("");
  const [issues, setIssues] = useState([]);
  const parsed = parseOfficeSpec(code, { lenient: !streaming }); // strict while streaming → a partial spec stays a quiet "Preparing…" placeholder instead of flickering a half-built preview
  // Don't hang on "Preparing…" forever: if the content never becomes a valid spec, surface a friendly dead-end.
  useEffect(() => {
    if (parsed) { setStuck(false); return; }
    const id = setTimeout(() => setStuck(true), 6000);
    return () => clearTimeout(id);
  }, [code, !!parsed]);
  // Folder-linked room: build the file ONCE when the spec STREAMS IN LIVE and SAVE it into the room's folder
  // (parity with the old script path); then the card shows Open / Show-in-folder. CRITICAL: only auto-save a
  // spec that actually streamed this mount. A card re-mounted from HISTORY (re-opening the conversation) was
  // already saved on its original run — re-saving would duplicate the file in the folder on every open.
  const sawStream = useRef(false);
  useEffect(() => { if (streaming) sawStream.current = true; }, [streaming]);
  useEffect(() => {
    if (!saveDir || !parsed || streaming || savedPath || state === "building") return;
    if (!sawStream.current) return; // re-opened from history (never streamed this mount) → already on disk, don't duplicate
    let cancelled = false;
    (async () => {
      try {
        setState("building");
        const blob = await buildOfficeBlob(parsed);
        setIssues((blob && blob.madavIssues) || []);
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
        const out = (bridge && bridge.saveAndOpen) ? await bridge.saveAndOpen(parsed.name, b64, saveDir) : null;
        if (cancelled) return;
        if (out && out.ok) { setSavedPath(out.path || ""); setState("saved"); }
        else { await downloadOffice(parsed); setState("done"); }            // no desktop bridge (web) → download instead
      } catch (e) { if (!cancelled) setState("error:" + String((e && e.message) || e).slice(0, 120)); }
    })();
    return () => { cancelled = true; };
  }, [saveDir, !!parsed, streaming]);
  if (!parsed) {
    if (stuck) return (
      <div className="md-office md-office-pending">
        <span className="md-office-ico">⚠️</span>
        <span className="md-office-meta"><b>Couldn't build this document</b><i>the content wasn't complete — ask me to try again</i></span>
      </div>
    );
    // Mid-stream (or not-yet-valid JSON): NEVER show the raw spec. A quiet placeholder until it's ready —
    // the model's JSON is plumbing the user shouldn't see.
    const t = (/"type"\s*:\s*"(xlsx|docx|pptx|pdf)"/.exec(code) || [])[1];
    return (
      <div className="md-office md-office-pending">
        <span className="md-office-ico">{t === "xlsx" ? "📊" : t === "pptx" ? "📽" : t === "pdf" ? "📕" : "📄"}</span>
        <span className="md-office-meta"><b>Preparing your {t ? OFFICE_LABEL[t] : "document"}…</b><i>building it on your device</i></span>
      </div>
    );
  }
  const dl = async () => {
    setState("building");
    try {
      // Desktop: build the real file, save it, and OPEN it in its native app (Excel/Word/…).
      if (bridge && bridge.saveAndOpen) {
        const blob = await buildOfficeBlob(parsed);
        setIssues((blob && blob.madavIssues) || []);
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
        const out = await bridge.saveAndOpen(parsed.name, b64);
        if (out && out.ok) { setState("done"); setTimeout(() => setState(""), 2500); return; }
      }
      // Web, or if native open is unavailable/failed: download the file.
      const _iss = await downloadOffice(parsed); setIssues(_iss || []); setState("done"); setTimeout(() => setState(""), 2500);
    } catch (e) { setState("error:" + String((e && e.message) || e).slice(0, 120)); }
  };
  const count = parsed.type === "xlsx" ? `${(parsed.sheets || []).length || 1} sheet(s)`
    : parsed.type === "pptx" ? `${(parsed.slides || []).length + (parsed.title ? 1 : 0)} slide(s)`
    : `${(parsed.sections || []).length} section(s)`;
  // Open a live preview in the side panel ("window next to it"). The same spec
  // renders to HTML there; Download still builds the real file.
  const open = () => { try { window.dispatchEvent(new CustomEvent("madav:openoffice", { detail: { code, name: parsed.name, type: parsed.type } })); } catch {} };
  // Engine size-cap warnings (rows/cols/sheets) shown on the card instead of dropping data silently.
  const noteEl = issues.length ? (
    <span className="md-office-note" title={issues.map((x) => x.message).join("\n")} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: issues.some((x) => x.level === "error") ? "#b42318" : "#9a6700", marginLeft: 6 }}>
      {"\u26A0 "}{issues.length === 1 ? issues[0].message : issues.length + " size notes \u2014 nothing dropped silently"}
    </span>
  ) : null;
  // Saved into a folder-linked room → Open + Show-in-folder instead of a Download button.
  if (savedPath) return (
    <div className="md-office">
      <span className="md-office-meta" onClick={open} style={{ cursor: "pointer" }} title="Open preview"><b>{parsed.name}</b><i>{OFFICE_LABEL[parsed.type]} · {count} · saved to the folder</i></span>
      <span className={"md-office-ico md-office-ico--" + parsed.type} onClick={open} style={{ cursor: "pointer" }} title="Open preview"><OfficeIcon type={parsed.type} /></span>
      <button className="md-office-btn" onClick={() => { try { bridge && bridge.openPath && bridge.openPath(savedPath); } catch {} }}>Open</button>
      <button className="md-office-open" onClick={() => { try { bridge && bridge.showInFolder && bridge.showInFolder(savedPath); } catch {} }}>Show in folder</button>
      {noteEl}
    </div>
  );
  return (
    <div className="md-office">
      <span className="md-office-meta" onClick={open} style={{ cursor: "pointer" }} title="Open preview"><b>{parsed.name}</b><i>{OFFICE_LABEL[parsed.type]} · {count} · built on your device</i></span>
      <span className={"md-office-ico md-office-ico--" + parsed.type} onClick={open} style={{ cursor: "pointer" }} title="Open preview"><OfficeIcon type={parsed.type} /></span>
      <button className="md-office-btn" disabled={state === "building"} onClick={dl}>
        {state === "building" ? (saveDir ? "Saving…" : "Building…") : state === "done" ? "Saved ✓" : (OPEN_LABEL[parsed.type] || "Download")}
      </button>
      {state.startsWith("error:") && <span className="md-office-err">{state.slice(6)}</span>}
      {state.startsWith("error:") && <button className="md-office-open" onClick={() => window.dispatchEvent(new CustomEvent("madav:fixdoc", { detail: { code, error: state.slice(6) } }))}>Rebuild</button>}
      {noteEl}
    </div>
  );
}

// A ```deckjs block is a model-written pptxgenjs build script — full bespoke design, composed
// per-slide by the model (this is what reaches Claude-grade quality). We NEVER show the raw code;
// Download builds a real .pptx on this device in a sandboxed worker.
function DeckCard({ code, streaming }) {
  const [state, setState] = useState(""); // "" | building | done | repairing | invalid | error:<msg>
  const [issues, setIssues] = useState([]);
  const ready = !streaming && /addSlide/.test(code);            // the script has begun producing slides
  const name = deckNameFrom(code);
  const isRepair = /\/\/\s*repaired/i.test(code);
  useEffect(() => {
    if (!ready || isRepair || state) return; // freshly complete -> validate syntax once (parity with xlsx/docx/pdf)
    const bad = _codeSyntaxError(code, ["pptx", "helpers", "ShapeType", "ChartType"]);
    if (bad) { setState("repairing"); window.dispatchEvent(new CustomEvent("madav:fixdoc", { detail: { kind: "deck", code, error: bad } })); }
  }, [ready, isRepair]);
  const view = async () => { try { const html = await deckPreviewHTML(code); window.dispatchEvent(new CustomEvent("madav:openhtml", { detail: { html, title: name } })); } catch (e) { setState("error:" + String((e && e.message) || e).slice(0, 120)); } };
  const build = async (force) => {
    setState("building");
    try {
      const { blob, issues: found } = await runDeckCode(code);
      if (found && found.length && !force) {
        setIssues(found);
        if (!isRepair) { setState("repairing"); window.dispatchEvent(new CustomEvent("madav:fixdoc", { detail: { kind: "deck", code, issues: found } })); return; }
        setState("invalid"); return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState("done"); setTimeout(() => setState(""), 2500);
    } catch (e) {
      const m = String((e && e.message) || e);
      const midStream = /Unexpected end of input|Invalid or unexpected token|Unexpected token|Unexpected identifier/i.test(m);
      setState("error:" + (midStream ? "Couldn't build it — if the reply has finished, click Rebuild." : m.slice(0, 140)));
    }
  };
  return (
    <div className={"md-office" + (ready ? "" : " md-office-pending")}>
      <span className="md-office-ico">📽</span>
      <span className="md-office-meta"><b>{ready ? name : "Composing your deck…"}</b><i>{state === "repairing" ? `Found ${issues.length || 1} issue(s) — Madav is rebuilding it…` : state === "invalid" ? `${issues.length} issue(s) in slide text — review before sending` : ready ? "PowerPoint deck · designed on your device" : "building it on your device"}</i></span>
      {ready && state !== "repairing" && <button className="md-office-open" onClick={view} title="Preview beside the chat">View</button>}
      {ready && state === "" && <button className="md-office-open" onClick={() => window.dispatchEvent(new CustomEvent("madav:fixdoc", { detail: { code, polish: true } }))} title="Refine the design — one more pass">Polish ✨</button>}
      {ready && state !== "repairing" && <button className="md-office-btn" disabled={state === "building"} onClick={() => build(state === "invalid")}>{state === "building" ? "Building…" : state === "done" ? "Saved ✓" : state === "invalid" ? "Download anyway" : "Download"}</button>}
      {state.startsWith("error:") && <span className="md-office-err">{state.slice(6)}</span>}
      {state.startsWith("error:") && <button className="md-office-open" onClick={() => window.dispatchEvent(new CustomEvent("madav:fixdoc", { detail: { code, error: state.slice(6) } }))}>Rebuild</button>}
    </div>
  );
}

// Any markdown table — even one a weak model prints as plain text — becomes a REAL spreadsheet on this
// device. The model only has to produce a table (trivial for any model); the deterministic @madav/documents
// engine builds the .xlsx. This is what lets Madav work WITHOUT depending on a strong model.
function hasMdTable(text) {
  const ls = String(text || "").split(/\r?\n/);
  for (let i = 0; i < ls.length - 1; i++) {
    if (ls[i].includes("|") && ls[i + 1].includes("-") && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(ls[i + 1])) return true;
  }
  return false;
}
function ExcelizeButton({ text, streaming }) {
  const [state, setState] = useState("");
  if (streaming) return null;
  const dl = async () => {
    setState("building");
    try {
      const mod = await import("@madav/documents");
      const tables = (mod.extractMarkdownTables ? mod.extractMarkdownTables(text) : []).filter((t) => t && t.rows && t.rows.length);
      if (!tables.length) { setState(""); return; }
      const spec = { type: "xlsx", name: "spreadsheet.xlsx", sheets: tables.map((t, i) => ({ name: "Sheet" + (i + 1), rows: [t.header, ...t.rows] })) };
      const blob = await buildOfficeBlob(spec);
      if (bridge && bridge.saveAndOpen) {
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(blob); });
        const out = await bridge.saveAndOpen(spec.name, b64);
        if (out && out.ok) { setState("done"); setTimeout(() => setState(""), 2500); return; }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = spec.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setState("done"); setTimeout(() => setState(""), 2500);
    } catch (e) { setState("error:" + String((e && e.message) || e).slice(0, 80)); }
  };
  return (
    <div className="md-office" style={{ marginTop: 6 }}>
      <span className="md-office-ico md-office-ico--xlsx" title="Excel"><OfficeIcon type="xlsx" /></span>
      <span className="md-office-meta"><b>Spreadsheet ready</b><i>built from this table on your device</i></span>
      <button className="md-office-btn" disabled={state === "building"} onClick={dl}>{state === "building" ? "Building…" : state === "done" ? "Saved \u2713" : "Download as Excel"}</button>
      {state.startsWith("error:") && <span className="md-office-err">Couldn't build it — try again.</span>}
    </div>
  );
}
// ---- block parsing ----
export default function Markdown({ text, streaming }) {
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
      if ((fence[1] === "officedoc" || fence[1] === "deckjs") && FEAT_OFFICE) {
        // Route by CONTENT, not the fence tag — models sometimes put deck code in an officedoc fence
        // (or a JSON spec in deckjs). pptxgenjs build code → DeckCard; a JSON spec → OfficeCard.
        const _c = buf.join("\n");
        const _isDeckCode = /\bpptx\s*\.\s*addSlide|\bpptx\s*\.\s*(?:ShapeType|ChartType)|\.\s*addSlide\s*\(/.test(_c);
        if (_isDeckCode || (fence[1] === "deckjs" && !/^\s*\{/.test(_c.trim()))) blocks.push(<DeckCard key={key()} code={_c} streaming={streaming} />);
        else blocks.push(<OfficeCard key={key()} code={_c} streaming={streaming} />);
      } else if (FEAT_OFFICE && /"type"\s*:\s*"(?:xlsx|docx|pptx|pdf)"/.test(buf.join("\n")) && !/\bpptx\s*\.\s*addSlide|\.\s*addSlide\s*\(/.test(buf.join("\n"))) {
        // A spreadsheet/Word/PDF spec emitted with the WRONG fence (```xlsx / ```json / untagged) is still
        // a file, never a raw snippet — render it as the downloadable card with Open/Download.
        blocks.push(<OfficeCard key={key()} code={buf.join("\n")} streaming={streaming} />);
      } else if (FEAT_OFFICE && /^\s*\{/.test(buf.join("\n").trim()) && /"(?:sheets|slides|sections)"\s*:/.test(buf.join("\n"))) {
        // A weak model dumped a partial/failed office spec as raw JSON - useless to the user. Route it to the
        // office card: a valid spec becomes the file, an invalid one shows a clean placeholder. Never raw JSON.
        blocks.push(<OfficeCard key={key()} code={buf.join("\n")} streaming={streaming} />);
      } else {
        const _code = buf.join("\n");
        blocks.push(<CodeBlock key={key()} lang={fence[1]} code={_code} />);
        if (FEAT_OFFICE && hasMdTable(_code)) blocks.push(<ExcelizeButton key={key()} text={_code} streaming={streaming} />);
      }
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
      const _tStart = i;
      const head = cells(line); i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      const _tableText = lines.slice(_tStart, i).join("\n");
      blocks.push(
        <div key={key()} className="md-table-wrap"><table className="md-table">
          <thead><tr>{head.map((c, ci) => <th key={ci}>{inline(c, key())}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{inline(c, key())}</td>)}</tr>)}</tbody>
        </table></div>
      );
      if (FEAT_OFFICE) blocks.push(<ExcelizeButton key={key()} text={_tableText} streaming={streaming} />);
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
