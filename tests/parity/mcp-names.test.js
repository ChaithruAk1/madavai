import { describe, it, expect } from "vitest";
import { mcpSanitize, mcpServersFromSettings, mcpToolName, mcpResultText } from "../../src/bridge/mcpNames.js";

describe("MCP name/config helpers (web)", () => {
  it("mcpServersFromSettings: default [] and keeps only valid https servers", () => {
    expect(mcpServersFromSettings(undefined)).toEqual([]);
    expect(mcpServersFromSettings({})).toEqual([]);
    const out = mcpServersFromSettings({ mcpServers: [
      { url: "https://mcp.acme.io/v1" },
      { url: "http://insecure.example" },                 // dropped: not https
      { url: "https://x.io", headers: { Authorization: "Bearer t" } },
      null, "nope", { nope: 1 },
    ] });
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe("https://mcp.acme.io/v1");
    expect(out[0].id).toBe("mcp-acme-io");
    expect(out[1].headers.Authorization).toBe("Bearer t");
  });

  it("mcpToolName: prefixed, safe charset, <=64 chars", () => {
    const n = mcpToolName("Acme Server!", "search/files");
    expect(n.startsWith("mcp__")).toBe(true);
    expect(/^[a-z0-9_-]+$/.test(n)).toBe(true);
    expect(n.length).toBeLessThanOrEqual(64);
  });

  it("mcpSanitize: never empty, trims junk", () => {
    expect(mcpSanitize("")).toBe("mcp");
    expect(mcpSanitize("  Hello World!  ")).toBe("hello-world");
  });

  it("mcpResultText: extracts text content", () => {
    expect(mcpResultText({ content: [{ type: "text", text: "hi" }, { type: "text", text: "there" }] })).toBe("hi\nthere");
    expect(mcpResultText("plain")).toBe("plain");
    expect(mcpResultText(null)).toBe("(no result)");
  });
});
