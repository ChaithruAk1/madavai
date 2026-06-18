import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { seal, open, sealJSON, openJSON, makeVault, vaultKey } from "../../server/token-vault.mjs";

const KEY = crypto.createHash("sha256").update("test-key").digest(); // 32 bytes
const KEY2 = crypto.createHash("sha256").update("other-key").digest();

describe("token-vault — AES-256-GCM seal/open", () => {
  it("round-trips a string", () => {
    const blob = seal("ya29.SECRET_ACCESS_TOKEN", KEY);
    expect(open(blob, KEY)).toBe("ya29.SECRET_ACCESS_TOKEN");
  });

  it("the sealed blob does NOT contain the plaintext", () => {
    const blob = seal("SUPER_SECRET_TOKEN_123", KEY);
    expect(blob.includes("SUPER_SECRET_TOKEN_123")).toBe(false);
    expect(Buffer.from(blob.slice(3), "base64").toString("utf8").includes("SUPER_SECRET")).toBe(false);
  });

  it("wrong key fails (GCM auth)", () => {
    const blob = seal("x", KEY);
    expect(() => open(blob, KEY2)).toThrow();
  });

  it("tampering fails (auth tag)", () => {
    const blob = seal("hello world", KEY);
    const bytes = Buffer.from(blob.slice(3), "base64");
    bytes[bytes.length - 1] ^= 0x01; // flip a ciphertext bit
    expect(() => open("v1." + bytes.toString("base64"), KEY)).toThrow();
  });

  it("seal/openJSON round-trips an object", () => {
    const tok = { access_token: "a", refresh_token: "r", expires_at: 123 };
    expect(openJSON(sealJSON(tok, KEY), KEY)).toEqual(tok);
  });

  it("rejects non-32-byte keys", () => {
    expect(() => seal("x", Buffer.alloc(16))).toThrow(/32 bytes/);
    expect(() => open("v1.abc", Buffer.alloc(16))).toThrow(/32 bytes/);
  });
});

describe("token-vault — per-user vault over a kv", () => {
  const mem = new Map();
  const kv = { get: (k) => mem.get(k), set: (k, v) => { mem.set(k, v); } };
  const vault = makeVault(kv, KEY);

  it("put/get/list/remove, isolated per user", async () => {
    await vault.put("u1", "gmail", { access_token: "T1" });
    await vault.put("u1", "slack", { access_token: "T2" });
    await vault.put("u2", "gmail", { access_token: "OTHER" });
    expect((await vault.get("u1", "gmail")).access_token).toBe("T1");
    expect((await vault.list("u1")).sort()).toEqual(["gmail", "slack"]);
    expect((await vault.get("u2", "gmail")).access_token).toBe("OTHER");
    expect(await vault.get("u1", "nope")).toBe(null);
    expect(await vault.remove("u1", "slack")).toBe(true);
    expect(await vault.list("u1")).toEqual(["gmail"]);
  });

  it("stores ciphertext at rest (no plaintext token in kv)", async () => {
    await vault.put("u3", "gh", { access_token: "PLAINTEXT_SHOULD_NOT_APPEAR" });
    const raw = mem.get("conntok:u3");
    expect(typeof raw).toBe("string");
    expect(raw.includes("PLAINTEXT_SHOULD_NOT_APPEAR")).toBe(false);
  });
});

describe("token-vault — vaultKey resolution", () => {
  it("accepts a 64-hex CONNECTOR_VAULT_KEY", () => {
    const k = vaultKey({ CONNECTOR_VAULT_KEY: "a".repeat(64) });
    expect(Buffer.isBuffer(k) && k.length === 32).toBe(true);
  });
  it("rejects a bad-length explicit key", () => {
    expect(() => vaultKey({ CONNECTOR_VAULT_KEY: "tooshort" })).toThrow(/32 bytes/);
  });
  it("derives a 32-byte key in dev (no env)", () => {
    expect(vaultKey({}).length).toBe(32);
  });
  it("refuses an insecure secret in production", () => {
    expect(() => vaultKey({ NODE_ENV: "production" })).toThrow(/production/);
    expect(vaultKey({ NODE_ENV: "production", SESSION_SECRET: "a-strong-secret-0123456789" }).length).toBe(32);
  });
});
