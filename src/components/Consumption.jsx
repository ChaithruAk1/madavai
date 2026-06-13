import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Hash, Layers, CalendarDays, Flame, Clock, Cpu, Award, TrendingUp, DollarSign } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import { bridge } from "../bridge/index.js";

const RANGES = [{ label: "7 days", days: 7 }, { label: "30 days", days: 30 }, { label: "All time", days: 0 }];
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n || 0)));
const shortModel = (s) => { const x = String(s || ""); const i = x.lastIndexOf("/"); return i >= 0 ? x.slice(i + 1) : x; };
const DONUT_COLORS = ["#13c2d6", "#6e7bff", "#22a06b", "#e8893a", "#d6597b", "#b88cff", "#2b8fd6", "#e0433f"];

export default function Consumption() {
  const [days, setDays] = useState(7);
  const [d, setD] = useState(null);
  const [prices, setPrices] = useState(null); // model id -> { prompt, completion } USD per token (OpenRouter catalog)
  useEffect(() => { let live = true; bridge.getUsage(days).then((x) => { if (live) setD(x); }); return () => { live = false; }; }, [days]);
  useEffect(() => { let live = true; bridge.getOpenRouterCatalog?.().then((c) => { if (live) setPrices(c || {}); }).catch(() => {}); return () => { live = false; }; }, []);

  // Estimated spend: tokens × blended per-token price for models we have real pricing on.
  // Honest about coverage — models without published pricing (local, NIM, unknown) are excluded.
  const spend = useMemo(() => {
    if (!d || !prices) return null;
    let usd = 0, covered = 0, total = 0;
    for (const m of d.models || []) {
      total += m.tokens || 0;
      const p = prices[m.model] || prices[(m.model || "").toLowerCase()];
      const pr = p && p.pricing ? p.pricing : p;
      const inP = pr && Number(pr.prompt), outP = pr && Number(pr.completion);
      if (pr && (inP > 0 || outP > 0)) { usd += (m.tokens || 0) * (((inP > 0 ? inP : 0) + (outP > 0 ? outP : 0)) / 2); covered += m.tokens || 0; }
    }
    return { usd, pct: total ? Math.round((covered / total) * 100) : 0 };
  }, [d, prices]);

  if (!d) return (
    <div className="skel-page">
      <div className="skel" style={{ width: 220, height: 26 }} />
      <div className="skel-row">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ flex: 1, height: 86 }} />)}</div>
      <div className="skel" style={{ height: 220 }} />
      <div className="skel-row"><div className="skel" style={{ flex: 2, height: 180 }} /><div className="skel" style={{ flex: 1, height: 180 }} /></div>
    </div>
  );

  const cards = [
    { k: "Messages", v: fmt(d.messages), icon: MessageSquare, accent: true },
    { k: "Tokens (est.)", v: fmt(d.tokens), icon: Hash },
    ...(spend && spend.pct > 0 ? [{ k: `Est. spend (${spend.pct}% priced)`, v: "$" + (spend.usd < 0.01 && spend.usd > 0 ? spend.usd.toFixed(4) : spend.usd.toFixed(2)), icon: DollarSign }] : []),
    { k: "Sessions", v: fmt(d.sessions), icon: Layers },
    { k: "Active days", v: fmt(d.activeDays), icon: CalendarDays },
    { k: "Current streak", v: d.currentStreak + "d", icon: Flame, accent: true },
  ];
  const empty = !d.messages && !d.sessions;

  return (
    <div className="cons scroll">
      <div className="cons-head">
        <div>
          <h2>Consumption<HelpDot mode="consumption" section="spend" /></h2>
          <div className="cons-sub">Your activity and model usage at a glance.</div>
        </div>
        <div className="seg">
          {RANGES.map((r) => <button key={r.label} className={`seg-btn ${days === r.days ? "active" : ""}`} onClick={() => setDays(r.days)}>{r.label}</button>)}
        </div>
      </div>

      {empty ? (
        <div className="cons-empty">No activity yet — send a few messages and come back to see your dashboard.</div>
      ) : (
        <>
          <div className="cons-kpis">
            {cards.map((c) => { const I = c.icon; return (
              <div className={`cons-kpi ${c.accent ? "accent" : ""}`} key={c.k}>
                <div className="cons-kpi-ico"><I size={16} /></div>
                <div className="cons-kpi-v">{c.v}</div>
                <div className="cons-kpi-k">{c.k}</div>
              </div>
            ); })}
          </div>

          {/* On wide windows these sit side by side (cons-wide2); on narrow they stack. */}
          <div className="cons-wide2">
            <div className="cons-panel">
              <div className="cons-panel-h"><TrendingUp size={14} /> Activity over time <span className="cons-panel-sub">tokens per day</span><HelpDot mode="consumption" section="tokens" /></div>
              <AreaChart byDay={d.byDay} days={days} />
            </div>
            <div className="cons-panel">
              <div className="cons-panel-h"><CalendarDays size={14} /> Daily activity <span className="cons-panel-sub">last 14 weeks</span></div>
              <Heatmap byDay={d.byDay} />
            </div>
          </div>

          <div className="cons-2col">
            <div className="cons-panel">
              <div className="cons-panel-h"><Cpu size={14} /> Tokens by model<HelpDot mode="consumption" section="share" /></div>
              <ModelDonut models={d.models} />
            </div>
            <div className="cons-panel">
              <div className="cons-panel-h"><Award size={14} /> Highlights</div>
              <div className="cons-highlights">
                <Highlight icon={Cpu} label="Top model" value={shortModel(d.favoriteModel)} />
                <Highlight icon={Clock} label="Peak hour" value={d.peakHour} />
                <Highlight icon={Flame} label="Longest streak" value={d.longestStreak + " days"} />
                <Highlight icon={MessageSquare} label="Avg / session" value={d.sessions ? Math.round(d.messages / d.sessions) + " msg" : "—"} />
              </div>
              <ModelBars models={d.models} />
            </div>
          </div>

          <p className="cons-foot">Tokens are estimated from text length (~4 chars/token); not every provider reports exact usage.</p>
        </>
      )}
    </div>
  );
}

