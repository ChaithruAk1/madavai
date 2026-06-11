// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// AgentOps — Mission Control's little sibling: a live side panel for SOLO agent turns.
// Shows the working portrait, an elapsed clock, and every tool step as it happens.
// Reuses the .tops-* station styling from Mission Control so the two feel like family.
import { useEffect, useState } from "react";
import { X, Check, Ban, Loader2 } from "lucide-react";
import Portrait from "./Portrait.jsx";

const nice = (n) => String(n || "").replace(/^mcp__/, "").replace(/__/g, " · ").replace(/_/g, " ");

export default function AgentOps({ agent, run, onClose }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (run.finished) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run.finished]);
  const secs = Math.max(0, Math.floor(((run.finished ? run.endedAt || Date.now() : Date.now()) - run.startedAt) / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const working = !run.finished;
  const live = run.steps.filter((s) => s.status === "run");
  return (
    <div className="tops">
      <div className="tops-head">
        <div className="tops-title">
          <Portrait seed={agent.id} color={(agent.identity && agent.identity.color) || "var(--accent)"} size={30}
            mood={working ? "working" : "happy"} title={agent.name} />
          <div>
            <div className="tops-name">{agent.name || "Agent"}</div>
            <div className="tops-sub">solo mission — live</div>
          </div>
        </div>
        <div className="tops-head-right">
          <span className="tops-clock">{clock}</span>
          <button className="tops-x" onClick={onClose} aria-label="Hide panel"><X size={14} /></button>
        </div>
      </div>
      <div className="tops-strip">
        {working
          ? <span className="tops-live"><i className="tops-dot" /> working{live.length ? ` — ${nice(live[live.length - 1].name)}` : " — thinking"}</span>
          : <span className="tops-done"><Check size={12} /> finished · {run.steps.length} tool step{run.steps.length === 1 ? "" : "s"} · {clock}</span>}
      </div>
      <div className="tops-floor scroll">
        {run.steps.length === 0 && (
          <div className="ag-hint" style={{ margin: 0 }}>
            {working ? "Thinking — tool steps will appear here as they happen." : "Finished without using any tools."}
          </div>
        )}
        {run.steps.map((s, i) => (
          <div key={s.id || i} className={`tops-station ${s.status === "run" ? "working" : "done"}`}>
            <span className="tops-rail" />
            <span className="tops-st-face">
              {s.status === "run" ? <Loader2 size={13} className="ag-spin" /> : s.status === "deny" ? <Ban size={13} /> : <Check size={13} />}
            </span>
            <div className="tops-st-body">
              <div className="tops-st-name">{nice(s.name)}{s.status === "deny" && <span className="tops-st-tag bad">denied</span>}</div>
              {s.status === "run" && <div className="tops-st-state"><span className="tops-bar"><span /></span></div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
