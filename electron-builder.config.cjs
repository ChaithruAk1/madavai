// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// electron-builder config = the "build" block from package.json + Windows code signing
// layered on top WHEN signing credentials are present in the environment.
// With no credentials this exports the exact same config as before — dev and admin
// builds stay unsigned and unaffected. See SIGNING.md for the full runbook.
//
// Route A — Azure Trusted Signing (recommended, ~$10/mo):
//   set AZURE_SIGNING=1 and AZURE_SIGNING_ACCOUNT / AZURE_SIGNING_PROFILE (+ the
//   standard Azure auth env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET).
// Route B — OV certificate on a USB token:
//   set CSC_SHA1 to the certificate's thumbprint (cert installed in the Windows
//   store from the token; signtool must be on PATH via the Windows SDK).
// Route C — legacy .pfx file (rare since 2023):
//   set WIN_CSC_LINK (path) + WIN_CSC_KEY_PASSWORD — electron-builder handles those
//   natively; no changes here are needed.

const pkg = require("./package.json");
const build = { ...pkg.build, win: { ...pkg.build.win } };

if (process.env.AZURE_SIGNING === "1") {
  build.win.azureSignOptions = {
    endpoint: process.env.AZURE_SIGNING_ENDPOINT || "https://eus.codesigning.azure.net",
    codeSigningAccountName: process.env.AZURE_SIGNING_ACCOUNT || "",
    certificateProfileName: process.env.AZURE_SIGNING_PROFILE || "",
    timestampRfc3161: "http://timestamp.acs.microsoft.com",
    timestampDigest: "SHA256",
  };
} else if (process.env.CSC_SHA1) {
  build.win.signtoolOptions = {
    ...(build.win.signtoolOptions || {}),
    certificateSha1: process.env.CSC_SHA1,
    rfc3161TimeStampServer: "http://timestamp.digicert.com",
    signingHashAlgorithms: ["sha256"],
  };
}

module.exports = build;
