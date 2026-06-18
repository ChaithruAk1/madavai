// server/provider-key-vault.mjs — encrypted, opt-in storage of a user's BYO provider key for SCHEDULED runs
// (Phase 3 S3a). A background run has no browser, so a BYO-provider task needs the key server-side. It is
// sealed with the SAME AES-256-GCM token-vault used for connectors, per user, under `provkey:<userId>`/default.
// Decrypted only in memory at run time (S3b); NEVER returned to the browser (status is a boolean). Opt-in.
import { makeVault, vaultKey } from "./token-vault.mjs";
import { kvFromCollection } from "./connector-vault.mjs";

export function makeProviderKeyVault(store, env = process.env) {
  const v = makeVault(kvFromCollection(store.col("provkeys")), vaultKey(env));
  return {
    async set(userId, { kind, baseUrl, apiKey }) {
      await v.put(userId, "default", { kind: kind === "anthropic" ? "anthropic" : "openai", baseUrl: String(baseUrl || ""), apiKey: String(apiKey || "") });
      return true;
    },
    get(userId) { return v.get(userId, "default"); },          // server-only; in-memory at run time
    remove(userId) { return v.remove(userId, "default"); },
    async status(userId) { const k = await v.get(userId, "default"); return { stored: !!(k && k.apiKey), kind: (k && k.kind) || null }; }, // never the key
  };
}
