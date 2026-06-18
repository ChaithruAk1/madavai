import { describe, it, expect } from "vitest";
import { dataToolsRule } from "../../core/agent-rules.js";

// ADR-0001 core: ONE ESM source emits the per-surface data-tools rule, selected by adapter capability.
// Desktop (shell+Node) and web (Pyodide) differ BY EXECUTION MODEL — this guards that each gets the right one.
describe("core/agent-rules dataToolsRule — single source, adapter-selected", () => {
  it("desktop caps (shell) -> the shell/Node rule", () => {
    const d = dataToolsRule({ shell: true });
    expect(d).toMatch(/run_bash/);
    expect(d).toMatch(/exceljs/);
    expect(d).not.toMatch(/There is no system shell/);
  });
  it("web caps (no shell) -> the browser/Pyodide rule", () => {
    const w = dataToolsRule({ shell: false });
    expect(w).toMatch(/run_python/);
    expect(w).toMatch(/no system shell or pip/);
    expect(w).not.toMatch(/run_bash/);
  });
  it("default (no caps) is the web/browser rule (safe default)", () => {
    expect(dataToolsRule()).toBe(dataToolsRule({ shell: false }));
  });
  it("the two surfaces genuinely differ (proves selection, not a single shared string)", () => {
    expect(dataToolsRule({ shell: true })).not.toBe(dataToolsRule({ shell: false }));
  });
});
