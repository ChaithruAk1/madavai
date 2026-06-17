import { describe, it, expect } from "vitest";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { buildCSP } = require("../../shared/csp.cjs");

// Frozen baselines captured 2026-06-17 from shared/csp.cjs. The DESKTOP branches must NOT change
// when web work touches csp.cjs — that is the point of single-sourcing the CSP (ADR-0001, plan §7).
// If a desktop branch changes, this fails: update the baseline only with explicit intent.
const PROD = "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const DEV = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: ws://localhost:5174 http://localhost:5174; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
const WEB = "default-src 'self'; script-src 'self' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src blob: data:; connect-src 'self' https:; frame-src 'self' blob: data: about:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

describe("CSP branches (single-sourced)", () => {
  it("DESKTOP prod branch unchanged", () => {
    expect(buildCSP({ isDev: false })).toBe(PROD);
  });
  it("DESKTOP dev branch unchanged", () => {
    expect(buildCSP({ isDev: true })).toBe(DEV);
  });
  it("WEB branch unchanged", () => {
    expect(buildCSP({ web: true })).toBe(WEB);
  });
  it("bespoke engine needs ('unsafe-eval' + worker blob:) satisfied on every surface", () => {
    for (const csp of [buildCSP({ web: true }), buildCSP({ isDev: false }), buildCSP({ isDev: true })]) {
      expect(csp).toContain("'unsafe-eval'");
      expect(csp).toContain("worker-src 'self' blob:");
    }
  });
  it("web script-src has no 'unsafe-inline' (security fix M1)", () => {
    const scriptSrc = buildCSP({ web: true }).split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeTruthy();
    expect(scriptSrc.includes("'unsafe-inline'")).toBe(false);
  });
});
