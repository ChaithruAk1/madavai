import { useRef, useState } from "react";
import { X, Eye, Code as CodeIcon, ExternalLink, Copy, Download, RotateCw, Check, Pencil, Sparkles, Undo2, Loader2, Bookmark, Share2 } from "lucide-react";
import { artifactSrcDoc } from "../artifacts.js";
import { bridge } from "../bridge/index.js";
import { madavAlert } from "../dialogs.jsx";

const EXT = { html: "html", svg: "svg", markdown: "md", react: "jsx", mermaid: "mmd", code: "txt" };

export default function ArtifactPanel({ artifact: artifactProp, versions = [], onClose }) {
  // Version history: when the conversation produced several artifacts of the same type
  // (iterations on one page/diagram/component), let the user flip between them.
  const [vIdx, setVIdx] = useState(-1); // -1 = the artifact that was clicked (latest intent)
  const baseArtifact = vIdx >= 0 && versions[vIdx] ? versions[vIdx] : artifactProp;
  const [tab, setTab] = useState(baseArtifact.previewable ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0); // bump to reload the preview iframe
  const [saved, setSaved] = useState(false);   // saved to Studio gallery
  const [roomMenu, setRoomMenu] = useState(false);
  const [rooms, setRooms] = useState([]);

  // ---- EDITABLE CANVAS ----
  // The artifact is no longer preview-only: the Edit tab is a live canvas — type
  // directly, or select a region and ask the AI for a targeted revision. Every AI
  // revision is undoable; Download/Copy/Preview always use the edited content.
  const [draft, setDraft] = useState(null);        // null = unedited (show base code)
  const [editHistory, setEditHistory] = useState([]); // undo stack of previous drafts
  const [revise, setRevise] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const taRef = useRef(null);
  const code = draft != null ? draft : baseArtifact.code;
  const artifact = draft != null ? { ...baseArtifact, code } : baseArtifact;
  const pickVersion = (i) => { setVIdx(i); setDraft(null); setEditHistory([]); setAiErr(""); };

  const applyAi = async () => {
    const instruction = revise.trim();
    if (!instruction || aiBusy) return;
    setAiBusy(true); setAiErr("");
    try {
      const ta = taRef.current;
      const selStart = ta && ta.selectionStart !== ta.selectionEnd ? ta.selectionStart : -1;
      const selEnd = ta ? ta.selectionEnd : -1;
      const strip = (t) => String(t || "").replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
      let next;
      if (selStart >= 0) {
        // Targeted revision: only the selected region changes; the rest is untouched.
        const before = code.slice(0, selStart), sel = code.slice(selStart, selEnd), after = code.slice(selEnd);
        const r = await bridge.completeOnce([
          { role: "system", content: "You are a precise canvas editor. The user selected a REGION of a document/file and gave an instruction. Output ONLY the replacement for the selected region — no fences, no commentary, no surrounding text." },
          { role: "user", content: `INSTRUCTION: ${instruction}\n\nCONTEXT BEFORE (do not output):\n…${before.slice(-800)}\n\nSELECTED REGION (replace this):\n${sel}\n\nCONTEXT AFTER (do not output):\n${after.slice(0, 800)}…` },
        ]);
        if (!r || r.error || !r.text) throw new Error((r && r.error) || "no reply");
        next = before + strip(r.text) + after;
      } else {
        const r = await bridge.completeOnce([
          { role: "system", content: "You are a precise canvas editor. Apply the instruction to the document/file and output ONLY the complete updated content — no fences, no commentary." },
          { role: "user", content: `INSTRUCTION: ${instruction}\n\nCONTENT:\n${code.slice(0, 60000)}` },
        ]);
        if (!r || r.error || !r.text) throw new Error((r && r.error) || "no reply");
        next = strip(r.text);
      }
      if (next && next !== code) {
        setEditHistory((h) => [...h.slice(-9), code]); // keep last 10 undo states
        setDraft(next);
        setRevise("");
        setNonce((n) => n + 1);
      }
    } catch (e) { setAiErr(String((e && e.message) || e).slice(0, 140)); }
    finally { setAiBusy(false); }
  };
  const undo = () => {
    // Compute from the current state OUTSIDE the updater — calling other setters
    // inside a state updater is a side effect React may run twice or defer.
    const h = editHistory;
    if (!h.length) return;
    setDraft(h[h.length - 1]);
    setNonce((n) => n + 1);
    setEditHistory(h.slice(0, -1));
  };

  // Save this creation into the Studio gallery so it isn't lost to chat history.
  const saveToGallery = async () => {
    try {
      const c = await bridge.getSettings();
      const item = { id: "gal_" + Date.now().toString(36), title: artifact.title || "Creation", kind: artifact.kind, code, previewable: !!artifact.previewable, createdAt: Date.now() };
      const next = [item, ...((c && c.studioGallery) || [])].slice(0, 200);
      await bridge.saveSettings({ ...c, studioGallery: next });
      setSaved(true); setTimeout(() => setSaved(false), 1600);
    } catch (e) { madavAlert("Could not save to gallery: " + String((e && e.message) || e)); }
  };
  const openRoomMenu = async () => {
    if (!roomMenu) { try { setRooms(await bridge.listProjects() || []); } catch { setRooms([]); } }
    setRoomMenu((v) => !v);
  };
  const sendToRoom = async (room) => {
    setRoomMenu(false);
    try {
      const fn = bridge.addKnowledgeText || bridge.addKnowledge;
      await fn(room.id, "Studio · " + (artifact.title || "Creation"), code);
      madavAlert(`Sent to “${room.name}” — it's on that workroom's knowledge shelf.`);
    } catch (e) { madavAlert("Could not send: " + String((e && e.message) || e)); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const download = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `artifact.${EXT[artifact.kind] || "txt"}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openTab = () => {
    if (!artifact.previewable) return;
    // SECURITY: never give model-generated HTML a same-origin context (a Blob URL would let
    // artifact JS read localStorage — API keys + auth token). Instead, open a minimal wrapper
    // page whose only content is a sandboxed iframe (no allow-same-origin → opaque origin).
    const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const wrapperHtml = `<!doctype html><html><head><meta charset="utf-8"><title>${escText(artifact.title || "Artifact")}</title>` +
      `<style>html,body{margin:0;padding:0;height:100%}iframe{border:0;width:100vw;height:100vh;display:block}</style></head>` +
      `<body><iframe sandbox="allow-scripts allow-popups allow-forms allow-modals" srcdoc="${escAttr(artifactSrcDoc(artifact))}"></iframe></body></html>`;
    const w = window.open("", "_blank");
    if (!w) return; // popup blocked
    w.document.write(wrapperHtml);
    w.document.close();
  };

  return (
    <div className="artifact-wrap" style={{ width: "46%", maxWidth: 760 }}>
      <div className="artifact-head">
        <span className="artifact-title">{artifact.title}{draft != null && <i className="artifact-edited"> · edited</i>}</span>
        {versions.length > 1 && (
          <select className="artifact-ver" title="Version history" value={vIdx} onChange={(e) => pickVersion(Number(e.target.value))}>
            <option value={-1}>latest</option>
            {versions.map((_, i) => <option key={i} value={i}>v{i + 1}{i === versions.length - 1 ? " (newest)" : ""}</option>)}
          </select>
        )}
        <div className="artifact-tabs">
          {artifact.previewable && <button className={`artifact-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}><Eye size={13} /> Preview</button>}
          <button className={`artifact-tab ${tab === "edit" ? "active" : ""}`} onClick={() => setTab("edit")}><Pencil size={13} /> Edit</button>
          <button className={`artifact-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}><CodeIcon size={13} /> Code</button>
        </div>
        <div className="artifact-actions">
          {editHistory.length > 0 && <button className="artifact-ico" title="Undo last AI revision" onClick={undo}><Undo2 size={14} /></button>}
          {tab === "preview" && artifact.previewable && <button className="artifact-ico" title="Refresh preview" onClick={() => setNonce((n) => n + 1)}><RotateCw size={14} /></button>}
          {artifact.previewable && <button className="artifact-ico" title="Open in new tab" onClick={openTab}><ExternalLink size={14} /></button>}
          <button className="artifact-ico" title={saved ? "Saved to Studio gallery" : "Save to Studio gallery"} onClick={saveToGallery}>{saved ? <Check size={14} /> : <Bookmark size={14} />}</button>
          <span className="artifact-roomwrap">
            <button className="artifact-ico" title="Send to a Workroom's knowledge shelf" onClick={openRoomMenu}><Share2 size={14} /></button>
            {roomMenu && (
              <div className="artifact-roommenu">
                <div className="artifact-roommenu-h">Send to workroom</div>
                {rooms.length === 0 ? <div className="artifact-roommenu-empty">No workrooms yet.</div>
                  : rooms.filter((r) => !r.archived).map((r) => (
                    <button key={r.id} className="artifact-roommenu-row" onClick={() => sendToRoom(r)}>
                      <span className="artifact-roommenu-glyph" style={{ color: (r.identity && r.identity.color) || "var(--accent)" }}>{(r.identity && r.identity.glyph) || "◆"}</span> {r.name}
                    </button>
                  ))}
              </div>
            )}
          </span>
          <button className="artifact-ico" title="Copy code" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <button className="artifact-ico" title="Download" onClick={download}><Download size={14} /></button>
          <button className="artifact-ico" title="Close" onClick={onClose}><X size={15} /></button>
        </div>
      </div>
      <div className="artifact-body">
        {tab === "preview" && artifact.previewable ? (
          <iframe key={nonce} className="artifact-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={artifactSrcDoc(artifact)} title="artifact preview" />
        ) : tab === "edit" ? (
          <div className="artifact-canvas">
            <textarea
              ref={taRef}
              className="artifact-edit"
              value={code}
              spellCheck={false}
              onChange={(e) => {
                if (draft == null) setEditHistory((h) => [...h.slice(-9), code]);
                setDraft(e.target.value);
              }}
            />
            <div className="artifact-revise">
              <Sparkles size={14} style={{ flex: "none", color: "var(--accent)" }} />
              <input
                value={revise}
                placeholder="Ask AI to revise — select text first for a targeted edit, or leave unselected to revise the whole thing"
                onChange={(e) => setRevise(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyAi(); }}
              />
              <button className="btn primary" disabled={aiBusy || !revise.trim()} onClick={applyAi}>
                {aiBusy ? <Loader2 size={13} className="ag-spin" /> : "Revise"}
              </button>
            </div>
            {aiErr && <div className="artifact-aierr">{aiErr}</div>}
          </div>
        ) : (
          <pre className="artifact-code">{code}</pre>
        )}
      </div>
    </div>
  );
}
