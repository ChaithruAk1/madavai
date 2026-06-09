import { useState } from "react";
import { X, Eye, Code as CodeIcon, ExternalLink, Copy, Download, RotateCw, Check } from "lucide-react";
import { artifactSrcDoc } from "../artifacts.js";

const EXT = { html: "html", svg: "svg", markdown: "md", react: "jsx", mermaid: "mmd", code: "txt" };

export default function ArtifactPanel({ artifact: artifactProp, versions = [], onClose }) {
  // Version history: when the conversation produced several artifacts of the same type
  // (iterations on one page/diagram/component), let the user flip between them.
  const [vIdx, setVIdx] = useState(-1); // -1 = the artifact that was clicked (latest intent)
  const artifact = vIdx >= 0 && versions[vIdx] ? versions[vIdx] : artifactProp;
  const [tab, setTab] = useState(artifact.previewable ? "preview" : "code");
  const [copied, setCopied] = useState(false);
  const [nonce, setNonce] = useState(0); // bump to reload the preview iframe

  const copy = async () => { try { await navigator.clipboard.writeText(artifact.code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const download = () => {
    const blob = new Blob([artifact.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `artifact.${EXT[artifact.kind] || "txt"}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openTab = () => {
    if (!artifact.previewable) return;
    const blob = new Blob([artifactSrcDoc(artifact)], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  return (
    <div className="artifact-wrap" style={{ width: "46%", maxWidth: 760 }}>
      <div className="artifact-head">
        <span className="artifact-title">{artifact.title}</span>
        {versions.length > 1 && (
          <select className="artifact-ver" title="Version history" value={vIdx} onChange={(e) => setVIdx(Number(e.target.value))}>
            <option value={-1}>latest</option>
            {versions.map((_, i) => <option key={i} value={i}>v{i + 1}{i === versions.length - 1 ? " (newest)" : ""}</option>)}
          </select>
        )}
        <div className="artifact-tabs">
          {artifact.previewable && <button className={`artifact-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}><Eye size={13} /> Preview</button>}
          <button className={`artifact-tab ${tab === "code" ? "active" : ""}`} onClick={() => setTab("code")}><CodeIcon size={13} /> Code</button>
        </div>
        <div className="artifact-actions">
          {tab === "preview" && artifact.previewable && <button className="artifact-ico" title="Refresh preview" onClick={() => setNonce((n) => n + 1)}><RotateCw size={14} /></button>}
          {artifact.previewable && <button className="artifact-ico" title="Open in new tab" onClick={openTab}><ExternalLink size={14} /></button>}
          <button className="artifact-ico" title="Copy code" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <button className="artifact-ico" title="Download" onClick={download}><Download size={14} /></button>
          <button className="artifact-ico" title="Close" onClick={onClose}><X size={15} /></button>
        </div>
      </div>
      <div className="artifact-body">
        {tab === "preview" && artifact.previewable ? (
          <iframe key={nonce} className="artifact-frame" sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={artifactSrcDoc(artifact)} title="artifact preview" />
        ) : (
          <pre className="artifact-code">{artifact.code}</pre>
        )}
      </div>
    </div>
  );
}
