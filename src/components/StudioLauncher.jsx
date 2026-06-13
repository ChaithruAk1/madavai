// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// "Studio" — a creative build console. You lead with the IDEA (one prompt bar), optionally
// pick a format "lens" and a saved style (Design DNA), ask for several variations or a crew
// pass, and Madav forges it into a live, runnable preview. Creations can be kept in a Gallery.
// The prompt is the hero; formats are lenses, not gates.
import { useEffect, useRef, useState } from "react";
import { Globe, FileText, Gamepad2, Wrench, Palette, Workflow, ListChecks, Sparkles, Wand2, ArrowRight, ArrowUp, Shuffle, Layers, Users, Image as ImageIcon, Plus, X, Trash2, Download, BookOpen, Dice5 } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import StudioGuide from "./StudioGuide.jsx";
import { bridge } from "../bridge/index.js";
import { artifactSrcDoc } from "../artifacts.js";
import { madavConfirm } from "../dialogs.jsx";

const STYLES = ["Minimalist", "Modern", "Bold & colorful", "Playful", "Professional", "Dark"];

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

const SEEDS = [
  "a dashboard, but as if designed by a Swiss railway in 1965",
  "a landing page that feels like a 70s travel poster",
  "a to-do app with the personality of a strict but caring coach",
  "a generative art piece inspired by bioluminescent deep-sea life",
  "a pricing page styled like a vintage letterpress menu",
  "a memory card game themed around constellations",
  "a portfolio site with brutalist type and a soft pastel palette",
  "a weather widget that feels hand-drawn in a sketchbook",
  "a quiz that grades you with the warmth of a favorite teacher",
  "a flowchart that explains making coffee like a NASA launch sequence",
];

