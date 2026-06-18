// server/connector-oauth.mjs — connector OAuth token exchange (P3.4.3c). The ONE place that turns an auth
// code into provider tokens. `fetch` is injectable so this unit-tests with no network. `tokenUrl` comes from
// the registry CONSTANT (never the request). Secrets are passed in by the caller (server-side env only) and
// are never logged here. Returns the provider's parsed JSON: { access_token, refresh_token?, expires_in?, scope?, error? }.
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
