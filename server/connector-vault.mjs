// Madav web — bind the encrypted token vault (server/token-vault.mjs) to the real user store (P3.4.2).
// Per-user connector tokens are sealed (AES-256-GCM) and persisted in the "conntokens" collection,
// which both store backends (JSON file + Postgres jsonb) support. Tokens never reach the browser.
// Still wired to nothing live: no routes/OAuth import this yet (see docs/PHASE3-OAUTH.md, P3.4.3+).
import { makeVault, vaultKey } from "./token-vault.mjs";

// Adapt a store collection ({ get(id), insert(doc), update(id,patch) }) to the tiny kv shape
// makeVault expects ({ get(key) -> blob|null, set(key, blob) }). The sealed blob lives in doc.blob.
export function kvFromCollection(col) {
  return {
    async get(key) { const doc = await col.get(key); return doc ? doc.blob : null; },
    async set(key, blob) {
      const existing = await col.get(key);
      if (existing) await col.update(key, { blob });
      else await col.insert({ id: key, blob });
    },
  };
}

// Build the per-user connector vault over the given store. Throws (via vaultKey) in production if no
// real CONNECTOR_VAULT_KEY / SESSION_SECRET is set, so we never persist tokens under a guessable key.
export function makeConnectorVault(store, env = process.env) {
  const key = vaultKey(env);
  return makeVault(kvFromCollection(store.col("conntokens")), key);
}
