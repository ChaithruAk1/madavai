// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Account block for Settings: shows the signed-in user + subscription status, with Manage / Subscribe
// and Sign out. Reads the live account from the auth server; hidden when not signed in.
import { useEffect, useState } from "react";
import { LogOut, CreditCard, Sparkles } from "lucide-react";
import { bridge } from "../bridge/index.js";

export default function AccountCard() {
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (bridge.authMe) bridge.authMe().then(setMe).catch(() => {}); }, []);
  if (!me || me.error || !me.user) return null;

  const u = me.user;
  const initial = (u.name || u.email || "U").slice(0, 1).toUpperCase();
  // Local-roster roles win over the generic status: Creator (admin) and Complimentary
  // (free, excluded from subscription) get their own labels and no billing buttons.
  const role = me.role || ((me.subscription && me.subscription.plan === "Complimentary") ? "complimentary" : null);
  const statusLabel = role === "creator" ? "Creator"
    : role === "complimentary" ? "Complimentary"
    : me.status === "active" ? `Active · ${(me.subscription && me.subscription.plan) || "Pro"}`
    : me.status === "trialing" ? `Free trial · ${me.daysLeft} day${me.daysLeft === 1 ? "" : "s"} left`
    : me.status === "expired" ? "Trial ended" : me.status;
  const billable = role !== "creator" && role !== "complimentary";
  const logout = async () => { await bridge.authSignOut().catch(() => {}); location.reload(); };
  const manage = async () => { setMsg(""); const r = await (bridge.billingPortal ? bridge.billingPortal() : Promise.resolve({ error: "n/a" })).catch(() => ({ error: "failed" })); if (!(r && r.ok)) setMsg(`Couldn't open the billing portal (${(r && r.error) || "unknown"}).`); };
  const subscribe = async () => { setMsg(""); setBusy("sub"); const r = await (bridge.billingCheckout ? bridge.billingCheckout() : Promise.resolve({ error: "n/a" })).catch(() => ({ error: "failed" })); setBusy(""); if (!(r && r.ok)) setMsg(`Couldn't start checkout (${(r && (r.detail || r.error)) || "unknown"}).`); else setMsg("Complete checkout in your browser; your status updates shortly."); };

  return (
    <div className="acct-card">
      <div className="acct-card-head">
        {u.avatar ? <img className="acct-card-av" src={u.avatar} alt="" /> : <div className="acct-card-av ini">{initial}</div>}
        <div style={{ minWidth: 0 }}>
          <div className="acct-card-name">{u.name || "Account"}</div>
          <div className="acct-card-email">{u.email} · via {u.provider}</div>
        </div>
        <span className={`acct-status ${me.status}`} style={{ marginLeft: "auto" }}>{statusLabel}</span>
      </div>
      <div className="acct-card-actions">
        {!billable
          ? <span className="acct-card-msg" style={{ margin: 0 }}>{role === "creator" ? "Creator access — all features, no subscription." : "Complimentary access — no subscription needed."}</span>
          : me.status === "active"
          ? <button className="btn" onClick={manage}><CreditCard size={14} /> Manage subscription</button>
          : <button className="btn primary" disabled={busy === "sub"} onClick={subscribe}><Sparkles size={14} /> {busy === "sub" ? "Opening…" : "Subscribe"}</button>}
        <button className="btn ghost" onClick={logout}><LogOut size={14} /> Sign out</button>
      </div>
      {msg && <div className="acct-card-msg">{msg}</div>}
    </div>
  );
}
