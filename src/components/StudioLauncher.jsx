// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// "Studio" — a build console. You lead with the IDEA (one prompt bar), optionally pick a
// format "lens" and style, and BrainEdge forges it into a live, runnable preview. Distinct
// from a category-card picker: the prompt is the hero; formats are lenses, not gates.
import { useEffect, useRef, useState } from "react";
import { Globe, FileText, Gamepad2, Wrench, Palette, Workflow, ListChecks, Sparkles, Wand2, ArrowRight, CornerDownLeft, Shuffle } from "lucide-react";

const STYLES = ["Minimalist", "Modern", "Bold & colorful", "Playful", "Professional", "Dark"];

// Format "lenses" — optional. Pick one to tune the output format; or just type and go.
const LENSES = [
  { id: "apps", title: "App / site", icon: Globe, style: true,
    format: "single self-contained HTML page (inline CSS/JS) or a React component", types: ["Landing page", "Dashboard", "Portfolio", "Blog", "Interactive tool"] },
  { id: "tools", title: "Tool", icon: Wrench, style: true,
    format: "interactive single-file HTML or React tool", types: ["Calculator", "Timer / stopwatch", "Tracker", "Unit converter", "To-do list"] },
  { id: "games", title: "Game", icon: Gamepad2, style: true,
    format: "single self-contained HTML game, playable immediately", types: ["Puzzle", "Arcade", "Quiz game", "Card game", "Memory game"] },
  { id: "visuals", title: "Visual", icon: Palette, style: true,
    format: "HTML / SVG / Canvas visual", types: ["Generative art", "Animation", "Chart / graph", "Pattern"] },
  { id: "docs", title: "Document", icon: FileText, style: false,
    format: "clean, well-formatted Markdown document", types: ["Proposal", "Report", "Resume", "Meeting notes", "Spec", "README"] },
  { id: "diagrams", title: "Diagram", icon: Workflow, style: false,
    format: "Mermaid diagram", types: ["Flowchart", "Sequence diagram", "Mind map", "Org chart", "ER diagram"] },
  { id: "quiz", title: "Quiz", icon: ListChecks, style: true,
    format: "interactive single-file HTML quiz/survey that shows results", types: ["Quiz (scored)", "Survey", "Poll"] },
];

// Rotating example ideas — click to load, or watch them cycle in the prompt placeholder.
const EXAMPLES = [
  { lens: "tools", type: "Calculator", text: "a tip & bill-split calculator with a clean dark UI" },
  { lens: "games", type: "Arcade", text: "a one-button endless runner game" },
  { lens: "apps", type: "Dashboard", text: "a habit tracker dashboard with a weekly streak chart" },
  { lens: "visuals", type: "Generative art", text: "a flowing particle field that reacts to the mouse" },
  { lens: "quiz", type: "Quiz (scored)", text: "a 10-question quiz on world capitals that scores me" },
  { lens: "diagrams", type: "Flowchart", text: "a flowchart of a customer onboarding process" },
  { lens: "docs", type: "Spec", text: "a one-page product spec for a coffee-subscription app" },
  { lens: "apps", type: "Landing page", text: "a landing page for a productivity app called FlowState" },
];

