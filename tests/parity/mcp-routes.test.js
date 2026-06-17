import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Static route-contract check (importing auth-server.mjs would start the HTTP server). Asserts the
// /mcp routes exist and are additive + guarded (auth + rate-limit + SSRF), per WEB-PARITY-PLAN §P6.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("MCP server routes (P3.2)", () => {
  it("defines POST /mcp/tools and /mcp/call", () => {
    expect(src).toMatch(/p === "\/mcp\/tools" && req\.method === "POST"/);
    expect(src).toMatch(/p === "\/mcp\/call" && req\.method === "POST"/);
  });

  it("the mcp block requires auth, rate-limits, and runs the SSRF guard", () => {
    const i = src.indexOf('"/mcp/tools"');
    const j = src.indexOf("/admin/users", i);
    const seg = src.slice(i, j > i ? j : i + 3000);
    expect(seg).toMatch(/verify\(bearer\(req\)\)/);
    expect(seg).toMatch(/rateLimited\(req, "mcp"/);
    expect(seg).toMatch(/assertSafeMcpUrl/);
    expect(seg).toMatch(/mcpForwardHeaders/); // only an allowlist of headers is forwarded
  });

  it("imports the broker module", () => {
    expect(src).toMatch(/import \* as mcpBroker from "\.\/mcp-broker\.mjs"/);
  });

  it("did not alter the existing /proxy/fetch route", () => {
    expect(src).toMatch(/p === "\/proxy\/fetch" && req\.method === "POST"/);
  });
});
