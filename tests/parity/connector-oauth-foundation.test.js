import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CONNECTORS, getConnector, isConfigured, connectorCreds, listConnectors, buildAuthorizeUrl } from "../../server/connector-registry.mjs";
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
    expect(isConfigured("google-gmail", env)).toBe(false);
    env.GMAIL_CONNECTOR_CLIENT_ID = "client-id";
    env.GMAIL_CONNECTOR_CLIENT_SECRET = "SECRET_VALUE";
    expect(isConfigured("google-gmail", env)).toBe(true);
    expect(connectorCreds("google-gmail", env)).toEqual({ clientId: "client-id", clientSecret: "SECRET_VALUE" });
    const list = listConnectors(env);
    expect(list.find((x) => x.id === "google-gmail")).toMatchObject({ id: "google-gmail", configured: true });
    expect(JSON.stringify(list)).not.toContain("SECRET_VALUE");
  });
});

describe("buildAuthorizeUrl — correct OAuth + PKCE params, scoped to the constant endpoint", () => {
  it("sets client_id, redirect_uri, response_type, scope, state, S256 challenge, and extra params", () => {
    const url = new URL(buildAuthorizeUrl(getConnector("google-gmail"), {
      clientId: "CID", redirectUri: "https://app.example/cb", state: "STATE123", codeChallenge: "CHALLENGE",
    }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("CID");
    expect(q.get("redirect_uri")).toBe("https://app.example/cb");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(q.get("state")).toBe("STATE123");
    expect(q.get("code_challenge")).toBe("CHALLENGE");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent");
  });

  it("omits PKCE params when the connector does not use PKCE", () => {
    const url = new URL(buildAuthorizeUrl({ authorizeUrl: "https://p/auth", scopes: ["s"], usePKCE: false }, {
      clientId: "c", redirectUri: "https://app/cb", state: "st", codeChallenge: "x",
    }));
    expect(url.searchParams.get("code_challenge")).toBe(null);
    expect(url.searchParams.get("code_challenge_method")).toBe(null);
  });
});

describe("oauth-state — single-use, user-bound, TTL (over the real JSON store)", () => {
  const tmp = path.join(os.tmpdir(), "madav-oauthstate-" + process.pid + "-" + Date.now() + ".json");
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
    expect(await states.consume(id)).toBe(null);
  });

  it("an expired state cannot be consumed", async () => {
    let t = 1000000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const id = await states.create({ connectorId: "google-gmail", userId: "u", codeVerifier: "v", redirect: "" });
    t += 11 * 60000;
    expect(await states.consume(id)).toBe(null);
  });

  it("sweep drops expired records but keeps fresh ones", async () => {
    let t = 5000000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const oldId = await states.create({ connectorId: "google-gmail", userId: "a", codeVerifier: "v", redirect: "" });
    t += 11 * 60000;
    const freshId = await states.create({ connectorId: "google-gmail", userId: "b", codeVerifier: "v", redirect: "" });
    const removed = await states.sweep();
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await states.consume(freshId)).toMatchObject({ userId: "b" });
    expect(await states.consume(oldId)).toBe(null);
  });
});
