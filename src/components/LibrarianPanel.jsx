// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sage Librarian panel (a Test Center tab) — the approval side of the knowledge sweep.
// Engine: electron/librarian.cjs. Flow: Scan (git drift since last sweep) → Generate
// (model rewrites an area file from current source) → REVIEW the entry-level diff →
// Apply (writes the file, with backup + rollback) or Discard. Repair-Bay pattern:
// nothing lands without the admin's click. Desktop + source tree only.
import { useEffect, useState } from "react";
import { bridge } from "../bridge/index.js";
import { BookOpen, RefreshCw, Loader2, Check, X, Undo2, ChevronDown, ChevronRight, Sparkles } from "lucide-react";

export default function LibrarianPanel() {
  const [status, setStatus] = useState(null);     // { available, root, lastSweep, pending } | { error }
  const [scan, setScan] = useState(null);          // { baseline, changedFiles, areas } | { error }
  const [scanning, setScanning] = useState(false);
  const [genBusy, setGenBusy] = useState({});      // areaFile -> true while the model writes
  const [props, setProps] = useState([]);          // pending proposals
  const [applied, setApplied] = useState({});      // areaFile -> { backup, swept }
  const [open, setOpen] = useState({});            // areaFile -> expanded review
  const [err, setErr] = useState("");

  const refresh = async () => {
    try {
      const s = await bridge.librarianStatus?.();
      setStatus(s || { error: "The Librarian was added in this update — close Madav completely and reopen it." });
      const p = await bridge.librarianProposals?.();
      setProps(Array.isArray(p) ? p : []);
    } catch (e) { setStatus({ error: String((e && e.message) || e) }); }
  };
  useEffect(() => { refresh(); }, []);

  const doScan = async () => {
    setScanning(true); setErr("");
    try { const r = await bridge.librarianScan(); r && r.error ? setErr(r.error) : setScan(r); }
    catch (e) { setErr(String((e && e.message) || e)); }
    setScanning(false);
  };

  const doGenerate = async (areaFile) => {
    setGenBusy((b) => ({ ...b, [areaFile]: true })); setErr("");
    try { const r = await bridge.librarianGenerate(areaFile); if (r && r.error) setErr(r.error); }
    catch (e) { setErr(String((e && e.message) || e)); }
    setGenBusy((b) => ({ ...b, [areaFile]: false }));
    refresh();
  };

  const doApply = async (areaFile) => {
    setErr("");
    const label = (props.find((p) => p.file === areaFile) || {}).label || areaFile;
    const r = await bridge.librarianApply(areaFile);
    if (r && r.applied) setApplied((a) => ({ ...a, [areaFile]: { backup: r.backup, swept: r.swept, label } }));
    else setErr((r && r.error) || "apply failed");
    refresh(); // the proposal leaves the pending list; the applied row below keeps the rollback
  };

  const doDiscard = async (areaFile) => { await bridge.librarianDiscard(areaFile); refresh(); };
  const doRollback = async (areaFile) => {
    const a = applied[areaFile];
    if (!a) return;
    const r = await bridge.librarianRollback({ file: areaFile, backup: a.backup });
    if (r && r.restored) setApplied((x) => { const y = { ...x }; delete y[areaFile]; return y; });
    else setErr((r && r.error) || "rollback failed");
  };

  if (!bridge.librarianStatus) return <div className="ag-empty"><BookOpen size={26} /><div className="ag-empty-t">Librarian not loaded</div><div className="ag-empty-s">This feature was just added — close Madav completely and reopen it.</div></div>;
  if (status && status.error) return <div className="ag-empty"><BookOpen size={26} /><div className="ag-empty-t">Librarian unavailable</div><div className="ag-empty-s">{status.error}</div></div>;
  if (status && !status.available) return (
    <div className="ag-empty"><BookOpen size={26} />
      <div className="ag-empty-t">Source tree required</div>
      <div className="ag-empty-s">The Librarian reads the repository (git + sage-knowledge/ + src/) to keep Sage's control-level knowledge in sync. It only works when Madav runs from source — shipped installers carry the knowledge baked at release time, which is correct.</div>
    </div>
  );

  return (
    <div className="lib-panel">
      <div className="lib-head">
        <div>
          <div className="lib-title"><BookOpen size={16} /> Sage Librarian</div>
          <div className="lib-sub">Keeps Sage's control-level knowledge matched to the code. Scan finds drifted areas since the last sweep{status?.lastSweep ? ` (baseline ${status.lastSweep})` : ""}; Generate has the model rewrite the area file from current source; nothing is written until you approve the diff.</div>
        </div>
        <button className="btn primary" disabled={scanning} onClick={doScan}>{scanning ? <><Loader2 size={14} className="ag-spin" /> Scanning…</> : <><RefreshCw size={14} /> Scan for drift</>}</button>
      </div>

      {err && <div className="lib-err"><X size={13} /> {err}</div>}

      {scan && !scan.error && (
        <div className="lib-scan">
          <div className="lib-scanline">{scan.changedFiles} source file{scan.changedFiles === 1 ? "" : "s"} changed since baseline {scan.baseline} → {scan.areas.length === 0 ? "no knowledge areas affected. Sage is in sync." : `${scan.areas.length} knowledge area${scan.areas.length === 1 ? "" : "s"} likely stale:`}</div>
          {scan.areas.map((a) => (
            <div key={a.file} className="lib-area">
              <div className="lib-area-main">
                <b>{a.label}</b> <span className="lib-dim">sage-knowledge/{a.file}</span>
                <div className="lib-dim">changed: {a.components.join(", ")}</div>
              </div>
              <button className="btn" disabled={!!genBusy[a.file]} onClick={() => doGenerate(a.file)}>
                {genBusy[a.file] ? <><Loader2 size={13} className="ag-spin" /> Writing…</> : <><Sparkles size={13} /> Generate update</>}
              </button>
            </div>
          ))}
        </div>
      )}

      {props.length > 0 && <div className="lib-section">Pending proposals — review before anything lands</div>}
      {props.map((p) => {
        const d = p.diff || {};
        const isOpen = !!open[p.file];
        const ap = applied[p.file];
        return (
          <div key={p.file} className="lib-prop">
            <div className="lib-prop-head" onClick={() => setOpen((o) => ({ ...o, [p.file]: !o[p.file] }))}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <b>{p.label}</b> <span className="lib-dim">sage-knowledge/{p.file}</span>
              <span className="lib-chips">
                {d.added?.length > 0 && <span className="lib-chip add">+{d.added.length} new</span>}
                {d.changed?.length > 0 && <span className="lib-chip chg">~{d.changed.length} updated</span>}
                {d.removed?.length > 0 && <span className="lib-chip del">−{d.removed.length} removed</span>}
                <span className="lib-chip">{d.unchanged} unchanged</span>
              </span>
            </div>
            {isOpen && (
              <div className="lib-prop-body">
                {["added", "changed", "removed"].map((k) => (d[k] || []).length > 0 && (
                  <div key={k} className="lib-difflist">
                    <span className={`lib-chip ${k === "added" ? "add" : k === "changed" ? "chg" : "del"}`}>{k}</span>
                    <span>{d[k].join(" · ")}</span>
                  </div>
                ))}
                <details className="lib-raw"><summary>Full proposed file</summary><pre>{p.proposed}</pre></details>
                <details className="lib-raw"><summary>Current file (for comparison)</summary><pre>{p.base}</pre></details>
                <div className="lib-dim" style={{ marginTop: 6 }}>written by {p.model || "the active model"} · from {p.components.join(", ")}</div>
              </div>
            )}
            {!ap && (
              <div className="lib-actions">
                <button className="btn primary" onClick={() => doApply(p.file)}><Check size={13} /> Apply (writes the file)</button>
                <button className="btn" onClick={() => doDiscard(p.file)}><X size={13} /> Discard</button>
              </div>
            )}
          </div>
        );
      })}

      {Object.entries(applied).map(([file, a]) => (
        <div key={"ap-" + file} className="lib-prop">
          <div className="lib-actions">
            <span className="lib-ok"><Check size={13} /> {a.label} applied{a.swept ? " — sweep baseline updated" : ""} <span className="lib-dim">(backup kept)</span></span>
            <button className="btn" onClick={() => doRollback(file)}><Undo2 size={13} /> Roll back</button>
          </div>
        </div>
      ))}

      {!scan && props.length === 0 && (
        <div className="lib-hint">Run a scan to see which knowledge areas drifted. After applying, changes reach Sage on the next build / dev reload, and land in git like any other edit — review the diff in your commit as usual.</div>
      )}
    </div>
  );
}
