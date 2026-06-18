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

  it("CRUD is authed, per-user, quota-bounded; the task CRUD block never handles secrets", () => {
    const start = src.indexOf('p === "/tasks" && req.method === "GET"');
    const crud = src.slice(start, src.indexOf("/run$/i")); // GET/POST/PUT/DELETE/runs — before the run + key routes
    expect(crud).toMatch(/authUser\(req\)/);
    expect(crud).toMatch(/t\.userId === user\.id/);                  // per-user scoping
    expect(crud).toMatch(/task limit reached/);                      // quota cap
    expect(crud).not.toContain("apiKey");                            // key handling lives only in /tasks/provider-key
    expect(src).toMatch(/15 \* 60000/);                              // min 15-min interval (in the task normalizer)
  });

  it("did not alter the existing /projects or /workspace routes", () => {
    expect(src).toContain('p === "/projects" && req.method === "GET"');
    expect(src).toContain('p === "/workspace" && req.method === "GET"');
  });
});
