# Mac Desktop Build — Scope & Runbook

Scopes adding a **macOS** build of the Madav desktop app (today it ships **Windows‑only**). Covers the build config, the icon, Apple signing + notarization, and the Windows‑only code that needs Mac handling. Where a step can only be done on a Mac, it's called out.

> **Bottom line:** achievable, but it's a real effort, not a flag flip. The core app (chat, projects, agents, documents, terminal) runs on Mac; **three Windows‑only features** need Mac work, and you **must build + sign on a Mac** (electron‑builder can't produce a Mac app from Windows).

---

## 1. Status — done vs. needed

| Item | Status |
|---|---|
| **`build/icon.icns`** (Mac icon) | ✅ **Generated** from the M logo (1024px → icns). |
| **`build/entitlements.mac.plist`** | ✅ **Created** (incl. the JIT entitlements the doc engine needs). |
| `mac` build config block | ⏳ Ready to paste (§3) — not yet wired into `package.json` (kept the live build Windows‑focused for your testing). |
| Apple Developer account + certs | ⏳ Yours to set up (§4). |
| A Mac (or macOS CI runner) to build on | ⏳ Required — electron‑builder mac builds need macOS. |
| Windows‑only feature handling | ⏳ Code work (§5). |

---

## 2. What already works on Mac (no change)

- **Chat / Projects / Agents / Teams / Skills / Connectors / Knowledge** — pure JS, cross‑platform.
- **Documents** (xlsx/docx/pdf/pptx) — built client‑side; the deckjs `eval` path works on Mac **once the JIT entitlements (already in the plist) are applied**.
- **Terminal** — `@homebridge/node-pty-prebuilt-multiarch` is **cross‑platform**; on Mac it uses `forkpty` instead of ConPTY. `electron/terminal.cjs` already branches on `process.platform` (zsh/bash on Mac). electron‑builder rebuilds the native module for darwin during the mac build.
- **Native agent loop / providers / MCP / RAG / scheduler** — platform‑agnostic.

---

## 3. The mac build config (paste into `package.json` → `build`, after the `win` block)

```jsonc
"mac": {
  "icon": "build/icon.icns",
  "category": "public.app-category.productivity",
  "target": [
    { "target": "dmg", "arch": ["arm64", "x64"] },
    { "target": "zip", "arch": ["arm64", "x64"] }   // zip = the auto-update artifact
  ],
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": false                                  // flip to true (or set via env) after §4 signing is ready
},
"dmg": {
  "artifactName": "Madav-${version}-${arch}.dmg"
}
```

Add a build script (runs **on a Mac**):
```jsonc
"electron:build:mac": "node scripts/build-features.mjs --all && vite build && electron-builder --mac --config electron-builder.config.cjs"
```

`electron-builder.config.cjs` already spreads `pkg.build`, so the `mac` block flows through automatically; the Windows signing branches there are guarded by env vars and stay inert on a mac build. (Consider adding a parallel `if (process.env.APPLE_TEAM_ID) build.mac.notarize = {...}` branch later — mirror of the Windows signing pattern.)

> **arm64 + x64:** Apple Silicon (M‑series) is arm64; Intel Macs are x64. The config above builds **both arches**. A single **universal** binary is also possible (`"target": [{"target":"dmg","arch":"universal"}]`) but doubles app size; two per‑arch DMGs is usually leaner.

---

## 4. Apple signing + notarization runbook (do this on a Mac)

Without this, macOS Gatekeeper blocks the app ("Madav is damaged / from an unidentified developer"). Steps:

1. **Enroll in the Apple Developer Program** — ~$99/yr (developer.apple.com). Note your **Team ID**.
2. **Create a "Developer ID Application" certificate** (for distribution *outside* the App Store) in the Apple Developer portal → Certificates. Download it and double‑click to install into the **login keychain** on the build Mac. (electron‑builder auto‑detects a Developer ID cert in the keychain.)
3. **Create an App Store Connect API key** (recommended over Apple‑ID‑password) — App Store Connect → Users and Access → Integrations → App Store Connect API → generate a key with **Developer** role. Download the `.p8`, note the **Key ID** and **Issuer ID**.
4. **Set the signing + notarization env** before building (on the Mac):
   ```bash
   export APPLE_API_KEY="/path/to/AuthKey_XXXXXX.p8"
   export APPLE_API_KEY_ID="XXXXXXXXXX"
   export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   # (alternative: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID)
   ```
   Set the mac config `"notarize": true` (electron‑builder ≥24 notarizes via `notarytool` using the above).
