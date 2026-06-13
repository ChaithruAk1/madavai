// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Studio Guide — a short, friendly walkthrough of the creative studio, built in the same
// fashion as the Projects and Playbook guides (agg-* classes). Three tabs: Tour & practice,
// Do's & don'ts, and How it works. Rendered inside StudioLauncher's "Guide" tab.
import { useState } from "react";
import { BookOpen, Compass, ShieldCheck, ShieldAlert, ArrowRight, ArrowLeft, Check, Wand2, Sparkles, Layers, GitBranch, Users, Image as ImageIcon, Share2, Palette, Play } from "lucide-react";

const Node = ({ glyph, color, label, sub }) => (
  <span className="agg-node" style={color ? { "--nc": color } : undefined}>
    <span className="agg-node-face">{glyph}</span>
    <span className="agg-node-label">{label}</span>
    {sub && <span className="agg-node-sub">{sub}</span>}
  </span>
);
const Arrow = ({ label }) => (
  <div className="agg-arrow">{label && <span className="agg-arrow-lbl">{label}</span>}<span className="agg-arrow-line" /></div>
);

const CHAPTERS = [
  {
    title: "Describe, don't build", sub: "the prompt is the hero",
    lead: "Studio starts from a sentence. You say what you want — “a pricing page for a coffee app”, “a snake game”, “a flowchart of our onboarding” — and Madav forges a live, runnable preview. You're directing, not coding.",
    diagram: (<div className="agg-flow"><Node glyph="✍️" color="#13c2d6" label="Your idea" sub="one line" /><Arrow label="forge" /><Node glyph="✨" color="#8b7cf6" label="Madav builds" /><Arrow /><Node glyph="▶" color="#5fb573" label="Live preview" sub="real, runnable" /></div>),
    note: "Pick a lens (App, Tool, Game, Diagram, Document…) to tune the format — or skip it and just type.",
  },
  {
    title: "Refine by talking", sub: "the preview is the editor",
    lead: "Once it renders, you keep talking: “make the hero bolder”, “add a third column”, “use a darker palette”. The preview updates so you can react to the real thing instead of imagining it.",
    diagram: (<div className="agg-flow"><Node glyph="▶" color="#13c2d6" label="Preview" /><Arrow label="“make it bolder”" /><Node glyph="✨" color="#8b7cf6" label="It updates" /><Arrow /><Node glyph="✓" color="#5fb573" label="Yours" /></div>),
    note: "In the artifact's Edit tab you can also select a region and ask for a targeted change.",
  },
  {
    title: "Design DNA", sub: "save a look, reuse it",
    lead: "Found a look you love? Save it as a style preset — a palette, type and voice with a name like “Aurora Noir”. Apply it to any new creation in one click and everything comes out on-brand, no re-describing.",
    diagram: (<div className="agg-flow"><Node glyph="🎨" color="#13c2d6" label="Save a look" sub="“Aurora Noir”" /><Arrow /><Node glyph="📌" color="#f4a261" label="One click" /><Arrow /><Node glyph="🧩" color="#5fb573" label="On-brand" sub="every time" /></div>),
    note: "A preset is a saved prompt-prefix — it travels with every build until you turn it off.",
  },
  {
    title: "Diverge, then choose", sub: "variations & crew",
    lead: "Ask for several takes at once — Studio lays 2 or 4 variations side by side so you can compare and pick. Or switch on Crew mode and a Concept → Critic → Polish pass refines the idea before you ever see it.",
    diagram: (<div className="agg-flow"><Node glyph="🔀" color="#13c2d6" label="4 takes" sub="compare" /><Arrow /><Node glyph="👁" color="#8b7cf6" label="Critic pass" /><Arrow /><Node glyph="💎" color="#5fb573" label="Polished" /></div>),
    note: "Designers think in options — variations beat re-asking one-at-a-time.",
  },
  {
    title: "Keep & share", sub: "gallery and export",
    lead: "Save a creation to your Gallery so it isn't lost to chat history — reopen, remix or download it any time. Or send it straight to a Workroom's knowledge shelf so your crew can build on it.",
    diagram: (<div className="agg-flow"><Node glyph="🖼" color="#13c2d6" label="Gallery" sub="your work" /><Arrow label="remix" /><Node glyph="✨" color="#8b7cf6" label="New version" /><Arrow label="send" /><Node glyph="📚" color="#5fb573" label="Workroom" sub="crew builds on it" /></div>),
    note: "Reopening a saved piece and refining it is a remix — the original stays safe.",
  },
];

