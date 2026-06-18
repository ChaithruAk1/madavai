// server/connector-tokens.mjs — the connector token ACCESS layer (P3.4.4). Reads the sealed token for a
// (user, connector), transparently REFRESHES + re-seals when it's near expiry, and returns a usable access
// token to SERVER code only. Wired to no live outbound call yet — see docs/PHASE3-P3.4.4-TOKEN-USE-REVIEW.md
// for the injection rule a future consumer must follow (constant URL, server-set Authorization, no client headers).
import { getConnector, connectorCreds } from "./connector-registry.mjs";
import { refreshAccessToken } from "./connector-oauth.mjs";

const SKEW_MS = 60000; // refresh ~1 minute before the token actually expires

export function makeConnectorTokens(vault, env = process.env, fetchImpl = fetch, now = () => Date.now()) {
  return {
    // Returns a valid access token for (userId, connectorId), or null if not connected / unrefreshable.
    // userId MUST be the authenticated user's id (never a request field) — this is the wrong-tenant guard (U1).
    async getAccessToken(userId, connectorId) {
      const rec = await vault.get(userId, connectorId);
      if (!rec || !rec.access_token) return null;
      if (!rec.expires_at || rec.expires_at - SKEW_MS > now()) return rec.access_token; // still valid
      if (!rec.refresh_token) return null;                       // expired, can't refresh -> disconnected
      const conn = getConnector(connectorId); if (!conn) return null;
      const { clientId, clientSecret } = connectorCreds(connectorId, env);
      const t = await refreshAccessToken(
        { tokenUrl: conn.tokenUrl, clientId, clientSecret, refreshToken: rec.refresh_token }, fetchImpl);
      if (!t || !t.access_token) {                               // refresh failed
        if (t && t.error === "invalid_grant") await vault.remove(userId, connectorId); // revoked -> force reconnect
        return null;
      }
      await vault.put(userId, connectorId, {                     // re-seal the refreshed token (rotation-safe)
        ...rec,
        access_token: t.access_token,
        refresh_token: t.refresh_token || rec.refresh_token,
        expires_at: t.expires_in ? now() + t.expires_in * 1000 : null,
        scope: t.scope || rec.scope,
      });
      return t.access_token;
    },
  };
}