function Highlight({ icon: I, label, value }) {
  return <div className="cons-hl"><div className="cons-hl-ico"><I size={14} /></div><div><div className="cons-hl-v">{value}</div><div className="cons-hl-k">{label}</div></div></div>;
}

// ---- Activity area chart (interactive hover) ----
function AreaChart({ byDay, days }) {
  const [hover, setHover] = useState(null);
  const series = useMemo(() => {
    const n = days || 30;
    const out = [];
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
    for (let i = n - 1; i >= 0; i--) { const dt = new Date(today); dt.setDate(dt.getDate() - i); const k = dt.toISOString().slice(0, 10); out.push({ k, v: byDay[k] || 0 }); }
    return out;
  }, [byDay, days]);
  const W = 720, H = 180, pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...series.map((s) => s.v));
  const x = (i) => pad.l + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(series.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${x(0).toFixed(1)},${(pad.t + ih).toFixed(1)} Z`;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = 1e9; series.forEach((s, i) => { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  return (
    <div className="cons-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ width: "100%", height: H }}>
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} stroke="var(--line)" strokeWidth="1" />)}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {hover != null && <>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--accent-line)" strokeWidth="1" />
          <circle cx={x(hover)} cy={y(series[hover].v)} r="3.5" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="1.5" />
        </>}
      </svg>
      {hover != null && (
        <div className="cons-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{fmt(series[hover].v)}</b> tokens<span>{new Date(series[hover].k + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}

// ---- GitHub-style contribution heatmap ----
function Heatmap({ byDay }) {
  const weeks = 14;
  const cells = useMemo(() => {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");
    const start = new Date(today); start.setDate(start.getDate() - (weeks * 7 - 1));
    // align start to Sunday
    start.setDate(start.getDate() - start.getDay());
    const arr = []; const cur = new Date(start);
    let max = 1; for (const k in byDay) if (byDay[k] > max) max = byDay[k];
    while (cur <= today) { const k = cur.toISOString().slice(0, 10); arr.push({ k, v: byDay[k] || 0 }); cur.setDate(cur.getDate() + 1); }
    return { arr, max };
  }, [byDay]);
  const level = (v) => v <= 0 ? 0 : v < cells.max * 0.25 ? 1 : v < cells.max * 0.5 ? 2 : v < cells.max * 0.75 ? 3 : 4;
  const cols = Math.ceil(cells.arr.length / 7);
  return (
    <div className="cons-heat">
      <svg viewBox={`0 0 ${cols * 16} ${7 * 16}`} style={{ width: "100%", maxWidth: cols * 16 }}>
        {cells.arr.map((c, i) => { const col = Math.floor(i / 7), row = i % 7; return (
          <rect key={c.k} x={col * 16} y={row * 16} width="13" height="13" rx="3" className={`heat-l${level(c.v)}`}>
            <title>{`${c.k}: ${fmt(c.v)} tokens`}</title>
          </rect>
        ); })}
      </svg>
      <div className="cons-heat-legend">Less {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`heat-l${l}`} />)} More</div>
    </div>
  );
}

// ---- Token-share donut ----
function ModelDonut({ models }) {
  const [hover, setHover] = useState(null);
  const top = models.slice(0, 6);
  const total = Math.max(1, top.reduce((a, m) => a + m.tokens, 0));
  let acc = 0; const R = 60, r = 38, cx = 70, cy = 70;
  const arcs = top.map((m, i) => {
    const frac = m.tokens / total; const a0 = acc * 2 * Math.PI - Math.PI / 2; acc += frac; const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
    return { d: `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`, color: DONUT_COLORS[i % DONUT_COLORS.length], m, frac };
  });
  if (!top.length) return <div className="cons-empty-sm">No model usage yet.</div>;
  return (
    <div className="cons-donut">
      <svg viewBox="0 0 140 140" width="140" height="140">
        {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} opacity={hover == null || hover === i ? 1 : 0.35} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ transition: "opacity .12s" }} />)}
        <text x="70" y="66" textAnchor="middle" className="cons-donut-c">{hover == null ? fmt(total) : Math.round(arcs[hover].frac * 100) + "%"}</text>
        <text x="70" y="82" textAnchor="middle" className="cons-donut-l">{hover == null ? "tokens" : shortModel(arcs[hover].m.model)}</text>
      </svg>
      <div className="cons-legend">
        {arcs.map((a, i) => (
          <div key={i} className={`cons-leg ${hover === i ? "on" : ""}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="cons-leg-dot" style={{ background: a.color }} /><span className="cons-leg-name" title={a.m.model}>{shortModel(a.m.model)}</span><span className="cons-leg-v">{Math.round(a.frac * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelBars({ models }) {
  const top = models.slice(0, 5); const max = Math.max(1, ...top.map((m) => m.tokens));
  if (!top.length) return null;
  return (
    <div className="cons-bars">
      {top.map((m) => (
        <div className="cons-bar-row" key={m.model}>
          <div className="cons-bar-label" title={m.model}>{shortModel(m.model)}</div>
          <div className="cons-bar-track"><div className="cons-bar-fill" style={{ width: `${Math.max(4, (m.tokens / max) * 100)}%` }} /></div>
          <div className="cons-bar-val">{fmt(m.tokens)} · {m.messages}m</div>
        </div>
      ))}
    </div>
  );
}