const DOS = [
  <>Lead with a <b>clear one-line idea</b> — the prompt is the hero; lenses just tune the format.</>,
  <>Save a look you like as <b>Design DNA</b> and reuse it, instead of re-describing your style each time.</>,
  <>Ask for <b>2–4 variations</b> when you're exploring — compare, then fork your favorite.</>,
  <>Use the <b>Gallery</b> to keep good work, and <b>send to a Workroom</b> when the crew should build on it.</>,
  <>Refine in <b>plain language</b> — “bigger hero”, “calmer palette” — and watch the preview react.</>,
];
const DONTS = [
  <>Don't use Studio for a real codebase — that's <b>Let's Build</b>, which works inside a folder.</>,
  <>Don't expect external imports or a backend — Studio artifacts are <b>self-contained</b> by design.</>,
  <>Don't keep re-asking for one option at a time when you mean to explore — turn on <b>Variations</b>.</>,
  <>Don't lose a great result to scroll — <b>Save it to the Gallery</b> the moment you like it.</>,
];

const STEPS = [
  { icon: Wand2, t: "Make your first thing", steps: ["Open Studio", "Type an idea, e.g. “a tip calculator with a clean dark UI”", "Optionally pick the Tool lens", "Press Create — it builds a live preview"] },
  { icon: Palette, t: "Save & apply a style", steps: ["Build something you like the look of", "In Design DNA, click “Save a look”", "Name it (e.g. “Aurora Noir”) and describe the palette/feel", "Click the preset before your next build to apply it"] },
  { icon: Layers, t: "Explore variations", steps: ["Set the Variations selector to 2 or 4", "Describe your idea and Create", "Compare the takes side by side in the preview", "Tell Studio which one to keep refining"] },
  { icon: Users, t: "Build with a crew", steps: ["Turn on Crew mode", "Describe the idea and Create", "Read the Concept → Critic → Polish notes", "Receive the refined final artifact"] },
  { icon: ImageIcon, t: "Keep it in the Gallery", steps: ["On a creation you like, click Save to gallery", "Open the Gallery tab any time to reopen it", "Use “Refine in Studio” to remix it", "Or Download / Send to a Workroom"] },
];

