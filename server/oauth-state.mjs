// Store-backed pending connector-OAuth state (P3.4.3a) — CSRF protection for the connector flow.
// Each record is single-use, user-bound, and expires in 10 minutes. Store-backed (not in-memory) so it
// survives restarts AND works across >1 Render instance (the in-memory login-OAuth Map can't — review T11).
// The record holds the PKCE code_verifier, which is short-lived + single-use; the high-value access/refresh
// tokens are sealed separately in the vault. Nothing here is wired to a route yet.
import { makeState } from "./oauth-pkce.mjs";

const TTL_MS = 10 * 60000; // 10 minutes — matches the existing login-OAuth state TTL

export function makeOAuthStateStore(store, now = () => Date.now()) {
  const col = store.col("oauthstate");
  return {
    // Create a pending record bound to userId; returns the opaque state id to put in the authorize URL.
    async create({ connectorId, userId, codeVerifier, redirect }) {
      const id = makeState();
      await col.insert({ id, connectorId, userId, codeVerifier, redirect: redirect || "", exp: now() + TTL_MS });
      return id;
    },
    // Single-use: return the record and DELETE it. null if missing or expired (expired rows are dropped too).
    async consume(id) {
      if (!id) return null;
      const rec = await col.get(id);
      if (!rec) return null;
      await col.remove(id);                       // single-use: gone whether or not it's still valid
      if (!rec.exp || rec.exp < now()) return null; // expired -> treat as absent
      return rec;
    },
    // Housekeeping: drop expired records (the route layer can call this opportunistically).
    async sweep() {
      const all = await col.all();
      const t = now();
      let removed = 0;
      for (const r of all) if (!r.exp || r.exp < t) { await col.remove(r.id); removed++; }
      return removed;
    },
  };
}
