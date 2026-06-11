import { useState, useRef, useEffect } from "react";
import { ArrowUp, Square, Paperclip, X, FileText, Plus, Mic, Github, Puzzle, Plug, Palette, FolderKanban, ChevronRight, Zap, Terminal, AtSign, Folder } from "lucide-react";
import { bridge } from "../bridge/index.js";
// Two-channel build flag: public builds without Voice fold this to false and the mic code drops out.
const FEAT_VOICE = import.meta.env.VITE_FEAT_VOICE !== "0";
import GithubContent from "./GithubContent.jsx";

export default function Composer({ mode, busy, onSend, onStop, onNavigate, onNewChat, onPickFolder, onAddRepo, cwd, controls }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // { name, content } | { name, image, dataUrl }
  const [skill, setSkill] = useState(null); // attached slash-command skill { name, description }
  const [menuOpen, setMenuOpen] = useState(false);
  const [ghOpen, setGhOpen] = useState(false);   // "Add content from GitHub" modal
  const [skillsSub, setSkillsSub] = useState(false); // Skills submenu in the "+" menu
  const [listening, setListening] = useState(false);

  // ---- slash-command (commands + skills) menu ----
  const [skills, setSkills] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);

  // ---- @-mention (files + connectors) menu ----
  const [connectors, setConnectors] = useState([]);
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
  const loadConnectors = () => { bridge.getSettings && bridge.getSettings().then((s) => { setConnectors(((s && s.connectors) || []).filter((c) => c.enabled !== false)); setVoiceOn(FEAT_VOICE && ((s && s.extras) || {}).voice !== false); }).catch(() => {}); };
  const [voiceOn, setVoiceOn] = useState(FEAT_VOICE); // Extras switchboard: hide the mic when voice input is off
  useEffect(() => { loadSkills(); loadConnectors(); }, []);
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
  const connMatches = atOpen ? connectors.filter((c) => !aq || (c.name || "").toLowerCase().includes(aq)) : [];
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
    const attached = textFiles.map((f) => `--- Attached file: ${f.name} ---\n${f.content}`).join("\n\n");
    const skillLine = skill ? `Use the "${skill.name}" skill to handle this request. Load it first, then follow its instructions.\n\n` : "";
    const body = attached ? `${attached}\n\n${t}` : t;
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
        else if (r && r.error) alert(r.error);
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
              alert("No speech key found — switched to the built-in Windows voice engine. Tap the mic again and speak.");
            }
            else if (r && r.error) alert(r.error);
          } catch (e) { alert("Transcription failed: " + String((e && e.message) || e)); }
          ref.current && ref.current.focus();
        };
        rec.start();
        setListening(true);
        recRef.current = rec;
        return;
      } catch { setListening(false); alert("Microphone access was blocked — allow it in your system settings and try again."); return; }
    }
    // Web fallback: browser-native speech recognition where available.
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input needs the desktop app (with an OpenAI or Groq key for Whisper), or Chrome on the web."); return; }
    try {
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.continuous = false;
      rec.onresult = (e) => { const t = e.results[0][0].transcript; setText((p) => (p ? p + " " : "") + t); };
      rec.onend = () => { setListening(false); recRef.current = null; };
      rec.onerror = () => { setListening(false); recRef.current = null; };
      rec.start(); setListening(true); recRef.current = rec;
    } catch { setListening(false); recRef.current = null; }
  };

  const placeholder = skill
    ? `Message for the ${skill.name} skill…`
    : mode === "code" ? "Describe a coding task or ask a question…  ( / commands · @ files )"
    : mode === "cowork" ? "Describe a task to work on together…  ( / commands · @ files )"
    : "How can I help you today?  ( / commands · @ files )";
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
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={grow} onKeyDown={onKey} onPaste={onPaste} />
        <div className="composer-row">
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />

          <div className="plus-wrap" ref={menuRef}>
            <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} title="Add"><Plus size={17} /></button>
            {menuOpen && (
              <div className="plus-menu">
                <button className="plus-item" onClick={pickFiles}><Paperclip size={15} /> Add files or photos <span className="kbd">Ctrl+U</span></button>
                <button className="plus-item" onClick={() => { setMenuOpen(false); setText((v) => (v ? v + " @" : "@")); setAtOpen(true); setAtQuery(""); setAtIdx(0); loadConnectors(); ref.current && ref.current.focus(); }}><AtSign size={15} /> Mention file / connector <span className="kbd">@</span></button>
                <button className="plus-item" onClick={() => { setMenuOpen(false); setGhOpen(true); }}><Github size={15} /> Add from GitHub</button>
                <div className="plus-sep" />
                <button className="plus-item" onClick={() => { setSkillsSub((v) => !v); loadSkills(); }}><Puzzle size={15} /> Skills <ChevronRight size={14} className="pm-chev" style={{ transform: skillsSub ? "rotate(90deg)" : "none" }} /></button>
                {skillsSub && (
                  <div className="plus-sub">
                    {skills.length === 0 && <div className="plus-subempty">No skills installed yet</div>}
                    {skills.map((s) => (
                      <button key={s.name || s.dir} className="plus-item plus-subitem" title={s.description || ""} onClick={() => { setSkill({ name: s.name, description: s.description }); setSkillsSub(false); setMenuOpen(false); }}>
                        <Puzzle size={13} /> <span className="plus-subname">{s.name}</span>
                      </button>
                    ))}
                    <button className="plus-item plus-subitem" onClick={() => nav("skills")}><Plus size={13} /> Manage / add skills</button>
                  </div>
                )}
                <button className="plus-item" onClick={() => nav("project")}><FolderKanban size={15} /> Add to project <ChevronRight size={14} className="pm-chev" /></button>
                <div className="plus-sep" />
                <button className="plus-item" onClick={() => nav("connectors")}><Plug size={15} /> Connectors <ChevronRight size={14} className="pm-chev" /></button>
              </div>
            )}
          </div>
          {ghOpen && <GithubContent onClose={() => setGhOpen(false)} onAttach={(items) => setFiles((f) => [...f, ...items])} />}

          <span style={{ flex: 1 }} />
          {controls && <div className="composer-controls">{controls}</div>}
          <span style={{ flex: 1 }} />

          {voiceOn && <button className={`icon-btn ${listening ? "rec" : ""}`} onClick={toggleMic} title="Voice input"><Mic size={16} /></button>}
          {busy ? (
            <button className="send" onClick={onStop} title="Stop" style={{ background: "var(--bg-3)" }}><Square size={14} /></button>
          ) : (
            <button className="send" onClick={submit} disabled={!canSend} title="Send"><ArrowUp size={16} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
