// Store-backed pending connector-OAuth state (P3.4.3a; extended in P3.4.5). CSRF protection for the connector
// flow: single-use, user-bound, 10-minute records. Store-backed (not in-memory) so it survives restarts AND
// works across >1 instance. Self-contained (no oauth-pkce dependency) so the bespoke modules can be retired.
import crypto from "node:crypto";

const TTL_MS = 10 * 60000; // 10 minutes
const randomId = () => crypto.randomBytes(16).toString("hex");

export function makeOAuthStateStore(store, now = () => Date.now()) {
  const col = store.col("oauthstate");
  return {
    // Legacy (bespoke P3.4.3) create with an auto id.
    async create({ connectorId, userId, codeVerifier, redirect }) {
      const id = randomId();
      await col.insert({ id, connectorId, userId, codeVerifier, redirect: redirect || "", exp: now() + TTL_MS });
      return id;
    },
    // Upsert under a caller-chosen id. Used by the SDK sign-in flow (P3.4.5), where the id IS the CSRF state
    // placed in the authorize URL — known before the SDK produces the PKCE verifier.
    async putWithId(id, fields) {
      await col.remove(id);
      await col.insert({ id, ...fields, exp: now() + TTL_MS });
      return id;
    },
    // Single-use: return the record and DELETE it. null if missing or expired (expired rows dropped too).
    async consume(id) {
      if (!id) return null;
      const rec = await col.get(id);
      if (!rec) return null;
      await col.remove(id);
      if (!rec.exp || rec.exp < now()) return null;
      return rec;
    },
    async sweep() {
      const all = await col.all();
      const t = now();
      let removed = 0;
      for (const r of all) if (!r.exp || r.exp < t) { await col.remove(r.id); removed++; }
      return removed;
    },
  };
}
