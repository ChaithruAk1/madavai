// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Admin-only analytics + user management. Gated server-side (admin-email session or x-admin-key).
import { useEffect, useState } from "react";
import { RefreshCw, Ban, Check, Gift, Users, Eye, UserPlus, TrendingUp, Activity, CreditCard, Sparkles, Globe } from "lucide-react";
import { bridge } from "../bridge/index.js";

const EVENT_LABEL = { signup: "Signed up", signin: "Signed in", subscribed: "Subscribed" };
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n ?? 0)));
const ago = (iso) => { if (!iso) return "—"; const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + "d ago"; return new Date(iso).toLocaleDateString(); };

export default function AdminPanel() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { bridge.getSettings?.().then((s) => { if (s && s.adminKey) setKey(s.adminKey); }); }, []);

  const load = async () => {
    setErr(""); setBusy(true);
    try {
      const [st, us, se] = await Promise.all([bridge.adminStats(key), bridge.adminUsers(key), bridge.adminSearchUsage ? bridge.adminSearchUsage(key) : null]);
      if (st && st.error) { setErr(st.error === "forbidden" ? "Wrong admin key (server rejected it)." : st.error); setStats(null); setUsers(null); return; }
      setStats(st); setUsers((us && us.users) || []); setSearch(se && !se.error ? se : null);
      const s = await bridge.getSettings?.(); if (s) bridge.saveSettings?.({ ...s, adminKey: key });
    } catch (e) { setErr(String(e && e.message || e)); }
    finally { setBusy(false); }
  };
  const act = async (id, action) => {
    await bridge.adminAction(id, action, key);
    const us = await bridge.adminUsers(key); setUsers((us && us.users) || []);
    const st = await bridge.adminStats(key); if (st && !st.error) setStats(st);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const C = stats && stats.counts, A = (stats && stats.audience) || {}, F = (stats && stats.last7d) || {}, S = (stats && stats.series) || [];

  return (
    <div className="adminp">
      <div className="adminp-keyrow">
        <input className="model-search" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key (optional — your session already authorizes)" />
        <button className="btn primary" disabled={busy} onClick={load}><RefreshCw size={14} className={busy ? "spin" : ""} /> {busy ? "Loading…" : "Reload"}</button>
      </div>
      {err && <div className="adminp-err">{err}</div>}

      {stats && (
        <>
          <div className="adminp-sec"><Globe size={13} /> Audience <span>last 7 days</span></div>
          <div className="cons-kpis adminp-kpis">
            <Stat icon={Eye} label="Visits" v={fmt(A.visits7d)} accent sub={`${fmt(A.visits24h)} today`} />
            <Stat icon={Users} label="Unique visitors" v={fmt(A.uniqueVisitors)} />
            <Stat icon={UserPlus} label="Signups" v={fmt(F.signup)} />
            <Stat icon={TrendingUp} label="Visitor → signup" v={(A.conversion || 0) + "%"} accent />
            <Stat icon={Activity} label="Active 24h" v={fmt(C.active24h)} />
          </div>

          <div className="cons-panel">
            <div className="cons-panel-h"><TrendingUp size={14} /> Traffic & signups <span className="cons-panel-sub">last 14 days</span></div>
            <TrendChart series={S} />
          </div>

          <div className="adminp-sec"><Users size={13} /> Accounts</div>
          <div className="cons-kpis adminp-kpis">
            <Stat icon={Users} label="Total users" v={fmt(C.total)} />
            <Stat icon={CreditCard} label="Paying" v={fmt(C.paying)} accent />
            <Stat icon={Gift} label="Complimentary" v={fmt(C.comp)} />
            <Stat icon={Sparkles} label="Trialing" v={fmt(C.trialing)} />
            <Stat icon={Activity} label="Active 7d" v={fmt(C.active7d)} />
          </div>

          {search && (
            <>
              <div className="adminp-sec"><Globe size={13} /> Search engine <span>this month</span></div>
              {search.configured === false ? (
                <div className="adminp-empty">{search.note || "Search engine not configured (no SERP_API_KEY) — using the free DuckDuckGo tier."}</div>
              ) : (
                <div className="cons-kpis adminp-kpis">
                  <Stat icon={CreditCard} label="Spent" v={"$" + Number((search.usage || {}).spentUsd || 0).toFixed(3)} accent sub={"of $" + ((search.usage || {}).budgetUsd ?? 0)} />
                  <Stat icon={Gift} label="Remaining" v={"$" + Number((search.usage || {}).remainingUsd || 0).toFixed(2)} />
                  <Stat icon={TrendingUp} label="Serper credits used" v={fmt((search.usage || {}).paidCalls)} accent />
                  <Stat icon={Globe} label="Free searches" v={fmt((search.usage || {}).freeCalls)} />
                </div>
              )}
            </>
          )}

          <Funnel visits={A.uniqueVisitors || 0} signups={F.signup || 0} subs={F.subscribed || 0} />

          <div className="adminp-sec"><Users size={13} /> Users</div>
          <div className="adminp-table">
            <div className="adminp-tr adminp-th"><span>User</span><span>Status</span><span>Last seen</span><span>Actions</span></div>
            {users && users.map((u) => (
              <div key={u.id} className="adminp-tr">
                <span className="adminp-user"><b>{u.name || u.email || u.id}</b><em>{u.email}</em></span>
                <span><span className={`adminp-badge s-${u.status}`}>{u.status}{u.daysLeft != null ? ` · ${u.daysLeft}d` : ""}</span>{u.freeAccess && <span className="adminp-badge s-comp">comp</span>}</span>
                <span className="adminp-seen">{ago(u.lastSeenAt)}</span>
                <span className="adminp-acts">
                  {u.suspended
                    ? <button title="Unsuspend" onClick={() => act(u.id, "unsuspend")}><Check size={13} /></button>
                    : <button title="Suspend / ban" onClick={() => act(u.id, "suspend")}><Ban size={13} /></button>}
                  <button title={u.freeAccess ? "Remove free access" : "Grant free access"} onClick={() => act(u.id, u.freeAccess ? "uncomp" : "comp")}><Gift size={13} /></button>
                </span>
              </div>
            ))}
            {users && users.length === 0 && <div className="adminp-empty">No users yet.</div>}
          </div>

          {stats.events && stats.events.length > 0 && (
            <>
              <div className="adminp-sec"><Activity size={13} /> Recent activity</div>
              <div className="adminp-events">
                {stats.events.slice(0, 25).map((e, i) => (
                  <div key={i} className="adminp-ev"><span className={`adminp-ev-t t-${e.type}`}>{EVENT_LABEL[e.type] || e.type}</span><span className="adminp-ev-u">{e.email || "—"}</span><span className="adminp-ev-d">{ago(e.ts)}</span></div>
                ))}
                {stats.events.length === 0 && <div className="adminp-empty">No account activity yet.</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon: I, label, v, accent, sub }) {
  return (
    <div className={`cons-kpi ${accent ? "accent" : ""}`}>
      <div className="cons-kpi-ico"><I size={16} /></div>
      <div className="cons-kpi-v">{v}</div>
      <div className="cons-kpi-k">{label}{sub ? <span className="adminp-kpi-sub"> · {sub}</span> : null}</div>
    </div>
  );
}

// Dual-line trend: visits (accent) + signups (accent-2) over the last 14 days.
function TrendChart({ series }) {
  const [hover, setHover] = useState(null);
  if (!series.length) return <div className="cons-empty-sm">No data yet.</div>;
  const W = 720, H = 180, pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...series.map((s) => Math.max(s.visits, s.signups)));
  const x = (i) => pad.l + (series.length <= 1 ? iw / 2 : (i / (series.length - 1)) * iw);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const path = (key) => series.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");
  const onMove = (e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0, bd = 1e9; series.forEach((s, i) => { const dd = Math.abs(x(i) - px); if (dd < bd) { bd = dd; best = i; } }); setHover(best); };
  return (
    <div className="cons-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ width: "100%", height: H }}>
        {[0.5, 1].map((g) => <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih * (1 - g)} y2={pad.t + ih * (1 - g)} stroke="var(--line)" strokeWidth="1" />)}
        <path d={path("visits")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        <path d={path("signups")} fill="none" stroke="var(--accent-2)" strokeWidth="2" strokeLinejoin="round" />
        {hover != null && <>
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--accent-line)" strokeWidth="1" />
          <circle cx={x(hover)} cy={y(series[hover].visits)} r="3" fill="var(--accent)" />
          <circle cx={x(hover)} cy={y(series[hover].signups)} r="3" fill="var(--accent-2)" />
        </>}
      </svg>
      <div className="adminp-legend"><span><i style={{ background: "var(--accent)" }} /> Visits</span><span><i style={{ background: "var(--accent-2)" }} /> Signups</span></div>
      {hover != null && (
        <div className="cons-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{series[hover].visits}</b> visits · <b>{series[hover].signups}</b> signups
          <span>{new Date(series[hover].day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}

// Visitors → Signups → Subscribed funnel.
function Funnel({ visits, signups, subs }) {
  const max = Math.max(1, visits, signups, subs);
  const rows = [
    { label: "Unique visitors", v: visits, c: "var(--accent)" },
    { label: "Signed up", v: signups, c: "var(--accent-2)" },
    { label: "Subscribed", v: subs, c: "#22a06b" },
  ];
  return (
    <div className="cons-panel">
      <div className="cons-panel-h"><TrendingUp size={14} /> Conversion funnel <span className="cons-panel-sub">last 7 days</span></div>
      <div className="adminp-funnelbars">
        {rows.map((r) => (
          <div className="adminp-frow" key={r.label}>
            <span className="adminp-flabel">{r.label}</span>
            <span className="adminp-ftrack"><span className="adminp-ffill" style={{ width: `${Math.max(3, (r.v / max) * 100)}%`, background: r.c }} /></span>
            <span className="adminp-fval">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
