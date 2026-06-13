// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Activity & spend — observability panel over the local run-trace store. Shows cost/latency/
// error-rate, per-model breakdown, and a recent-runs list with an expandable tool timeline.
// Self-contained and additive; reuses existing CSS classes (no styles.css changes). Degrades
// gracefully on the web build, where the desktop trace store isn't present.
import { useEffect, useState } from "react";
import { bridge } from "../bridge/index.js";

const fmtUSD = (n) => "$" + Number(n || 0).toFixed(Number(n) < 1 ? 4 : 2);
const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms || 0) + "ms");
const fmtTime = (t) => { try { return new Date(t).toLocaleString(); } catch { return ""; } };

export default function Activity() {
  const [days, setDays] = useState(30);
  const [sum, setSum] = useState(null);
  const [runs, setRuns] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);
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

  if (!supported) {
    return (
      <div className="settings scroll" style={{ padding: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Activity</h2>
        <p style={{ color: "var(--text-2)", fontSize: 13 }}>
          Run tracing records local agent runs and is available in the desktop app. It isn't available in the web build.
        </p>
      </div>
    );
  }

  const s = sum || {};
  const cards = [
    ["Spend", fmtUSD(s.costUSD), `${s.runs || 0} runs`],
    ["Error rate", ((s.errorRate || 0) * 100).toFixed(1) + "%", `${s.errors || 0} failed`],
    ["Latency p50", fmtMs(s.latencyP50 || 0), "per run"],
    ["Latency p99", fmtMs(s.latencyP99 || 0), "per run"],
    ["Saved on local", fmtUSD(s.localSavedUSD), "vs cloud price"],
    ["Tokens", (s.tokens || 0).toLocaleString(), "estimated"],
  ];

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Activity &amp; spend</h2>
        <select className="cdir-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Last 24h</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={0}>All time</option>
        </select>
        <button className="btn ghost" onClick={() => bridge.testAlert && bridge.testAlert()}>Test alert</button>
        <button className="btn ghost danger" onClick={() => { if (bridge.clearTraces) bridge.clearTraces().then(load); }}>Clear</button>
      </div>
      <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 4 }}>
        Every agent run, recorded locally — tools, durations, tokens, cost, and errors. Cost is estimated from token
        counts and your pricing map (Settings); local models are counted as $0.
      </p>

      {loading ? <div className="cdir-msg">Loading…</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 10, margin: "10px 0 18px" }}>
            {cards.map(([k, v, sub]) => (
              <div key={k} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px", background: "var(--bg-1)" }}>
                <div style={{ fontSize: 11.5, color: "var(--text-2)" }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 650, marginTop: 2 }}>{v}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>{sub}</div>
              </div>
            ))}
          </div>

          {(s.models || []).length > 0 && (
            <div className="conn-sec">
              <div className="conn-sec-h">By model</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--text-2)", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px" }}>Model</th><th>Runs</th><th>Cost</th><th>Tokens</th><th>p50</th><th>p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.models.map((m) => (
                      <tr key={m.model} style={{ borderTop: "1px solid var(--line)" }}>
                        <td style={{ padding: "6px 8px" }}>{m.model}</td>
                        <td>{m.runs}</td><td>{fmtUSD(m.cost)}</td><td>{(m.tokens || 0).toLocaleString()}</td>
                        <td>{fmtMs(m.p50 || 0)}</td><td>{fmtMs(m.p99 || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="conn-sec">
            <div className="conn-sec-h">Recent runs <span className="conn-count">{runs.length}</span></div>
            {runs.length === 0 ? (
              <div className="cdir-msg">No runs recorded yet. Use Chat / Cowork / Code and they'll appear here.</div>
            ) : (
              <div>
                {runs.map((r) => (
                  <div key={r.id} style={{ border: "1px solid var(--line)", borderRadius: 10, marginBottom: 8, overflow: "hidden" }}>
                    <button onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      style={{ width: "100%", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 50, flex: "0 0 auto", background: r.status === "error" ? "var(--danger)" : r.status === "ok" ? "var(--ok)" : "var(--text-2)" }} />
                      <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                        <b style={{ fontSize: 13 }}>{r.mode} · {r.model || "—"}</b>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--text-2)" }}>
                          {fmtTime(r.endedAt || r.startedAt)} · {(r.steps || []).length} tools · {fmtMs(r.durationMs || 0)} · {fmtUSD(r.costUSD)}{r.local ? " · local" : ""}
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: r.status === "error" ? "var(--danger)" : "var(--text-2)" }}>{r.status}</span>
                    </button>
                    {openId === r.id && (
                      <div style={{ padding: "4px 12px 12px", borderTop: "1px solid var(--line)" }}>
                        {r.error && <div style={{ color: "var(--danger)", fontSize: 12.5, margin: "8px 0" }}>{r.error}</div>}
                        {(r.steps || []).map((st, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                            <span style={{ color: st.ok === false ? "var(--danger)" : "var(--text-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{st.name}</span>
                            <span style={{ color: "var(--text-2)", flex: "0 0 auto" }}>{fmtMs(st.durationMs || 0)}</span>
                          </div>
                        ))}
                        {(r.steps || []).length === 0 && <div style={{ fontSize: 12, color: "var(--text-2)", paddingTop: 6 }}>No tool calls.</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
