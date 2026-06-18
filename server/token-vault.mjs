// Madav web — encrypted connector token vault (Phase 3 / P3.4.1).
// Stores per-user OAuth/connector tokens ENCRYPTED at rest (AES-256-GCM). Tokens never reach the
// browser: the server seals them here and attaches them to connector/MCP calls server-side (plan P7).
// This slice is the crypto + storage primitive only; OAuth flows + route wiring come later
// (docs/PHASE3-OAUTH.md). Pure node:crypto; unit-tested; wired to nothing yet.
import crypto from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12, TAG_LEN = 16;

// Resolve the 32-byte vault key. Prefer CONNECTOR_VAULT_KEY (hex64 or base64-of-32-bytes); else derive
// deterministically from SESSION_SECRET (so sealed tokens survive restarts while the secret is stable).
// Throws in production if neither is a real secret (mirrors the auth server's guard).
export function vaultKey(env = process.env) {
  const raw = String(env.CONNECTOR_VAULT_KEY || "").trim();
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
    try { const b = Buffer.from(raw, "base64"); if (b.length === 32) return b; } catch {}
    throw new Error("CONNECTOR_VAULT_KEY must be 32 bytes (64 hex chars or base64 of 32 bytes).");
  }
  const secret = String(env.SESSION_SECRET || "").trim();
  const insecure = !secret || secret.length < 16 || ["dev", "changeme", "secret"].includes(secret);
  if (insecure && env.NODE_ENV === "production") {
    throw new Error("Set CONNECTOR_VAULT_KEY (or a strong SESSION_SECRET) before using the connector vault in production.");
  }
  return crypto.createHash("sha256").update("madav-connector-vault\0" + (secret || "madav-dev-secret")).digest();
}

/** Seal a string with AES-256-GCM → "v1." + base64(iv|tag|ciphertext). */
export function seal(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("seal: key must be 32 bytes");
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([c.update(String(plaintext), "utf8"), c.final()]);
  return "v1." + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

/** Open a sealed blob; throws on tamper or wrong key (GCM auth). */
export function open(blob, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("open: key must be 32 bytes");
  const s = String(blob || "");
  const buf = Buffer.from(s.startsWith("v1.") ? s.slice(3) : s, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error("open: malformed blob");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const d = crypto.createDecipheriv(ALG, key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

export function sealJSON(obj, key) { return seal(JSON.stringify(obj === undefined ? null : obj), key); }
export function openJSON(blob, key) { return JSON.parse(open(blob, key)); }

// Storage-agnostic vault over a tiny kv ({ get(key)->blob|null|undefined, set(key,blob) } — may be
// async). Stores ALL of a user's connector tokens as ONE sealed blob under conntok:<userId>. The real
// store binding + OAuth flows come in P3.4.2+.
export function makeVault(kv, key) {
  const ukey = (userId) => "conntok:" + String(userId || "");
  const loadAll = async (userId) => {
    const blob = await kv.get(ukey(userId));
    if (!blob) return {};
    try { return openJSON(blob, key) || {}; } catch { return {}; } // unreadable (e.g. rotated key) -> empty
  };
  return {
    async put(userId, connectorId, tokenObj) {
      const all = await loadAll(userId);
      all[String(connectorId)] = tokenObj;
      await kv.set(ukey(userId), sealJSON(all, key));
      return true;
    },
    async get(userId, connectorId) {
      const all = await loadAll(userId);
      return all[String(connectorId)] || null;
    },
    async list(userId) { return Object.keys(await loadAll(userId)); },
    async remove(userId, connectorId) {
      const all = await loadAll(userId);
      if (!(String(connectorId) in all)) return false;
      delete all[String(connectorId)];
      await kv.set(ukey(userId), sealJSON(all, key));
      return true;
    },
  };
}
