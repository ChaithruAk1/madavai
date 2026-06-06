import { useState, useRef } from "react";
import { ArrowUp, Square, Paperclip, X, FileText } from "lucide-react";

export default function Composer({ mode, busy, onSend, onStop }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]); // { name, content }
  const ref = useRef(null);
  const fileRef = useRef(null);

  const onPick = (e) => {
    const list = Array.from(e.target.files || []);
    list.forEach((f) => {
      const r = new FileReader();
      r.onload = () => setFiles((prev) => [...prev, { name: f.name, content: String(r.result || "").slice(0, 20000) }]);
      r.readAsText(f);
    });
    e.target.value = "";
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    const t = text.trim();
    if ((!t && files.length === 0) || busy) return;
    const attached = files.map((f) => `--- Attached file: ${f.name} ---\n${f.content}`).join("\n\n");
    const full = attached ? `${attached}\n\n${t}` : t;
    onSend(full);
    setText("");
    setFiles([]);
    if (ref.current) ref.current.style.height = "auto";
  };

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } };
  const grow = (e) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const placeholder = {
    chat: "Message Chai…",
    code: "Describe a change to the repo…",
    cowork: "Ask Chai to work on your folder…",
    project: "Continue this project…",
  }[mode] || "Message Chai…";

  const canSend = !!text.trim() || files.length > 0;

  return (
    <div className="composer-wrap">
      <div className="composer">
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f, i) => (
              <span key={i} className="file-chip">
                <FileText size={12} /> {f.name}
                <button className="file-x" onClick={() => removeFile(i)} title="Remove"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <textarea ref={ref} rows={1} value={text} placeholder={placeholder} onChange={grow} onKeyDown={onKey} />
        <div className="composer-row">
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
          <button className="chip" onClick={() => fileRef.current && fileRef.current.click()}><Paperclip size={12} /> attach</button>
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
