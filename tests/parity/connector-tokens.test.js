import { describe, it, expect } from "vitest";
import { refreshAccessToken } from "../../server/connector-oauth.mjs";
import { makeConnectorTokens } from "../../server/connector-tokens.mjs";

const NOW = 1000000;
const PAST = 1; // a real, positive, already-elapsed expiry (not 0, which means "no known expiry")
const stubFetch = (jsonObj, cap) => async (url, opts) => {
  if (cap) { cap.url = url; cap.body = opts.body.toString(); }
  return { json: async () => jsonObj };
};
function fakeVault(initial = {}) {
  const m = new Map(Object.entries(initial));
  const k = (u, c) => u + "|" + c;
  return { _m: m, async get(u, c) { return m.get(k(u, c)) || null; },
    async put(u, c, v) { m.set(k(u, c), v); }, async remove(u, c) { m.delete(k(u, c)); } };
}
const ENV = { GMAIL_CONNECTOR_CLIENT_ID: "CID", GMAIL_CONNECTOR_CLIENT_SECRET: "SEC" };

describe("refreshAccessToken (P3.4.4)", () => {
  it("POSTs grant_type=refresh_token + creds, returns the new token", async () => {
    const cap = {};
    const t = await refreshAccessToken(
      { tokenUrl: "https://oauth2.googleapis.com/token", clientId: "CID", clientSecret: "SEC", refreshToken: "RT" },
      stubFetch({ access_token: "AT", expires_in: 3600 }, cap));
    const q = new URLSearchParams(cap.body);
    expect(q.get("grant_type")).toBe("refresh_token");
    expect(q.get("refresh_token")).toBe("RT");
    expect(q.get("client_id")).toBe("CID");
    expect(q.get("client_secret")).toBe("SEC");
    expect(t.access_token).toBe("AT");
  });
});

describe("getAccessToken (P3.4.4) — refresh + re-seal, keyed by user", () => {
  it("returns the token unchanged when not near expiry (no refresh)", async () => {
    const v = fakeVault({ "u|google-gmail": { access_token: "AT", refresh_token: "RT", expires_at: NOW + 5 * 60000 } });
    let called = false;
    const ct = makeConnectorTokens(v, ENV, async () => { called = true; return { json: async () => ({}) }; }, () => NOW);
    expect(await ct.getAccessToken("u", "google-gmail")).toBe("AT");
    expect(called).toBe(false);
  });

  it("refreshes + re-seals when expired; keeps the old refresh_token if not rotated", async () => {
    const v = fakeVault({ "u|google-gmail": { access_token: "OLD", refresh_token: "RT", expires_at: PAST, scope: "s" } });
    const ct = makeConnectorTokens(v, ENV, stubFetch({ access_token: "NEW", expires_in: 3600 }), () => NOW);
    expect(await ct.getAccessToken("u", "google-gmail")).toBe("NEW");
    const rec = await v.get("u", "google-gmail");
    expect(rec.access_token).toBe("NEW");
    expect(rec.refresh_token).toBe("RT");
    expect(rec.expires_at).toBe(NOW + 3600 * 1000);
  });

  it("persists a rotated refresh_token when the provider returns one", async () => {
    const v = fakeVault({ "u|google-gmail": { access_token: "OLD", refresh_token: "RT", expires_at: PAST } });
    const ct = makeConnectorTokens(v, ENV, stubFetch({ access_token: "NEW", refresh_token: "RT2", expires_in: 100 }), () => NOW);
    await ct.getAccessToken("u", "google-gmail");
    expect((await v.get("u", "google-gmail")).refresh_token).toBe("RT2");
  });

  it("expired with no refresh_token -> null", async () => {
    const v = fakeVault({ "u|google-gmail": { access_token: "OLD", expires_at: PAST } });
    const ct = makeConnectorTokens(v, ENV, async () => ({ json: async () => ({}) }), () => NOW);
    expect(await ct.getAccessToken("u", "google-gmail")).toBe(null);
  });

  it("invalid_grant -> null AND the record is removed (force reconnect)", async () => {
    const v = fakeVault({ "u|google-gmail": { access_token: "OLD", refresh_token: "RT", expires_at: PAST } });
    const ct = makeConnectorTokens(v, ENV, stubFetch({ error: "invalid_grant" }), () => NOW);
    expect(await ct.getAccessToken("u", "google-gmail")).toBe(null);
    expect(await v.get("u", "google-gmail")).toBe(null);
  });

  it("no stored record -> null", async () => {
    const ct = makeConnectorTokens(fakeVault({}), ENV, async () => ({ json: async () => ({}) }));
    expect(await ct.getAccessToken("u", "google-gmail")).toBe(null);
  });
});
