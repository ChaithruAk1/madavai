// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// TeamOps — mission control for a running agent team. The user WATCHES the floor:
// every member is a workstation that lights up when it's working, hands off down the
// line, and stamps its output when done. Pure presentation; data comes from UiEvents.
import { useEffect, useState } from "react";
import { X, Check, CircleDashed, Zap, GitMerge, ClipboardList, AlertTriangle } from "lucide-react";

const VERBS = ["thinking", "digging in", "drafting", "cross-checking", "assembling", "refining"];

function Face({ identity, size = 30 }) {
  const c = (identity && identity.color) || "#13c2d6";
  const g = (identity && identity.glyph) || "✦";
  return <span className="ags-face" style={{ width: size, height: size, fontSize: Math.round(size * 0.46), background: `${c}22`, border: `1px solid ${c}66`, color: c }}>{g}</span>;
}

function Elapsed({ since }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <span className="tops-clock">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}

function WorkingVerb() {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % VERBS.length), 2200); return () => clearInterval(t); }, []);
  return <span>{VERBS[i]}…</span>;
}

export default function TeamOps({ team, run, onClose }) {
  if (!team) return null;
  const steps = run && run.steps ? run.steps : [];
  const doneCount = steps.filter((s) => s.status === "done").length;
  const workingAll = steps.filter((s) => s.status === "working");
  const working = workingAll[0];
  const idle = !run || !run.startedAt;
  const allDone = run && run.finished;

  return (
    <div className="tops glass">
      <div className="tops-head">
        <div className="tops-title">
          <span className="tops-faces">
            {team.members.slice(0, 4).map((m, i) => <span key={i} style={{ marginLeft: i ? -8 : 0 }}><Face identity={m.identity} size={24} /></span>)}
          </span>
          <div>
            <div className="tops-name">{team.name || "Your team"}</div>
            <div className="tops-sub">{team.mode === "manager" ? <><GitMerge size={11} /> managed</> : <><Zap size={11} /> relay line</>} · {team.members.length} agents</div>
          </div>
        </div>
        <div className="tops-head-right">
          {run && run.startedAt && !allDone && <Elapsed since={run.startedAt} />}
          {onClose && <button className="tops-x" aria-label="Close Mission Control" onClick={onClose}><X size={14} /></button>}
        </div>
      </div>

      {/* status strip */}
      <div className="tops-strip">
        {idle && <span>Floor is quiet — brief the team below to put everyone to work.</span>}
        {!idle && !allDone && <span className="tops-live"><span className="tops-dot" /> {workingAll.length > 1 ? `${workingAll.length} agents on the floor` : working ? `${working.name} on the floor` : "dispatching"} · {doneCount}/{steps.length || team.members.length} stations cleared</span>}
        {allDone && <span className="tops-done"><Check size={12} /> Mission complete — {doneCount} station{doneCount === 1 ? "" : "s"} cleared</span>}
      </div>

      {/* cost guardrail — live token meter (shown when this mission has a budget) */}
      {run && run.budget && run.budget.max > 0 && (
        <div style={{ padding: "6px 14px 2px", display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-2)" }}>
          <span>budget</span>
          <span style={{ flex: 1, height: 5, borderRadius: 3, background: "color-mix(in srgb, currentColor 18%, transparent)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 3, width: `${Math.min(100, Math.round((run.budget.used / run.budget.max) * 100))}%`, background: run.budget.used >= run.budget.max ? "var(--danger)" : "var(--accent)", transition: "width .4s ease" }} />
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(run.budget.used / 1000)}k / {Math.round(run.budget.max / 1000)}k tok</span>
        </div>
      )}

      {/* the floor */}
      <div className="tops-floor scroll">
        {run && run.plan && (
          <div className={`tops-station ${run.plan.status}`}>
            <span className="tops-rail" />
            <span className="tops-st-face"><ClipboardList size={15} /></span>
            <div className="tops-st-body">
              <div className="tops-st-name">Coordinator <span className="tops-st-tag">plan</span></div>
              {run.plan.status === "working" && <div className="tops-st-state">splitting the mission…</div>}
              {run.plan.status === "done" && <div className="tops-st-out">{run.plan.output}</div>}
            </div>
          </div>
        )}
        {(steps.length ? steps : team.members.map((m) => ({ name: m.name, status: "queued", identity: m.identity }))).map((st, i) => {
          const member = team.members.find((m) => m.name === st.name) || {};
          return (
            <div key={st.name + i} className={`tops-station ${st.status}`}>
              <span className="tops-rail" />
              <span className="tops-st-face"><Face identity={st.identity || member.identity} size={30} /></span>
              <div className="tops-st-body">
                <div className="tops-st-name">{st.name}
                  {st.status === "working" && <span className="tops-st-tag live">working</span>}
                  {st.status === "done" && <span className="tops-st-tag ok"><Check size={10} /> done</span>}
                  {st.status === "failed" && <span className="tops-st-tag bad"><AlertTriangle size={10} /> failed</span>}
                  {st.status === "queued" && <span className="tops-st-tag"><CircleDashed size={10} /> standing by</span>}
                </div>
                {st.status === "working" && <div className="tops-st-state"><WorkingVerb /><span className="tops-bar"><span /></span></div>}
                {st.status === "done" && st.output && <div className="tops-st-out">{String(st.output).slice(0, 220)}{String(st.output).length > 220 ? "…" : ""}</div>}
                {member.description && st.status === "queued" && <div className="tops-st-desc">{member.description}</div>}
              </div>
            </div>
          );
        })}
        {run && run.synth && (
          <div className={`tops-station ${run.synth}`}>
            <span className="tops-rail" />
            <span className="tops-st-face"><GitMerge size={15} /></span>
            <div className="tops-st-body">
              <div className="tops-st-name">Assembly {run.synth === "working" ? <span className="tops-st-tag live">merging</span> : <span className="tops-st-tag ok"><Check size={10} /> delivered</span>}</div>
              {run.synth === "working" && <div className="tops-st-state">synthesizing the deliverable…<span className="tops-bar"><span /></span></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
