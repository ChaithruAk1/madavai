// server/connector-oauth.mjs — connector OAuth token exchange + refresh (P3.4.3c / P3.4.4). The places that
// turn an auth code (or a refresh token) into provider tokens. `fetch` is injectable so these unit-test with
// no network. `tokenUrl` comes from the registry CONSTANT (never the request). Secrets are passed in by the
// caller (server-side env only) and are never logged here.

// Auth-code -> tokens (P3.4.3c). Returns { access_token, refresh_token?, expires_in?, scope?, error? }.
export async function exchangeCodeForToken(
  { tokenUrl, clientId, clientSecret, code, codeVerifier, redirectUri }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier, // PKCE proof — binds the code to the verifier minted at /start
  });
  const r = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return r.json();
}

// Refresh token -> a fresh access token (P3.4.4). Returns { access_token, expires_in?, scope?, refresh_token?, error? }.
export async function refreshAccessToken(
  { tokenUrl, clientId, clientSecret, refreshToken }, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const r = await fetchImpl(tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return r.json();
}
