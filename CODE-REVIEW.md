# BrainEdge — Full Code Review & Readiness Report
**Date:** 2026-06-09 · **Scope:** entire codebase · **Status: REPORT ONLY — nothing changed.**
Plain language throughout. §2 has YES/NO boxes for your decisions.

## 1. Where the code is not top-notch

### 1a. Security
| # | Plain-language problem | Where | Severity |
|---|------------------------|-------|----------|
| S1 | Server ships with default passwords ("dev-insecure-secret-change-me", "dev-admin-key"). Forget two env vars in production and anyone can mint admin access. Server must refuse to start without real secrets. | server | CRITICAL |
| S2 | Agent terminal tool runs commands as-is after one approval click. No screen for obviously destructive commands. | desktop engine | HIGH |
| S3 | Skill .zip import vulnerable to "zip slip" — a crafted zip can plant files anywhere on disk. | desktop engine | HIGH |
| S4 | Web app stores API keys in browser localStorage — one script injection steals every key. (Trade-off of keys-stay-on-device; can be hardened, not eliminated.) | web | HIGH |
| S5 | Sign-in token rides in the URL after OAuth — lands in browser history and server logs. | web | MED |
| S6 | Server allows any website to call it (CORS "*") and /proxy endpoints will relay traffic anywhere for signed-in users. | server | MED |
| S7 | Stripe webhook signature check silently OFF if the secret env var is empty — fake "payment succeeded" events possible. | server | MED |
| S8 | Rate limiter trusts a spoofable header (X-Forwarded-For) — limits can be bypassed. | server | MED |
| S9 | CLI token sits in plaintext on disk for ~a year (known/accepted; revalidated online each launch). | cli | LOW |

### 1b. Reliability & efficiency
| # | Probl