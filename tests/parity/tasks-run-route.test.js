import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");
const RUN_SIG = 'p.match(/^\\/tasks\\/[a-z0-9_]+\\/run$/i) && req.method === "POST"';

describe("POST /tasks/:id/run (S3b) — contract", () => {
  it("defines an authed, user-scoped run-now route", () => {
    expect(src).toContain(RUN_SIG);
  });
  it("uses the scheduler single-shot path (runDue) + ownership check", () => {
    const seg = src.slice(src.indexOf(RUN_SIG), src.indexOf(RUN_SIG) + 800);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/taskScheduler\.runDue/);
    expect(seg).toMatch(/cur\.userId !== user\.id/);
    expect(seg).toMatch(/skipped === "quota"/);
  });
  it("constructs the scheduler with providerCallFor + statusOf", () => {
    expect(src).toMatch(/makeScheduler\(\{[\s\S]{0,160}providerCallFor[\s\S]{0,160}statusOf/);
  });
  it("starts the scheduler only outside tests (env-guarded)", () => {
    expect(src).toMatch(/SCHED_DISABLED/);
    expect(src).toMatch(/NODE_ENV !== "test"/);
    expect(src).toMatch(/taskScheduler\.start\(\)/);
  });
  it("providerCallFor uses the sealed BYO key + Starter house key, host-allowlisted", () => {
    const i = src.indexOf("async function providerCallFor");
    const seg = src.slice(i, i + 1200);
    expect(seg).toMatch(/providerKeyVault\(\)\.get/);
    expect(seg).toMatch(/isAllowedProxyHost\(k\.baseUrl\)/);
    expect(seg).toMatch(/STARTER_KEY/);
  });
});
