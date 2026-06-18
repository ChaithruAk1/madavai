import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeProviderKeyVault } from "../../server/provider-key-vault.mjs";
import { makeStore } from "../../server/store.mjs";

// Phase 3 S3a: the opt-in BYO provider key is sealed server-side (same AES-256-GCM token-vault as
// connectors), per user, and NEVER returned to the browser (status is a boolean). No execution here.
describe("provider-key-vault (S3a) — sealed BYO key over the real store", () => {
  const tmp = path.join(os.tmpdir(), "madav-provkey-" + process.pid + "-" + Date.now() + ".json");
  const saved = { DB: process.env.DATABASE_URL, SF: process.env.STORE_FILE };
  beforeAll(() => { delete process.env.DATABASE_URL; process.env.STORE_FILE = tmp; });
  afterAll(() => {
    if (saved.DB === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.DB;
    if (saved.SF === undefined) delete process.env.STORE_FILE; else process.env.STORE_FILE = saved.SF;
    try { fs.unlinkSync(tmp); } catch {}
  });

  const ENV = { SESSION_SECRET: "x".repeat(48) }; // strong key so vaultKey() won't refuse

  it("set/get round-trips; status is boolean+kind only; remove clears it", async () => {
    const pkv = makeProviderKeyVault(await makeStore(), ENV);
    expect(await pkv.status("u1")).toEqual({ stored: false, kind: null });
    await pkv.set("u1", { kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: "SK_SECRET_VALUE_123" });
    expect(await pkv.status("u1")).toEqual({ stored: true, kind: "openai" });
    expect((await pkv.get("u1")).apiKey).toBe("SK_SECRET_VALUE_123");
    await pkv.remove("u1");
    expect(await pkv.status("u1")).toEqual({ stored: false, kind: null });
  });

  it("normalizes kind to openai|anthropic", async () => {
    const pkv = makeProviderKeyVault(await makeStore(), ENV);
    await pkv.set("u2", { kind: "weird", baseUrl: "https://api.openai.com/v1", apiKey: "k" });
    expect((await pkv.status("u2")).kind).toBe("openai");
    await pkv.set("u3", { kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "k" });
    expect((await pkv.status("u3")).kind).toBe("anthropic");
  });

  it("the secret is NOT stored in plaintext (sealed at rest)", async () => {
    const pkv = makeProviderKeyVault(await makeStore(), ENV);
    await pkv.set("u4", { kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: "PLAINTEXT_LEAK_CHECK_789" });
    const onDisk = fs.readFileSync(tmp, "utf8");
    expect(onDisk.includes("PLAINTEXT_LEAK_CHECK_789")).toBe(false);
  });

  it("keys are isolated per user", async () => {
    const pkv = makeProviderKeyVault(await makeStore(), ENV);
    await pkv.set("a", { kind: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "AAA" });
    expect(await pkv.status("b")).toEqual({ stored: false, kind: null });
    expect((await pkv.get("a")).apiKey).toBe("AAA");
  });
});

describe("provider-key routes (S3a) — contract", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");
  const store = fs.readFileSync(path.resolve(here, "../../server/store.mjs"), "utf8");

  it("defines POST + GET-status + DELETE /tasks/provider-key", () => {
    expect(src).toContain('p === "/tasks/provider-key" && req.method === "POST"');
    expect(src).toContain('p === "/tasks/provider-key/status" && req.method === "GET"');
    expect(src).toContain('p === "/tasks/provider-key" && req.method === "DELETE"');
  });
  it("POST is authed, host-allowlisted (SSRF), and seals via the vault", () => {
    const i = src.indexOf('p === "/tasks/provider-key" && req.method === "POST"');
    const seg = src.slice(i, i + 1200);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/isAllowedProxyHost\(baseUrl\)/);
    expect(seg).toMatch(/providerKeyVault\(\)\.set/);
  });
  it("the status route never serializes the apiKey", () => {
    const j = src.indexOf('p === "/tasks/provider-key/status"');
    expect(src.slice(j, j + 400)).not.toContain("apiKey");
  });
  it("store registers the provkeys collection", () => {
    expect(store).toMatch(/"provkeys"/);
  });
});
