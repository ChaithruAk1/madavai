# Security Review & Hardening — 2026-06-10
*Full-codebase review (2 review agents over electron/server/cli/src + live header research on industry leaders), findings, and the fixes IMPLEMENTED this session. Verify with `npm run build` + full restart; commit from your own terminal.*

## A. What you must do yourself (cannot be done from code)

1. **ROTATE the OAuth/Stripe secrets in `server/.env` NOW.** The file holds a live Google client secret, GitHub client secret, and Stripe keys. Good news: `git ls-files` confirms `.env` and `users.json` are NOT tracked by git (gitignore works) — no history scrub needed. But they sat on disk through many sessions; rotate before launch.
2. **Set `ALLOW_DEV_LOGIN=0`** (or remove it) in `server/.env` — with it on, `/auth/dev/start?email=<any admin email>` mints an admin session with no OAuth. The server now refuses to START in production with this flag (fix B1), but your local file still has it.
3. **2FA** on Google/GitHub/Stripe/Render accounts (standing item).
4. When you build the next installer: test the packaged app's SDK transport once (see B14 fuses caveat).

## B. Fixes IMPLEMENTED this session

### Server (`server/auth-server.mjs`, `server/store.mjs`)
1. **Prod guard extended** — refuses to start in production when `ALLOW_DEV_LOGIN=1` (was: only default secrets).
2. **Stripe webhook hard-fail** — missing webhook secret or bad signature → 400, nothing processed (was: skipped verification when secret unset → anyone could flip `subscriptionActive`). Plus event-id idempotency (replay protection).
3. **SSRF closed** — `/proxy/fetch` now follows redirects manually (≤5 hops), re-checking every hop against a private-target blocklist (loopback, RFC1918, 169.254 metadata, `.internal`); `/proxy/chat` + `/proxy/models` validate caller-supplied `baseUrl` the same way. Desktop loopback callers keep their local Ollama/LM Studio.
4. **CLI token revocation** — tokens now carry a version; `/cli/verify` rejects stale versions; new admin action `revoke-cli` bumps the version (kills a leaked year-long token at next launch).
5. **CORS tightened** — `Access-Control-Allow-Origin: *` removed; origins are reflected only from an allowlist (own origin + dev ports + `EXTRA_ORIGINS`).
6. **Security headers everywhere** (modeled on the live header set of leading AI products: nonce-grade CSP, COOP/CORP, deny-by-default Permissions-Policy): nosniff, X-Frame-Options DENY, Referrer-Policy, COOP/CORP same-origin, Permissions-Policy (mic kept for push-to-talk), HSTS on https, strict JSON-route CSP, SPA CSP that still permits user-configured provider endpoints + preview CDNs.
7. **Rate limits** on `/auth/*`, `/cli/verify`, `/score-quiz` (429 + Retry-After).
8. **Body-size caps** (100KB auth / 8MB proxy-chat / 1MB default) + `headersTimeout`/`requestTimeout` (slowloris).
9. **Static path guard** boundary-aware (prefix-collision fix).
10. `/.well-known/security.txt` published (vulnerability contact).

### Electron (`electron/*.cjs`, `package.json`)
11. **git argument injection closed** — repo URLs validated (`https?://` only) and passed after `--` in clone; `pull` takes no user args.
12. **Main-window hardening** — `setWindowOpenHandler` (deny; external https opens in system browser), `will-navigate` allowlist (dev server + file://), session permission handler allowing only mic + clipboard (camera/geolocation/USB etc. denied — also on the agent-browser partition).
13. **Webhook server** — timing-safe token compare (sha256-normalized `timingSafeEqual`), 30 req/min/IP rate limit, loud warning when LAN binding is enabled.
14. **Electron fuses** added to the build (`runAsNode:false`, no NODE_OPTIONS, no inspect args, cookie encryption, only-load-from-ASAR) — kills the "relaunch the installer binary as node" local attack. **CAVEAT:** the Agent-SDK transport spawns its child via `ELECTRON_RUN_AS_NODE`; if the anthropic-kind transport fails in a PACKAGED build, set `"runAsNode": true` in `build.electronFuses` (dev is unaffected — fuses apply only at package time).
15. **Headless shell RCE closed** — webhook-triggered agent runs strip the shell tool unless the agent explicitly opts in (`headlessShell: true`), and the prompt is stamped as untrusted external input. Enforced at THREE layers now: mission-runner clones the agent shell-off, `call_agent` handoffs inherit webhook provenance, and a new `noShell` hard-gate in `agent-openai.cjs` removes the tool schema AND refuses execution. The same gate now also enforces per-agent Shell toggles in interactive sessions and team missions (was: mode-based only).
16. **CLI config** written `0600` (was world-readable with plaintext key+token).
17. **MCP servers** no longer inherit the full host environment — minimal env allowlist + per-server env.

### Frontend (`src/`)
18. **Artifact popout same-origin escape closed (was CRITICAL)** — "Open in new tab" previously ran model-generated HTML same-origin (full access to localStorage = API keys + auth token). Now wraps the artifact in a sandboxed iframe (no `allow-same-origin`) inside the popout → opaque origin, zero storage access.
19. **Markdown preview sanitized** — marked output scrubbed of script/iframe/object/embed, `on*` attributes, `javascript:` URLs before innerHTML; `</script>` injection in the srcdoc closed.
20. **Backup restore hardened** — top-level key whitelist, `authBaseUrl` change requires explicit confirm (was: a crafted backup could silently repoint auth+proxy traffic), profile baseUrls validated http(s).
21. **Web folder agent** — explicit rejection of `..`/absolute/`~` path segments (belt-and-braces over the File System Access API).

## C. Verified pre-existing protections (no action)
Settings secrets encrypted via OS keychain (`safeStorage`); strict renderer CSP on desktop; tar-argv zip import; crypto-strength IDs; timing-safe admin key + rate limit; prod default-secret guard; password/payment fields refused by the agent browser; untrusted-content framing on web pages; markdown chat renderer XSS-safe (React elements, https-only links).

## D. Known remaining items (acknowledged, not fixed this session)
- `verify()` token parse can throw on a malformed `Bearer a.b` header (unhandled rejection — cosmetic, request just errors); OAuth error pages interpolate provider error text unescaped (low).
- CDN scripts for artifact previews have no SRI hashes (would need verified per-file hashes; self-hosting the preview libs is the better long-term fix — roadmap).
- Web build CSP is delivered by the auth server only (an `index.html` meta would break artifact previews' CDN loads in dev; acceptable trade).
- vite/vitest dev-chain audit findings (dev-only) — major-version upgrade deferred deliberately.
- Obfuscation is a deterrent, not a control (already understood).

## E. Process recommendations (from the industry research)
Lockfile + `npm ci` + `npm audit --omit=dev` gate in any future CI; Dependabot; code-sign the Windows installer (Authenticode/Azure Trusted Signing) before public distribution; keep Electron within its 3 supported majors; structured auth logs already exist — add alerting when you have a host; a HackerOne-style disclosure program is overkill today, `security.txt` (done) is the right size.