5. **Build:** `npm run electron:build:mac`. electron‑builder will **codesign** (Developer ID + hardened runtime + the entitlements plist), **notarize** (upload to Apple, wait for the ticket), and **staple** the ticket to the DMG.
6. **Verify** on a clean Mac: `spctl -a -vvv /Applications/Madav.app` should say `accepted` / `Notarized Developer ID`. The DMG should open with no Gatekeeper warning.

**CI option:** a GitHub Actions `macos-latest` runner can do all of the above headless — store the cert (`.p12`) + the API key as encrypted secrets, set `CSC_LINK`/`CSC_KEY_PASSWORD` + the `APPLE_API_*` env, run `electron:build:mac`. This avoids needing a physical Mac.

---

## 5. Windows‑only code → Mac handling (the real work)

Three features are Windows‑specific. **Recommended approach: feature‑gate them off on Mac for the first build** (clean degradation), then build Mac equivalents later.

| Module | What it does (Windows) | Mac plan |
|---|---|---|
| `electron/desktop-driver.cjs` | Desktop automation via **PowerShell + UI Automation** (the "agent controls your screen" feature). Used by `desktop-recorder`, `agent-openai`, `session-manager`. | **Phase C reimplement** with macOS **Accessibility API + AppleScript/Apple Events** (the entitlement is already in the plist). **For the first Mac build: gate it OFF** (return "not available on macOS"). |
| `electron/win-speech.cjs` | **Windows speech recognizer** for voice input (mic → text). Referenced by `main.cjs`, `preload.cjs`, `desktop-recorder`. | Mac has its own dictation/speech APIs. **For the first build: gate voice OFF on Mac** (the web SpeechRecognition path also exists as a fallback). Wire Mac dictation in Phase C. |
| `electron/cli-install.cjs` | Installs the `madav` CLI via **PowerShell launchers / PATH**. | Add a **mac branch**: a shell launcher script symlinked into `/usr/local/bin` (or `~/.local/bin`). Small, do it in Phase A. |

`electron/main.cjs:685` and `agent-openai.cjs:36` already use `process.platform === "win32"` guards — verify each has a sane non‑win branch (most do). The single most important rule: **every `win-speech` / `desktop-driver` entry point must check `process.platform` and degrade, not throw**, or the Mac app errors on launch.

---

## 6. Phased plan + effort

- **Phase A — Working (unsigned) Mac build · ~1–2 days on a Mac.** Paste the §3 config; gate the 3 Windows‑only features off on Mac; add the mac `cli-install` branch; `npm run electron:build:mac` → an **unsigned `.dmg`** for internal testing (testers right‑click → Open to bypass Gatekeeper once). Smoke‑test: chat, a document, the terminal, a project.
- **Phase B — Signed + notarized · ~1 day + Apple enrollment.** §4 runbook → a DMG anyone can install with no warnings. This is the shippable Mac build.
- **Phase C — Mac feature parity · later, larger.** Reimplement desktop automation (Accessibility API) and voice (Mac dictation). Only needed if Mac users require the "computer use" + voice features.

---

## 7. Risks / gotchas

- **node-pty native rebuild** must match the exact Electron version for darwin (arm64 + x64). electron‑builder handles it, but a mismatch shows as a blank/crashing terminal — `npm run rebuild` on the Mac if so.
- **Notarization is finicky** — the JIT/library‑validation entitlements (already in the plist) are mandatory for our `eval`‑based doc engine and native modules; without them notarization passes but the app crashes on first deck/terminal use.
- **You cannot test the Mac app without a Mac.** Plan for at least one macOS machine (or a CI runner + a tester's Mac).
- **Two Macs to cover:** Apple Silicon (arm64) and Intel (x64) behave differently for native modules — test on both if you support Intel.

---

## 8. Delivered with this scope
- `build/icon.icns` (Mac icon).
- `build/entitlements.mac.plist` (hardened‑runtime entitlements incl. the JIT keys the doc engine needs).
- The ready‑to‑paste `mac`/`dmg` config + build script (§3).
- The signing/notarization runbook (§4) and the Windows‑only feature plan (§5).

**Not done (needs a Mac / your accounts):** wiring the config into `package.json`, Apple enrollment + certs, the actual build, and the feature‑gating code. Say the word and I'll wire the config + write the `process.platform` gates whenever you're ready to build on a Mac.
