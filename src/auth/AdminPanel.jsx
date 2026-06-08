// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Admin-only analytics + user management. Gated by the admin key (x-admin-key) entered here and
// validated server-side — normal users without the key get "forbidden" and see nothing.
import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Ban, Check, Gift, Users } from "lucide-react";
import { bridge } from "../bridge/index.js";

const fmt = (iso) => { if (!iso) return "—"; const d = new Date(iso); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + "m ago"; if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + "d ago"; return d.toLocaleDateString(); };

export default function AdminPanel() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { bridge.getSettings?.().then((s) => { if (s && s.adminKey) setKey(s.adminKey); }); }, []);

  const load = async () => {
    setErr(""); setBusy(true);
    try {
      const [st, us] = await Promise.all([bridge.adminStats(key), bridge.adminUsers(key)]);
      if (st && st.error) { setErr(st.error === "forbidden" ? "Wrong admin key (server rejected it)." : st.error); setStats(null); setUsers(null); return; }
      setStats(st); setUsers((us && us.users) || []);
      const s = await bridge.getSettings?.(); if (s) bridge.saveSettings?.({ ...s, adminKey: key }); // remember the key locally
    } catch (e) { setErr(String(e && e.message || e)); }
    finally { setBusy(false); }
  };

  const act = async (id, action) => {
    await bridge.adminAction(id, action, key);
    const us = await bridge.adminUsers(key); setUsers((us && us.users) || []);
    const st = await bridge.adminStats(key); if (st && !st.error) setStats(st);
  };

  // This panel only renders for admins, so the signed-in session already authorizes — auto-load.
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const C = stats && stats.counts; const F = stats && stats.last7d;

  return (
    <div className="adminp">
      <div className="adminp-keyrow">
        <input className="model-search" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key (optional — your session already authorizes)" />
        <button className="btn primary" disabled={busy} onClick={load}>{busy ? <RefreshCw size={14} className="spin" /> : <RefreshCw size={14} />} {busy ? "Loading…" : "Reload"}</button>
      </div>
      {err && <div className="adminp-err">{err}</div>}

      {stats && (
        <>
          <div className="adminp-cards">
            <Stat label="Total users" v={C.total} />
            <Stat label="Active 24h" v={C.active24h} accent />
            <Stat label="Active 7d" v={C.active7d} />
            <Stat label="New 7d" v={C.new7d} />
            <Stat label="Trialing" v={C.trialing} />
            <Stat label="Paying" v={C.paying} accent />
            <Stat label="Complimentary" v={C.comp} />
            <Stat label="Expired" v={C.expired} />
          </div>
          <div className="adminp-funnel">Last 7 days · <b>{F.signup}</b> signups · <b>{F.signin}</b> sign-ins · <b>{F.subscribed}</b> subscribed</div>

          <div className="nav-label" style={{ paddingLeft: 0, marginTop: 10 }}><Users size={13} style={{ verticalAlign: "-2px" }} /> Users</div>
          <div className="adminp-table">
            <div className="adminp-tr adminp-th"><span>User</span><span>Status</span><span>Last seen</span><span>Actions</span></div>
            {users && users.map((u) => (
              <div key={u.id} className="adminp-tr">
                <span className="adminp-user"><b>{u.name || u.email || u.id}</b><em>{u.email}</em></span>
                <span><span className={`adminp-badge s-${u.status}`}>{u.status}{u.daysLeft != null ? ` · ${u.daysLeft}d` : ""}</span>{u.freeAccess && <span className="adminp-badge s-comp">comp</span>}</span>
                <span className="adminp-seen">{fmt(u.lastSeenAt)}</span>
                <span className="adminp-acts">
                  {u.suspended
                    ? <button title="Unsuspend" onClick={() => act(u.id, "unsuspend")}><Check size={13} /></button>
                    : <button title="Suspend / ban" onClick={() => act(u.id, "suspend")}><Ban size={13} /></button>}
                  {u.freeAccess
                    ? <button title="Remove free access" onClick={() => act(u.id, "uncomp")}><Gift size={13} /></button>
                    : <button title="Grant free access" onClick={() => act(u.id, "comp")}><Gift size={13} /></button>}
                </span>
              </div>
            ))}
            {users && users.length === 0 && <div className="adminp-empty">No users yet.</div>}
          </div>

          {stats.events && stats.events.length > 0 && (
            <>
              <div className="nav-label" style={{ paddingLeft: 0, marginTop: 12 }}>Recent activity</div>
              <div className="adminp-events">
                {stats.events.slice(0, 25).map((e, i) => (
                  <div key={i} className="adminp-ev"><span className="adminp-ev-t">{e.type}</span><span className="adminp-ev-u">{e.userId || "—"}</span><span className="adminp-ev-d">{fmt(e.ts)}</span></div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, v, accent }) {
  return <div className={`adminp-card ${accent ? "accent" : ""}`}><div className="adminp-card-v">{v ?? 0}</div><div className="adminp-card-l">{label}</div></div>;
}