export default function StudioGuide({ onBack }) {
  const [tab, setTab] = useState("tour");
  const [chapter, setChapter] = useState(0);
  const ch = CHAPTERS[chapter];

  if (tab === "reference") {
    return (
      <div className="agg-ref scroll">
        <div className="agg-ref-inner">
          <div className="agg-subnav">
            <button onClick={() => setTab("tour")}><Compass size={14} /> Tour</button>
            <button className="on"><BookOpen size={14} /> Do's &amp; don'ts</button>
            <button onClick={() => setTab("how")}><Play size={14} /> How to</button>
            <button onClick={onBack}><ArrowRight size={14} /> Go to Studio</button>
          </div>
          <div className="agg-kicker"><BookOpen size={13} /> Madav Studio Guide</div>
          <h1 className="agg-h1">Do's &amp; don'ts</h1>
          <p className="agg-ref-sub">The short reference for getting the most out of Studio — describe boldly, save your look, explore in options, and keep what's good.</p>
          <div className="agg-ref-grid">
            <div className="agg-ref-card do"><h3><ShieldCheck size={16} /> Do</h3><ul>{DOS.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div className="agg-ref-card dont"><h3><ShieldAlert size={16} /> Don't</h3><ul>{DONTS.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
        </div>
      </div>
    );
  }

  if (tab === "how") {
    return (
      <div className="agg-ref scroll">
        <div className="agg-ref-inner">
          <div className="agg-subnav">
            <button onClick={() => setTab("tour")}><Compass size={14} /> Tour</button>
            <button onClick={() => setTab("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
            <button className="on"><Play size={14} /> How to</button>
            <button onClick={onBack}><ArrowRight size={14} /> Go to Studio</button>
          </div>
          <div className="agg-kicker"><Play size={13} /> Madav Studio Guide</div>
          <h1 className="agg-h1">How to do it</h1>
          <p className="agg-ref-sub">Five short recipes — from your first build to saving a look, exploring variations, building with a crew, and keeping work in the Gallery.</p>
          <div className="pb2-steps">
            {STEPS.map((st, i) => { const I = st.icon; return (
              <div key={i} className="pb2-stepcard">
                <div className="pb2-stephead"><span className="pb2-stepic"><I size={16} /></span> {st.t}</div>
                <ol className="pb2-steplist">{st.steps.map((x, j) => <li key={j}>{x}</li>)}</ol>
              </div>
            ); })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agg-wrap">
      <div className="agg-left scroll">
        <button className="pj-back" style={{ marginBottom: 6 }} onClick={onBack}><ArrowLeft size={15} /> Studio</button>
        <div className="agg-tophead">
          <div className="agg-kicker"><BookOpen size={13} className="agg-book" /> A 3-minute guide</div>
          <button className="btn primary" onClick={onBack}><Wand2 size={14} /> Open Studio</button>
        </div>
        <h1 className="agg-h1">Make things by talking</h1>
        <p className="agg-intro">Studio turns a sentence into a live, runnable preview — pages, tools, games, diagrams, documents. Describe it, refine it by talking, save your favorite looks, explore variations, and keep the good stuff in your Gallery.</p>
        <div className="agg-subnav">
          <button className="on"><Compass size={14} /> Tour &amp; practice</button>
          <button onClick={() => setTab("reference")}><BookOpen size={14} /> Do's &amp; don'ts</button>
          <button onClick={() => setTab("how")}><Play size={14} /> How to</button>
          <button onClick={onBack}><ArrowRight size={14} /> Go to Studio</button>
        </div>
        <div className="agg-rail">
          {CHAPTERS.map((c, i) => (
            <button key={i} className={`agg-rail-item ${chapter === i ? "on" : ""} ${chapter > i ? "read" : ""}`} onClick={() => setChapter(i)}>
              <span className="agg-rail-n">{chapter > i ? <Check size={11} /> : `0${i + 1}`}</span>
              <span className="agg-rail-t">{c.title}</span>
              <span className="agg-rail-s">{c.sub}</span>
            </button>
          ))}
        </div>
        <div className="agg-stage" key={chapter}>
          <h2>{ch.title}</h2>
          <p>{ch.lead}</p>
          {ch.diagram}
          <div className="agg-note">{ch.note}</div>
        </div>
        <div className="agg-pager">
          <button className="btn ghost" onClick={() => (chapter === 0 ? onBack() : setChapter((c) => c - 1))}>← {chapter === 0 ? "Studio" : "Back"}</button>
          <span className="agg-pager-dots">{CHAPTERS.map((_, i) => <span key={i} className={chapter === i ? "on" : ""} />)}</span>
          {chapter < CHAPTERS.length - 1
            ? <button className="btn primary" onClick={() => setChapter((c) => c + 1)}>Next <ArrowRight size={13} /></button>
            : <button className="btn primary" onClick={onBack}><Wand2 size={13} /> Open Studio</button>}
        </div>
      </div>
      <div className="agg-right scroll">
        <div className="agg-right-head">
          <div className="agg-kicker" style={{ marginBottom: 8 }}><Sparkles size={12} /> The creative toolkit</div>
          <h2>What makes Studio different</h2>
          <p>Five ideas that turn a one-shot generator into a real creative space.</p>
        </div>
        <div className="agg-sims">
          <div className="agg-sim lit"><div className="agg-sim-head"><span className="agg-sim-n"><Palette size={13} /></span><div><div className="agg-sim-title">Design DNA</div><div className="agg-sim-meta">save a look</div></div></div><p className="agg-sim-story">Store a palette + type + voice as a named style and apply it in one click — brand-in-a-button.</p></div>
          <div className="agg-sim lit"><div className="agg-sim-head"><span className="agg-sim-n"><Layers size={13} /></span><div><div className="agg-sim-title">Variations</div><div className="agg-sim-meta">diverge</div></div></div><p className="agg-sim-story">Ask for 2–4 takes at once and compare them side by side, then fork your favorite.</p></div>
          <div className="agg-sim lit"><div className="agg-sim-head"><span className="agg-sim-n"><Users size={13} /></span><div><div className="agg-sim-title">Crew mode</div><div className="agg-sim-meta">Concept → Critic → Polish</div></div></div><p className="agg-sim-story">A small crew sketches, critiques and refines the idea before you ever see the result.</p></div>
          <div className="agg-sim lit"><div className="agg-sim-head"><span className="agg-sim-n"><ImageIcon size={13} /></span><div><div className="agg-sim-title">Gallery</div><div className="agg-sim-meta">keep & remix</div></div></div><p className="agg-sim-story">Your creations collect here instead of scrolling away — reopen, remix, download or send onward.</p></div>
          <div className="agg-sim lit"><div className="agg-sim-head"><span className="agg-sim-n"><Share2 size={13} /></span><div><div className="agg-sim-title">Export anywhere</div><div className="agg-sim-meta">it goes somewhere</div></div></div><p className="agg-sim-story">Send a finished piece to a Workroom's knowledge shelf, or download it to use outside Madav.</p></div>
        </div>
      </div>
    </div>
  );
}