export default function StudioLauncher({ onStart }) {
  const [tab, setTab] = useState("create");
  const [lens, setLens] = useState("");
  const [type, setType] = useState("");
  const [style, setStyle] = useState("");
  const [desc, setDesc] = useState("");
  const [ph, setPh] = useState(0);
  const taRef = useRef(null);

  const [styles, setStyles] = useState([]);
  const [styleId, setStyleId] = useState("");
  const [variations, setVariations] = useState(1);
  const [crew, setCrew] = useState(false);
  const [gallery, setGallery] = useState([]);
  const [preview, setPreview] = useState(null);
  const [styleForm, setStyleForm] = useState(false);
  const [sName, setSName] = useState("");
  const [sRules, setSRules] = useState("");

  useEffect(() => {
    bridge.getSettings().then((c) => {
      setStyles((c && c.studioStyles) || []);
      setGallery((c && c.studioGallery) || []);
    }).catch(() => {});
  }, []);

  const persist = async (patch) => { try { const c = await bridge.getSettings(); await bridge.saveSettings({ ...c, ...patch }); } catch {} };

  useEffect(() => {
    if (desc) return;
    const t = setInterval(() => setPh((i) => (i + 1) % EXAMPLES.length), 3200);
    return () => clearInterval(t);
  }, [desc]);

  const cat = LENSES.find((l) => l.id === lens) || null;
  const pickLens = (l) => {
    if (lens === l.id) { setLens(""); setType(""); setStyle(""); return; }
    setLens(l.id); setType(l.types[0] || ""); setStyle(l.style ? STYLES[0] : "");
    taRef.current && taRef.current.focus();
  };
  const loadExample = (e) => {
    const l = LENSES.find((x) => x.id === e.lens);
    setLens(e.lens); setType(e.type); setStyle(l && l.style ? (style || STYLES[1]) : ""); setDesc(e.text);
    taRef.current && taRef.current.focus();
  };
  const surprise = () => { setDesc(SEEDS[Math.floor(Math.random() * SEEDS.length)]); taRef.current && taRef.current.focus(); };

  const saveStyle = async () => {
    const name = sName.trim(); const rules = sRules.trim();
    if (!name || !rules) return;
    const ns = { id: "sty_" + Date.now().toString(36), name: name.slice(0, 40), rules: rules.slice(0, 600) };
    const next = [...styles, ns];
    setStyles(next); setStyleId(ns.id); setStyleForm(false); setSName(""); setSRules("");
    await persist({ studioStyles: next });
  };
  const delStyle = async (id) => {
    if (!(await madavConfirm("Delete this style preset?", { okLabel: "Delete" }))) return;
    const next = styles.filter((s) => s.id !== id);
    setStyles(next); if (styleId === id) setStyleId("");
    await persist({ studioStyles: next });
  };

  const delGalleryItem = async (id) => {
    if (!(await madavConfirm("Remove this from your gallery?", { okLabel: "Remove" }))) return;
    const next = gallery.filter((g) => g.id !== id);
    setGallery(next); setPreview(null);
    await persist({ studioGallery: next });
  };
  const downloadItem = (item) => {
    const ext = { html: "html", svg: "svg", markdown: "md", react: "jsx", mermaid: "mmd", code: "txt" }[item.kind] || "txt";
    const blob = new Blob([item.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${(item.title || "creation").replace(/\W+/g, "-").toLowerCase()}.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const remix = (item) => {
    setPreview(null);
    onStart(`Here is an existing creation I want to remix. Keep what works, improve the rest, and produce it as a live, runnable preview.\n\n\`\`\`${item.kind || "html"}\n${item.code}\n\`\`\`\n\nMy direction: ${desc.trim() || "refine and elevate it"}.`);
  };

  const canCreate = !!desc.trim() || (cat && type);
  const create = () => {
    if (!canCreate) return;
    const preset = styles.find((s) => s.id === styleId);
    let p;
    if (!cat) {
      p = `${desc || "Build something cool and useful"} — produce it as a live, runnable preview.`;
    } else {
      const what = (type || cat.title).toLowerCase();
      p = `Create a ${what} as a ${cat.format}.` + (desc ? ` Details: ${desc}.` : "") + (style ? ` Visual style: ${style}.` : "");
    }
    if (preset) p += ` Apply this saved visual style — "${preset.name}": ${preset.rules}.`;
    if (variations > 1) p += ` Produce ${variations} DISTINCT variations in ONE self-contained HTML page, arranged as a clearly labeled comparison grid (Variation 1…${variations}) so I can compare them side by side and tell you which to keep.`;
    if (crew) p += ` Work as a small studio crew in a single pass: first a short Concept note (the approach), then a Critic note (the weaknesses to fix), then Polish into the final result. Show the three brief notes, then output the final polished artifact.`;
    p += ` Do not ask clarifying questions; just produce a polished first version I can refine afterwards.`;
    onStart(p);
  };
  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); create(); } };

  if (tab === "guide") {
    return <div className="studio scroll"><StudioGuide onBack={() => setTab("create")} /></div>;
  }

  if (tab === "gallery") {
    return (
      <div className="studio scroll">
        <div className="stu2">
          <div className="stu2-tabs">
            <button onClick={() => setTab("create")}><Wand2 size={14} /> Create</button>
            <button className="on"><ImageIcon size={14} /> Gallery</button>
            <button onClick={() => setTab("guide")}><BookOpen size={14} /> Guide</button>
          </div>
          <div className="stu2-section-label" style={{ marginTop: 16 }}><ImageIcon size={12} /> Your gallery<HelpDot mode="studio" section="gallery" /><span style={{ flex: 1 }} /><span className="mo-sub">{gallery.length} saved</span></div>
          {gallery.length === 0 ? (
            <div className="pjd-files-empty" style={{ marginTop: 10 }}>Nothing saved yet. Build something in Create, then click <b>Save to gallery</b> on the preview to keep it here.</div>
          ) : (
            <div className="stu2-gallery">
              {gallery.map((g) => (
                <button key={g.id} className="stu2-gcard" onClick={() => setPreview(g)}>
                  <div className="stu2-gthumb">{g.previewable !== false
                    ? <iframe className="stu2-gframe" sandbox="allow-scripts" srcDoc={artifactSrcDoc(g)} title={g.title} tabIndex={-1} />
                    : <span className="stu2-gkind">{g.kind}</span>}</div>
                  <div className="stu2-gmeta"><span className="stu2-gtitle">{g.title || "Untitled"}</span><span className="stu2-gkindtag">{g.kind}</span></div>
                </button>
              ))}
            </div>
          )}
        </div>

        {preview && (
          <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
            <div className="stu2-preview">
              <div className="stu2-preview-head">
                <span className="stu2-preview-title">{preview.title || "Creation"}</span>
                <span style={{ flex: 1 }} />
                <button className="btn ghost" onClick={() => remix(preview)} title="Reopen as the seed for a new version"><Wand2 size={13} /> Refine in Studio</button>
                <button className="icon-btn" title="Download" onClick={() => downloadItem(preview)}><Download size={14} /></button>
                <button className="icon-btn danger" title="Remove from gallery" onClick={() => delGalleryItem(preview.id)}><Trash2 size={14} /></button>
                <button className="icon-btn" title="Close" onClick={() => setPreview(null)}><X size={15} /></button>
              </div>
              <div className="stu2-preview-body">
                {preview.previewable !== false
                  ? <iframe className="stu2-preview-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={artifactSrcDoc(preview)} title="preview" />
                  : <pre className="artifact-code">{preview.code}</pre>}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="studio scroll">
      <div className="stu2">
        <div className="stu2-tabs">
          <button className="on"><Wand2 size={14} /> Create</button>
          <button onClick={() => setTab("gallery")}><ImageIcon size={14} /> Gallery{gallery.length > 0 && <span className="stu2-tabcount">{gallery.length}</span>}</button>
          <button onClick={() => setTab("guide")}><BookOpen size={14} /> Guide</button>
        </div>

        <div className="stu2-kicker"><Wand2 size={13} /> Studio · the creative build console</div>
        <h1 className="stu2-title">What should we <span className="stu2-grad">build</span> today?<HelpDot mode="studio" section="build" /></h1>
        <p className="stu2-sub">Describe an idea in a line — Madav forges it into a <b>live, runnable preview</b> you can refine. Pick a lens, save a look, or ask for a few variations.</p>

        <div className="stu2-console">
          <div className="stu2-spark"><Sparkles size={16} /></div>
          <textarea
            ref={taRef} className="stu2-input" rows={1} value={desc} onKeyDown={onKey}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={`e.g. ${EXAMPLES[ph].text}`} />
          <button className="stu2-surprise" onClick={surprise} title="Surprise me — seed a creative constraint"><Dice5 size={16} /></button>
          {canCreate && (
            <button className="send pop" onClick={create} title="Create (⌘/Ctrl+Enter)"><ArrowUp size={17} /></button>
          )}
          <HelpDot mode="studio" section="prompt" />
        </div>

        <div className="stu2-section-label">Shape it as <span>(optional)</span></div>
        <div className="stu2-lenses">
          {LENSES.map((l) => { const I = l.icon; const on = lens === l.id; return (
            <button key={l.id} className={`stu2-lens ${on ? "on" : ""}`} onClick={() => pickLens(l)}>
              <span className="stu2-lens-ic"><I size={16} /></span>
              <span className="stu2-lens-t">{l.title}</span>
            </button>
          ); })}
        </div>

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
                <div className="stu2-chips">{STYLES.map((sName2) => <button key={sName2} className={`stu2-chip ${style === sName2 ? "on" : ""}`} onClick={() => setStyle(sName2)}>{sName2}</button>)}</div>
              </div>
            )}
          </div>
        )}

        <div className="stu2-section-label"><Palette size={12} /> Design DNA<HelpDot mode="studio" section="styles" /><span style={{ flex: 1 }} /><button className="stu2-mini" onClick={() => setStyleForm((v) => !v)}><Plus size={12} /> Save a look</button></div>
        <div className="stu2-chips">
          <button className={`stu2-chip ${!styleId ? "on" : ""}`} onClick={() => setStyleId("")}>None</button>
          {styles.map((s) => (
            <span key={s.id} className={`stu2-stylechip ${styleId === s.id ? "on" : ""}`}>
              <button className="stu2-stylename" onClick={() => setStyleId(styleId === s.id ? "" : s.id)} title={s.rules}>{s.name}</button>
              <button className="stu2-stylex" onClick={() => delStyle(s.id)} title="Delete preset"><X size={10} /></button>
            </span>
          ))}
          {styles.length === 0 && <span className="mo-sub" style={{ alignSelf: "center" }}>No saved looks yet — build something, then save its style.</span>}
        </div>
        {styleForm && (
          <div className="stu2-styleform">
            <input className="model-search" placeholder="Style name — e.g. Aurora Noir" value={sName} onChange={(e) => setSName(e.target.value)} />
            <textarea className="model-search" rows={2} style={{ resize: "vertical" }} placeholder="Describe the look: palette, typography, mood, voice…" value={sRules} onChange={(e) => setSRules(e.target.value)} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn primary" disabled={!sName.trim() || !sRules.trim()} onClick={saveStyle}>Save look</button>
              <button className="btn ghost" onClick={() => setStyleForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="stu2-creativerow">
          <div className="stu2-opt">
            <span className="stu2-opt-label"><Layers size={12} /> Variations<HelpDot mode="studio" section="variations" /></span>
            <div className="stu2-chips">{[1, 2, 4].map((n) => <button key={n} className={`stu2-chip ${variations === n ? "on" : ""}`} onClick={() => setVariations(n)}>{n === 1 ? "1 take" : `${n} takes`}</button>)}</div>
          </div>
          <div className="stu2-opt">
            <span className="stu2-opt-label"><Users size={12} /> Crew mode<HelpDot mode="studio" section="crew" /></span>
            <button className={`stu2-chip ${crew ? "on" : ""}`} onClick={() => setCrew((v) => !v)}>{crew ? "Concept → Critic → Polish" : "Off"}</button>
          </div>
        </div>

        <div className="stu2-section-label" style={{ marginTop: 22 }}><Shuffle size={12} /> Need a spark? Try one</div>
        <div className="stu2-egs">
          {EXAMPLES.slice(0, 6).map((e, i) => (
            <button key={i} className="stu2-eg" onClick={() => loadExample(e)}>{e.text}</button>
          ))}
        </div>

        <div className="stu2-rail">
          <div className="stu2-rail-node"><span className="stu2-rail-ic"><Wand2 size={15} /></span><span>Your idea</span></div>
          <span className="stu2-rail-line" />
          <div className="stu2-rail-node accent"><span className="stu2-rail-ic"><Sparkles size={15} /></span><span>Madav forges it</span></div>
          <span className="stu2-rail-line" />
          <div className="stu2-rail-node ok"><span className="stu2-rail-ic"><ArrowRight size={15} /></span><span>Live preview to refine</span></div>
        </div>
      </div>
    </div>
  );
}
