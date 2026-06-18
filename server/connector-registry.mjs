// Connector registry for connector OAuth (P3.4.3a). Server-side CONSTANTS + env secrets ONLY.
// SECURITY-CRITICAL: authorizeUrl / tokenUrl / scopes are fixed here and are NEVER taken from a request.
// That removes SSRF (no attacker-chosen endpoints) and scope-injection (no attacker-chosen scopes) at the
// source. Adding a connector = one entry here + its two env vars — no new code path to audit. No network I/O.

// Each entry: { label, authorizeUrl, tokenUrl, scopes[], clientIdEnv, clientSecretEnv, usePKCE, extraAuthParams }
export const CONNECTORS = {
  "google-gmail": {
    label: "Gmail (read-only)",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"], // least-privilege: read only
    clientIdEnv: "GMAIL_CONNECTOR_CLIENT_ID",
    clientSecretEnv: "GMAIL_CONNECTOR_CLIENT_SECRET",
    usePKCE: true,
    extraAuthParams: { access_type: "offline", prompt: "consent" }, // ask Google for a refresh_token
  },
};

export function getConnector(id) { return CONNECTORS[id] || null; }

// "Configured" only when BOTH the client id + secret env vars are present (else the route returns 501).
export function isConfigured(id, env = process.env) {
  const c = getConnector(id);
  return !!(c && env[c.clientIdEnv] && env[c.clientSecretEnv]);
}

// Resolve per-connector OAuth client credentials from env (server-side only; never sent to the browser).
export function connectorCreds(id, env = process.env) {
  const c = getConnector(id);
  if (!c) return null;
  return { clientId: env[c.clientIdEnv] || "", clientSecret: env[c.clientSecretEnv] || "" };
}

// Public list for the UI: id + label + configured flag. NEVER includes secrets or endpoints.
export function listConnectors(env = process.env) {
  return Object.entries(CONNECTORS).map(([id, c]) => ({ id, label: c.label, configured: isConfigured(id, env) }));
}
