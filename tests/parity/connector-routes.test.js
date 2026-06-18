import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// P3.4.5 R3c: the bespoke per-provider Google OAuth routes/modules were RETIRED in favor of the generic
// MCP-SDK flow (/connectors/signin | oauth/callback | status | signout). This guards that they stay gone.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("bespoke connector OAuth retired (P3.4.5 R3c)", () => {
  it("no longer defines the per-connector /connectors/:id/oauth/* or :id/disconnect routes", () => {
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/start$")).toBe(false);
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/callback$")).toBe(false);
    expect(src.includes("([a-z0-9-]+)\\/disconnect$")).toBe(false);
  });

  it("no longer imports the bespoke modules (connector-oauth-web is kept)", () => {
    expect(src).not.toContain('from "./connector-registry.mjs"');
    expect(src).not.toContain('from "./oauth-pkce.mjs"');
    expect(src).not.toContain('from "./connector-oauth.mjs"');
    expect(src).toContain('from "./connector-oauth-web.mjs"');
  });

  it("keeps the realigned generic routes + /mcp + /admin", () => {
    expect(src).toContain('p === "/connectors/signin" && req.method === "POST"');
    expect(src).toContain('p === "/connectors/oauth/callback" && req.method === "GET"');
    expect(src).toMatch(/p === "\/mcp\/call" && req\.method === "POST"/);
    expect(src).toMatch(/p === "\/admin\/users" && req\.method === "GET"/);
  });
});
