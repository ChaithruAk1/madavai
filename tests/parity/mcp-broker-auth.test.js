import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transportInit } from "../../server/mcp-broker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("mcp broker auth passthrough (P3.4.5 R3b)", () => {
  it("transportInit carries headers and/or the SDK authProvider", () => {
    expect(transportInit({}, null)).toBeUndefined();
    expect(transportInit({ Authorization: "x" }, null)).toEqual({ requestInit: { headers: { Authorization: "x" } } });
    const p = { tag: 1 };
    expect(transportInit({}, p).authProvider).toBe(p);
    const both = transportInit({ a: "1" }, p);
    expect(both.requestInit.headers.a).toBe("1");
    expect(both.authProvider).toBe(p);
  });

  it("the /mcp routes build a SILENT vault provider keyed by the signed-in user when a connector id is given", () => {
    expect(src).toMatch(/import \{ beginConnectorSignIn, finishConnectorSignIn, makeWebOAuthProvider \} from "\.\/connector-oauth-web\.mjs"/);
    // both /mcp/tools and /mcp/call attach a non-interactive (no browser mid-call) provider for the user
    const built = (src.match(/makeWebOAuthProvider\(\{ vault: connectorVault\(\), userId: pl\.sub/g) || []).length;
    expect(built).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/interactive: false \}\) : null/);
    expect(src).toMatch(/listTools\(\{ url, headers: mcpForwardHeaders\(b\.headers\), authProvider \}\)/);
    expect(src).toMatch(/callTool\(\{ url, headers: mcpForwardHeaders\(b\.headers\), name, args: b\.args \|\| \{\}, authProvider \}\)/);
  });
});
