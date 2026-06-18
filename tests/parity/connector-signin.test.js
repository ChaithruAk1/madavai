import { describe, it, expect } from "vitest";
import { beginConnectorSignIn, finishConnectorSignIn } from "../../server/connector-oauth-web.mjs";

function fakeVault(initial = {}) {
  const m = new Map(Object.entries(initial)); const k = (u, c) => u + "|" + c;
  return { _m: m, async get(u, c) { return m.get(k(u, c)) || null; },
    async put(u, c, v) { m.set(k(u, c), v); }, async remove(u, c) { m.delete(k(u, c)); } };
}
function fakePending() {
  const m = new Map();
  return { _m: m, async putWithId(id, f) { m.set(id, { id, ...f }); return id; },
    async consume(id) { const r = m.get(id); if (r) m.delete(id); return r || null; } };
}
const REDIR = "https://app.example/connectors/oauth/callback";
const SERVER = { id: "srv1", url: "https://mcp.example/x", transport: "http" };

describe("connector sign-in orchestration (P3.4.5 R2a) — two-request SDK flow", () => {
  it("begin: drives the SDK to a REDIRECT, returns the authorize URL, persists verifier+user", async () => {
    const vault = fakeVault(); const pending = fakePending();
    // mock SDK auth() for the start leg: registers a client, saves the verifier, emits the authorize URL.
    const authFn = async (provider, { serverUrl }) => {
      expect(serverUrl).toBe(SERVER.url);
      await provider.saveClientInformation({ client_id: "dcr-id" });
      provider.saveCodeVerifier("VER123");
      provider.redirectToAuthorization(new URL("https://prov/auth?state=" + provider.state()));
      return "REDIRECT";
    };
    const r = await beginConnectorSignIn({ vault, pending, userId: "u1", server: SERVER, redirectUrl: REDIR, redirect: "https://app/done", authFn });
    expect(r.ok).toBe(true);
    expect(r.authorizeUrl).toContain("https://prov/auth?state=");
    const stateId = new URL(r.authorizeUrl).searchParams.get("state");
    const rec = pending._m.get(stateId);
    expect(rec).toMatchObject({ userId: "u1", serverId: "srv1", codeVerifier: "VER123", redirect: "https://app/done" });
    expect((await vault.get("u1", "srv1")).client.client_id).toBe("dcr-id"); // DCR persisted
  });

  it("begin: if already authorized, reports alreadyConnected and writes no pending state", async () => {
    const pending = fakePending();
    const r = await beginConnectorSignIn({ vault: fakeVault(), pending, userId: "u1", server: SERVER, redirectUrl: REDIR, authFn: async () => "AUTHORIZED" });
    expect(r).toEqual({ ok: true, alreadyConnected: true });
    expect(pending._m.size).toBe(0);
  });

  it("finish: consumes state once, restores the verifier, saves tokens to the vault", async () => {
    const vault = fakeVault(); const pending = fakePending();
    await pending.putWithId("STATE1", { userId: "u1", serverId: "srv1", server: SERVER, codeVerifier: "VER123", redirect: "https://app/done" });
    const authFn = async (provider, { serverUrl, authorizationCode }) => {
      expect(serverUrl).toBe(SERVER.url);
      expect(authorizationCode).toBe("CODE");
      expect(provider.codeVerifier()).toBe("VER123");       // restored from the pending record
      await provider.saveTokens({ access_token: "AT", refresh_token: "RT" });
      return "AUTHORIZED";
    };
    const r = await finishConnectorSignIn({ vault, pending, stateId: "STATE1", code: "CODE", redirectUrl: REDIR, authFn });
    expect(r).toMatchObject({ ok: true, userId: "u1", serverId: "srv1", redirect: "https://app/done" });
    expect((await vault.get("u1", "srv1")).tokens.access_token).toBe("AT");
    expect(pending._m.size).toBe(0);                          // single-use: consumed
  });

  it("finish: rejects an unknown/expired state and never calls the SDK", async () => {
    let called = false;
    const r = await finishConnectorSignIn({ vault: fakeVault(), pending: fakePending(), stateId: "NOPE", code: "CODE", redirectUrl: REDIR, authFn: async () => { called = true; return "AUTHORIZED"; } });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("finish: SDK not AUTHORIZED -> ok:false (no tokens stored)", async () => {
    const vault = fakeVault(); const pending = fakePending();
    await pending.putWithId("S2", { userId: "u1", serverId: "srv1", server: SERVER, codeVerifier: "v" });
    const r = await finishConnectorSignIn({ vault, pending, stateId: "S2", code: "CODE", redirectUrl: REDIR, authFn: async () => "REDIRECT" });
    expect(r.ok).toBe(false);
    expect(await vault.get("u1", "srv1")).toBe(null);
  });
});
