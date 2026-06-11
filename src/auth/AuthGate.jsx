// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Blocks the whole app behind a signed-in, non-suspended, trial/active account. ALWAYS-ONLINE:
// validates with the server on launch and every few minutes; offline or invalid ⇒ blocked.
import { useEffect, useState, useCallback } from "react";
import { LogIn, Wifi, ShieldX, RefreshCw, LogOut, Sparkles, CreditCard } from "lucide-react";
import { bridge } from "../bridge/index.js";
import ThinkLogo from "../components/ThinkLogo.jsx";

export default function AuthGate({ children }) {
  const [phase, setPhase] = useState("loading"); // loading|needLogin|offline|suspended|expired|ok
  const [me, setMe] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const check = useCallback(async () => {
    const r = await bridge.authMe().catch(() => ({ error: "offline" }));
    if (!r || r.error === "offline" || r.error === "server") return setPhase("offline");
    if (r.error === "unauthenticated") return setPhase("needLogin");
    if (r.error === "suspended") return setPhase("suspended");
    setMe(r);
    if (r.status === "expired") return setPhase("expired");
    setPhase("ok"); // trialing or active
  }, []);

  useEffect(() => { check(); }, [check]);
  // Re-validate periodically so bans / trial expiry lock the app within minutes (and catch dropped net).
  useEffect(() => {
    if (phase !== "ok") return;
    const iv = setInterval(check, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, [phase, check]);

  const login = async (provider) => {
    setErr(""); setBusy(provider);
    const r = await bridge.authSignIn(provider).catch((e) => ({ error: String(e && e.message || e) }));
    setBusy("");
    if (r && r.ok) { setPhase("loading"); check(); }
    else setErr(provider === "dev"
      ? `Dev sign-in failed (${(r && r.error) || "unknown"}). Restart the auth server with ALLOW_DEV_LOGIN=1 AND fully restart the desktop app (electron, not just hot-reload).`
      : `Sign-in didn't complete (${(r && r.error) || "unknown"}). Check the auth server and try again.`);
  };
  const logout = async () => { await bridge.authSignOut().catch(() => {}); setMe(null); setPhase("needLogin"); };
  const subscribe = async () => {
    setErr(""); setBusy("checkout");
    try {
      const r = bridge.billingCheckout ? await bridge.billingCheckout() : { error: "billing not loaded — fully restart the app (close & rerun electron:dev)" };
      if (r && r.ok) setAwaiting(true); // poll until the webhook activates, then unlock
      else setErr(`Checkout error: ${(r && (r.detail || r.error)) || "unknown"}`);
    } catch (e) { setErr("Checkout error: " + (e && (e.message || e))); }
    finally { setBusy(""); }
  };
  const portal = async () => {
    try {
      const r = bridge.billingPortal ? await bridge.billingPortal() : { error: "billing not loaded — restart the app" };
      if (!(r && r.ok)) setErr(`Couldn't open the billing portal (${(r && r.error) || "unknown"}).`);
    } catch (e) { setErr("Portal error: " + (e && (e.message || e))); }
  };
  // After checkout, poll /me so the app unlocks automatically once Stripe's webhook flips the account.
  const [awaiting, setAwaiting] = useState(false);
  useEffect(() => {
    if (!awaiting) return;
    const iv = setInterval(check, 5000);
    const stop = setTimeout(() => setAwaiting(false), 3 * 60 * 1000);
    return () => { clearInterval(iv); clearTimeout(stop); };
  }, [awaiting, check]);
  useEffect(() => { if (phase === "ok") setAwaiting(false); }, [phase]);
  // On the paywall, keep re-checking so a confirmed payment unlocks even after the await window.
  useEffect(() => {
    if (phase !== "expired") return;
    const iv = setInterval(check, 8000);
    return () => clearInterval(iv);
  }, [phase, check]);

  if (phase === "ok") {
    // Trial banner + account menu now live in the sidebar (Profile entry + upgrade box).
    return <>{children}</>;
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand"><ThinkLogo size={44} animated={false} /><div className="auth-word">Madav</div></div>

        {phase === "loading" && <div className="auth-msg"><RefreshCw className="spin" size={18} /> Checking your account…</div>}

        {phase === "needLogin" && (
          <>
            <p className="auth-sub">Sign in to use Madav. New accounts get a <b>7‑day free trial</b>.</p>
            <button className="auth-btn" disabled={!!busy} onClick={() => login("google")}><LogIn size={16} /> {busy === "google" ? "Opening browser…" : "Continue with Google"}</button>
            <button className="auth-btn" disabled={!!busy} onClick={() => login("github")}><LogIn size={16} /> {busy === "github" ? "Opening browser…" : "Continue with GitHub"}</button>
            <p className="auth-fine">A browser window opens to sign in securely, then returns you here. Madav requires an internet connection.</p>
            {import.meta.env && import.meta.env.DEV && (
              <button className="auth-btn ghost" style={{ marginTop: 14, fontSize: 12 }} disabled={!!busy} onClick={() => login("dev")}>Dev sign‑in (testing only)</button>
            )}
            {err && <p className="auth-fine" style={{ color: "var(--danger)" }}>{err}</p>}
          </>
        )}

        {phase === "offline" && (
          <>
            <div className="auth-msg"><Wifi size={18} /> Madav needs an internet connection and a signed‑in account.</div>
            <p className="auth-sub">It can't run offline. Reconnect, then retry.</p>
            <button className="auth-btn" onClick={() => { setPhase("loading"); check(); }}><RefreshCw size={16} /> Retry</button>
          </>
        )}

        {phase === "suspended" && (
          <>
            <div className="auth-msg danger"><ShieldX size={18} /> Your account is suspended.</div>
            <p className="auth-sub">Access has been blocked. Contact support if you believe this is a mistake.</p>
            <button className="auth-btn ghost" onClick={logout}><LogOut size={16} /> Sign out</button>
          </>
        )}

        {phase === "expired" && (
          <>
            <div className="auth-msg"><Sparkles size={18} /> {me && me.status === "trialing" ? "Upgrade Madav" : "Your free trial has ended"}</div>
            <p className="auth-sub">Subscribe to keep using Madav. You keep using your own model API keys — you're paying for the Madav experience.</p>
            <button className="auth-btn primary" disabled={!!busy || awaiting} onClick={subscribe}>{busy === "checkout" ? "Opening checkout…" : awaiting ? "Waiting for payment…" : "Subscribe"}</button>
            {me && me.status === "trialing" && <button className="auth-btn ghost" onClick={() => setPhase("ok")}>Keep using my trial</button>}
            <button className="auth-btn ghost" onClick={logout}><LogOut size={16} /> Sign out</button>
            {err && <p className="auth-fine" style={{ color: "var(--danger)" }}>{err}</p>}
            <p className="auth-fine">Complete checkout in your browser — Madav unlocks automatically when payment is confirmed.</p>
          </>
        )}
      </div>
    </div>
  );
}

// Small fixed account button (top-right) with a popover: status, manage/subscribe, sign out.
function AccountMenu({ me, onSubscribe, onPortal, onLogout }) {
  const [open, setOpen] = useState(false);
  if (!me || !me.user) return null;
  const u = me.user;
  const initial = (u.name || u.email || "U").slice(0, 1).toUpperCase();
  const statusLabel = me.status === "active" ? `Active · ${(me.subscription && me.subscription.plan) || "Pro"}`
    : me.status === "trialing" ? `Trial · ${me.daysLeft} day${me.daysLeft === 1 ? "" : "s"} left` : me.status;
  return (
    <div className="acct">
      <button className="acct-chip" onClick={() => setOpen((o) => !o)} title="Account">
        {u.avatar ? <img src={u.avatar} alt="" /> : <span className="acct-ini">{initial}</span>}
      </button>
      {open && (
        <>
          <div className="acct-scrim" onClick={() => setOpen(false)} />
          <div className="acct-pop">
            <div className="acct-name">{u.name || "Account"}</div>
            <div className="acct-email">{u.email}</div>
            <div className={`acct-status ${me.status}`}>{statusLabel}</div>
            <div className="acct-actions">
              {me.status === "active"
                ? <button onClick={() => { setOpen(false); onPortal(); }}><CreditCard size={14} /> Manage subscription</button>
                : <button onClick={() => { setOpen(false); onSubscribe(); }}><Sparkles size={14} /> Subscribe</button>}
              <button onClick={() => { setOpen(false); onLogout(); }}><LogOut size={14} /> Sign out</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
