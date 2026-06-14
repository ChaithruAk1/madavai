// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Activity & spend — observability over the local run-trace store. Embeds at the bottom of the
// Consumption page (embedded=true) in a matching cons-panel, or renders standalone. Shows
// cost/latency/error metrics (each with a hover tooltip), a recent-runs list filterable by
// source category. Each run: click → opens its chat; a caret expands the tool timeline; × hides
// it. Degrades gracefully on web. No styles.css changes (reuses existing classes + inline).
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge } from "../bridge/index.js";

const fmtUSD = (n) => "$" + Number(n || 0).toFixed(Number(n) < 1 ? 4 : 2);
const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms || 0) + "ms");
const fmtTime = (t) => { try { return new Date(t).toLocaleString(); } catch { return ""; } };
const HIDE_KEY = "madav.tracesHidden";

// Friendly source category — falls back to the run mode so runs recorded before categories shipped still group sensibly.
const CAT = { chat: "Let's Chat", cowork: "Let's Collaborate", code: "Let's Build", project: "Projects", team: "Agents" };
const catOf = (r) => r.category || CAT[r.mode] || (r.mode ? r.mode[0].toUpperCase() + r.mode.slice(1) : "Other");

const CARD_HELP = {
  "Spend": "Estimated cost of your runs in this range — token counts × your pricing map. Local models count as $0.",
  "Error rate": "Share of runs that ended in an error (and how many failed).",
  "Latency p50": "Median run time — half of your runs finished faster than this.",
  "Latency p99": "Tail latency — only 1% of your runs were slower than this.",
  "Saved on local": "What your local-model runs would have cost at cloud prices — i.e. money saved by running locally.",
};

