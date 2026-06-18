#!/usr/bin/env node
// End-to-end test of the WEB connector chain (P3.4.5), server-side, in-process — NO network, NO browser.
// It stitches the REAL modules together and mocks only the MCP SDK's auth() (the single external boundary):
//   begin sign-in -> (consent, mocked) -> finish callback -> tokens SEALED in the real vault over a real
//   JSON store -> a SILENT provider reads them back (what the /mcp broker uses) -> transportInit attaches it.
// Asserts: single-use state, NO plaintext token at rest, per-user isolation, disconnect.
//   Run:  node tests/e2e/connectors-flow.e2e.mjs   (exit 0 = pass, 1 = fail)
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SESSION_SECRET = "x".repeat(40);   // strong key so the vault won't refuse
delete process.env.DATABASE_URL;               // force the JSON store backend
const tmp = path.join(os.tmpdir(), "madav-e2e-conn-" + process.pid + "-" + Date.now() + ".json");
process.env.STORE_FILE = tmp;

const { makeStore } = await import("../../server/store.mjs");
const { makeConnectorVault } = await import("../../server/connector-vault.mjs");
const { makeOAuthStateStore } = await import("../../server/oauth-state.mjs");
const { makeWebOAuthProvider, beginConnectorSignIn, finishConnectorSignIn } = await import("../../server/connector-oauth-web.mjs");
const { transportInit } = await import("../../server/mcp-broker.mjs");

const REDIR = "https://app.example/connectors/oauth/callback";
const SERVER = { id: "acme-mcp", url: "https://mcp.acme.example/mcp", transport: "http" };
const ACCESS = "ACCESS_TOKEN_SECRET_e2e", REFRESH = "REFRESH_TOKEN_SECRET_e2e";
let step = 0;
const hdr = (m) => console.log("\n[" + (++step) + "] " + m);
const ok = (m) => console.log("  ✓ " + m);

let code = 0;
try {
  const store = await makeStore();
  const vault = makeConnectorVault(store);          // real AES-256-GCM vault over the temp JSON store
  const pending = makeOAuthStateStore(store);

  // mock SDK auth(): start leg registers a client + PKCE verifier and emits the authorize URL
  const authBegin = async (provider) => {
    await provider.saveClientInformation({ client_id: "dcr-client" });
    provider.saveCodeVerifier("VERIFIER_e2e");
    provider.redirectToAuthorization(new URL("https://provider.example/consent?state=" + provider.state()));
    return "REDIRECT";
  };
  // finish leg: the provider must carry the verifier; save tokens as the SDK would after exchanging the code
  const authFinish = async (provider, { authorizationCode }) => {
    assert.equal(authorizationCode, "AUTH_CODE_e2e", "callback must pass the provider code to the SDK");
    assert.equal(provider.codeVerifier(), "VERIFIER_e2e", "PKCE verifier must survive the two requests");
    await provider.saveTokens({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, scope: "read" });
    return "AUTHORIZED";
  };

  hdr("Begin sign-in");
  const begun = await beginConnectorSignIn({ vault, pending, userId: "user-1", server: SERVER, redirectUrl: REDIR, redirect: "", authFn: authBegin });
  assert.equal(begun.ok, true); assert.ok(begun.authorizeUrl, "returns an authorize URL");
  const stateId = new URL(begun.authorizeUrl).searchParams.get("state");
  assert.match(stateId, /^[0-9a-f]{32}$/, "state id is high-entropy");
  ok("authorize URL returned; pending state + verifier stored server-side");

  hdr("Finish sign-in (provider redirects back with code + state)");
  const fin = await finishConnectorSignIn({ vault, pending, stateId, code: "AUTH_CODE_e2e", redirectUrl: REDIR, authFn: authFinish });
  assert.equal(fin.ok, true); assert.equal(fin.userId, "user-1"); assert.equal(fin.serverId, "acme-mcp");
  ok("code exchanged; tokens sealed under (user-1, acme-mcp)");

  hdr("State is single-use");
  const replay = await finishConnectorSignIn({ vault, pending, stateId, code: "AUTH_CODE_e2e", redirectUrl: REDIR, authFn: authFinish });
  assert.equal(replay.ok, false, "the same state cannot be consumed twice");
  ok("replaying the state is rejected");

  hdr("No plaintext token at rest");
  const onDisk = fs.readFileSync(tmp, "utf8");
  assert.equal(onDisk.includes(ACCESS), false, "access token must not be in the store file");
  assert.equal(onDisk.includes(REFRESH), false, "refresh token must not be in the store file");
  assert.equal(onDisk.includes("access_token"), false, "not even the field name should leak");
  ok("the on-disk store contains ciphertext only");

  hdr("The /mcp broker reads the token back (silent provider) and attaches it");
  const silent = makeWebOAuthProvider({ vault, userId: "user-1", server: SERVER, redirectUrl: REDIR, interactive: false });
  assert.equal((await silent.tokens()).access_token, ACCESS, "silent provider returns the stored token to server code");
  assert.equal(transportInit({}, silent).authProvider, silent, "transportInit attaches the provider to the MCP transport");
  ok("a connected server's token is available to the broker (never to the browser)");

  hdr("Per-user isolation");
  const other = makeWebOAuthProvider({ vault, userId: "user-2", server: SERVER, redirectUrl: REDIR, interactive: false });
  assert.equal(await other.tokens(), undefined, "a different user sees no token");
  ok("user-2 cannot read user-1's tokens");

  hdr("Disconnect removes the tokens");
  await vault.remove("user-1", "acme-mcp");
  assert.equal(await silent.tokens(), undefined, "after disconnect there is no token");
  ok("disconnect clears the vault entry");

  console.log("\n✅ E2E PASSED — full web connector chain works end-to-end (SDK boundary mocked).");
} catch (e) {
  console.error("\n❌ E2E FAILED:", (e && e.message) || e);
  code = 1;
}
try { fs.unlinkSync(tmp); } catch {}
process.exit(code);
