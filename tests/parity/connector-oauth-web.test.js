import { describe, it, expect } from "vitest";
import { makeWebOAuthProvider, NeedsSignIn } from "../../server/connector-oauth-web.mjs";

function fakeVault(initial = {}) {
  const m = new Map(Object.entries(initial));
  const k = (u, c) => u + "|" + c;
  return { _m: m, async get(u, c) { return m.get(k(u, c)) || null; },
    async put(u, c, v) { m.set(k(u, c), v); }, async remove(u, c) { m.delete(k(u, c)); } };
}
const REDIR = "https://app.example/connectors/oauth/callback";
const mk = (over = {}) => {
  const flow = over.flow || {};
  const vault = over.vault || fakeVault();
  const p = makeWebOAuthProvider({ vault, userId: over.userId || "u1",
    server: { id: "srv1", url: "https://mcp.example/x" }, redirectUrl: REDIR, flow,
    interactive: over.interactive || false, onAuthUrl: over.onAuthUrl || null });
  return { p, flow, vault };
};

describe("connector-oauth-web — generic SDK OAuthClientProvider (no per-connector code)", () => {
  it("advertises a public PKCE client pointed at the HTTPS callback", () => {
    const { p } = mk();
    expect(p.redirectUrl).toBe(REDIR);
    const m = p.clientMetadata;
    expect(m.redirect_uris).toEqual([REDIR]);
    expect(m.token_endpoint_auth_method).toBe("none");
    expect(m.grant_types).toContain("refresh_token");
  });

  it("round-trips client registration through the vault", async () => {
    const { p, vault } = mk();
    expect(await p.clientInformation()).toBeUndefined();
    await p.saveClientInformation({ client_id: "abc" });
    expect((await p.clientInformation()).client_id).toBe("abc");
    expect((await vault.get("u1", "srv1")).client.client_id).toBe("abc");
  });

  it("round-trips tokens through the vault and keeps client + tokens together", async () => {
    const { p, vault } = mk();
    await p.saveClientInformation({ client_id: "abc" });
    await p.saveTokens({ access_token: "AT", refresh_token: "RT" });
    expect((await p.tokens()).access_token).toBe("AT");
    const stored = await vault.get("u1", "srv1");
    expect(stored.client.client_id).toBe("abc");
    expect(stored.tokens.refresh_token).toBe("RT");
  });

  it("carries the PKCE verifier in flow (throws if asked before set)", () => {
    const { p, flow } = mk();
    expect(() => p.codeVerifier()).toThrow(/verifier/);
    p.saveCodeVerifier("v123");
    expect(flow.codeVerifier).toBe("v123");
    expect(p.codeVerifier()).toBe("v123");
  });

  it("state() returns the route-minted pending id", () => {
    const { p, flow } = mk({ flow: { state: "STATE_ID" } });
    expect(p.state()).toBe("STATE_ID");
  });

  it("silent provider refuses to open a browser; interactive hands back the URL", () => {
    const { p: silent } = mk({ interactive: false });
    expect(() => silent.redirectToAuthorization(new URL("https://provider/auth?x=1"))).toThrow(NeedsSignIn);
    let captured = null;
    const { p: inter } = mk({ interactive: true, onAuthUrl: (u) => { captured = u; } });
    inter.redirectToAuthorization(new URL("https://provider/auth?x=1"));
    expect(captured).toBe("https://provider/auth?x=1");
  });

  it("invalidateCredentials scopes: tokens / client / all", async () => {
    const seed = fakeVault({ "u1|srv1": { client: { client_id: "abc" }, tokens: { access_token: "AT" } } });
    const { p } = mk({ vault: seed });
    await p.invalidateCredentials("tokens");
    expect((await seed.get("u1", "srv1")).tokens).toBeUndefined();
    expect((await seed.get("u1", "srv1")).client.client_id).toBe("abc");
    await p.invalidateCredentials("all");
    expect(await seed.get("u1", "srv1")).toBe(null);
  });

  it("is per-user isolated (vault keyed by userId)", async () => {
    const vault = fakeVault();
    const a = makeWebOAuthProvider({ vault, userId: "userA", server: { id: "srv1" }, redirectUrl: REDIR, flow: {} });
    const b = makeWebOAuthProvider({ vault, userId: "userB", server: { id: "srv1" }, redirectUrl: REDIR, flow: {} });
    await a.saveTokens({ access_token: "A_TOKEN" });
    expect(await b.tokens()).toBeUndefined();
    expect((await a.tokens()).access_token).toBe("A_TOKEN");
  });
});
