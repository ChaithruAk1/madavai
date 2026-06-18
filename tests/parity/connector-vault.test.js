import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { kvFromCollection, makeConnectorVault } from "../../server/connector-vault.mjs";
import { makeStore } from "../../server/store.mjs";

// 1) The kv adapter maps onto a store collection, taking the insert path then the update path.
describe("connector-vault — kvFromCollection adapter", () => {
  it("get/set onto a collection (insert then update, no duplicate)", async () => {
    const rows = new Map();
    const col = {
      async get(id) { return rows.has(id) ? rows.get(id) : null; },
      async insert(doc) { rows.set(doc.id, doc); return doc; },
      async update(id, patch) { const d = rows.get(id); if (d) Object.assign(d, patch); return d || null; },
    };
    const kv = kvFromCollection(col);
    expect(await kv.get("k")).toBe(null);
    await kv.set("k", "BLOB1");                       // insert
    expect(await kv.get("k")).toBe("BLOB1");
    expect(rows.get("k")).toEqual({ id: "k", blob: "BLOB1" });
    await kv.set("k", "BLOB2");                       // update
    expect(await kv.get("k")).toBe("BLOB2");
    expect(rows.size).toBe(1);                        // updated in place, not duplicated
  });
});

// 2) End-to-end over the REAL JSON store backend — proves nothing lands in plaintext at rest.
describe("connector-vault — over the real JSON store", () => {
  const tmp = path.join(os.tmpdir(), `madav-vault-${process.pid}-${Date.now()}.json`);
  const saved = { DB: process.env.DATABASE_URL, SF: process.env.STORE_FILE };
  beforeAll(() => { delete process.env.DATABASE_URL; process.env.STORE_FILE = tmp; });
  afterAll(() => {
    if (saved.DB === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.DB;
    if (saved.SF === undefined) delete process.env.STORE_FILE; else process.env.STORE_FILE = saved.SF;
    try { fs.unlinkSync(tmp); } catch {}
  });

  it("seals tokens at rest and round-trips per user", async () => {
    const store = await makeStore();
    expect(store.kind).toBe("json");
    const vault = makeConnectorVault(store, { SESSION_SECRET: "x".repeat(40) });

    await vault.put("user-1", "gmail", { access_token: "PLAINTEXT_TOKEN_AAA", refresh_token: "rrr" });
    await vault.put("user-1", "slack", { access_token: "BBB" });
    await vault.put("user-2", "gmail", { access_token: "CCC" });

    expect((await vault.get("user-1", "gmail")).access_token).toBe("PLAINTEXT_TOKEN_AAA");
    expect((await vault.list("user-1")).sort()).toEqual(["gmail", "slack"]);
    expect((await vault.get("user-2", "gmail")).access_token).toBe("CCC"); // isolation
    expect(await vault.remove("user-1", "slack")).toBe(true);
    expect(await vault.list("user-1")).toEqual(["gmail"]);

    const onDisk = fs.readFileSync(tmp, "utf8");
    expect(onDisk.includes("PLAINTEXT_TOKEN_AAA")).toBe(false); // token value never in plaintext
    expect(onDisk.includes("access_token")).toBe(false);        // not even the field name leaks
    expect(onDisk).toContain("conntokens");                     // collection present in the file
    expect(onDisk).toContain("conntok:user-1");                 // sealed under the per-user key
  });

  it("a second vault with the same secret reads what the first wrote (survives restart)", async () => {
    const v1 = makeConnectorVault(await makeStore(), { SESSION_SECRET: "x".repeat(40) });
    await v1.put("user-9", "gh", { access_token: "PERSISTED" });
    const v2 = makeConnectorVault(await makeStore(), { SESSION_SECRET: "x".repeat(40) }); // fresh store handle
    expect((await v2.get("user-9", "gh")).access_token).toBe("PERSISTED");
  });
});
