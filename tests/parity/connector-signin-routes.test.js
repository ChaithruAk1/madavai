import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Static route-contract check for the REALIGNED connector OAuth routes (P3.4.5 R2b). Importing auth-server.mjs
// would boot the HTTP server, so we assert against the source text (same pattern as the other route tests).
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");

describe("realigned connector OAuth routes (P3.4.5 R2b)", () => {
  it("defines signin / callback / status / signout", () => {
    expect(src).toContain('p === "/connectors/signin" && req.method === "POST"');
    expect(src).toContain('p === "/connectors/oauth/callback" && req.method === "GET"');
    expect(src).toContain('p === "/connectors/status" && req.method === "GET"');
    expect(src).toContain('p === "/connectors/signout" && req.method === "POST"');
  });

  it("imports the SDK sign-in orchestration", () => {
    expect(src).toMatch(/import \{ beginConnectorSignIn, finishConnectorSignIn.*\} from "\.\/connector-oauth-web\.mjs"/);
  });

  it("signin is authed, rate-limited, SSRF-checked, redirect-guarded", () => {
    const i = src.indexOf('p === "/connectors/signin"');
    const seg = src.slice(i, i + 1400);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/rateLimited\(req, "conn-oauth"/);
    expect(seg).toMatch(/assertSafeMcpUrl\(server\.url\)/);
    expect(seg).toMatch(/isAllowedRedirect\(redirect\)/);
    expect(seg).toMatch(/beginConnectorSignIn\(/);
  });

  it("callback finishes via the orchestration and never puts a token in a URL", () => {
    const i = src.indexOf('p === "/connectors/oauth/callback" && req.method === "GET"');
    const seg = src.slice(i, i + 1100);
    expect(seg).toMatch(/finishConnectorSignIn\(/);
    expect(seg).toContain('"connected="');
    expect(seg).not.toContain("token=");
  });

  it("status / signout require auth and never return a token", () => {
    const i = src.indexOf('p === "/connectors/status"');
    const seg = src.slice(i, i + 1300);
    expect(seg).toMatch(/authUser\(req\)/);
    expect(seg).toMatch(/connected:/);
    expect(seg).not.toContain("access_token");
  });
});
