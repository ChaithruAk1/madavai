# Managed-Service Web Features — design + the decisions you owe (VENDOR-GATED)

**Status: DESIGN ONLY — and blocked on your vendor choices.** These are the three remaining scorecard §4
items that are `SERVICE` (reachable on web only via a managed third party): **browser automation**, **Telegram/
mobile messaging**, **voice transcription**. Desktop does each locally; the browser can't, so web needs a
server-side proxy to a vendor. I did **not** build any of these — each needs you to pick a vendor and provide a
key, and each accepts a new secret/surface that goes through the same review gate as the connector vault and
the scheduler. This note exists so those decisions are crisp when you're back.

## Shared architecture (same template for all three)
Identical to what the scheduler + connector vault already established — reuse, don't reinvent:
1. **Server-side only.** The vendor key lives in env (or the AES-256-GCM vault for per-user keys), never in the
   browser. A new additive route on `auth-server.mjs` proxies the call, `authUser`-gated + rate-limited.
2. **SSRF/allowlist + caps.** Reuse `isAllowedProxyHost`/`assertSafeMcpUrl`; cap payload sizes and per-user
   daily usage (mirror the Starter quota + scheduler caps).
3. **Capability honesty.** Flip the `webCapabilities` entry from "coming" to live only when wired; keep a
   graceful message until then (the bridge stubs already say "desktop app").
4. **Design-note-first per service**, then: additive route → bridge method → UI unstub. No desktop change.

---

## 1. Browser automation (`automation.browser`)
- **Desktop:** drives a real local browser. **Web blocker:** a browser tab can't spawn or control another
  browser; needs a managed headless browser.
- **Vendor options:** Browserless, ScrapingBee, Steel.dev, or a self-hosted Playwright service. (Anthropic's
  own "Claude in Chrome" is a different, extension-based path — not a server vendor.)
- **Surface/threats:** SSRF (the model picks URLs → must allowlist/deny private ranges), cost (per-session
  billing → daily cap), and prompt-injection from fetched pages (sanitize/limit what re-enters the model).
- **Decision you owe:** which vendor (or none yet), and whether to gate it behind a per-user opt-in like BYO keys.

## 2. Telegram / mobile messaging (`comms.messaging`)
- **Desktop:** runs a Telegram bot locally (`applyMessaging`/`messagingStatus` → "desktop app only" on web).
- **Web blocker:** a bot needs a persistent process/webhook; a browser can't host it. Needs a **server-hosted
  bot** (long-poll worker or a Telegram webhook → `auth-server` route).
- **Surface/threats:** the bot token is a powerful secret (vault it); inbound messages are untrusted input
  (authenticate the Telegram user → Madav account binding); abuse/rate limits.
- **Decision you owe:** is messaging a per-user bot (each user supplies a token) or one Madav-hosted bot with
  account linking? (Changes the custody + linking design materially.)

## 3. Voice transcription (`voice.transcribe`)
- **Desktop:** local transcription. **Web today:** browser mic capture only; `transcribe` is absent from
  `webBridge`. Needs a managed STT.
- **Vendor options:** OpenAI Whisper API, Deepgram, AssemblyAI, or the user's own BYO key (cheapest to ship —
  reuse the provider-key vault + a `/transcribe` proxy route).
- **Surface/threats:** audio upload size cap, per-user quota, and the key (env or BYO vault). Lowest complexity
  of the three — and **BYO-key Whisper is buildable without a Madav-side vendor commitment.**
- **Decision you owe:** Madav-hosted STT (pick a vendor + eat the cost) vs **BYO-key only** (recommended first
  step — zero vendor commitment, reuses S3a's vault).

---

## Recommendation (when you're back)
Rank by value-to-effort and vendor-independence:
1. **Voice transcription, BYO-key** — smallest, reuses the provider-key vault, no Madav vendor commitment.
2. **Browser automation** — highest user value, but real SSRF/cost/injection surface; needs a vendor + a
   security note before any code.
3. **Telegram** — most design-dependent (per-user vs hosted bot); decide the custody model first.

Each is a separate, gated increment. **Nothing here is built; all three await your call.**
