import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { makeCodeVerifier, codeChallengeS256, makeState } from "../../server/oauth-pkce.mjs";

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("oauth-pkce (RFC 7636)", () => {
  it("verifier is base64url and within the 43..128 length range", () => {
    const v = makeCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("challenge = base64url(SHA-256(verifier)), url-safe and unpadded", () => {
    const v = makeCodeVerifier();
    const expected = b64url(crypto.createHash("sha256").update(v).digest());
    expect(codeChallengeS256(v)).toBe(expected);
    expect(codeChallengeS256(v)).not.toContain("=");
    expect(codeChallengeS256(v)).not.toMatch(/[+/]/);
  });

  it("verifiers and states are high-entropy (unique across many draws)", () => {
    const vs = new Set(Array.from({ length: 200 }, () => makeCodeVerifier()));
    const ss = new Set(Array.from({ length: 200 }, () => makeState()));
    expect(vs.size).toBe(200);
    expect(ss.size).toBe(200);
    expect(makeState()).toMatch(/^[0-9a-f]{32}$/);
  });
});
