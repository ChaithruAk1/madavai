// Portable browser auth client for the auth-kit server. Framework-agnostic (vanilla, React, Vue…).
// Stores the session token in localStorage and talks to the server over fetch.
//
//   import { createAuthClient } from "./auth-client.js";
//   const auth = createAuthClient();                 // same-origin server (recommended)
//   const auth = createAuthClient({ baseUrl: "https://auth.yourdomain.com" });
//
//   const me = await auth.me();                      // { user, status, daysLeft, subscription, admin } | { error }
//   auth.signIn("google");                           // redirects the page to the OAuth flow
//   await auth.subscribe();                          // redirects to Stripe Checkout
//   await auth.signOut();
//
// Account status: "trialing" | "active" | "expired" | "suspended". Gate your app on it.

export function createAuthClient(opts = {}) {
  const base = (opts.baseUrl || "").replace(/\/+$/, "");
  const tokenKey = opts.tokenKey || "auth.token";
  const api = (p) => base + p;
  const getToken = () => { try { return localStorage.getItem(tokenKey) || ""; } catch { return ""; } };
  const setToken = (t) => { try { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); } catch {} };
  const headers = (extra) => { const h = { ...(extra || {}) }; const t = getToken(); if (t) h.Authorization = "Bearer " + t; return h; };

  // On load, capture ?token=... that the OAuth redirect appended, then clean the URL.
  (function capture() {
    try { const u = new URL(location.href); const t = u.searchParams.get("token");
      if (t) { setToken(t); u.searchParams.delete("token"); history.replaceState({}, "", u.pathname + (u.search || "") + u.hash); }
    } catch {}
  })();

  return {
    getToken, setToken,
    isSignedIn: () => !!getToken(),

    async me() {
      if (!getToken()) return { error: "unauthenticated" };
      try {
        const r = await fetch(api("/me"), { headers: headers() });
        if (r.status === 401) { setToken(""); return { error: "unauthenticated" }; }
        if (r.status === 403) return { error: "suspended" };
        if (!r.ok) return { error: "server", code: r.status };
        return await r.json();
      } catch { return { error: "offline" }; }
    },

    // Redirects the whole page to the server's OAuth start; returns here with ?token=.
    signIn(provider = "google", redirect) {
      const back = redirect || (location.origin + location.pathname);
      const p = provider === "github" ? "github" : provider === "dev" ? "dev" : "google";
      location.href = api(`/auth/${p}/start`) + `?redirect=${encodeURIComponent(back)}`;
    },

    async signOut() {
      if (getToken()) { try { await fetch(api("/auth/logout"), { method: "POST", headers: headers() }); } catch {} }
      setToken(""); return { ok: true };
    },

    // Stripe — redirect to Checkout / Customer Portal.
    async subscribe() { return openBilling("checkout"); },
    async manageBilling() { return openBilling("portal"); },

    // Product analytics (never send sensitive content).
    async track(type, meta) { if (!getToken()) return { ok: false }; try { await fetch(api("/events"), { method: "POST", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ type, meta: meta || null }) }); return { ok: true }; } catch { return { ok: false }; } },

    // Admin (only works for admin-email sessions or with an admin key).
    async adminStats(adminKey) { return adminGet("stats", adminKey); },
    async adminUsers(adminKey) { return adminGet("users", adminKey); },
    async adminAction(id, action, adminKey) {
      try { const r = await fetch(api(`/admin/users/${encodeURIComponent(id)}/${action}`), { method: "POST", headers: headers(adminKey ? { "x-admin-key": adminKey } : {}) });
        if (r.status === 403) return { error: "forbidden" }; const j = await r.json().catch(() => ({})); return r.ok ? j : { error: (j && j.error) || ("server " + r.status) };
      } catch { return { error: "offline" }; }
    },
  };

  async function openBilling(kind) {
    try { const r = await fetch(api(`/billing/${kind}`), { method: "POST", headers: headers() });
      const j = await r.json().catch(() => ({})); if (j && j.url) { location.href = j.url; return { ok: true }; }
      return { error: (j && j.error) || ("server " + r.status), detail: (j && j.detail) || "" };
    } catch { return { error: "offline" }; }
  }
  async function adminGet(kind, adminKey) {
    try { const r = await fetch(api(`/admin/${kind}`), { headers: headers(adminKey ? { "x-admin-key": adminKey } : {}) });
      if (r.status === 403) return { error: "forbidden" }; if (!r.ok) return { error: "server " + r.status }; return await r.json();
    } catch { return { error: "offline" }; }
  }
}
