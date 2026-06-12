// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// QA Test Center (ADMIN ONLY) — one button runs the full agent-powered test cycle across
// every layer of the app: code integrity, data stores, file tools, the live model engine
// (instruction-following, agent identity, team planning, markdown/JSON discipline), and
// the auth server. Live progress board + issues list + run history for daily cycles.
import { useEffect, useRef, useState } from "react";
import { FlaskConical, Play, Check, X, Loader2, CircleDashed, SkipForward, History, ShieldAlert, Wrench, Undo2, MousePointerClick, ChevronUp, ChevronDown, Pencil, BookOpen } from "lucide-react";
import { bridge, isWeb } from "../bridge/index.js";
import { runFunctionalSweep, lastFunctionalReport, builtinList, getCustomScenarios, saveCustomScenarios, getDisabled, setDisabled, draftScenario, runScenario, STEP_DOCS } from "../qa/functional.js";
import LibrarianPanel from "./LibrarianPanel.jsx";

// ---- Plain-English error translator ----
// Raw errors are for machines. Every failure gets: what it means, what to do,
// and — when it's fixable on an app screen — a button that takes you there.
export function translateError(raw) {
  const s = String(raw || "");
  const T = (plain, fix, nav) => ({ plain, fix, nav });
  if (/no cookie auth|401|unauthorized|invalid api key|incorrect api key|authentication/i.test(s))
    return T("The AI provider rejected your key — it's missing, wrong, or doesn't cover the selected model.",
      "Pick a model you have access to in the model selector, or paste the correct API key for this provider.",
      { label: "Open Model configuration", target: "models" });
  if (/404|not found for account|no endpoints|model.*not.*found/i.test(s))
    return T("The selected model doesn't exist on your account or was retired by the provider.",
      "Choose a different model from the selector — then re-run.",
      { label: "Open Model configuration", target: "models" });
  if (/429|rate.?limit|quota|insufficient|balance/i.test(s))
    return T("The provider says you're out of credits or sending requests too fast.",
      "Wait a minute and re-run, top up the account, or switch to a free model.",
      { label: "Open Model configuration", target: "models" });
  if (/no active provider|no provider\/model|no_profile|pick a model/i.test(s))
    return T("No AI provider/model is selected, so live tests can't talk to anything.",
      "Pick any working model in the selector first.",
      { label: "Open Model configuration", target: "models" });
  if (/timed out|timeout|abort|fetch failed|failed to fetch|econnrefused|enotfound|network/i.test(s))
    return T("Nothing answered — the provider (or your local model server) is unreachable.",
      "Check your internet; for local models make sure LM Studio/Ollama is running; for the account server, start it.", null);
  if (/health returned|app-version returned|server/i.test(s) && /\b(5\d\d|404)\b/.test(s))
    return T("Your account server answered with an error.", "Check the server terminal window for the real cause and restart it.", null);
  if (/doesn't parse|SyntaxError|Unexpected token/i.test(s))
    return T("A code file was saved with a typo — the app can't read it.", "Use Diagnose & propose fix below, or revert the last change to that file.", null);
  if (/expected .* bullets|unexpected reply|broke character|no JSON|plan unusable|no markdown table/i.test(s))
    return T("The AI model answered, but didn't follow instructions well enough.",
      "This is usually a weak model, not a bug — switch to a stronger model and re-run. If it fails on every model, the prompt layer changed.",
      { label: "Open Model configuration", target: "models" });
  return T("Something failed — the technical detail below says where.", "Use Diagnose & propose fix, or send the detail to your developer.", null);
}

const AREAS = ["Code integrity", "Data stores", "File tools", "Live engine", "Agents & Teams", "Skills & tasks", "Auth server"];
const AREA_BLURB = {
  "Code integrity": "Every engine file parses; dependencies are pinned.",
  "Data stores": "Settings, conversations, projects, agents & teams survive write → read → search → delete.",
  "File tools": "The agent file sandbox works and can't escape the working folder.",
  "Live engine": "Real model calls: ping, instruction-following, agent identity, team planning, JSON & markdown discipline.",
  "Agents & Teams": "The multi-agent feature end to end — knowledge injection, pinned models, and a REAL 2-member relay mission.",
  "Skills & tasks": "Skill discovery, scheduler task store, Via Mobile log, CLI files.",
  "Auth server": "Health, version endpoint, and that admin doors are locked to strangers.",
};

export default function TestCenter({ onNavigate }) {
  const [admin, setAdmin] = useState(null); // null = checking, false = denied, true = welcome
  const [run, setRun] = useState(null);     // { total, startedAt, tests: {id → rec} } during/after a cycle
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState([]);
  const unsubRef = useRef(null);
  // Functional UI sweep: report persists across navigation (the sweep drives the whole app).
  const [fnReport, setFnReport] = useState(() => lastFunctionalReport());
  const [fnBusy, setFnBusy] = useState(false);
  const [fnArea, setFnArea] = useState(null); // null = show every check; or one area name to focus
  const [tab, setTab] = useState("engine");   // "engine" | "sweep" | "library" | "history"

  // Coming back to this page mid- or post-run: restore the engine cycle state from the main process.
  useEffect(() => {
    bridge.qaStatus?.().then((s) => {
      if (s && s.current && s.current.tests) {
        setRun({ total: s.current.total, startedAt: s.current.startedAt, done: !s.running, tests: Object.fromEntries(s.current.tests.map((t) => [t.id, t])) });
        if (s.running) setBusy(true);
      }
    }).catch(() => {});
  }, []);

  // ---- Scenario Manager: edit the test library without touching code ----
  const [libOpen, setLibOpen] = useState(false);
  const [customs, setCustoms] = useState(() => getCustomScenarios());
  const [disabled, setDisabledState] = useState(() => getDisabled());
  // draft: { area, desc, busy, err, name, steps, editingId?, sim?, confirm? }
  //   sim     = last simulation result { ok, note, ms } (null until simulated)
  //   confirm = admin ticked "I've reviewed this" (required before save)
  const [draft, setDraft] = useState(null);
  const persistCustoms = (next) => { setCustoms(next); saveCustomScenarios(next); };
  const toggleBuiltin = (id) => { const n = new Set(disabled); n.has(id) ? n.delete(id) : n.add(id); setDisabledState(n); setDisabled(n); };
  const aiDraft = async () => {
    if (!draft || !draft.desc.trim()) return;
    setDraft((d) => ({ ...d, busy: true, err: "" }));
    try {
      const r = await draftScenario(draft.area, draft.desc.trim());
      setDraft((d) => ({ ...d, busy: false, name: r.name, steps: r.steps, sim: null, confirm: false }));
    } catch (e) { setDraft((d) => ({ ...d, busy: false, err: String((e && e.message) || e) })); }
  };
  // Simulate the drafted scenario live before it's added — the window drives itself
  // through the steps and reports pass/fail. Editing any step resets the result.
  const simulateDraft = async () => {
    if (!draft || !draft.steps || !draft.steps.length) return;
    setDraft((d) => ({ ...d, simBusy: true, err: "" }));
    const res = await runScenario(draft.steps);
    setDraft((d) => ({ ...d, simBusy: false, sim: res }));
  };
  const setSteps = (updater) => setDraft((d) => ({ ...d, steps: updater(d.steps), sim: null, confirm: false })); // any edit invalidates the sim
  const saveDraftScenario = () => {
    if (!draft || !draft.steps || !draft.steps.length || !draft.confirm) return;
    const rec = { area: draft.area, name: draft.name || draft.desc.slice(0, 60), steps: draft.steps, enabled: true,
      lastSim: draft.sim ? { ok: draft.sim.ok, at: Date.now() } : null };
    if (draft.editingId) persistCustoms(customs.map((x) => x.id === draft.editingId ? { ...x, ...rec } : x)); // edit in place
    else persistCustoms([...customs, { id: "cs_" + Date.now(), ...rec }]);
    setDraft(null);
  };
  const editScenario = (c) => setDraft({ area: c.area, desc: c.name, name: c.name, steps: c.steps.map((s) => ({ ...s })), editingId: c.id, sim: null, confirm: false, busy: false, err: "" });
  const moveScenario = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= customs.length) return;
    const next = [...customs]; [next[i], next[j]] = [next[j], next[i]]; persistCustoms(next);
  };
  const startSweep = async () => {
    if (fnBusy) return;
    setFnBusy(true);
    try { const r = await runFunctionalSweep(); if (r) setFnReport(r); } finally { setFnBusy(false); setFnReport(lastFunctionalReport()); }
  };

  // Repair Bay: per-test-id { state: "diagnosing"|"proposed"|"applying"|"applied"|"error", proposal, backup, error }
  const [repairs, setRepairs] = useState({});
  const setRepair = (id, patch) => setRepairs((r) => ({ ...r, [id]: { ...(r[id] || {}), ...patch } }));

  const diagnoseIssue = async (t) => {
    if (!bridge.qaDiagnose) {
      setRepair(t.id, { state: "error", error: "The Repair Bay was added in this update but the app hasn't reloaded it yet — close Madav completely and reopen it, then try again." });
      return;
    }
    setRepair(t.id, { state: "diagnosing", error: null });
    try {
      const p = await bridge.qaDiagnose({ id: t.id, name: t.name, area: t.area, error: t.error });
      if (p && p.error) setRepair(t.id, { state: "error", error: p.error });
      else setRepair(t.id, { state: "proposed", proposal: p });
    } catch (e) { setRepair(t.id, { state: "error", error: String((e && e.message) || e) }); }
  };
  const approveFix = async (t) => {
    const p = repairs[t.id] && repairs[t.id].proposal;
    if (!p || !p.fixable) return;
    setRepair(t.id, { state: "applying" });
    const r = await bridge.qaApplyFix({ file: p.file, find: p.find, replace: p.replace });
    if (r && r.applied) setRepair(t.id, { state: "applied", backup: r.backup });
    else setRepair(t.id, { state: "error", error: (r && r.error) || "apply failed" });
  };
  const undoFix = async (t) => {
    const rp = repairs[t.id];
    if (!rp || !rp.backup) return;
    const r = await bridge.qaRollback({ file: rp.proposal.file, backup: rp.backup });
    setRepair(t.id, r && r.restored ? { state: "proposed", backup: null } : { state: "error", error: (r && r.error) || "rollback failed" });
  };

  // Admin gate: same door as the Admin Analytics section — a working adminStats call.
  useEffect(() => {
    let live = true;
    (async () => {
      try { const r = await bridge.adminStats?.(); if (live) setAdmin(!!r && !r.error); }
      catch { if (live) setAdmin(false); }
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => { bridge.qaHistory?.().then((h) => setHist(h || [])).catch(() => {}); }, [busy]);

  useEffect(() => {
    if (!bridge.onQaEvent) return;
    unsubRef.current = bridge.onQaEvent((e) => {
      if (e.kind === "qa_start") setRun({ total: e.data.total, startedAt: e.data.startedAt, tests: {}, done: false });
      else if (e.kind === "qa_test") setRun((r) => r ? { ...r, tests: { ...r.tests, [e.data.id]: e.data } } : r);
      else if (e.kind === "qa_done") { setRun((r) => r ? { ...r, done: true, summary: e.data } : r); setBusy(false); }
    });
    return () => { unsubRef.current && unsubRef.current(); };
  }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true); setRun(null);
    try { await bridge.qaStart(); } catch { setBusy(false); }
  };

  if (isWeb) return (
    <div className="agents-page scroll"><div className="ag-empty"><FlaskConical size={28} />
      <div className="ag-empty-t">Test Center runs on desktop</div>
      <div className="ag-empty-s">The test cycle exercises the real engine, stores and file tools — that machinery lives in the desktop app.</div>
    </div></div>
  );
  if (admin === null) return <div className="skel-page"><div className="skel" style={{ width: 240, height: 26 }} /><div className="skel" style={{ height: 200 }} /></div>;
  if (admin === false) return (
    <div className="agents-page scroll"><div className="ag-empty"><ShieldAlert size={28} />
      <div className="ag-empty-t">Admins only</div>
      <div className="ag-empty-s">The Test Center can exercise every part of the app, so it's restricted to admin accounts. Sign in as an admin to run it.</div>
    </div></div>
  );

  const tests = run ? Object.values(run.tests) : [];
  const byArea = (a) => tests.filter((t) => t.area === a);
  const counts = { pass: tests.filter((t) => t.status === "pass").length, fail: tests.filter((t) => t.status === "fail").length, skipped: tests.filter((t) => t.status === "skipped").length };
  const doneCount = counts.pass + counts.fail + counts.skipped;
  const issues = tests.filter((t) => t.status === "fail");
  const pct = run ? Math.round((doneCount / run.total) * 100) : 0;

  const StatusIco = ({ s }) =>
    s === "pass" ? <Check size={13} style={{ color: "var(--ok, #5fb573)" }} />
    : s === "fail" ? <X size={13} style={{ color: "#f08a86" }} />
    : s === "skipped" ? <SkipForward size={13} style={{ color: "var(--text-2)" }} />
    : s === "running" ? <Loader2 size={13} className="ag-spin" />
    : <CircleDashed size={13} style={{ color: "var(--text-2)" }} />;

  const lastEngine = hist[0];
  const fnFails = fnReport ? fnReport.results.filter((r) => r.status === "fail").length : 0;
  const openIssues = issues.length + fnFails;
  const ovCards = [
    { id: "engine", label: "Engine tests", icon: FlaskConical, good: lastEngine ? !lastEngine.fail : null,
      big: busy ? pct + "%" : lastEngine ? `${lastEngine.pass}/${lastEngine.total}` : "—",
      sub: busy ? "running now" : lastEngine ? new Date(lastEngine.at).toLocaleDateString() : "never run" },
    { id: "sweep", label: "UI sweep", icon: MousePointerClick, good: fnReport ? fnReport.fail === 0 : null,
      big: fnBusy ? "…" : fnReport ? Math.round((fnReport.pass / Math.max(1, fnReport.total)) * 100) + "%" : "—",
      sub: fnBusy ? "sweeping now" : fnReport ? new Date(fnReport.at).toLocaleDateString() : "never run" },
    { id: "library", label: "Scenario library", icon: Wrench, good: null,
      big: String(builtinList().length + customs.length), sub: `${customs.length} of yours` },
    { id: "history", label: "Open issues", icon: openIssues ? X : Check, good: openIssues === 0 && (lastEngine || fnReport) ? true : openIssues ? false : null,
      big: String(openIssues), sub: openIssues ? "needs attention" : "all clear" },
  ];

  return (
    <div className="agents-page scroll">
      <div className="ag-head">
        <div>
          <h2 className="ag-title"><FlaskConical size={20} /> Test Center</h2>
          <p className="ag-sub">Madav tests Madav. Two testers, one library, one history — run both daily, fix what turns red.</p>
        </div>
        <div className="ag-head-right">
          <button className="btn primary" disabled={busy} onClick={() => { setTab("engine"); start(); }}>{busy ? <><Loader2 size={14} className="ag-spin" /> {pct}%</> : <><Play size={14} /> Run engine cycle</>}</button>
          <button className="btn" disabled={fnBusy} onClick={() => { setTab("sweep"); startSweep(); }}>{fnBusy ? <><Loader2 size={14} className="ag-spin" /> Sweeping…</> : <><MousePointerClick size={14} /> Run UI sweep</>}</button>
        </div>
      </div>

      {/* Mission status — four cards, each a door into its tab */}
      <div className="qa-ov">
        {ovCards.map((c) => { const I = c.icon; return (
          <button key={c.id} className={`qa-ov-card ${c.good === true ? "good" : c.good === false ? "bad" : ""} ${tab === c.id ? "sel" : ""}`} onClick={() => setTab(c.id)}>
            <span className="qa-ov-ico"><I size={15} /></span>
            <span className="qa-ov-big">{c.big}</span>
            <span className="qa-ov-label">{c.label}</span>
            <span className="qa-ov-sub">{c.sub}</span>
          </button>
        ); })}
      </div>

      {/* Category tabs */}
      <div className="ags-tabs" style={{ marginTop: 4 }}>
        <button className={`ags-tab ${tab === "engine" ? "on" : ""}`} onClick={() => setTab("engine")}><FlaskConical size={13} /> Engine tests</button>
        <button className={`ags-tab ${tab === "sweep" ? "on" : ""}`} onClick={() => setTab("sweep")}><MousePointerClick size={13} /> UI sweep</button>
        <button className={`ags-tab ${tab === "library" ? "on" : ""}`} onClick={() => setTab("library")}><Wrench size={13} /> Scenario library</button>
        <button className={`ags-tab ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}><History size={13} /> History & issues</button>
        <button className={`ags-tab ${tab === "librarian" ? "on" : ""}`} onClick={() => setTab("librarian")}><BookOpen size={13} /> Sage Librarian</button>
      </div>

      {tab === "engine" && (<>
      {/* live progress strip */}
      {run && (
        <div className="qa-strip">
          <span className="qa-bar"><span style={{ width: pct + "%" }} /></span>
          <span className="qa-nums">
            <b style={{ color: "var(--ok, #5fb573)" }}>{counts.pass} pass</b>
            {counts.fail > 0 && <b style={{ color: "#f08a86" }}> · {counts.fail} fail</b>}
            {counts.skipped > 0 && <span> · {counts.skipped} skipped</span>}
            <span> · {doneCount}/{run.total}</span>
          </span>
        </div>
      )}

      {/* issues first — that's what the admin came for */}
      {issues.length > 0 && (
        <div className="qa-issues">
          <div className="qa-issues-h"><X size={14} /> Issues found ({issues.length})</div>
          {issues.map((t) => { const rp = repairs[t.id] || {}; const p = rp.proposal; const tr = translateError(t.error); return (
            <div key={t.id} className="qa-issue">
              <div className="qa-issue-name">{t.name} <span className="qa-issue-area">{t.area}</span></div>
              <div className="qa-plain"><b>{tr.plain}</b> {tr.fix}</div>
              {tr.nav && onNavigate && <button className="btn ghost qa-fixbtn" onClick={() => onNavigate(tr.nav.target)}>→ {tr.nav.label}</button>}
              <details className="qa-raw"><summary>Technical detail</summary><div className="qa-issue-err">{t.error}</div></details>

              {/* Repair Bay — diagnose autonomously, apply ONLY with the admin's approval */}
              {!rp.state && <button className="btn ghost qa-fixbtn" onClick={() => diagnoseIssue(t)}><Wrench size={12} /> Diagnose &amp; propose fix</button>}
              {rp.state === "diagnosing" && <div className="qa-fixline"><Loader2 size={13} className="ag-spin" /> Repair agent is reading the error and the code…</div>}
              {rp.state === "error" && <div className="qa-fixline" style={{ color: "#f08a86" }}>{rp.error} <button className="btn ghost qa-fixbtn" onClick={() => diagnoseIssue(t)}>Retry</button></div>}

              {(rp.state === "proposed" || rp.state === "applying" || rp.state === "applied") && p && (
                <div className="qa-fixcard">
                  <div className="qa-fixdiag">{p.diagnosis}</div>
                  {p.fixable ? (
                    <>
                      <div className="qa-fixmeta">Proposed change in <b>{p.file}</b> · confidence: <b>{p.confidence}</b>{p.restartRequired ? " · app restart needed after applying" : ""}</div>
                      <div className="qa-fixdiff">
                        <pre className="qa-del">− {p.find}</pre>
                        <pre className="qa-add">+ {p.replace}</pre>
                      </div>
                      <div className="qa-fixacts">
                        {rp.state === "proposed" && <>
                          <button className="btn primary" onClick={() => approveFix(t)}><Check size={13} /> Approve &amp; apply</button>
                          <button className="btn ghost" onClick={() => setRepair(t.id, { state: null, proposal: null })}>Dismiss</button>
                        </>}
                        {rp.state === "applying" && <span className="qa-fixline"><Loader2 size={13} className="ag-spin" /> Applying (backup first)…</span>}
                        {rp.state === "applied" && <>
                          <span className="qa-fixline" style={{ color: "var(--ok, #5fb573)" }}><Check size={13} /> Applied — backup saved. Re-run the cycle to verify{p.restartRequired ? " (restart the app first)" : ""}.</span>
                          <button className="btn ghost" onClick={() => undoFix(t)}><Undo2 size={12} /> Roll back</button>
                        </>}
                      </div>
                    </>
                  ) : (
                    <div className="qa-fixmeta">{p.patchInvalid ? `The agent proposed a patch but it didn't validate (${p.patchInvalid}) — treat this as diagnosis only.` : "Not auto-fixable — likely environmental (provider, key, server). Follow the diagnosis above."}</div>
                  )}
                </div>
              )}
            </div>
          ); })}
        </div>
      )}
      {run && run.done && issues.length === 0 && (
        <div className="qa-clear"><Check size={15} /> All clear — {counts.pass} tests passed{counts.skipped ? ` (${counts.skipped} skipped — not configured)` : ""}. Ship it.</div>
      )}

      {/* the board */}
      <div className="qa-board">
        {AREAS.map((a) => {
          const list = byArea(a);
          return (
            <div key={a} className="qa-area">
              <div className="qa-area-h">{a}<span className="qa-area-sub">{AREA_BLURB[a]}</span></div>
              {!run && <div className="ag-hint" style={{ margin: 0 }}>Waiting for a run…</div>}
              {list.map((t) => (
                <div key={t.id} className={`qa-row ${t.status}`}>
                  <StatusIco s={t.status} />
                  <span className="qa-row-name">{t.name}</span>
                  {t.ms != null && <span className="qa-row-ms">{t.ms < 1000 ? t.ms + "ms" : (t.ms / 1000).toFixed(1) + "s"}</span>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      </>)}

      {/* ===== Functional UI Sweep — drives the real interface, area by area ===== */}
      {tab === "sweep" && (
      <div className="qa-fn">
        <p className="ag-sub" style={{ margin: "2px 0 12px" }}>A driver pilots the REAL interface — clicks tabs, types in the composer, pastes an image, opens every area — and checks what a user would see. The app navigates itself during a run; don't fight the mouse.</p>

        {fnReport && (() => {
          const areas = [...new Set(fnReport.results.map((r) => r.area))];
          const fails = fnReport.results.filter((r) => r.status === "fail");
          return (
            <>
              {/* visual verdict */}
              <div className="qa-fn-verdict">
                <div className={`qa-fn-big ${fnReport.fail ? "bad" : "good"}`}>
                  <span className="qa-fn-pct">{Math.round((fnReport.pass / Math.max(1, fnReport.total)) * 100)}%</span>
                  <span className="qa-fn-sub">{fnReport.pass}/{fnReport.total} checks passed{fnReport.skip ? ` · ${fnReport.skip} skipped` : ""}</span>
                  <span className="qa-fn-when">{new Date(fnReport.at).toLocaleString()}</span>
                </div>
                <div className="qa-fn-areas">
                  {areas.map((a) => {
                    const list = fnReport.results.filter((r) => r.area === a);
                    const p = list.filter((r) => r.status === "pass").length;
                    const f = list.filter((r) => r.status === "fail").length;
                    return (
                      <button key={a} className={`qa-fn-area ${f ? "bad" : "good"} ${fnArea === a ? "sel" : ""}`} title="Click to focus this area's checks" onClick={() => setFnArea(fnArea === a ? null : a)}>
                        <div className="qa-fn-area-h">{f ? <X size={12} /> : <Check size={12} />} {a}</div>
                        <div className="qa-bar sm"><span style={{ width: Math.round((p / Math.max(1, list.length)) * 100) + "%" }} /></div>
                        <div className="qa-fn-area-n">{p}/{list.length} · click for details</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Every check, scenario by scenario, grouped by topic (click a card above to focus one) */}
              <div className="qa-fn-detail">
                {(fnArea ? [fnArea] : areas).map((a) => (
                  <div key={a} className="qa-area" style={{ marginTop: 12 }}>
                    <div className="qa-area-h">{a} <span className="qa-area-sub">{fnReport.results.filter((r) => r.area === a).length} scenario{fnReport.results.filter((r) => r.area === a).length === 1 ? "" : "s"} tested</span></div>
                    {fnReport.results.filter((r) => r.area === a).map((r, i) => (
                      <div key={i} className={`qa-row ${r.status === "fail" ? "fail" : ""}`}>
                        {r.status === "pass" ? <Check size={13} style={{ color: "var(--ok, #5fb573)" }} />
                          : r.status === "fail" ? <X size={13} style={{ color: "#f08a86" }} />
                          : <SkipForward size={13} style={{ color: "var(--text-2)" }} />}
                        <span className="qa-row-name" title={r.name}>{r.name}{r.status === "skip" && r.note ? <span style={{ color: "var(--text-2)" }}> — {r.note}</span> : ""}</span>
                        {r.ms != null && <span className="qa-row-ms">{r.ms < 1000 ? r.ms + "ms" : (r.ms / 1000).toFixed(1) + "s"}</span>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {fails.length > 0 && (
                <div className="qa-issues" style={{ marginTop: 12 }}>
                  <div className="qa-issues-h"><X size={14} /> UI checks that failed ({fails.length})</div>
                  {fails.map((r, i) => { const tr = translateError(r.note); return (
                    <div key={i} className="qa-issue">
                      <div className="qa-issue-name">{r.name} <span className="qa-issue-area">{r.area}</span></div>
                      <div className="qa-plain"><b>{tr.plain}</b> {tr.fix}</div>
                      {tr.nav && onNavigate && <button className="btn ghost qa-fixbtn" onClick={() => onNavigate(tr.nav.target)}>→ {tr.nav.label}</button>}
                      <details className="qa-raw"><summary>Technical detail</summary><div className="qa-issue-err">{r.note}</div></details>
                    </div>
                  ); })}
                </div>
              )}
              {fnReport.results.some((r) => r.status === "skip") && (
                <p className="ag-hint" style={{ marginTop: 8 }}>Skipped = honest gaps, not failures: {fnReport.results.filter((r) => r.status === "skip").map((r) => r.note).join("; ")}</p>
              )}
            </>
          );
        })()}
        {!fnReport && <p className="ag-hint">No sweep yet — run one with the button above. The window will drive itself for about a minute.</p>}
      </div>
      )}

      {/* ===== Scenario Library: grow the test suite without code ===== */}
      {tab === "library" && (
          <div className="qa-lib">
            <p className="ag-sub" style={{ margin: "0 0 10px" }}>
              As features grow, grow the tests here: describe what to check in plain English, the AI drafts the steps, you review and save. Your scenarios run in every sweep alongside the built-ins. Built-ins can be switched off if a feature changes.
            </p>

            {/* add new — AI-drafted, human-reviewed */}
            {!draft ? (
              <button className="btn primary" onClick={() => setDraft({ area: "Let's Chat", desc: "", steps: null, name: "", busy: false, err: "" })}><Play size={13} /> Add a scenario</button>
            ) : (
              <div className="qa-fixcard">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select className="model-search" style={{ width: "auto", marginBottom: 0, padding: "7px 10px" }} value={draft.area} onChange={(e) => setDraft((d) => ({ ...d, area: e.target.value }))}>
                    {["Let's Chat", "Let's Collaborate", "Let's Build", "Projects", "Agents", "Studio", "Scheduler", "Interface", "Models", "Consumption", "Custom"].map((a) => <option key={a}>{a}</option>)}
                  </select>
                  <input className="model-search" style={{ flex: 1, minWidth: 220, marginBottom: 0 }} placeholder='Describe the check, e.g. "pasting two images shows two previews"'
                    value={draft.desc} onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") aiDraft(); }} />
                  <button className="btn" disabled={draft.busy || !draft.desc.trim()} onClick={aiDraft}>{draft.busy ? <Loader2 size={13} className="ag-spin" /> : "Draft steps with AI"}</button>
                </div>
                {draft.err && <div className="ag-err" style={{ marginTop: 8 }}>{draft.err}</div>}
                {draft.steps && (
                  <>
                    <div className="qa-fixmeta" style={{ marginTop: 10 }}>{draft.editingId ? "Editing" : "Draft"}: <b>{draft.name}</b> — review the steps (edit any field), simulate, then save:</div>
                    {draft.steps.map((st, i) => (
                      <div key={i} className="qa-step">
                        <select value={st.do} onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, do: e.target.value } : x))}>
                          {STEP_DOCS.map((sd) => <option key={sd.do} value={sd.do}>{sd.do}</option>)}
                        </select>
                        <input placeholder="target (text / label)" value={st.target || ""} onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, target: e.target.value } : x))} />
                        <input placeholder="value" style={{ width: 110 }} value={st.value || ""} onChange={(e) => setSteps((s) => s.map((x, idx) => idx === i ? { ...x, value: e.target.value } : x))} />
                        <button className="btn ghost ag-del" onClick={() => setSteps((s) => s.filter((_, x) => x !== i))}><X size={11} /></button>
                      </div>
                    ))}

                    {/* Simulate the scenario live, then require an explicit admin confirmation before it joins the suite */}
                    {draft.sim && (
                      <div className={`qa-simres ${draft.sim.ok ? "ok" : "bad"}`}>
                        {draft.sim.ok ? <Check size={13} /> : <X size={13} />}
                        <span>{draft.sim.ok ? `Simulation passed (${draft.sim.ms} ms) — the window ran every step successfully.` : `Simulation failed: ${draft.sim.note}`}</span>
                      </div>
                    )}
                    <label className="qa-confirm">
                      <input type="checkbox" checked={!!draft.confirm} onChange={(e) => setDraft((d) => ({ ...d, confirm: e.target.checked }))} />
                      I've reviewed {draft.sim && draft.sim.ok ? "and simulated " : ""}this scenario and want to add it to the suite.
                    </label>

                    <div className="qa-fixacts">
                      <button className="btn" disabled={draft.simBusy} onClick={simulateDraft}>{draft.simBusy ? <Loader2 size={13} className="ag-spin" /> : <Play size={13} />} {draft.simBusy ? "Simulating…" : "Simulate now"}</button>
                      <button className="btn primary" disabled={!draft.confirm} title={!draft.confirm ? "Tick the confirmation box first" : ""} onClick={saveDraftScenario}><Check size={13} /> {draft.editingId ? "Save changes" : "Add scenario"}</button>
                      <button className="btn ghost" onClick={() => setSteps((s) => [...s, { do: "expect", target: "" }])}>+ step</button>
                      <button className="btn ghost" onClick={() => setDraft(null)}>Cancel</button>
                    </div>
                    <div className="ag-hint" style={{ margin: "6px 0 0" }}>Tip: Simulate drives the real UI through your steps so you catch a bad selector before it ever runs in a sweep.</div>
                  </>
                )}
              </div>
            )}

            {/* your scenarios */}
            {customs.length > 0 && (
              <div className="qa-area" style={{ marginTop: 12 }}>
                <div className="qa-area-h">Your scenarios <span className="qa-area-sub">run in this order every sweep — reorder, edit, or toggle off</span></div>
                {customs.map((c, i) => (
                  <div key={c.id} className="qa-row">
                    <span className="qa-seq">{i + 1}</span>
                    <input type="checkbox" className="mo-cmpck" checked={c.enabled !== false} onChange={() => persistCustoms(customs.map((x) => x.id === c.id ? { ...x, enabled: x.enabled === false } : x))} />
                    <span className="qa-row-name">{c.name} <span className="qa-issue-area">{c.area}</span></span>
                    <span className="qa-row-ms">{c.steps.length} steps{c.lastSim ? (c.lastSim.ok ? " · ✓ simulated" : " · ✗ last sim failed") : ""}</span>
                    <button className="btn ghost" title="Move up" disabled={i === 0} onClick={() => moveScenario(i, -1)} style={{ padding: "3px 6px" }}><ChevronUp size={13} /></button>
                    <button className="btn ghost" title="Move down" disabled={i === customs.length - 1} onClick={() => moveScenario(i, 1)} style={{ padding: "3px 6px" }}><ChevronDown size={13} /></button>
                    <button className="btn ghost" title="Edit" onClick={() => editScenario(c)} style={{ padding: "3px 6px" }}><Pencil size={12} /></button>
                    <button className="btn ghost ag-del" title="Delete" onClick={() => persistCustoms(customs.filter((x) => x.id !== c.id))}><X size={11} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* built-ins (toggle off when a feature intentionally changes) */}
            <div className="qa-area" style={{ marginTop: 12 }}>
              <div className="qa-area-h">Built-in scenarios <span className="qa-area-sub">untick one if a feature changed on purpose and the check no longer applies</span></div>
              {builtinList().map((b) => (
                <div key={b.id} className="qa-row">
                  <input type="checkbox" className="mo-cmpck" checked={!disabled.has(b.id)} onChange={() => toggleBuiltin(b.id)} />
                  <span className="qa-row-name">{b.name} <span className="qa-issue-area">{b.area}</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* ===== History & issues — daily cycles, compared ===== */}
      {tab === "history" && (<>
        {openIssues > 0 && <p className="ag-sub" style={{ margin: "2px 0 10px" }}>{issues.length ? `${issues.length} engine issue${issues.length === 1 ? "" : "s"} (see Engine tests tab)` : ""}{issues.length && fnFails ? " · " : ""}{fnFails ? `${fnFails} UI check${fnFails === 1 ? "" : "s"} failing (see UI sweep tab)` : ""}</p>}
        {hist.length > 0 ? (
          <div className="qa-hist" style={{ marginTop: 0 }}>
            <div className="qa-area-h"><History size={14} /> Past engine runs</div>
            {hist.slice(0, 10).map((h, i) => (
              <div key={i} className="qa-hist-row">
                <span>{new Date(h.at).toLocaleString()}</span>
                <span className="qa-bar sm"><span style={{ width: Math.round((h.pass / Math.max(1, h.total)) * 100) + "%" }} /></span>
                <span className="qa-nums"><b style={{ color: h.fail ? "#f08a86" : "var(--ok, #5fb573)" }}>{h.pass}/{h.total}</b>{h.fail ? ` · ${h.fail} failed` : " · clean"}</span>
              </div>
            ))}
          </div>
        ) : <p className="ag-hint">No runs yet — history builds as you run daily cycles.</p>}
        <p className="ag-hint">Tip: run both testers every morning before you touch anything — a red row today that was green yesterday is a regression with a timestamp.</p>
      </>)}

      {/* ===== Sage Librarian — knowledge drift sweep with admin approval ===== */}
      {tab === "librarian" && <LibrarianPanel />}
    </div>
  );
}
