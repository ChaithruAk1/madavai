// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// "Studio" — pick a category, choose options (chips) + add details, and BrainEdge builds it as a live
// preview straight away (no clarifying-question wall, because you've already chosen up front).
import { useState } from "react";
import { Globe, FileText, Gamepad2, Wrench, Palette, Workflow, ListChecks, Plus, ArrowLeft, Sparkles } from "lucide-react";

const STYLES = ["Minimalist", "Modern", "Bold & colorful", "Playful", "Professional", "Dark"];
const CATS = [
  { id: "apps", title: "Apps & sites", desc: "Interactive web apps and landing pages", icon: Globe, style: true,
    format: "single self-contained HTML page (inline CSS/JS) or a React component", types: ["Portfolio", "Landing page", "Dashboard", "Blog", "Interactive tool"] },
  { id: "docs", title: "Documents", desc: "Formatted docs, specs, templates", icon: FileText, style: false,
    format: "clean, well-formatted Markdown document", types: ["Proposal", "Report", "Resume", "Meeting notes", "Spec", "README"] },
  { id: "games", title: "Games", desc: "Playable browser games", icon: Gamepad2, style: true,
    format: "single self-contained HTML game, playable immediately", types: ["Puzzle", "Arcade", "Quiz game", "Card game", "Memory game"] },
  { id: "tools", title: "Tools", desc: "Calculators, trackers, utilities", icon: Wrench, style: true,
    format: "interactive single-file HTML or React tool", types: ["Calculator", "Timer / stopwatch", "Tracker", "Unit converter", "To-do list"] },
  { id: "visuals", title: "Visuals", desc: "Generative art, animation, graphics", icon: Palette, style: true,
    format: "HTML / SVG / Canvas visual", types: ["Generative art", "Animation", "Chart / graph", "Pattern"] },
  { id: "diagrams", title: "Diagrams", desc: "Flowcharts and mind maps", icon: Workflow, style: false,
    format: "Mermaid diagram", types: ["Flowchart", "Sequence diagram", "Mind map", "Org chart", "ER diagram"] },
  { id: "quiz", title: "Quizzes", desc: "Interactive quizzes & surveys", icon: ListChecks, style: true,
    format: "interactive single-file HTML quiz/survey that shows results", types: ["Quiz (scored)", "Survey", "Poll"] },
  { id: "blank", title: "Blank canvas", desc: "Start from scratch", icon: Plus, style: false, format: "live preview", types: [] },
];

export default function StudioLauncher({ onStart }) {
  const [cat, setCat] = useState(null);
  const [type, setType] = useState("");
  const [style, setStyle] = useState("");
  const [desc, setDesc] = useState("");

  const open = (c) => { setCat(c); setType(c.types[0] || ""); setStyle(c.style ? STYLES[0] : ""); setDesc(""); };

  const create = () => {
    if (!cat) return;
    let prompt;
    if (cat.id === "blank") {
      prompt = `${desc || "Build something cool and useful"} — produce it as a live, runnable preview. Do not ask clarifying questions; just make a polished first version I can refine.`;
    } else {
      const what = (type || cat.title).toLowerCase();
      prompt = `Create a ${what} as a ${cat.format}.`
        + (desc ? ` Details: ${desc}.` : "")
        + (style ? ` Visual style: ${style}.` : "")
        + ` Build it now as a live preview — do not ask any clarifying questions; just produce a polished first version I can refine afterwards.`;
    }
    onStart(prompt);
  };

  if (cat) {
    const I = cat.icon;
    return (
      <div className="studio scroll">
        <div className="studio-inner studio-form">
          <button className="studio-back" onClick={() => setCat(null)}><ArrowLeft size={15} /> Studio</button>
          <div className="studio-formhead">
            <span className="studio-ico"><I size={20} /></span>
            <div><h1 style={{ margin: 0, fontSize: 22 }}>{cat.title}</h1><p style={{ margin: "2px 0 0", color: "var(--text-2)", fontSize: 13 }}>{cat.desc}</p></div>
          </div>

          {cat.types.length > 0 && (
            <div className="studio-field">
              <label>Type</label>
              <div className="studio-chips">{cat.types.map((t) => <button key={t} className={`studio-chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>{t}</button>)}</div>
            </div>
          )}
          {cat.style && (
            <div className="studio-field">
              <label>Style</label>
              <div className="studio-chips">{STYLES.map((s) => <button key={s} className={`studio-chip ${style === s ? "on" : ""}`} onClick={() => setStyle(s)}>{s}</button>)}</div>
            </div>
          )}
          <div className="studio-field">
            <label>Details {cat.id === "blank" ? "" : "(optional)"}</label>
            <textarea className="model-search" rows={4} style={{ resize: "vertical", fontFamily: "inherit" }} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder={cat.id === "blank" ? "Describe what you want to build…" : "e.g. my name is Maya, dark theme, include a contact form and projects grid…"} />
          </div>
          <button className="btn primary studio-create" onClick={create}><Sparkles size={15} /> Create</button>
        </div>
      </div>
    );
  }

  return (
    <div className="studio scroll">
      <div className="studio-inner">
        <div className="studio-head">
          <h1>Studio</h1>
          <p>Describe an idea and BrainEdge builds it as a <b>live, runnable preview</b>. Pick a starting point.</p>
        </div>
        <div className="studio-grid">
          {CATS.map((c) => { const I = c.icon; return (
            <button key={c.id} className={`studio-card ${c.id === "blank" ? "blank" : ""}`} onClick={() => open(c)}>
              <span className="studio-ico"><I size={20} /></span>
              <span className="studio-ct">{c.title}</span>
              <span className="studio-cd">{c.desc}</span>
            </button>
          ); })}
        </div>
      </div>
    </div>
  );
}