export default function StudioLauncher({ onStart }) {
  const [lens, setLens] = useState("");      // selected format lens id, or "" = freeform
  const [type, setType] = useState("");
  const [style, setStyle] = useState("");
  const [desc, setDesc] = useState("");
  const [ph, setPh] = useState(0);           // rotating placeholder index
  const taRef = useRef(null);

  // Cycle the placeholder example for a sense of life (pauses while the user is typing).
  useEffect(() => {
    if (desc) return;
    const t = setInterval(() => setPh((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, [desc]);

  const cat = LENSES.find((l) => l.id === lens) || null;
  const pickLens = (l) => {
    if (lens === l.id) { setLens(""); setType(""); setStyle(""); return; } // toggle off
    setLens(l.id); setType(l.types[0] || ""); setStyle(l.style ? STYLES[0] : "");
    taRef.current && taRef.current.focus();
  };
  const loadExample = (e) => {
    const l = LENSES.find((x) => x.id === e.lens);
    setLens(e.lens); setType(e.type); setStyle(l && l.style ? (style || STYLES[1]) : ""); setDesc(e.text);
    taRef.current && taRef.current.focus();
  };

  const canCreate = !!desc.trim() || (cat && type);
  const create = () => {
    if (!canCreate) return;
    let prompt;
    if (!cat) {
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
  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); create(); } };

  return (
    <div className="studio scroll">
      <div className="stu2">
        {/* header */}
        <div className="stu2-kicker"><Wand2 size={13} /> Studio · the build console</div>
        <h1 className="stu2-title">What should we <span className="stu2-grad">build</span> today?</h1>
        <p className="stu2-sub">Describe an idea in a line — BrainEdge forges it into a <b>live, runnable preview</b> you can refine. Pick a lens to shape the format, or just hit create.</p>

        {/* the console: prompt bar */}
        <div className="stu2-console">
          <div className="stu2-spark"><Sparkles size={16} /></div>
          <textarea
            ref={taRef} className="stu2-input" rows={2} value={desc} onKeyDown={onKey}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={`e.g. ${EXAMPLES[ph].text}`} />
          <button className="stu2-go" disabled={!canCreate} onClick={create} title="Create (⌘/Ctrl+Enter)">
            <Sparkles size={15} /> Create <CornerDownLeft size={13} className="stu2-go-kbd" />
          </button>
        </div>

        {/* format lenses */}
        <div className="stu2-section-label">Shape it as <span>(optional)</span></div>
        <div className="stu2-lenses">
          {LENSES.map((l) => { const I = l.icon; const on = lens === l.id; return (
            <button key={l.id} className={`stu2-lens ${on ? "on" : ""}`} onClick={() => pickLens(l)}>
              <span className="stu2-lens-ic"><I size={16} /></span>
              <span className="stu2-lens-t">{l.title}</span>
            </button>
          ); })}
        </div>

        {/* contextual options for the chosen lens */}
        {cat && (
          <div className="stu2-opts">
            {cat.types.length > 0 && (
              <div className="stu2-opt">
                <span className="stu2-opt-label">Type</span>
                <div className="stu2-chips">{cat.types.map((t) => <button key={t} className={`stu2-chip ${type === t ? "on" : ""}`} onClick={() => setType(t)}>{t}</button>)}</div>
              </div>
            )}
            {cat.style && (
              <div className="stu2-opt">
                <span className="stu2-opt-label">Style</span>
                <div className="stu2-chips">{STYLES.map((sName) => <button key={sName} className={`stu2-chip ${style === sName ? "on" : ""}`} onClick={() => setStyle(sName)}>{sName}</button>)}</div>
              </div>
            )}
          </div>
        )}

        {/* example reel */}
        <div className="stu2-section-label" style={{ marginTop: 22 }}><Shuffle size={12} /> Need a spark? Try one</div>
        <div className="stu2-egs">
          {EXAMPLES.slice(0, 6).map((e, i) => (
            <button key={i} className="stu2-eg" onClick={() => loadExample(e)}>{e.text}</button>
          ))}
        </div>

        {/* idea → preview pipeline (decorative, animated) */}
        <div className="stu2-rail">
          <div className="stu2-rail-node"><span className="stu2-rail-ic"><Wand2 size={15} /></span><span>Your idea</span></div>
          <span className="stu2-rail-line" />
          <div className="stu2-rail-node accent"><span className="stu2-rail-ic"><Sparkles size={15} /></span><span>BrainEdge forges it</span></div>
          <span className="stu2-rail-line" />
          <div className="stu2-rail-node ok"><span className="stu2-rail-ic"><ArrowRight size={15} /></span><span>Live preview to refine</span></div>
        </div>
      </div>
    </div>
  );
}
