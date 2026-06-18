import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Phase 2 — project-record sync (additive). Static contract check: importing auth-server.mjs boots the server,
// so assert against source (same pattern as the other route tests). Mirrors the /workspace blob sync.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");
const store = fs.readFileSync(path.resolve(here, "../../server/store.mjs"), "utf8");

describe("project-record sync routes (Phase 2, additive)", () => {
  it("store declares a projects collection", () => {
    expect(store).toMatch(/COLLECTIONS = \[[^\]]*"projects"/);
  });

  it("defines GET and PUT /projects", () => {
    expect(src).toContain('p === "/projects" && req.method === "GET"');
    expect(src).toContain('p === "/projects" && req.method === "PUT"');
  });

  it("both require auth + rate-limit; PUT caps the body and stores a per-user blob", () => {
    const i = src.indexOf('p === "/projects" && req.method === "GET"');
    const seg = src.slice(i, i + 1700);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/rateLimited\(req, "projects"/);
    expect(seg).toMatch(/rateLimited\(req, "projects-w"/);
    expect(seg).toMatch(/store\.col\("projects"\)/);
    expect(seg).toMatch(/1024 \* 1024/);              // 1MB body cap
    expect(seg).not.toContain("apiKey");              // projects carry no secrets
  });

  it("did not alter the existing /workspace or /conversations routes", () => {
    expect(src).toContain('p === "/workspace" && req.method === "GET"');
    expect(src).toContain('p === "/conversations"');
  });
});
