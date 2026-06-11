// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// "Enable terminal access" — one click provisions the Madav CLI on the user's machine, reusing the
// provider/key already in Settings and a subscription-bound token. No config files, no key re-entry.
import { useEffect, useState } from "react";
import { Terminal, CheckCircle2, AlertTriangle, Copy, Download } from "lucide-react";
import { bridge, isWeb } from "../bridge/index.js";

export default function CliAccess() {
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const refresh = () => bridge.cliStatus?.().then(setStatus).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const enable = async () => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await bridge.enableCli();
      if (!r || r.ok === false) setErr((r && r.error) || "Couldn't enable terminal access.");
      else setResult(r);
    } catch (e) { setErr(String((e && e.message) || e)); }
    setBusy(false); refresh();
  };

  if (isWeb || (status && status.web)) {
    return (
      <div className="prof-card">
        <div className="prof-card-h"><span className="prof-ico"><Terminal size={15} /></span> Available in the desktop app</div>
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: "8px 0 0" }}>The terminal agent runs on your computer, so it's set up from the Madav <b>desktop app</b> (a browser can't write to your shell). Open the desktop app → Settings → Terminal access, and click Enable.</p>
      </div>
    );
  }

  const nodeOk = status && status.node && status.node.ok;

  return (
    <div className="prof-card">
      <div className="prof-card-h"><span className="prof-ico"><Terminal size={15} /></span> Madav CLI</div>

      {status && status.configured && status.onPath && !result && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 2px", fontSize: 13 }}>
          <CheckCircle2 size={15} color="#3ECF8E" />
          <span>Terminal access is <b>active</b> — open any terminal and run <code>madav</code>. (Set up automatically for your subscription.)</span>
        </div>
      )}

      {/* Node prerequisite */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "10px 0 2px" }}>
        {nodeOk
          ? <><CheckCircle2 size={15} color="#3ECF8E" /> <span>Node.js detected{status.node.version ? ` (${status.node.version})` : ""}.</span></>
          : <><AlertTriangle size={15} color="#E0B341" /> <span>Node.js not found. Install it once from <a href="#" onClick={(e) => { e.preventDefault(); bridge.openExternal?.("https://nodejs.org/en/download"); }}>nodejs.org <Download size={11} /></a>, then click Enable.</span></>}
      </div>

      <p style={{ color: "var(--text-2)", fontSize: 12.5, margin: "8px 0 14px", lineHeight: 1.5 }}>
        This writes your provider settings to a local config and adds a <code>madav</code> command to your PATH. Your subscription is checked each time it starts. You won't re-enter any API key.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn primary" onClick={enable} disabled={busy}>{busy ? "Setting up…" : (status && status.configured ? "Re-run setup" : "Enable terminal access")}</button>
        {status && status.configured && <button className="btn" onClick={async () => { await bridge.disableCli(); refresh(); setResult(null); }}>Disable</button>}
        {status && status.onPath && <span style={{ fontSize: 12, color: "#3ECF8E", display: "inline-flex", gap: 5, alignItems: "center" }}><CheckCircle2 size={13} /> command installed</span>}
      </div>

      {err && <div style={{ marginTop: 12, color: "#E06C5B", fontSize: 13 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 10 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, fontWeight: 600, marginBottom: 6 }}><CheckCircle2 size={15} color="#3ECF8E" /> Ready — model <code>{result.model}</code></div>
          <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "0 0 8px" }}>{(result.command && result.command.note) || "Open a new terminal and run:"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code style={{ flex: 1, padding: "8px 10px", background: "var(--bg)", borderRadius: 8, fontSize: 13 }}>madav</code>
            <button className="btn" onClick={() => { try { navigator.clipboard.writeText("madav"); } catch {} }}><Copy size={13} /> Copy</button>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-3)", margin: "10px 0 0" }}>Then <code>cd</code> into any project folder first, and type <code>madav</code>. In the CLI: <code>/help</code> lists commands, <code>/undo</code> reverts the last edit.</p>
        </div>
      )}
    </div>
  );
}
