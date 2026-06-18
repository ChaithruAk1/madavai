# RAG-lite — manual test example (copy/paste)

Goal: prove that with **large** project knowledge, the answer (a) focuses on the topic you asked about,
(b) cites the right source, and (c) the system prompt sends only the **relevant excerpts**, not the whole
knowledge base. Plus a control showing **small** knowledge is unchanged.

## Setup
1. Run the web app (`npm run dev` + `node server/auth-server.mjs`) and sign in.
2. Create a Project named **"RAG Test"**.
3. Add the **three** docs below via the Knowledge panel's **"Paste text…"** box (NOT "Add files" — file
   upload into a project is desktop-only on web; pasted text works and is what RAG-lite reads). Paste each
   doc separately; name them as shown if prompted. Together they're ~7.5k chars — over the ~6k budget, so
   RAG-lite engages.

---

### Knowledge doc 1 — Name it: `Zephyr API Reference`
Zephyr is our internal data-sync API. Base URL: https://zephyr.internal.example/v3. All requests authenticate
with a bearer token in the Authorization header; tokens are issued by the Platform team and rotate every 90
days. The three primary endpoints are: GET /records (list, paginated), POST /records (create), and
POST /sync/run (kick off a full reconciliation job). Pagination uses a cursor: pass ?cursor=<token> and read
the next cursor from the `X-Next-Cursor` response header; an empty header means you have reached the last page.
Rate limits are tier-based and enforced per token. The Standard tier allows 60 requests per minute. The
Enterprise tier allows 600 requests per minute and additionally permits 5 concurrent /sync/run jobs. The
Sandbox tier is capped at 10 requests per minute and the window resets on the minute boundary (not a rolling
window). When you exceed a limit, Zephyr returns HTTP 429 with a `Retry-After` header in seconds; clients must
honor it and back off — repeated violations within an hour trigger a temporary 15-minute block on the token.
Error model: 400 for malformed bodies, 401 for an expired or missing token, 409 for a write conflict (retry
with the latest cursor), and 503 during reconciliation windows (safe to retry after the Retry-After delay).
The /sync/run job is asynchronous: it returns a job id immediately, and you poll GET /sync/status/<id> until
the status is `done` or `failed`. Jobs older than 24 hours are purged. Do not call /sync/run more than once
per hour per dataset; overlapping reconciliations are rejected with 409. For bulk reads prefer cursor
pagination over offset, which Zephyr does not support. Webhooks are Enterprise-only and deliver at-least-once,
so consumers must be idempotent. Data model: a record has an id (uuid), a dataset key, a version integer that
increments on every write, a payload object (max 256 KB), and server-set createdAt/updatedAt timestamps in
RFC3339 UTC. Writes must include an `Idempotency-Key` header; replaying the same key within 48 hours returns
the original result instead of creating a duplicate. Field types are strict: numbers are JSON numbers (no
quoted strings), booleans are true/false, and unknown fields are rejected with 400 rather than ignored. The
official SDKs (TypeScript and Python) wrap retries, cursor pagination, and idempotency automatically; hand-
rolled clients should replicate those three behaviors. Breaking changes ship behind a dated version prefix and
the previous version is supported for at least 6 months; deprecations are announced in the #zephyr-announce
channel and in the `Sunset` response header.

### Knowledge doc 2 — Name it: `Helsinki Office Handbook`
The Helsinki office is at Eteläesplanadi 12, 4th floor. Building hours for badge access are 06:00–22:00 on
weekdays; outside those hours you need a security escort arranged a day ahead. New hires collect their access
badge from Reception desk 4B between 09:00 and 11:00 on their first Monday; bring a photo ID. IT setup: pick up
your laptop from the IT bar on the 4th floor (open 08:30–16:30); the default image is macOS with FileVault
enforced, and Windows is available on request for hardware-specific roles. Connect to the `HEL-Corp` Wi-Fi with
your SSO credentials; guests use `HEL-Guest` with a daily code printed at Reception. VPN is required for any
access to internal systems from outside the building — install the GlobalConnect client and authenticate with
SSO plus your hardware key. The fire assembly point is the small park across Eteläesplanadi, by the fountain;
wardens wear yellow vests. Meeting rooms are booked in the calendar system and named after Finnish lakes
(Saimaa, Inari, Päijänne); the two phone booths on the 4th floor are first-come. Kitchen stock is restocked
Tuesday and Thursday mornings. Desk allocation is hot-desking except for the support team, who have fixed desks
near the east windows. For facilities issues (AC, lighting, a jammed door) file a ticket in the Workplace
portal; urgent safety issues go to the building manager on the laminated card at every exit. Parking is limited
and assigned by lottery each quarter; bicycle storage is in the basement, accessed with the same badge.
Commuting: the office is a 5-minute walk from the Market Square tram stop (lines 2 and 4) and a 12-minute walk
from the central station; there are showers on the 4th floor for cyclists and runners. Visitors must be
pre-registered in the Visitor portal by their host at least 2 hours ahead; they sign in at Reception, receive a
temporary badge that opens only the 4th-floor common areas, and must be escorted in secure zones. Printing uses
follow-me printing: send to the `HEL-Secure` queue and release at any printer with your badge; jobs not
released in 24 hours are deleted. Security policy: never hold a door open for someone without a visible badge
(tailgating), lock your laptop when you step away, and report a lost badge to Reception immediately so it can be
revoked. Public holidays follow the Finnish calendar; the office is closed and badge access is restricted to
on-call staff on those days. The local IT and facilities escalation contacts are pinned in the #helsinki-office
channel.

