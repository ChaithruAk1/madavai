# Windows Code Signing — runbook

BrainEdge's build signs the installer automatically **when signing credentials are present
in the environment**, and stays unsigned (dev/admin builds unaffected) when they're not.
Wiring lives in `electron-builder.config.cjs`; `npm run electron:build` uses it.

## What signing does (and doesn't)
- **Does:** removes the SmartScreen "unknown publisher" scare, shows *your* verified name
  as publisher, and lets users detect a tampered/repackaged BrainEdge.
- **Doesn't:** hide or protect your source. Signing is about authenticity, not secrecy.

## You must obtain a certificate yourself
Since June 2023 code-signing private keys must live in certified hardware (HSM/USB token)
or a cloud signing service — there is no simple key-file path for a trusted cert anymore.
Pick one route:

### Route A — Azure Trusted Signing (recommended)
Cheapest and CI-friendly (~$10/month). Requires a verified org or, for individuals,
3 years of history. Once set up:
```
set AZURE_SIGNING=1
set AZURE_SIGNING_ACCOUNT=<your account name>
set AZURE_SIGNING_PROFILE=<your profile name>
set AZURE_TENANT_ID=...    & set AZURE_CLIENT_ID=...    & set AZURE_CLIENT_SECRET=...
npm run electron:build
```

### Route B — OV certificate on a USB token (DigiCert/Sectigo/etc.)
~$200–400/yr. The cert arrives on a FIPS token; install it into the Windows cert store,
put the Windows SDK's `signtool` on PATH, then:
```
set CSC_SHA1=<certificate thumbprint, no spaces>
npm run electron:build
```
Note: token signing needs the PIN entered interactively — not headless-CI friendly.

### Route C — legacy .pfx (only if you already hold one)
```
set WIN_CSC_LINK=C:\path\to\cert.pfx
set WIN_CSC_KEY_PASSWORD=...
npm run electron:build
```

## Verify a signed build
Right-click the produced `release\*.exe` → Properties → **Digital Signatures** tab should
list your name with a valid timestamp. Or: `signtool verify /pa /v release\BrainEdge*.exe`.

## EV vs OV
An **EV** cert grants instant SmartScreen reputation; an **OV** cert builds reputation only
after enough installs. Azure Trusted Signing behaves like EV for reputation purposes and is
the best value today.
