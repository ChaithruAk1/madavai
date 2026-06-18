import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeOAuthStateStore } from "../../server/oauth-state.mjs";
import { makeStore } from "../../server/store.mjs";

// P3.4.5 R3c: the connector-registry + buildAuthorizeUrl tests were retired with the bespoke modules.
// This file now covers the store-backed OAuth state, which the realigned SDK sign-in flow uses.
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
    const id = await states.create({ connectorId: "x", userId: "user-1", codeVerifier: "ver", redirect: "" });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await states.consume(id)).toMatchObject({ userId: "user-1", codeVerifier: "ver" });
    expect(await states.consume(id)).toBe(null);
  });

  it("putWithId upserts under a chosen id; consume returns it once", async () => {
    const states = makeOAuthStateStore(await makeStore());
    await states.putWithId("STATEID", { userId: "u1", serverId: "srv1", codeVerifier: "v" });
    expect(await states.consume("STATEID")).toMatchObject({ userId: "u1", serverId: "srv1", codeVerifier: "v" });
    expect(await states.consume("STATEID")).toBe(null);
  });

  it("an expired state cannot be consumed", async () => {
    let t = 1000000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const id = await states.create({ connectorId: "x", userId: "u", codeVerifier: "v", redirect: "" });
    t += 11 * 60000;
    expect(await states.consume(id)).toBe(null);
  });

  it("sweep drops expired records but keeps fresh ones", async () => {
    let t = 5000000;
    const states = makeOAuthStateStore(await makeStore(), () => t);
    const oldId = await states.create({ connectorId: "x", userId: "a", codeVerifier: "v", redirect: "" });
    t += 11 * 60000;
    const freshId = await states.create({ connectorId: "x", userId: "b", codeVerifier: "v", redirect: "" });
    expect(await states.sweep()).toBeGreaterThanOrEqual(1);
    expect(await states.consume(freshId)).toMatchObject({ userId: "b" });
    expect(await states.consume(oldId)).toBe(null);
  });
});
