import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Static route-contract check (importing auth-server.mjs would boot the HTTP server). Asserts the P3.4.3b
// connector routes exist and are guarded, and that the token-accepting callback (P3.4.3c) is NOT here yet.
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("connector OAuth routes (P3.4.3b) — start / list / disconnect", () => {
  it("defines GET /connectors, POST /connectors/:id/oauth/start, POST /connectors/:id/disconnect", () => {
    expect(src).toContain('p === "/connectors" && req.method === "GET"');
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/start$")).toBe(true);
    expect(src.includes("([a-z0-9-]+)\\/disconnect$")).toBe(true);
  });

  it("does NOT define the token-accepting callback route yet (that is gated P3.4.3c)", () => {
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/callback$")).toBe(false);
  });

  it("imports the registry, state store, PKCE, and vault modules", () => {
    expect(src).toMatch(/import \{ getConnector.*\} from "\.\/connector-registry\.mjs"/);
    expect(src).toMatch(/import \{ makeOAuthStateStore \} from "\.\/oauth-state\.mjs"/);
    expect(src).toMatch(/import \{ makeCodeVerifier, codeChallengeS256 \} from "\.\/oauth-pkce\.mjs"/);
    expect(src).toMatch(/import \{ makeConnectorVault \} from "\.\/connector-vault\.mjs"/);
  });

  it("the connector block requires auth, rate-limits, gates on config, and uses PKCE + user-bound state", () => {
    const i = src.indexOf('p === "/connectors" && req.method === "GET"');
    const j = src.indexOf("/admin/users", i);
    const seg = src.slice(i, j > i ? j : i + 4000);
    expect(seg).toMatch(/authUser\(req\)/);                 // authenticated user required
    expect(seg).toMatch(/rateLimited\(req, "conn-oauth"/);  // start route is rate-limited
    expect(seg).toMatch(/rateLimited\(req, "connectors"/);  // list/disconnect rate-limited
    expect(seg).toMatch(/isConfigured\(id\)/);              // 501 when not configured
    expect(seg).toMatch(/501/);
    expect(seg).toMatch(/isAllowedRedirect\(redirect\)/);   // open-redirect guard
    expect(seg).toMatch(/codeChallengeS256\(codeVerifier\)/); // PKCE S256
    expect(seg).toMatch(/oauthStates\.create\(\{ connectorId: id, userId: user\.id/); // state bound to the user
    expect(seg).toMatch(/buildAuthorizeUrl\(/);
    expect(seg).toContain("/oauth/callback");               // start wires the redirect_uri for 3c
  });

  it("never returns a provider token in the connector block", () => {
    const i = src.indexOf('p === "/connectors" && req.method === "GET"');
    const j = src.indexOf("/admin/users", i);
    const seg = src.slice(i, j > i ? j : i + 4000);
    expect(seg).not.toContain("access_token"); // status only — tokens never leave the server here
  });

  it("did not alter the existing /mcp or /admin routes", () => {
    expect(src).toMatch(/p === "\/mcp\/call" && req\.method === "POST"/);
    expect(src).toMatch(/p === "\/admin\/users" && req\.method === "GET"/);
  });
});
