import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ArrowUp, Square, Paperclip, X, FileText, Plus, Mic, Github, Puzzle, Plug, Palette, FolderKanban, ChevronRight, Zap, Terminal, AtSign, Folder, Volume2, VolumeX, Search, Users } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { madavAlert } from "../dialogs.jsx";
// Two-channel build flag: public builds without Voice fold this to false and the mic code drops out.
const FEAT_VOICE = import.meta.env.VITE_FEAT_VOICE !== "0";
import GithubContent from "./GithubContent.jsx";
import { iconUrlFor } from "../connectorIcons.js";

// Side-flyout placement (Claude-style): open the panel downward from the item, or FLIP it upward
// when there isn't enough room below — and cap its height to the chosen side so it ALWAYS shows in
// full (scrolls only if the content is taller than the whole side, which is rare).
function placeFlyout(fly, wrap) {
  if (!fly || !wrap) return;
  fly.style.maxHeight = "none"; // measure full content first
  const m = 12;
  const w = wrap.getBoundingClientRect();
  const need = fly.scrollHeight;
  const below = window.innerHeight - w.top - m;   // room growing down from the item's top
  const above = w.bottom - m;                     // room growing up from the item's bottom
  const up = need > below && above > below;        // flip up only when it actually helps
  if (up) { fly.style.top = "auto"; fly.style.bottom = "-6px"; fly.style.maxHeight = Math.max(160, above) + "px"; }
  else { fly.style.bottom = "auto"; fly.style.top = "-6px"; fly.style.maxHeight = Math.max(160, below) + "px"; }
}

