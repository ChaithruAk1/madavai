import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Phase 3 S1 — scheduled tasks, STORAGE ONLY (no execution yet). Static route-contract check (importing
// auth-server.mjs boots the server). Execution + the BYO-key vault land in S2/S3 behind review.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");
const store = fs.readFileSync(path.resolve(here, "../../server/store.mjs"), "utf8");

describe("scheduled-task routes (Phase 3 S1)", () => {
  it("store declares tasks + runs collections", () => {
    expect(store).toMatch(/COLLECTIONS = \[[^\]]*"tasks"/);
    expect(store).toMatch(/COLLECTIONS = \[[^\]]*"runs"/);
  });

  it("defines task CRUD + per-task runs routes", () => {
    expect(src).toContain('p === "/tasks" && req.method === "GET"');
    expect(src).toContain('p === "/tasks" && req.method === "POST"');
    expect(src.includes("\\/tasks\\/[a-z0-9_]+$")).toBe(true);          // PUT + DELETE :id
    expect(src.includes("\\/tasks\\/[a-z0-9_]+\\/runs$")).toBe(true);   // GET runs
  });

  it("CRUD is authed, per-user, quota-bounded; storage-only (no execution/secret in S1)", () => {
    const i = src.indexOf('p === "/tasks" && req.method === "GET"');
    const seg = src.slice(i, i + 3400);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/t\.userId === user\.id/);                     // per-user scoping
    expect(seg).toMatch(/task limit reached/);                        // quota cap
    expect(seg).toMatch(/15 \* 60000/);                               // min 15-min interval
    expect(seg).not.toContain("apiKey");                              // no key handling yet
    expect(seg).not.toContain("/starter/v1/chat");                    // no execution yet
  });

  it("did not alter the existing /projects or /workspace routes", () => {
    expect(src).toContain('p === "/projects" && req.method === "GET"');
    expect(src).toContain('p === "/workspace" && req.method === "GET"');
  });
});
