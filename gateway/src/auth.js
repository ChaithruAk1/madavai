// The gateway IS an OAuth authorization server (so Madav's standard MCP OAuth client can
// register + sign in), but it doesn't hold any user credentials — it BROKERS the real
// provider's OAuth. Flow per provider:
//   Madav → /authorize  →  we redirect the user to GitHub/Notion/Slack
//   provider → /oauth/<id>/callback  →  we swap the provider code for the provider token
//   we mint OUR auth code → bounce back to Madav's redirect with it
//   Madav → /token  →  we issue a gateway access token mapped to the provider token
import crypto from "node:crypto";
import { clients, tokens, authCodes, pendings } from "./store.js";
import { PROVIDERS } from "./providers.js";

const rnd = (n = 32) => crypto.randomBytes(n).toString("base64url");

class ClientsStore {
  async getClient(clientId) { return clients.get(clientId); }
  async registerClient(client) {                         // dynamic client registration
    const full = { ...client, client_id: client.client_id || "mcpc_" + rnd(10), client_id_issued_at: Math.floor(Date.now() / 1000) };
    clients.set(full);
    return full;
  }
}

// Which connector a request targets is taken from the RFC 8707 `resource` param the MCP
// client sends (e.g. https://gw/github/mcp → "github"). One AS, many connectors.
function providerFromResource(resource) {
  try { const seg = new URL(resource).pathname.split("/").filter(Boolean); return PROVIDERS[seg[0]] ? seg[0] : null; }
  catch { return null; }
}
const configured = () => Object.keys(PROVIDERS).filter((k) => PROVIDERS[k].clientId() && PROVIDERS[k].clientSecret());

// A SINGLE authorization server for every connector (mounted at the gateway root, which is
// where the MCP SDK expects /authorize, /token, /register to live).
export function makeSharedProvider({ publicUrl }) {
  const store = new ClientsStore();
  return {
    get clientsStore() { return store; },

    async authorize(client, params, res) {
      const fail = (desc) => { const u = new URL(params.redirectUri); u.searchParams.set("error", "invalid_target"); u.searchParams.set("error_description", desc); if (params.state) u.searchParams.set("state", params.state); res.redirect(u.toString()); };
      const list = configured();
      const providerId = providerFromResource(params.resource) || (list.length === 1 ? list[0] : null);
      if (!providerId) return fail("Unknown or missing connector. Use the per-connector MCP URL, e.g. /github/mcp.");
      const prov = PROVIDERS[providerId];
      const pendingId = rnd(16);
      pendings.set(pendingId, {
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        provider: providerId,
      });
      const cb = `${publicUrl}/oauth/${providerId}/callback`;
      const u = new URL(prov.authorizeUrl);
      u.searchParams.set("client_id", prov.clientId());
      u.searchParams.set("redirect_uri", cb);
      u.searchParams.set("response_type", "code");
      if (prov.scopes) u.searchParams.set("scope", prov.scopes);
      if (prov.authorizeExtra) for (const [k, v] of Object.entries(prov.authorizeExtra)) u.searchParams.set(k, v);
      u.searchParams.set("state", pendingId);            // our pending id carries the MCP session
      res.redirect(u.toString());
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
      const rec = authCodes.peek(authorizationCode);
      if (!rec || rec.clientId !== client.client_id) throw new Error("invalid_grant");
      return rec.codeChallenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode) {
      const rec = authCodes.take(authorizationCode);     // single use
      if (!rec || rec.clientId !== client.client_id) throw new Error("invalid_grant");
      const access = "gwt_" + rnd(32);
      tokens.set(access, { provider: rec.provider, providerToken: rec.providerToken, clientId: client.client_id, sub: rec.sub });
      return { access_token: access, token_type: "Bearer", expires_in: 60 * 60 * 24 * 30, scope: "" };
    },

    async exchangeRefreshToken() { throw new Error("unsupported_grant_type"); },

    async verifyAccessToken(token) {
      const v = tokens.get(token);
      if (!v) throw new Error("invalid_token");
      return { token, clientId: v.clientId, scopes: [], extra: { provider: v.provider, providerToken: v.providerToken } };
    },

    async revokeToken(_client, request) { if (request && request.token) tokens.del(request.token); },
  };
}

// Provider's own OAuth redirect lands here (state = our pending id).
export async function handleProviderCallback(providerId, req, res, publicUrl) {
  const prov = PROVIDERS[providerId];
  const { code, state, error } = req.query;
  if (error) return res.status(400).send("Sign-in failed at the provider: " + String(error));
  const pend = state ? pendings.take(String(state)) : null;
  if (!pend) return res.status(400).send("Sign-in session expired — start again from Madav.");
  try {
    const cb = `${publicUrl}/oauth/${providerId}/callback`;
    const { providerToken } = await prov.exchange({ code: String(code), redirectUri: cb });
    const gwCode = "gwc_" + rnd(24);
    authCodes.set(gwCode, { clientId: pend.clientId, redirectUri: pend.redirectUri, codeChallenge: pend.codeChallenge, provider: providerId, providerToken, sub: providerId });
    const back = new URL(pend.redirectUri);
    back.searchParams.set("code", gwCode);
    if (pend.state) back.searchParams.set("state", pend.state);
    res.redirect(back.toString());
  } catch (e) {
    res.status(502).send("Could not complete sign-in: " + String((e && e.message) || e));
  }
}
