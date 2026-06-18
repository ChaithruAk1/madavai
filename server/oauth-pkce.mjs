// PKCE (RFC 7636) + OAuth state-id helpers for connector OAuth (P3.4.3a). Pure node:crypto, no I/O.
// code_verifier: a high-entropy secret kept server-side; only code_challenge = base64url(SHA-256(verifier))
// is ever sent to the provider. This binds the eventual code redemption to the request that started it.
import crypto from "node:crypto";

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// 32 random bytes -> 43-char base64url verifier (within RFC 7636's 43..128 range).
export function makeCodeVerifier() { return b64url(crypto.randomBytes(32)); }

// S256 challenge for a verifier (url-safe, unpadded).
export function codeChallengeS256(verifier) {
  return b64url(crypto.createHash("sha256").update(String(verifier)).digest());
}

// Opaque single-use CSRF state id — 32 hex chars, same shape as the existing login-OAuth state.
export function makeState() { return crypto.randomBytes(16).toString("hex"); }