### Knowledge doc 3 — Name it: `INC-4471 Postmortem`
Incident INC-4471 occurred on 2026-03-14 and degraded the billing service for 38 minutes (14:02–14:40 UTC).
Impact: roughly 12% of checkout attempts failed with HTTP 503, and invoice generation was delayed for all
customers during the window. Root cause: the billing service database connection pool was capped at a maximum
of 10 connections, a value carried over from a much smaller earlier deployment. Under a marketing-driven
traffic spike the pool was exhausted; new requests queued past their timeout and returned 503s. Detection: the
on-call engineer was paged by the 503-rate alert 4 minutes after onset; the dashboards clearly showed pool
saturation at 100%. Resolution: the pool maximum was raised from 10 to 80 and the service was rolled
gradually; error rates returned to normal within 6 minutes of the change. Contributing factors: the pool size
was not load-tested after the last capacity increase, and there was no alert specifically on pool utilization
(only on downstream 503s). Action items: (1) add a connection-pool-utilization alert at 80%, owner Platform,
due 2026-03-21; (2) make pool size a reviewed capacity parameter tied to instance count, owner Billing; (3)
add a load test that exercises peak concurrency to the release pipeline; (4) document safe pool sizing in the
service runbook. No data was lost; failed checkouts were retryable and most customers succeeded on retry.
Timeline (UTC): 13:55 marketing email sent to ~2M recipients; 14:02 503 rate crosses 5% and the alert fires
at 14:06; 14:10 on-call confirms pool saturation; 14:22 fix prepared and reviewed; 14:34 rollout begins; 14:40
error rate normal; 15:10 incident closed after monitoring. Customer comms: a status-page notice was posted at
14:18 and updated at 14:45 with resolution; support handled 31 tickets, all resolved with a retry suggestion.
Impact breakdown: EU region saw the highest failure share (~18%) due to time-of-day traffic; APAC was
minimally affected. Follow-up status as of 2026-03-28: action items (1) and (2) are complete and verified in
staging; (3) the peak-concurrency load test is in code review; (4) the runbook update is merged. Lesson:
capacity parameters inherited from older deployments must be revalidated whenever instance counts or traffic
assumptions change, and saturation should be alerted directly rather than inferred from downstream errors.

---

## The test

### Q1 — ask about ONE topic (Zephyr)
Ask in the Project chat: **"What are Zephyr's rate limits, including the sandbox tier?"**
- **PASS:** the answer states **Standard 60/min, Enterprise 600/min (5 concurrent sync jobs), Sandbox 10/min
  reset on the minute**, and references the **Zephyr API Reference** source. It should NOT bring in Helsinki
  badges or INC-4471 details.

### Q2 — a different topic (incident)
Ask: **"What was the root cause of INC-4471 and how long was the impact?"**
- **PASS:** **connection pool capped at 10, exhausted under load → 503s for 38 minutes**, cites **INC-4471
  Postmortem**. No Zephyr/Helsinki content pulled in.

### Q3 — prove the whole knowledge base wasn't dumped (devtools)
1. Open browser devtools → **Network**. Send Q1 again.
2. Click the chat request (`POST …/chat/completions`, or `POST /proxy/chat` if it went through the proxy) →
   **Request payload** → look at the **system** message (`messages[0]`).
3. **PASS:** it contains the header **"Relevant excerpts from this project's knowledge"** plus the **Zephyr**
   passages, and does **NOT** contain the Helsinki or INC-4471 text. (Before this change, the system message
   carried all three docs in full on every turn.)

## Control — small knowledge is unchanged
1. Create a second Project; add ONE tiny knowledge doc named `Note` with content: `The launch date is May 4.`
2. Ask: **"When is the launch?"** → answer: **May 4**.
3. Devtools system message **PASS:** it contains the full `# Note` + `The launch date is May 4.` with **no**
   "excerpts" header (small knowledge is injected whole, exactly as before).

## Pass / fail checklist
- [ ] Q1 returns the correct Zephyr limits and cites Zephyr; no unrelated topics.
- [ ] Q2 returns the correct INC-4471 root cause + 38-minute impact; cites the postmortem.
- [ ] Devtools: large-Project system message shows ranked **excerpts** of only the relevant doc, not all three.
- [ ] Control: small-Project system message shows the whole small doc, no "excerpts" header.
- [ ] Automated: `npx vitest run tests/parity` → `113 passed`.