export default function Activity({ embedded = false, days: daysProp, onOpenSession, onNavigate }) {
  const [daysLocal, setDaysLocal] = useState(30);
  const days = daysProp != null ? daysProp : daysLocal;
  const [sum, setSum] = useState(null);
  const [runs, setRuns] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [cat, setCat] = useState("All");
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [hidden, setHidden] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(HIDE_KEY) || "[]")); } catch { return new Set(); } });
  const supported = !!(bridge.getTraceSummary && bridge.getTraces);

  const load = () => {
    if (!supported) { setLoading(false); return; }
    setLoading(true);
    Promise.all([bridge.getTraceSummary(days), bridge.getTraces(200)])
      .then(([s, r]) => { setSum(s || null); setRuns(Array.isArray(r) ? r : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  const hide = (id) => { const n = new Set(hidden); n.add(id); setHidden(n); try { localStorage.setItem(HIDE_KEY, JSON.stringify([...n])); } catch {} };
  const unhideAll = () => { setHidden(new Set()); try { localStorage.removeItem(HIDE_KEY); } catch {} };
  const openChat = (run) => { if (onOpenSession && run.sessionId) onOpenSession(run.sessionId); else if (onNavigate) onNavigate(run.mode === "project" ? "project" : run.mode === "team" ? "agents" : "chat"); };
  const testAlert = () => {
    let ok = false; try { ok = !!(bridge.testAlert && bridge.testAlert()); } catch {}
    setMsg("Test alert sent — check your system notifications (allow notifications if your browser/OS asks).");
    setTimeout(() => setMsg(""), 5000);
  };

  const wrapCls = embedded ? "cons-panel" : "";
  const wrapStyle = embedded ? { marginTop: 16 } : { padding: 24 };

  if (!supported) {
    return (
      <div className={wrapCls} style={wrapStyle}>
        <div className="cons-panel-h">Activity &amp; spend</div>
        <p style={{ color: "var(--text-2)", fontSize: 13 }}>Run tracing records local agent runs; it's available in the desktop app.</p>
      </div>
    );
  }

  const s = sum || {};
  const visible = runs.filter((r) => !hidden.has(r.id) && (cat === "All" || catOf(r) === cat));
  const cats = ["All", ...Array.from(new Set(runs.filter((r) => !hidden.has(r.id)).map(catOf)))];
  const cards = [
    ["Spend", fmtUSD(s.costUSD), `${s.runs || 0} runs`],
    ["Error rate", ((s.errorRate || 0) * 100).toFixed(1) + "%", `${s.errors || 0} failed`],
    ["Latency p50", fmtMs(s.latencyP50 || 0), "per run"],
    ["Latency p99", fmtMs(s.latencyP99 || 0), "per run"],
    ["Saved on local", fmtUSD(s.localSavedUSD), "vs cloud price"],
  ];

  return (
    <div className={wrapCls} style={wrapStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Show" : "Hide"}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-0)", display: "inline-flex", alignItems: "center", gap: 6, font: "inherit", fontSize: 15, fontWeight: 650, padding: 0 }}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />} Activity &amp; spend
        </button>
        <HelpDot mode="consumption" section="activity" />
        <span style={{ flex: 1 }} />
        {!embedded && (
          <select className="cdir-select" value={days} onChange={(e) => setDaysLocal(Number(e.target.value))}>
            <option value={1}>24h</option><option value={7}>7d</option><option value={30}>30d</option><option value={0}>All</option>
          </select>
        )}
        {hidden.size > 0 && <button className="btn ghost" onClick={unhideAll}>Unhide ({hidden.size})</button>}
        <button className="btn ghost" onClick={testAlert}>Test alert</button>
        <button className="btn ghost danger" onClick={() => { if (bridge.clearTraces) bridge.clearTraces().then(load); }}>Clear</button>
      </div>

      {msg && <div className="cdir-msg" style={{ marginTop: 8 }}>{msg}</div>}

      {!collapsed && (loading ? <div className="cdir-msg" style={{ marginTop: 10 }}>Loading…</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, margin: "12px 0 16px" }}>
          {cards.map(([k, v, sub]) => (
            <div key={k} title={CARD_HELP[k] || ""} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", background: "var(--bg-1)", cursor: "help" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{k}</div>
              <div style={{ fontSize: 20, fontWeight: 650, marginTop: 2 }}>{v}</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* Source category filter */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              style={{ fontSize: 12, padding: "4px 11px", borderRadius: 999, cursor: "pointer",
                border: "1px solid " + (cat === c ? "var(--accent-line)" : "var(--line)"),
                background: cat === c ? "var(--accent-weak)" : "transparent", color: cat === c ? "var(--text-0)" : "var(--text-2)" }}>
              {c}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="cdir-msg">No runs{cat !== "All" ? ` in ${cat}` : ""} yet. Use Chat / Collaborate / Build and they'll appear here.</div>
        ) : (
          <div>
            {visible.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 10px" }}>
                  <button onClick={(e) => { e.stopPropagation(); setOpenId(openId === r.id ? null : r.id); }} title="Tool timeline"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 2, display: "inline-flex" }}>
                    {openId === r.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <span style={{ width: 8, height: 8, borderRadius: 50, flex: "0 0 auto", background: r.status === "error" ? "var(--danger)" : r.status === "ok" ? "var(--ok)" : "var(--text-2)" }} />
                  <button onClick={() => openChat(r)} title="Open this chat"
                    style={{ flex: 1, textAlign: "left", minWidth: 0, background: "transparent", border: "none", cursor: "pointer", color: "inherit", padding: 0 }}>
                    <b style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, background: "var(--bg-2)", color: "var(--text-2)", fontWeight: 600 }}>{catOf(r)}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.model || "—"}</span>
                    </b>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-2)", marginTop: 1 }}>
                      {fmtTime(r.endedAt || r.startedAt)} · {(r.steps || []).length} tools · {fmtMs(r.durationMs || 0)} · {fmtUSD(r.costUSD)}{r.local ? " · local" : ""}
                    </span>
                  </button>
                  <span style={{ fontSize: 11, color: r.status === "error" ? "var(--danger)" : "var(--text-2)" }}>{r.status}</span>
                  <button onClick={(e) => { e.stopPropagation(); hide(r.id); }} title="Hide this run"
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-2)", padding: 2, display: "inline-flex" }}>
                    <X size={14} />
                  </button>
                </div>
                {openId === r.id && (
                  <div style={{ padding: "4px 12px 12px", borderTop: "1px solid var(--line)" }}>
                    {r.error && <div style={{ color: "var(--danger)", fontSize: 12.5, margin: "8px 0" }}>{r.error}</div>}
                    {(r.steps || []).map((st, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                        <span style={{ color: st.ok === false ? "var(--danger)" : "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</span>
                        <span style={{ color: "var(--text-2)", flex: "0 0 auto" }}>{fmtMs(st.durationMs || 0)}</span>
                      </div>
                    ))}
                    {(r.steps || []).length === 0 && <div style={{ fontSize: 12, color: "var(--text-2)", paddingTop: 6 }}>No tool calls. Click the title to open this chat.</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </>)}
    </div>
  );
}
