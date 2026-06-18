import { describe, it, expect } from "vitest";
import { exchangeCodeForToken } from "../../server/connector-oauth.mjs";

const stubFetch = (jsonObj, cap) => async (url, opts) => {
  if (cap) { cap.url = url; cap.method = opts.method; cap.body = opts.body.toString(); }
  return { json: async () => jsonObj };
};

describe("exchangeCodeForToken (P3.4.3c)", () => {
  it("POSTs grant_type=authorization_code + PKCE code_verifier to the constant token URL", async () => {
    const cap = {};
    const tok = await exchangeCodeForToken(
      { tokenUrl: "https://oauth2.googleapis.com/token", clientId: "CID", clientSecret: "SEC",
        code: "AUTHCODE", codeVerifier: "VERIFIER", redirectUri: "https://app/cb" },
      stubFetch({ access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "s" }, cap));
    expect(cap.url).toBe("https://oauth2.googleapis.com/token");
    expect(cap.method).toBe("POST");
    const q = new URLSearchParams(cap.body);
    expect(q.get("grant_type")).toBe("authorization_code");
    expect(q.get("code")).toBe("AUTHCODE");
    expect(q.get("code_verifier")).toBe("VERIFIER");
    expect(q.get("client_id")).toBe("CID");
    expect(q.get("client_secret")).toBe("SEC");
    expect(q.get("redirect_uri")).toBe("https://app/cb");
    expect(tok.access_token).toBe("AT");
  });

  it("returns the provider error object on failure (no throw)", async () => {
    const tok = await exchangeCodeForToken(
      { tokenUrl: "https://t", clientId: "c", clientSecret: "s", code: "x", codeVerifier: "v", redirectUri: "r" },
      stubFetch({ error: "invalid_grant", error_description: "bad code" }));
    expect(tok.access_token).toBeUndefined();
    expect(tok.error).toBe("invalid_grant");
  });
});