export default function Composer({ mode, busy, onSend, onStop, onNavigate, onNewChat, onPickFolder, onAddRepo, cwd, controls }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // { name, content } | { name, image, dataUrl }
  const [skill, setSkill] = useState(null); // attached slash-command skill { name, description }
  const [menuOpen, setMenuOpen] = useState(false);
  const [ghOpen, setGhOpen] = useState(false);   // "Add content from GitHub" modal
  const [skillsSub, setSkillsSub] = useState(false); // Skills submenu in the "+" menu
  const [connectorsSub, setConnectorsSub] = useState(false); // Connectors submenu in the "+" menu
  const [listening, setListening] = useState(false);

  // ---- slash-command (commands + skills) menu ----
  const [skills, setSkills] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);

  // ---- @-mention (files + connectors) menu ----
  const [connectors, setConnectors] = useState([]);
  const [skillSurfaces, setSkillSurfaces] = useState({});       // per-process skill enablement map
  const [researchSurfaces, setResearchSurfaces] = useState({}); // per-process Deep Research toggle
  const [agentSurfaces, setAgentSurfaces] = useState({});       // per-process "Use Agents" toggle
  const [dirFiles, setDirFiles] = useState([]);
  const [atOpen, setAtOpen] = useState(false);
  const [atQuery, setAtQuery] = useState("");
  const [atIdx, setAtIdx] = useState(0);

  const ref = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const loadSkills = () => { bridge.listSkills && bridge.listSkills().then((l) => setSkills((l || []).filter((s) => s.enabled !== false))).catch(() => {}); };
  const loadConnectors = () => { bridge.getSettings && bridge.getSettings().then((s) => { setConnectors(((s && s.connectors) || [])); setSkillSurfaces((s && s.skillSurfaces) || {}); setResearchSurfaces((s && s.researchSurfaces) || {}); setAgentSurfaces((s && s.agentSurfaces) || {}); setVoiceOn(FEAT_VOICE && ((s && s.extras) || {}).voice !== false); setSpeakOn(!!(s && s.voiceSpeak)); }).catch(() => {}); };
  const [voiceOn, setVoiceOn] = useState(FEAT_VOICE); // Extras switchboard: hide the mic when voice input is off
  // Spoken replies (agent voice): speaker button next to the mic toggles settings.voiceSpeak.
  // Muting also silences any reply currently being read aloud. Both composer instances and
  // App stay in sync via the "madav:voicespeak" window event.
  const [speakOn, setSpeakOn] = useState(false);
  const toggleSpeaker = async () => {
    const next = !speakOn;
    setSpeakOn(next);
    if (!next && window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch {} } // mute = stop talking NOW
    try { const s = await bridge.getSettings(); await bridge.saveSettings({ ...s, voiceSpeak: next }); } catch {}
    try { window.dispatchEvent(new CustomEvent("madav:voicespeak", { detail: next })); } catch {}
  };
  useEffect(() => {
    const sync = (e) => setSpeakOn(!!e.detail);
    window.addEventListener("madav:voicespeak", sync);
    return () => window.removeEventListener("madav:voicespeak", sync);
  }, []);
  useEffect(() => { loadSkills(); loadConnectors(); }, []);
  // "+" menu side-flyouts (Skills / Connectors): hover with a close-delay so crossing into the
  // panel never dismisses it, and flip up/down based on available room so it always shows full.
  const skillWrapRef = useRef(null), skillFlyRef = useRef(null);
  const connWrapRef = useRef(null), connFlyRef = useRef(null);
  const flyTimer = useRef(null);
  const openFly = (kind) => { clearTimeout(flyTimer.current); if (kind === "conn") { setConnectorsSub(true); loadConnectors(); } else { setSkillsSub(true); loadSkills(); } };
  const closeFlySoon = (kind) => { clearTimeout(flyTimer.current); flyTimer.current = setTimeout(() => { if (kind === "conn") setConnectorsSub(false); else setSkillsSub(false); }, 180); };
  useLayoutEffect(() => { if (connectorsSub) placeFlyout(connFlyRef.current, connWrapRef.current); }, [connectorsSub, connectors.length]);
  useLayoutEffect(() => { if (skillsSub) placeFlyout(skillFlyRef.current, skillWrapRef.current); }, [skillsSub, skills.length]);
  useEffect(() => { if (cwd && bridge.listDir) bridge.listDir(cwd).then((l) => setDirFiles(l || [])).catch(() => setDirFiles([])); else setDirFiles([]); }, [cwd]);

  // Built-in slash commands — inline ACTIONS you use in place, not navigation away.
  const nav = (m) => { setMenuOpen(false); onNavigate && onNavigate(m); };
  const COMMANDS = [
    { id: "add-files", desc: "Open the file picker", run: () => pickFiles() },
    { id: "new", desc: mode === "cowork" ? "Start a new task" : mode === "code" ? "Start a new session" : "Start a new chat", run: () => onNewChat && onNewChat() },
    { id: "folder", desc: "Choose a working folder", run: () => onPickFolder && onPickFolder() },
  ];

  const q = slashQuery.toLowerCase();
  const cmdMatches = slashOpen ? COMMANDS.filter((c) => !q || c.id.includes(q)) : [];
  const skillMatches = slashOpen ? skills.filter((s) => { const n = (s.name || "").toLowerCase(), d = (s.description || "").toLowerCase(); return !q || n.includes(q) || d.includes(q); }) : [];
  const slashFlat = [...cmdMatches.map((c) => ({ type: "cmd", data: c })), ...skillMatches.map((s) => ({ type: "skill", data: s }))];

  const aq = atQuery.toLowerCase();
  const connMatches = atOpen ? connectors.filter((c) => c.enabled !== false && (!aq || (c.name || "").toLowerCase().includes(aq))) : [];
  const fileMatches = atOpen ? dirFiles.filter((f) => !aq || (f.name || "").toLowerCase().includes(aq)).slice(0, 40) : [];
  const atFlat = [...connMatches.map((c) => ({ type: "connector", data: c })), ...fileMatches.map((f) => ({ type: "file", data: f }))];

  // Read one File into the attachments list — images as data URLs (for vision),
  // office files PARSED to text (xlsx → CSV per sheet, docx → raw text), plain text
  // inline, and unreadable binary REFUSED with a friendly note. Before this guard,
  // attaching an .xlsx dumped raw ZIP bytes into the chat (and torched the tokens).
  const BINARY_EXT = /\.(zip|7z|rar|gz|tar|exe|dll|msi|iso|bin|dat|class|jar|so|dylib|woff2?|ttf|otf|mp3|wav|mp4|mov|avi|mkv|pptx?|db|sqlite)$/i;
  const addFile = (name, content) => setFiles((prev) => [...prev, { name, content }]);
  const ingest = async (f) => {
    if (!f) return;
    const name = f.name || "pasted-file";
    const lower = name.toLowerCase();
    try {
      if ((f.type || "").startsWith("image/")) {
        const r = new FileReader();
        r.onload = () => setFiles((prev) => [...prev, { name: f.name || "pasted-image.png", image: true, dataUrl: String(r.result || "") }]);
        r.readAsDataURL(f);
        return;
      }
      if (/\.(xlsx|xls)$/i.test(lower)) {
        // Real spreadsheet support: parse to CSV per sheet so the model can reason over it.
        const buf = await f.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        let out = "";
        for (const sn of (wb.SheetNames || []).slice(0, 8)) {
          out += `--- sheet: ${sn} ---\n` + XLSX.utils.sheet_to_csv(wb.Sheets[sn]).slice(0, 12000) + "\n";
        }
        addFile(name, out.slice(0, 24000) || "(empty spreadsheet)");
        return;
      }
      if (/\.docx$/i.test(lower)) {
        const buf = await f.arrayBuffer();
        const m = await import("mammoth/mammoth.browser.js");
        const mam = m.default || m;
        const r = await mam.extractRawText({ arrayBuffer: buf });
        addFile(name, String((r && r.value) || "").slice(0, 24000) || "(empty document)");
        return;
      }
      if (/\.pdf$/i.test(lower)) {
        addFile(name, `(PDF "${name}" attached — chat can't extract PDF text yet. Add it to a Project's knowledge instead — Projects parse PDFs — and chat there.)`);
        return;
      }
      if (BINARY_EXT.test(lower)) {
        addFile(name, `(binary file "${name}" attached — it can't be read as text, so its contents were not included)`);
        return;
      }
      // Plain text — with a binary sniff so mystery files can't dump garbage.
      const text = await f.text();
      const sample = text.slice(0, 2000);
      let ctrl = 0;
      for (let i = 0; i < sample.length; i++) { const c = sample.charCodeAt(i); if (c === 0xfffd || (c < 32 && c !== 9 && c !== 10 && c !== 13)) ctrl++; }
      if (sample && ctrl / sample.length > 0.05) {
        addFile(name, `(file "${name}" looks binary — its contents can't be read as text and were not included)`);
        return;
      }
      addFile(name, text.slice(0, 20000));
    } catch (e) {
      addFile(name, `(couldn't read "${name}": ${String((e && e.message) || e).slice(0, 100)})`);
    }
  };

  const onPick = (e) => { Array.from(e.target.files || []).forEach(ingest); e.target.value = ""; };
  const onPaste = (e) => {
    const items = Array.from(e.clipboardData?.items || []);
    const fileItems = items.filter((it) => it.kind === "file");
    if (fileItems.length === 0) return; // let normal text paste happen
    e.preventDefault();
    fileItems.forEach((it) => ingest(it.getAsFile()));
  };
  const pickFiles = () => { setMenuOpen(false); fileRef.current && fileRef.current.click(); };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const closeSlash = () => { setSlashOpen(false); setSlashQuery(""); setSlashIdx(0); };
  const closeAt = () => { setAtOpen(false); setAtQuery(""); setAtIdx(0); };

  const chooseSlash = (entry) => {
    if (!entry) return;
    if (entry.type === "cmd") { setText(""); closeSlash(); entry.data.run(); if (ref.current) ref.current.style.height = "auto"; return; }
    // skill
    setSkill({ name: entry.data.name, description: entry.data.description });
    setText(""); closeSlash();
    if (ref.current) { ref.current.style.height = "auto"; ref.current.focus(); }
  };

  const chooseAt = (entry) => {
    if (!entry) return;
    const raw = entry.type === "connector" ? entry.data.name : entry.data.name;
    const token = /\s/.test(raw) ? `@"${raw}"` : `@${raw}`;
    setText((v) => v.replace(/@([\w./-]*)$/, () => token + " ")); // function form: names with "$" must not be treated as replacement patterns
    closeAt();
    if (ref.current) ref.current.focus();
  };

  const submit = () => {
    const t = text.trim();
    if ((!t && files.length === 0 && !skill) || busy) return;
    const textFiles = files.filter((f) => !f.image);
    const images = files.filter((f) => f.image).map((f) => ({ name: f.name, dataUrl: f.dataUrl }));
    // Wrap each attached file in begin/end markers and place them AFTER the user's text.
    // The model still receives the full content; the chat bubble (Message.jsx) collapses
    // each marked block into a compact 📎 chip so the file body never floods the view.
    const attached = textFiles.map((f) => `--- Attached file: ${f.name} ---\n${f.content}\n--- end of file: ${f.name} ---`).join("\n\n");
    const skillLine = skill ? `Use the "${skill.name}" skill to handle this request. Load it first, then follow its instructions.\n\n` : "";
    const body = attached ? `${t}\n\n${attached}` : t;
    const full = `${skillLine}${body}`.trim();
    onSend(full, images);
    setText(""); setFiles([]); setSkill(null); closeSlash(); closeAt();
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e) => {
    if (slashOpen && slashFlat.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashFlat.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashFlat.length) % slashFlat.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseSlash(slashFlat[slashIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); closeSlash(); return; }
    } else if (slashOpen && e.key === "Escape") { e.preventDefault(); closeSlash(); return; }

    if (atOpen && atFlat.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAtIdx((i) => (i + 1) % atFlat.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAtIdx((i) => (i - 1 + atFlat.length) % atFlat.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); chooseAt(atFlat[atIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); closeAt(); return; }
    } else if (atOpen && e.key === "Escape") { e.preventDefault(); closeAt(); return; }

    if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) { e.preventDefault(); pickFiles(); return; }
    if (e.key === "Backspace" && !text && skill) { e.preventDefault(); setSkill(null); return; }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const grow = (e) => {
    const v = e.target.value;
    setText(v);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";

    const slashM = !skill && v.match(/^\/([\w-]*)$/);
    const atM = v.match(/(?:^|\s)@([\w./-]*)$/);
    if (slashM) { if (!slashOpen) { loadSkills(); } setSlashOpen(true); setSlashQuery(slashM[1]); setSlashIdx(0); closeAt(); }
    else if (atM) { if (!atOpen) { loadConnectors(); if (cwd && bridge.listDir) bridge.listDir(cwd).then((l) => setDirFiles(l || [])).catch(() => {}); } setAtOpen(true); setAtQuery(atM[1]); setAtIdx(0); if (slashOpen) closeSlash(); }
    else { if (slashOpen) closeSlash(); if (atOpen) closeAt(); }
  };

  const openSlashFromMenu = () => { setMenuOpen(false); setText("/"); setSlashOpen(true); setSlashQuery(""); setSlashIdx(0); loadSkills(); ref.current && ref.current.focus(); };
  // Per-PROCESS connector control. The Connectors page is the master switch (c.enabled); here in a
  // composer's "+" menu we flip the connector ON/OFF for THIS process only (chat / cowork / code /
  // project) via c.surfaces[surface] — independent across processes, never global. Default: on in
  // every process except plain chat (so chat stays clean unless you turn a connector on here).
  const surfaceOf = () => mode || "chat";
  const connOnHere = (c) => {
    if (!c || c.enabled === false) return false;
    const su = surfaceOf(); const sf = c.surfaces || {};
    return (su in sf) ? sf[su] !== false : su !== "chat";
  };
  const toggleConnector = async (c) => {
    try {
      const su = surfaceOf(); const next = !connOnHere(c);
      const cfg = await bridge.getSettings();
      const list = (cfg.connectors || []).map((x) => (x.id === c.id || x.name === c.name) ? { ...x, surfaces: { ...(x.surfaces || {}), [su]: next } } : x);
      await bridge.saveSettings({ ...cfg, connectors: list });
      setConnectors(list);
    } catch {}
  };
  // Per-process SKILL toggles (mirror connectors): each skill on/off for THIS process via
  // skillSurfaces[skillDir][surface]. Default on everywhere except plain chat. load_skill stays
  // available for explicit /attach regardless — this only scopes what the model auto-discovers.
  const skillKey = (sk) => sk.dir || sk.name;
  const skillOnHere = (sk) => { const su = surfaceOf(); const m = skillSurfaces[skillKey(sk)]; return (m && (su in m)) ? m[su] !== false : su !== "chat"; };
  const toggleSkill = async (sk) => {
    try { const su = surfaceOf(); const next = !skillOnHere(sk); const k = skillKey(sk);
      const cfg = await bridge.getSettings(); const map = { ...(cfg.skillSurfaces || {}) }; map[k] = { ...(map[k] || {}), [su]: next };
      await bridge.saveSettings({ ...cfg, skillSurfaces: map }); setSkillSurfaces(map); } catch {}
  };
  // Per-process DEEP RESEARCH toggle. Opt-in per process; when on, Madav may run deep_research here
  // and its research skills are surfaced. Agents keep research via their own gate.
  const researchOnHere = () => researchSurfaces[surfaceOf()] === true;
  const toggleResearch = async () => {
    try { const su = surfaceOf(); const next = !researchOnHere();
      const cfg = await bridge.getSettings(); const map = { ...(cfg.researchSurfaces || {}), [su]: next };
      await bridge.saveSettings({ ...cfg, researchSurfaces: map }); setResearchSurfaces(map); } catch {}
  };
  // Per-process "Use Agents" toggle. On → Madav may delegate to your agent roster (multi-agent
  // handoffs). Off → a direct plain-text answer. Default: on everywhere except plain chat.
  const agentsOnHere = () => { const su = surfaceOf(); const v = agentSurfaces[su]; return v != null ? v !== false : su !== "chat"; };
  const toggleAgents = async () => {
    try { const su = surfaceOf(); const next = !agentsOnHere();
      const cfg = await bridge.getSettings(); const map = { ...(cfg.agentSurfaces || {}), [su]: next };
      await bridge.saveSettings({ ...cfg, agentSurfaces: map }); setAgentSurfaces(map); } catch {}
  };

  // Push-to-talk: click to record, click again to stop → transcribed through the
  // user's own Whisper-capable key (OpenAI/Groq) in the main process. Falls back to
  // the Web Speech API on browsers that have it (web build in Chrome).
  const toggleMic = async () => {
    if (listening) {
      // Guard the stop: a MediaRecorder must actually be recording, and the ref is
      // cleared so a stale recorder can never be stopped by a later click.
      const rec = recRef.current;
      try { if (rec && rec.stop && (!("state" in rec) || rec.state === "recording")) rec.stop(); } catch {}
      recRef.current = null;
      return;
    }
    // Windows-native engine (no key, no model): used once chosen — the Whisper path
    // below flips this flag the first time it finds no usable key.
    let winVoice = false; try { winVoice = localStorage.getItem("be.voice.engine") === "win"; } catch {}
    if (winVoice && bridge.winSpeech) {
      setListening(true);
      try {
        const r = await bridge.winSpeech({ timeoutSec: 12 });
        if (r && r.text) setText((p) => (p ? p + " " : "") + r.text);
        else if (r && r.error) madavAlert(r.error);
      } catch {}
      setListening(false);
      ref.current && ref.current.focus();
      return;
    }
    if (bridge.transcribe && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = async () => {
          setListening(false);
          stream.getTracks().forEach((t) => t.stop());
          try {
            const blob = new Blob(chunks, { type: mime });
            const b64 = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result).split(",")[1] || "");
              fr.onerror = rej;
              fr.readAsDataURL(blob);
            });
            const r = await bridge.transcribe({ b64, mime });
            if (r && r.text) setText((p) => (p ? p + " " : "") + r.text);
            else if (r && r.error && /key/i.test(r.error) && bridge.winSpeech) {
              // No Whisper key → switch this machine to the built-in Windows voice
              // engine permanently (no key needed). One more tap and it just works.
              try { localStorage.setItem("be.voice.engine", "win"); } catch {}
              madavAlert("No speech key found — switched to the built-in Windows voice engine. Tap the mic again and speak.");
            }
            else if (r && r.error) madavAlert(r.error);
          } catch (e) { madavAlert("Transcription failed: " + String((e && e.message) || e)); }
          ref.current && ref.current.focus();
        };
        rec.start();
        setListening(true);
        recRef.current = rec;
        return;
      } catch { setListening(false); madavAlert("Microphone access was blocked — allow it in your system settings and try again."); return; }
    }
    // Web fallback: browser-native speech recognition where available.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { madavAlert("Voice input needs the desktop app (with an OpenAI or Groq key for Whisper), or Chrome on the web."); return; }
    try {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
      rec.onresult = (e) => { const t = e.results[0][0].transcript; setText((p) => (p ? p + " " : "") + t); };
      rec.onend = () => { setListening(false); recRef.current = null; };
      rec.onerror = () => { setListening(false); recRef.current = null; };
      rec.start(); setListening(true); recRef.current = rec;
    } catch { setListening(false); recRef.current = null; }
  };

  const placeholder = skill ? `Message for the ${skill.name} skill…` : "Ask Madav";
  const canSend = !!text.trim() || files.length > 0 || !!skill;

  return (
    <div className="composer-wrap">
      <div className="composer">
        {slashOpen && (
          <div className="slash-menu">
            {slashFlat.length === 0 ? (
              <div className="slash-empty">No matching command or skill.<button className="slash-link" onClick={() => { closeSlash(); setText(""); nav("skills"); }}>Manage skills →</button></div>
            ) : (
              <>
                {cmdMatches.length > 0 && <div className="slash-head"><Terminal size={12} /> Commands</div>}
                {cmdMatches.map((c, i) => (
                  <button key={c.id} className={`slash-item ${i === slashIdx ? "active" : ""}`} onMouseEnter={() => setSlashIdx(i)} onClick={() => chooseSlash({ type: "cmd", data: c })}>
                    <span className="slash-name">/{c.id}</span><span className="slash-desc">{c.desc}</span>
                  </button>
                ))}
                {skillMatches.length > 0 && <div className="slash-head"><Zap size={12} /> Skills</div>}
                {skillMatches.map((s, j) => { const gi = cmdMatches.length + j; return (
                  <button key={s.dir || s.name} className={`slash-item ${gi === slashIdx ? "active" : ""}`} onMouseEnter={() => setSlashIdx(gi)} onClick={() => chooseSlash({ type: "skill", data: s })}>
                    <span className="slash-name">/{s.name}</span>{s.description && <span className="slash-desc">{s.description}</span>}
                  </button>
                ); })}
              </>
            )}
          </div>
        )}

        {atOpen && (
          <div className="slash-menu">
            {atFlat.length === 0 ? (
              <div className="slash-empty">{cwd || connectors.length ? "No matching file or connector." : "Link a folder or add connectors to @-mention them."}</div>
            ) : (
              <>
                {connMatches.length > 0 && <div className="slash-head"><Plug size={12} /> Connectors</div>}
                {connMatches.map((c, i) => (
                  <button key={"c" + (c.name || i)} className={`slash-item ${i === atIdx ? "active" : ""}`} onMouseEnter={() => setAtIdx(i)} onClick={() => chooseAt({ type: "connector", data: c })}>
                    <span className="slash-name">@{c.name}</span>{c.description && <span className="slash-desc">{c.description}</span>}
                  </button>
                ))}
                {fileMatches.length > 0 && <div className="slash-head"><AtSign size={12} /> Files {cwd ? `· ${cwd}` : ""}</div>}
                {fileMatches.map((f, j) => { const gi = connMatches.length + j; return (
                  <button key={"f" + f.name} className={`slash-item ${gi === atIdx ? "active" : ""}`} onMouseEnter={() => setAtIdx(gi)} onClick={() => chooseAt({ type: "file", data: f })}>
                    <span className="slash-name">{f.isDir ? <Folder size={12} /> : <FileText size={12} />} {f.name}{f.isDir ? "/" : ""}</span>
                  </button>
                ); })}
              </>
            )}
          </div>
        )}

        {(files.length > 0 || skill) && (
          <div className="composer-files">
            {skill && (
              <span className="file-chip skill-chip"><Zap size={12} /> {skill.name}
                <button className="file-x" onClick={() => setSkill(null)} title="Remove skill"><X size={11} /></button>
              </span>
            )}
            {files.map((f, i) => (
              <span key={i} className="file-chip">
                {f.image ? <img src={f.dataUrl} alt="" className="file-thumb" /> : <FileText size={12} />} {f.name}
                <button className="file-x" onClick={() => removeFile(i)} title="Remove"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="composer-pill">
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />

          <div className="plus-wrap" ref={menuRef}>
            <button className="icon-btn bare" onClick={() => setMenuOpen((o) => !o)} title="Add"><Plus size={19} /></button>
            {menuOpen && (
              <div className="plus-menu">
                <button className="plus-item" onClick={pickFiles}><Paperclip size={15} /> Add files or photos <span className="kbd">Ctrl+U</span></button>
                <button className="plus-item" onClick={() => { setMenuOpen(false); setText((v) => (v ? v + " @" : "@")); setAtOpen(true); setAtQuery(""); setAtIdx(0); loadConnectors(); ref.current && ref.current.focus(); }}><AtSign size={15} /> Mention file / connector <span className="kbd">@</span></button>
                <button className="plus-item" onClick={() => { setMenuOpen(false); setGhOpen(true); }}><Github size={15} /> Add from GitHub</button>
                <div className="plus-sep" />
                <div className="plus-flywrap" ref={skillWrapRef} onMouseEnter={() => openFly("skill")} onMouseLeave={() => closeFlySoon("skill")}>
                  <button className="plus-item" onClick={() => { setSkillsSub((v) => !v); loadSkills(); }}><Puzzle size={15} /> Skills <ChevronRight size={14} className="pm-chev" /></button>
                  {skillsSub && (
                    <div className="plus-fly" ref={skillFlyRef} onMouseEnter={() => clearTimeout(flyTimer.current)}>
                      {skills.length === 0 && <div className="plus-subempty">No skills installed yet</div>}
                      {skills.map((s) => (
                        <button key={s.name || s.dir} className="plus-flyrow" title={s.description || ""} onClick={() => { setSkill({ name: s.name, description: s.description }); setSkillsSub(false); setMenuOpen(false); }}>
                          <Puzzle size={14} /> <span className="plus-subname">{s.name}</span>
                          <span className={`plus-switch ${skillOnHere(s) ? "on" : ""}`} title={`${skillOnHere(s) ? "On" : "Off"} for this process — click to toggle`} onClick={(e) => { e.stopPropagation(); toggleSkill(s); }}><span className="plus-knob" /></span>
                        </button>
                      ))}
                      <div className="plus-sep" />
                      <button className="plus-flyrow" onClick={() => nav("skills")}><Plus size={14} /> <span className="plus-subname">Manage / add skills</span></button>
                    </div>
                  )}
                </div>
                <button className="plus-item" onClick={() => nav("project")}><FolderKanban size={15} /> Add to project <ChevronRight size={14} className="pm-chev" /></button>
                <div className="plus-sep" />
                {/* Per-process connector toggles: switches the connector on/off for THIS process
                    only (chat / collaborate / build / project), not globally. */}
                <div className="plus-flywrap" ref={connWrapRef} onMouseEnter={() => openFly("conn")} onMouseLeave={() => closeFlySoon("conn")}>
                  <button className="plus-item" onClick={() => { setConnectorsSub((v) => !v); loadConnectors(); }}><Plug size={15} /> Connectors <ChevronRight size={14} className="pm-chev" /></button>
                  {connectorsSub && (
                    <div className="plus-fly" ref={connFlyRef} onMouseEnter={() => clearTimeout(flyTimer.current)}>
                      {connectors.filter((c) => c.enabled !== false).length === 0 && <div className="plus-subempty">No connectors enabled — turn them on in the Connectors page</div>}
                      {connectors.filter((c) => c.enabled !== false).map((c) => {
                        const on = connOnHere(c); const ic = iconUrlFor(c.name || "");
                        return (
                          <button key={c.id || c.name} className="plus-flyrow" title={c.name} onClick={() => toggleConnector(c)}>
                            {ic ? <span className="plus-flyico"><img src={ic} alt="" /></span> : <Plug size={14} />}
                            <span className="plus-subname">{c.name}</span>
                            <span className={`plus-switch ${on ? "on" : ""}`}><span className="plus-knob" /></span>
                          </button>
                        );
                      })}
                      <div className="plus-sep" />
                      <button className="plus-flyrow" onClick={() => nav("connectors")}><Plug size={14} /> <span className="plus-subname">Manage connectors</span></button>
                      <button className="plus-flyrow" onClick={() => nav("connectors")}><Plus size={14} /> <span className="plus-subname">Add connector</span></button>
                    </div>
                  )}
                </div>
                <div className="plus-sep" />
                <button className="plus-item" onClick={toggleResearch} title="Deep Research — multi-source web research with cited reports. When on for this process, Madav can run it and its research skills are surfaced.">
                  <Search size={15} /> Deep Research
                  <span className={`plus-switch ${researchOnHere() ? "on" : ""}`} style={{ marginLeft: "auto" }}><span className="plus-knob" /></span>
                </button>
                <button className="plus-item" onClick={toggleAgents} title="Use Agents — let Madav delegate to your agent roster (full multi-agent handoffs). Off = a direct plain-text answer for this process.">
                  <Users size={15} /> Use Agents
                  <span className={`plus-switch ${agentsOnHere() ? "on" : ""}`} style={{ marginLeft: "auto" }}><span className="plus-knob" /></span>
                </button>
              </div>
            )}
          </div>
          {ghOpen && <GithubContent onClose={() => setGhOpen(false)} onAttach={(items) => setFiles((f) => [...f, ...items])} />}

          <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={grow} onKeyDown={onKey} onPaste={onPaste} />

          {/* Gemini contract: the mic is always there; the round theme-colored send
              button slides in beside it the moment there's something to send.
              The speaker beside it toggles spoken replies (mute stops speech instantly). */}
          {voiceOn && (
            <button className={`icon-btn bare ${speakOn ? "speak-on" : ""}`} onClick={toggleSpeaker}
              title={speakOn ? "Spoken replies: on — click to mute" : "Spoken replies: muted — click to have answers read aloud"}>
              {speakOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          )}
          {voiceOn && <button className={`icon-btn bare ${listening ? "rec" : ""}`} onClick={toggleMic} title="Voice input"><Mic size={18} /></button>}
          {busy ? (
            <button className="send pop" onClick={onStop} title="Stop" style={{ background: "var(--bg-3)" }}><Square size={14} /></button>
          ) : canSend ? (
            <button className="send pop" onClick={submit} title="Send"><ArrowUp size={17} /></button>
          ) : null}
        </div>
        {controls && <div className="composer-subrow">{controls}</div>}
      </div>
    </div>
  );
}
