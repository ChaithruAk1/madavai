import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Static route-contract check (importing auth-server.mjs would boot the HTTP server). Asserts the connector
// OAuth routes exist and are guarded. After P3.4.3c the token-accepting callback IS present (and guarded).
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("connector OAuth routes — start / list / disconnect / callback", () => {
  it("defines GET /connectors, POST start, POST disconnect, GET callback", () => {
    expect(src).toContain('p === "/connectors" && req.method === "GET"');
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/start$")).toBe(true);
    expect(src.includes("([a-z0-9-]+)\\/disconnect$")).toBe(true);
    expect(src.includes("([a-z0-9-]+)\\/oauth\\/callback$")).toBe(true); // P3.4.3c now implemented
  });

  it("imports the registry, state store, PKCE, vault, and exchange modules", () => {
    expect(src).toMatch(/import \{ getConnector.*\} from "\.\/connector-registry\.mjs"/);
    expect(src).toMatch(/import \{ makeOAuthStateStore \} from "\.\/oauth-state\.mjs"/);
    expect(src).toMatch(/import \{ makeCodeVerifier, codeChallengeS256 \} from "\.\/oauth-pkce\.mjs"/);
    expect(src).toMatch(/import \{ makeConnectorVault \} from "\.\/connector-vault\.mjs"/);
    expect(src).toMatch(/import \{ exchangeCodeForToken \} from "\.\/connector-oauth\.mjs"/);
  });

  it("start requires auth, rate-limits, gates on config (501), guards redirect, uses PKCE + user-bound state", () => {
    const i = src.indexOf('p === "/connectors" && req.method === "GET"');
    const j = src.indexOf("/admin/users", i);
    const seg = src.slice(i, j > i ? j : i + 6000);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/rateLimited\(req, "conn-oauth"/);
    expect(seg).toMatch(/rateLimited\(req, "connectors"/);
    expect(seg).toMatch(/isConfigured\(id\)/);
    expect(seg).toMatch(/501/);
    expect(seg).toMatch(/isAllowedRedirect\(redirect\)/);
    expect(seg).toMatch(/codeChallengeS256\(codeVerifier\)/);
    expect(seg).toMatch(/oauthStates\.create\(\{ connectorId: id, userId: user\.id/);
    expect(seg).toMatch(/buildAuthorizeUrl\(/);
  });

  it("callback consumes single-use state, checks connector match, seals to the state's user, re-validates redirect, returns no token in a URL", () => {
    const i = src.indexOf("oauth\\/callback$");
    const seg = src.slice(i, i + 1700);
    expect(seg).toMatch(/oauthStates\.consume\(state\)/);          // single-use state (T1/T2)
    expect(seg).toMatch(/ctx\.connectorId !== id/);                // connector match (T1/T3)
    expect(seg).toMatch(/exchangeCodeForToken\(/);
    expect(seg).toMatch(/connectorVault\(\)\.put\(ctx\.userId/);   // sealed to the state's user (T3/T5)
    expect(seg).toMatch(/isAllowedRedirect\(ctx\.redirect\)/);     // re-validate redirect (T7)
    expect(seg).toContain('"connected="');                         // success carries the connector id (T4)
    expect(seg).not.toContain("token=");                           // never a token in a redirect URL
  });

  it("did not alter the existing /mcp or /admin routes", () => {
    expect(src).toMatch(/p === "\/mcp\/call" && req\.method === "POST"/);
    expect(src).toMatch(/p === "\/admin\/users" && req\.method === "GET"/);
  });
});
