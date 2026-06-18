import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONNECTORS, getConnector, isConfigured, connectorCreds, listConnectors } from "../../server/connector-registry.mjs";
import { makeOAuthStateStore } from "../../server/oauth-state.mjs";
import { makeStore } from "../../server/store.mjs";

describe("connector-registry — constants only, env-gated, no secret leakage", () => {
  it("ships the google-gmail reference connector with a least-privilege scope", () => {
    const c = getConnector("google-gmail");
    expect(c).toBeTruthy();
    expect(c.scopes).toEqual(["https://www.googleapis.com/auth/gmail.readonly"]);
    expect(c.usePKCE).toBe(true);
  });

  it("every authorize/token URL is a fixed https constant (never request-derived)", () => {
    for (const id of Object.keys(CONNECTORS)) {
      expect(CONNECTORS[id].authorizeUrl.startsWith("https://")).toBe(true);
      expect(CONNECTORS[id].tokenUrl.startsWith("https://")).toBe(true);
    }
  });

  it("unknown connector -> null", () => {
    expect(getConnector("nope")).toBe(null);
    expect(connectorCreds("nope", {})).toBe(null);
  });

  it("isConfigured / creds reflect env; the public list never carries secrets", () => {
    const env = {};
    expect(isConfigured("google-gmail", env)).toBe(false); // no env -> not available
    env.GMAIL_CONNECTOR_CLIENT_ID = "client-id";
    env.GMAIL_CONNECTOR_CLIENT_SECRET = "SECRET_VALUE";
    expect(isConfigured("google-gmail", env)).toBe(true);
    expect(connectorCreds("google-gmail", env)).toEqual({ clientId: "client-id", clientSecret: "SECRET_VALUE" });
    const list = listConnectors(env);
    expect(list.find((x) => x.id === "google-gmail")).toMatchObject({ id: "google-gmail", configured: true });
    expect(JSON.stringify(list)).not.toContain("SECRET_VALUE"); // secret must not be in the UI payload
  });
});

describe("oauth-state — single-use, user-bound, TTL (over the real JSON store)", () => {
  const tmp = path.join(os.tmpdir(), `madav-oauthstate-${process.pid}-${Date.now()}.json`);
  const saved = { DB: process.env.DATABASE_URL, SF: process.env.STORE_FILE };
  beforeAll(() => { delete process.env.DATABASE_URL; process.env.STORE_FILE = tmp; });
  afterAll(() => {
    if (saved.DB === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.DB;
    if (saved.SF === undefined) delete process.env.STORE_FILE; else process.env.STORE_FILE = saved.SF;
    try { fs.unlinkSync(tmp); } catch {}
  });

  it("create -> consume returns the user-bound record exactly once", async () => {
    const states = makeOAuthStateStore(await makeStore());
    const id = await states.create({ connectorId: "google-gmail", userId: "user-1", codeVerifier: "ver", redirect: "" });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const rec = await states.consume(id);
    expect(rec).toMatchObject({ connectorId: "google-gmail", userId: "user-1", codeVerifier: "ver" });
    expect(await states.consume(id)).toBe(null); // single-use: gone on second try
  });

  it("an expired state cannot be consumed", async () => {
    let t = 1_000_000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const id = await states.create({ connectorId: "google-gmail", userId: "u", codeVerifier: "v", redirect: "" });
    t += 11 * 60000; // past the 10-minute TTL
    expect(await states.consume(id)).toBe(null);
  });

  it("sweep drops expired records but keeps fresh ones", async () => {
    let t = 5_000_000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const oldId = await states.create({ connectorId: "google-gmail", userId: "a", codeVerifier: "v", redirect: "" });
    t += 11 * 60000;                 // oldId now expired
    const freshId = await states.create({ connectorId: "google-gmail", userId: "b", codeVerifier: "v", redirect: "" });
    const removed = await states.sweep();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await states.consume(freshId)).toMatchObject({ userId: "b" }); // fresh survived
    expect(await states.consume(oldId)).toBe(null);                       // expired gone
  });
});
