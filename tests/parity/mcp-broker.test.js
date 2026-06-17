import { describe, it, expect } from "vitest";
import { isPrivateHost, assertSafeMcpUrl, toOpenAiTools } from "../../server/mcp-broker.mjs";

// Pure-function tests only — the live connect/listTools/callTool need a real MCP server and are
// verified after deploy (P3.2). Importing the module does NOT load the MCP SDK (it's lazy).

describe("MCP broker — SSRF guard", () => {
  it("blocks loopback / private / link-local / metadata / internal hosts", () => {
    for (const h of [
      "localhost", "x.localhost", "127.0.0.1", "0.0.0.0", "10.0.0.5", "192.168.1.1",
      "172.16.0.1", "172.31.255.255", "169.254.169.254", "100.64.0.1",
      "::1", "fd00::1", "fe80::1", "metadata.google.internal", "svc.internal", "printer.local",
    ]) {
      expect(isPrivateHost(h), h).toBe(true);
    }
  });

  it("allows ordinary public hosts", () => {
    for (const h of ["api.example.com", "mcp.acme.io", "8.8.8.8", "203.0.113.10", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateHost(h), h).toBe(false);
    }
  });

  it("assertSafeMcpUrl requires https and a public host", () => {
    expect(() => assertSafeMcpUrl("http://api.example.com/mcp")).toThrow(/https/);
    expect(() => assertSafeMcpUrl("https://localhost/mcp")).toThrow(/private|loopback|internal/);
    expect(() => assertSafeMcpUrl("https://169.254.169.254/")).toThrow();
    expect(() => assertSafeMcpUrl("ftp://example.com")).toThrow();
    expect(() => assertSafeMcpUrl("not a url")).toThrow();
    expect(assertSafeMcpUrl("https://mcp.acme.io/v1").hostname).toBe("mcp.acme.io");
  });
});

describe("MCP broker — tool schema mapping", () => {
  it("toOpenAiTools maps shape + prefixes the name", () => {
    const out = toOpenAiTools([
      { name: "search", description: "find things", inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("function");
    expect(out[0].function.name).toBe("mcp__search");
    expect(out[0].function.parameters.properties.q.type).toBe("string");
  });

  it("tolerates a tool with no schema/description", () => {
    const out = toOpenAiTools([{ name: "ping" }]);
    expect(out[0].function.name).toBe("mcp__ping");
    expect(out[0].function.parameters).toEqual({ type: "object", properties: {} });
  });
});
