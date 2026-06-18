# How to test each phase (plain English)

One section per phase. After each phase I add a new section here and tell you in chat.
You test, then decide whether to commit. Commands are one-per-line (PowerShell-friendly).

---

## Phase 0 — Foundations (the safety net)

**What changed in plain words:** Phase 0 only **added new files**. It did **not** change any code the
app already uses. So the goal of testing is simple: the new safety checks pass, and the app works
**exactly like before** — nothing broke.

**What got added:**
- A rule book for how shared code is allowed to talk to the computer (the "adapter contract").
- A tape recorder that can record a desktop answer and replay it to check new code gives the same
  answer (the "replay harness").
- One master list of which features work on web and what to tell users when they don't.
- 6 automatic test files that guard all of the above.
- A checklist + automatic checks that run when code is pushed.

### Test 1 — Run the new safety tests (about 2 minutes)
In the Madav folder, run:

    npx vitest run tests/parity

**You should see:** `Test Files  6 passed` and `Tests  30 passed`.
✅ If you see 30 passed, the Phase 0 safety net works.

⚠️ Note: if you run the **full** test set (`npx vitest run`) you will see **3 red tests in
"savedStore"**. Those were **already failing before this work** — they are not from Phase 0. I left
them alone on purpose (that file may be desktop code, which I won't touch without your OK). You can
ignore them for now.

### Test 2 — Desktop still works exactly like before (most important)
Start the desktop app the way you normally do (full restart):

    npm run electron:dev

Then check the everyday things:
- Open a chat, send a message → reply streams as normal.
- Open a Project linked to a folder, ask for a report → it makes the Excel file and the Open card
  appears, same as before.
- Open the file → it opens in Excel as before.

**You should see:** no difference at all. Phase 0 added no desktop code, so nothing should look or
behave differently. If anything is different, stop and tell me.

### Test 3 — Web still works, and the build is complete
Build the web app:

    npm run build

Then check the build produced all 4 document engines:

    node scripts/check-worker-chunks.mjs dist

**You should see:** `OK — all 4 worker chunks present`.
Then open the web app (your normal way, or `npm run preview`) and check that chat and making an
Excel/PDF still work as before.

### Test 4 — (optional) Look at the new files
If you want to see what was added:
- `core/adapter.contract.js`
- `core/harness/replay.js`
- `src/bridge/webCapabilities.js`

### Pass / fail
- **PASS** = Test 1 shows 30 passed, **and** desktop + web behave exactly like before.
- If PASS → safe to commit (ask me for the exact commands).
- If anything looks different or breaks → tell me what you saw and I'll fix it before any commit.

**Reminder:** nothing has been committed yet. Phase 0 is all new files; you can also just delete the
new folders (`core/`, `tests/parity/`, `.github/`, `docs/`, `scripts/check-worker-chunks.mjs`,
`src/bridge/webCapabilities.js`) to undo it completely.

---

## Phase 1 — increment 1: web team identity ("not Claude")

**What changed in plain words:** On web, agent **team members** and the **coordinator** now state they
are Madav (not Claude/ChatGPT/Gemini). Desktop already did this; web now matches. Only **one web file**
changed (`src/bridge/webBridge.js`). **No desktop code changed.** This is web-only, so desktop cannot
be affected.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — See it on web (needs a web rebuild)
1. Build + run the web app:

       npm run build

   then open the web app your normal way (or `npm run preview`).
2. Make a small **Agent Team** with 2 members and run any mission.
3. In that chat, ask: **"Who are you and who made you?"**

**You should see:** the answer says **Madav** (not "I'm Claude"). Before this fix, a Claude-distilled
model could reply "I'm Claude" on web.

### Test 3 — Desktop unchanged
Desktop was not touched. If you start the desktop app, agent teams behave exactly as before.

### Pass / fail
- **PASS** = parity tests green, and a web team member/coordinator identifies as Madav.
- If PASS → commit this increment (separate from Phase 0). If not → tell me what it said.

---

## Phase 1 — increment 2: honest web Projects (no silent degrade)

**What changed in plain words:** On web, a **Project** chat could not make files but never said so — it
just replied with text as if everything was fine. Now, on web only, the assistant is told up front
that web Projects can discuss the project's notes but **cannot read a local folder or create/save
files** (those need the desktop app or "Let's Collaborate" with a picked folder). So if you ask for a
spreadsheet in a web Project, it will say so plainly instead of pretending. Only `src/bridge/webBridge.js`
changed. **No desktop code changed** — desktop Projects still make real files exactly as before.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — See it on web (needs a web rebuild)
1. Build + open web:

       npm run build

   then open the web app (or `npm run preview`).
2. Open a **Project** (Workroom) on web.
3. Ask it: **"Make me an Excel file of this data."**

**You should see:** a clear, honest reply — it explains that creating/saving files isn't available in
web Projects and points you to the desktop app or "Let's Collaborate", and it still helps with the
content inline. (Before: it would silently answer in text as if it had made a file.)
Normal questions (no file requested) should still get normal answers.

### Test 3 — Desktop unchanged
Open a folder-linked Project in the **desktop** app, ask for a report → it still creates the real Excel
file and shows the Open card, exactly as before.

### Pass / fail
- **PASS** = parity tests green; web Project is honest about files; desktop Projects still make files.
- If PASS → commit this increment. If not → tell me what it said.

---

## Phase 1 — increment 3: file-output card web fallback

**What changed in plain words:** The "file produced" card (the one with **Folder** and **Open** buttons)
appears after a run makes a file. Those two buttons only work on the desktop app. On **web** they did
nothing. Now, on web, those dead buttons are simply **not shown** (on web the file is already saved in
the folder you picked, so you open it from there). On **desktop, the card is exactly the same as before** —
both buttons still there and working.

⚠️ This is the **first shared-screen change** (the file `src/components/Message.jsx` is used by both
desktop and web). It is gated so the **desktop part is unchanged**. Please check desktop carefully.

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Desktop unchanged (important — this is the shared file)
1. Reload the desktop app (Ctrl+R), or rebuild it your normal way.
2. Run a folder-linked Project that makes a file (e.g. "Execute report for March").
3. Look at the file card that appears.

**You should see:** the **Folder** and **Open** buttons are still there and still work (open the file,
show it in the folder) — **exactly like before**. If anything is different on desktop, stop and tell me.

### Test 3 — Web has no dead buttons
1. Build + open web:

       npm run build

2. If a "file produced" card appears (e.g. in Let's Collaborate after making a file), it should show the
   file name and icon with **no dead buttons** — the file is in the folder you picked.

### Pass / fail
- **PASS** = parity tests green; desktop file card works exactly as before; web shows no dead buttons.
- If PASS → commit. If desktop changed in any way → stop and tell me.

---

## Phase 1 — increment 4: web "Let's Chat" tools (web search + image)

**What changed in plain words:** On web, plain **Let's Chat** could only talk — it couldn't search the
web or make an image, while the desktop app could. Now web chat can do both (and use web_fetch) for
normal chat models. It turns on only when: you're signed in (for web search) or image-gen is enabled,
the model is an OpenAI-style model, you're not in a Project, and your message has no attached image.
If a model can't do tools, chat **automatically falls back to the normal reply** (and remembers that
model so it won't slow down later messages). Only `src/bridge/webBridge.js` changed. **No desktop code
changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Web chat can now search / make an image (needs a web rebuild + sign-in)
1. Build + open web:

       npm run build

2. In **Let's Chat** (not a Project), signed in, ask something current, e.g.:
   **"Search the web for the latest Node.js LTS version and tell me the number."**
   → You should see a **web_search tool step** in the chat, then an answer using it.
3. If you have an image model selected and image-gen on, ask: **"Make an image of a red bicycle."**
   → You should see an image.

### Test 3 — Normal chat still works (the important safety check)
Ask a plain question with **no** web/image need, e.g. **"Explain recursion in two sentences."**
→ You should get a normal answer, same as before. Try your usual models. If a model you use **can't**
do tools, the reply should still come through normally (it quietly falls back).

### Test 4 — Desktop unchanged
Desktop wasn't touched — Let's Chat there behaves exactly as before.

### Pass / fail
- **PASS** = parity tests green; web chat can search/make images when relevant; **plain chat still works
  for all your models**; desktop unchanged.
- If any model's plain chat breaks or feels slower → tell me which model/provider and I'll tighten the
  trigger (or gate it behind a setting).

---

## Phase 1 — increment 5: web team members get tools

**What changed in plain words:** On web, agent **team members** could only write text — they couldn't
search the web or make an image (desktop members can use tools). Now each web team member can use the
same light tools as chat (web search, web fetch, image). Their tool steps show in the chat tagged with
the member's name (e.g. "↳ Researcher: web_search"). If a model can't do tools, that member just writes
a normal answer (safe fallback). Only `src/bridge/webBridge.js` changed. **No desktop code changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Team members can research (web rebuild + signed in)
1. Build + open web:

       npm run build

2. Make an **Agent Team** of 2 members (e.g. "Researcher" + "Writer"), signed in.
3. Run a mission that needs current info, e.g. **"Find the current stable Python version and write a one-paragraph note about it."**

**You should see:** member tool steps tagged with the member name (a **web_search**/**web_fetch** step),
then the team's combined answer using what they found.

### Test 3 — Teams still work with any model (safety check)
Run a team with your usual model(s). Even if a model can't use tools, each member should still produce a
normal text answer and the team should finish — same as before.

### Test 4 — Desktop unchanged
Desktop wasn't touched — agent teams there behave exactly as before.

### Pass / fail
- **PASS** = parity tests green; web team members can search/make images when relevant; teams still
  finish for all your models; desktop unchanged.
- If a team breaks or stalls on a model → tell me which provider/model.

---

## Phase 1 — increment 6: CORRECTION to increment 2 (web Projects CAN make files)

**What changed in plain words:** Increment 2 was too strict — it told web Projects "you cannot create
files." But web already makes real **downloadable** files (Excel/Word/PDF/slide decks) through the normal
office feature, and that prompt rule is also in a web Project — so the two instructions **contradicted**
each other. Fixed: a web Project now correctly **does make downloadable files** when asked. The only real
limit (now stated accurately) is that a web Project has **no linked local folder**, so it can't read or
compute over your existing local data files or save into a folder — that still needs the desktop app or
"Let's Collaborate". Only `src/bridge/webBridge.js` changed. **No desktop code changed.**

### Test 1 — Safety net still green
    npx vitest run tests/parity
**You should see:** `Tests  30 passed`.

### Test 2 — Web Project now makes a file (web rebuild)
1. Build + open web:

       npm run build

2. Open a **Project** on web. Ask: **"Make me an Excel file with a 3-month sales forecast for a coffee shop."**

**You should see:** a real **downloadable file card** (an .xlsx you can download) — NOT a refusal.
(Before this fix it wrongly said it couldn't make files.)

### Test 3 — Folder-data limit is still honest
In a web Project ask: **"Read the sales file in my project folder and total it."**
**You should see:** it explains it can't read a local folder on web and points you to the desktop app or
"Let's Collaborate" — because that part really is desktop-only.

### Test 4 — Desktop unchanged
Desktop Projects still read folders and save real files exactly as before.

### Pass / fail
- **PASS** = parity green; a web Project produces a downloadable file when asked; it's still honest about
  not reading your local folder; desktop unchanged.
- If a web Project still refuses to make a file → tell me the model you used.

---

## Phase 3 — increment P3.1: server MCP broker module (foundation)

**What changed in plain words:** Phase 3 (MCP connectors on web) has begun. This first step adds a new
server file `server/mcp-broker.mjs` that can connect to a remote MCP server over HTTPS, list its tools,
and call them — plus a safety guard that **refuses to connect to private/loopback/internal addresses**
(so the server can't be tricked into hitting your internal network). It is **not wired to anything yet**
(no routes, no agent), so the web app behaves exactly the same. **No desktop code, no existing file
changed** — one new file + one new test. See `docs/PHASE3-MCP.md` for the full plan.

### Test 1 — Safety net (now includes the broker's guard tests)
    npx vitest run tests/parity
**You should see:** `Tests  35 passed` (the 5 new ones test the SSRF guard + tool-schema mapping).

### Test 2 — Nothing else changed
Open the web app (rebuild if you like). Everything works exactly as before — this step added a
behind-the-scenes module only; there's no new button or behavior yet.

### Pass / fail
- **PASS** = `35 passed`, and the web app is unchanged.
- Live MCP connection is tested **after the next step (P3.2)**, which adds the server routes and is
  verified by connecting to a real MCP server post-deploy.

---

## Phase 3 — increment P3.2: /mcp server routes (deploy-tested)

**What changed in plain words:** Added two server endpoints — `POST /mcp/tools` (list a remote MCP
server's tools) and `POST /mcp/call` (call one) — to `server/auth-server.mjs`. Both require sign-in,
are rate-limited, run the SSRF guard, and only forward a small allowlist of headers. **Additive only**
— no existing route changed (a test asserts `/proxy/fetch` is untouched). This is **server-only**: no
`electron/**`, no renderer. Still **not wired to the agent** (P3.3), so the web UI is unchanged.

⚠️ **This is a production-server change** — it only takes effect after a **Render redeploy**; `npm run
dev` alone does not run this server.

### Test 1 — Safety net + route contract
    npx vitest run tests/parity
**You should see:** `Tests  39 passed` (4 new ones check the routes exist, are auth+rate-limit+SSRF
guarded, and that `/proxy/fetch` was not altered).

### Test 2 — Live check (after you deploy to Render)
With your Madav session token, point it at a public **HTTPS** MCP server:

    curl -s -X POST https://<your-render-host>/mcp/tools ^
      -H "Authorization: Bearer <your-madav-token>" ^
      -H "Content-Type: application/json" ^
      -d "{\"url\":\"https://<some-public-mcp-server>/mcp\"}"

**You should see:** a JSON `{ "tools": [...] }` list. A bad/missing token → 401; a private/loopback URL
→ 400 "Refusing to connect…"; no token bucket abuse (rate-limited).

### Test 3 — Nothing user-facing changed yet
The web app behaves exactly as before — these routes aren't called by the UI until P3.3.

### Pass / fail
- **PASS** = `39 passed`; after deploy, `/mcp/tools` returns a tool list for a real MCP server and
  rejects unauth/private URLs. Web UI unchanged.
- Live connection issues (transport/handshake) → tell me the MCP server URL + the error.

---

## Phase 3 — increment P3.3 (chat slice): MCP tools wired into web Let's Chat

**What changed in plain words:** Web **Let's Chat** can now use the tools of a connected MCP server.
It's **opt-in**: nothing happens unless you configure an MCP server in `settings.mcpServers`. With none
configured (the default), chat behaves exactly as before. When configured, at the start of a chat turn
the app asks the server broker for that MCP server's tools and offers them to the model as
`mcp__<server>__<tool>`; a tool call is routed back through the broker. If listing fails, the turn just
proceeds without MCP tools (fail-open). Files changed: `src/bridge/webBridge.js` + a new pure helper
`src/bridge/mcpNames.js`. **No desktop, no other surface.** Only the **chat loop** is wired this slice
(Collaborate + teams come next).

### Test 1 — Safety net (now includes MCP name/config tests)
    npx vitest run tests/parity
**You should see:** `Tests  43 passed`.

### Test 2 — Default = unchanged (the important safety check)
With **no** MCP server configured, open web Let's Chat and chat normally → identical to before (no
extra tool steps, no slowdown).

### Test 3 — End-to-end (needs: server deployed (P3.2) + an MCP server + opt-in config)
There's no UI to add an MCP server yet (that's P3.5). To try it now, set one in the browser console:
```
const k="be.settings"; const s=JSON.parse(localStorage.getItem(k)||"{}");
s.mcpServers=[{url:"https://<a-public-https-mcp-server>/mcp"}];
localStorage.setItem(k, JSON.stringify(s));
```
(adjust the key if your settings use a different one), reload, then in Let's Chat ask something the
MCP server's tools can answer. **You should see** an `mcp__…` tool step, then an answer using it.

### Pass / fail
- **PASS** = `43 passed`; with no MCP configured chat is unchanged; (optional) with a configured MCP
  server + deployed routes, a chat tool call works.
- The clean way to configure a server (no console) arrives with **P3.5 (connector UI)**.

---

## Phase 3 — increment P3.5: "MCP servers" UI (chain now end-to-end)

**What changed in plain words:** The Connectors screen now has an **"MCP servers"** panel (web only)
where you paste an HTTPS MCP server URL, **Test** it, and **Add/Remove** it — no console needed. Added
servers are used by web chat (from P3.3). This completes the chain: **UI → broker routes → chat → broker**.
Files: new `src/components/McpServers.jsx`, a one-line `{isWeb && <McpServers/>}` render in
`src/components/Connectors.jsx` (gated, so **desktop Connectors is unchanged**), and a `mcpTestServer`
method in `webBridge.js`. **No desktop code, no `electron/**`.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  43 passed`.

### Test 2 — Desktop Connectors unchanged (shared file — please check)
Open **Connectors in the desktop app** → it looks exactly as before (no "MCP servers" panel; that's
web-only).

### Test 3 — Web end-to-end (needs `npm run build` + the server deployed from P3.2)
1. `npm run build`, open web → **Connectors**. You should see the **"MCP servers"** panel.
2. Paste a public **HTTPS** MCP server URL, click **Test** → you should see a tool count (e.g. "OK — 5
   tools: …"). A private/loopback URL → "Failed: Refusing to connect…". Click **Add**.
3. Go to **Let's Chat** and ask something those MCP tools handle → you should see an `mcp__…` tool step,
   then an answer using it.

### Pass / fail
- **PASS** = `43 passed`; desktop Connectors unchanged; web shows the panel; Test lists tools for a real
  server; chat can call an MCP tool.
- If the panel doesn't appear on web, or Test/Add misbehaves → tell me what you saw.

---

## Phase 3 — MCP end-to-end test (concrete: DeepWiki)

**Server:** `https://mcp.deepwiki.com/mcp` — free, no-auth, read-only. 3 tools over public GitHub repos:
`read_wiki_structure`, `read_wiki_contents`, `ask_question`. (Tool names show in chat sanitized, e.g.
`mcp__mcp-deepwiki-com__ask-question` — underscores become dashes in the label; the real tool is still called.)

### Setup
1. **Auth server must be running the latest code** (restart it so the `/mcp` routes are live; stale server → "Failed: not found").
2. Web → **Connectors** → **MCP servers** → paste `https://mcp.deepwiki.com/mcp` → **Test**.
   → Expect **"OK — 3 tools: read_wiki_structure, read_wiki_contents, ask_question"** → click **Add**.
3. **Let's Chat** (not a Project) → pick a **tool-capable** model (Claude, GPT‑4o‑class, or a solid **paid** OpenRouter model — **not** a `:free` one).

### Prompts (each should trigger an `mcp__mcp-deepwiki-com__…` tool step)
- **A — list topics (read_wiki_structure):**
  > Use the DeepWiki tools to list the documentation topics available for the GitHub repo `vercel/next.js`.
- **B — ask a question (ask_question):**
  > Using DeepWiki, explain how the `facebook/react` repository implements its fiber reconciliation algorithm, and mention the files involved.
- **C — read contents (read_wiki_contents):**
  > With DeepWiki, give me a 5-bullet overview of what `tailwindlabs/tailwindcss` does, based on its wiki.

### Pass / fail
- **PASS** = for A/B/C you see a tool step labeled `mcp__mcp-deepwiki-com__…`, then an answer that uses
  the tool's result (repo-specific facts, not generic knowledge).
- **Fallback check** = switch to a model that can't tool-call → it should still answer (no MCP step), not error.
- If a prompt doesn't call a tool: add "**use your MCP tools**" explicitly, or use a more tool-eager model
  (weak models sometimes ignore tools). If you get a transport error on Test, tell me the exact text.

---

## Phase 3 — increment P3.6: robust tool-support cache (no more session-wide disable)

**What changed in plain words:** Previously, if a model's first tool request failed **once** — even a
transient network/rate blip — Madav marked it "no tools" and **silently skipped tools (and MCP) for the
whole browser session** until you reloaded. (That's what hid MCP during testing.) Now it only remembers
"no tools" on a **definitive** "tools unsupported" error (e.g. OpenRouter's "no endpoints found that
support tool use", or "model does not support tools"), **never** on a transient error — and the memory
**expires after 1 hour** so a model can recover. A transient blip now just falls back for that one
message and retries tools on the next. Files: new pure `src/bridge/toolSupport.js` (unit-tested) +
`src/bridge/webBridge.js`. **No desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  46 passed` (3 new ones check the error classifier: definitive vs transient).

### Test 2 — Tools/MCP still work (regression)
In Let's Chat with a tool-capable model + DeepWiki configured, run the forcing prompt → you still get the
`[mcp] CALL tool` line / tool step. (No reload needed anymore after a hiccup.)

### Test 3 — Desktop unchanged
Web-only change; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `46 passed`; MCP/tools still fire; a one-off network error no longer kills tools for the session.

---

## Phase 3 — increment P3.7: MCP tools in Collaborate + agent teams

**What changed in plain words:** MCP tools were chat-only; now they're also available in **Let's
Collaborate** and to **agent team members** — same opt-in `settings.mcpServers`, same broker, same
fail-open loading. Files: `src/bridge/webBridge.js` only (the `executeTool` mcp route added in P3.3
already handles the calls; this just loads `sess.mcpTools` for those sessions and adds them to each
loop's tool list). **No desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  46 passed`.

### Test 2 — MCP in Let's Collaborate (needs a picked folder + tool-capable model + DeepWiki added)
1. Open **Let's Collaborate**, pick any folder.
2. Ask: **"Using the DeepWiki tools, list the doc topics for `vercel/next.js`."**
3. **You should see** an `mcp__mcp-deepwiki-com__…` tool step (and `[mcp] CALL tool` in the server terminal).

### Test 3 — MCP in an agent team
1. Run an **Agent Team** (tool-capable model) with: **"Use DeepWiki to summarize what `sindresorhus/ky` does."**
2. **You should see** a member tool step tagged like `↳ Scout: mcp__mcp-deepwiki-com__ask-question` (and `[mcp] CALL tool` in the terminal).

### Test 4 — Desktop unchanged
Web-only change; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `46 passed`; MCP tools fire in Collaborate and in team members (not just chat); desktop unchanged.
- With no MCP server configured, all three surfaces behave exactly as before (opt-in).

---

## Phase 3 — increment P3.4.1: encrypted connector-token vault (no wiring yet)

**What changed in plain words:** the groundwork for "sign in to Gmail/Slack/etc. on the web." This slice
adds ONLY the locked box that will hold those logins — `server/token-vault.mjs` — which encrypts tokens
with AES-256-GCM so they're unreadable at rest and never sent to the browser. It is **wired to nothing**:
no new routes, no OAuth, no login buttons. The running app (desktop *and* web) behaves exactly as before.
Design + the security-gated next steps are in `docs/PHASE3-OAUTH.md`. **No desktop code.**

### Test 1 — Safety net (the only test you can run today)
    npx vitest run tests/parity
**You should see:** `Tests  58 passed` (12 new ones for the vault: encrypt/decrypt round-trip, tamper is
rejected, wrong key fails, the stored blob never contains the plaintext token, per-user isolation, and the
"refuse an insecure key in production" guard).

### Test 2 — Nothing changed in the app
Use Let's Chat / Collaborate / MCP exactly as before — there is no new button or behaviour to see yet.
This slice is invisible on purpose; it only adds a tested building block.

### Test 3 — Desktop unchanged
Web/server-only files added; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `58 passed`; the app looks and works exactly as before (the vault isn't connected to anything).
- **What's next (and gated):** P3.4.2 stores the box in real persistence; P3.4.3/P3.4.4 add the OAuth
  login + server-side token injection — both **only after a security review**, per `docs/PHASE3-OAUTH.md`.

---

## Phase 3 — increment P3.4.2: persist the connector vault in the store (still no wiring)

**What changed in plain words:** the locked box from P3.4.1 now has a real shelf to sit on. The encrypted
connector tokens are persisted in the user store under a new `conntokens` collection — works on both store
backends (local JSON file and Postgres), per-user. Files: `server/store.mjs` (one additive collection name),
`server/connector-vault.mjs` (binds the vault to the store). Still **wired to nothing live**: no routes, no
OAuth, no login buttons — nothing in the running app calls this yet. **No desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  61 passed` (3 new for the store binding: the adapter inserts-then-updates
correctly; an end-to-end round-trip through the **real** JSON store; and a check that the on-disk file
contains only ciphertext — the token value and even the field name `access_token` never appear in plaintext;
plus a "survives a restart" read-back).

### Test 2 — Nothing changed in the app
Use Let's Chat / Collaborate / MCP exactly as before. There is still nothing new to click — this slice only
gives the vault somewhere to live.

### Test 3 — Desktop unchanged
Web/server-only (`server/*.mjs`); desktop behaves exactly as before.

### Pass / fail
- **PASS** = `61 passed`; app unchanged; the on-disk store shows ciphertext only.
- **What's next (and gated):** P3.4.3 (OAuth start/callback) and P3.4.4 (server-side token injection) —
  both **only after a security review**, per `docs/PHASE3-OAUTH.md`. Then P3.4.5 wires the Connectors UI.

---

## Phase 3 — increment P3.4.3a: connector-OAuth foundation (PKCE + registry + state; NO routes)

**What changed in plain words:** the building blocks for "Sign in to Gmail on the web," with still **no live
endpoint**. Three server-only pieces, each unit-tested: (1) PKCE helpers (the standard proof that ties an
OAuth login to the request that started it); (2) a connector registry whose provider URLs and scopes are
**fixed in code, never taken from a request** — this is what removes whole classes of attack (SSRF, scope
injection); and (3) a single-use, user-bound, 10-minute OAuth "state" record stored in the database so it
survives restarts and multiple server instances. Files: `server/oauth-pkce.mjs`,
`server/connector-registry.mjs`, `server/oauth-state.mjs`, `server/store.mjs` (one new collection name).
**No routes, no OAuth network calls, no UI, no desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  71 passed` (10 new: PKCE challenge math + entropy; the registry exposes Gmail
read-only with constant https URLs and never leaks the client secret; OAuth state is single-use, expires
after 10 min, and a sweep drops only the expired records — all verified against the real JSON store).

### Test 2 — Nothing changed in the app
There is still nothing to click. This slice only adds tested building blocks behind the scenes.

### Test 3 — Desktop unchanged
Web/server-only; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `71 passed`; app unchanged.
- **Next (gated):** P3.4.3b adds the `start` / `list` / `disconnect` routes; P3.4.3c adds the `callback`
  that accepts a provider token — **re-review at 3c**, per the design doc. Then P3.4.4 (token injection).

---

## Phase 3 — increment P3.4.3b: connector-OAuth routes (start / list / disconnect; NO callback)

**What changed in plain words:** the first real connector endpoints. A signed-in web user can now (via the
API) list connectors, START a Gmail connect (which returns a Google authorize URL built with PKCE + a
single-use, user-bound state), and DISCONNECT (wipes their stored tokens). The endpoint that *accepts* a
token back from Google — the callback — is deliberately NOT built yet (that's P3.4.3c, re-reviewed). Files:
`server/auth-server.mjs` (3 routes), `server/connector-registry.mjs` (buildAuthorizeUrl). Auth-gated,
rate-limited, open-redirect-guarded; tokens are never returned to the browser. **No desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  79 passed` (8 new: buildAuthorizeUrl puts the right OAuth+PKCE params on
Google's constant endpoint; plus a static contract check that the 3 routes exist, require auth, rate-limit,
gate on config, use PKCE S256 + user-bound state, never return a token, and that the callback route is NOT
present yet).

### Test 2 — (optional) hit the routes locally
With the web server running and signed in: `GET /connectors` lists the Gmail entry as `configured:false`
(until you set `GMAIL_CONNECTOR_CLIENT_ID` / `GMAIL_CONNECTOR_CLIENT_SECRET`) and `connected:false`.
`POST /connectors/google-gmail/oauth/start` returns `501 not configured` until those env vars are set.
No browser response ever contains a token.

### Test 3 — Desktop unchanged
Web/server-only; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `79 passed`; desktop unchanged; start returns a PKCE authorize URL (or 501 if unconfigured);
  no token ever appears in a response.
- **Next (GATED):** P3.4.3c adds the callback that exchanges the code and seals tokens into the vault —
  **re-review before writing**. Then P3.4.4 (server-side token injection) and P3.4.5 (UI).

---

## Phase 3 — increment P3.4.3c: token-accepting callback (connect flow now end-to-end)

**What changed in plain words:** the final piece of "connect a Google account on the web." The callback
endpoint receives Google's one-time code, exchanges it server-side (with the PKCE proof) for the real
tokens, and SEALS them into the encrypted vault under the user who started the flow. Tokens never touch the
browser. Files: `server/connector-oauth.mjs` (the code→token exchange, no network in tests) + one callback
route in `server/auth-server.mjs`. **No desktop code.**

### Test 1 — Safety net
    npx vitest run tests/parity
**You should see:** `Tests  80 passed` (the exchange helper sends grant_type + PKCE verifier and parses
success/error with a stubbed network; the static contract check confirms the callback consumes single-use
state, checks the connector matches, seals to the state's user, re-validates the redirect, and never puts a
token in a URL).

### Test 2 — (optional, needs real Google creds) end-to-end
Only works once you create a Google OAuth client, set `GMAIL_CONNECTOR_CLIENT_ID` / `GMAIL_CONNECTOR_CLIENT_SECRET`,
and add `<base>/connectors/google-gmail/oauth/callback` as an authorized redirect URI. Then, signed in:
`POST /connectors/google-gmail/oauth/start` → open the returned URL → approve → you're redirected back and
`GET /connectors` shows `google-gmail connected:true`. The tokens live only in the server vault (ciphertext).
Until those creds exist, start returns `501` and nothing can be connected — safe by default.

### Test 3 — Desktop unchanged
Web/server-only; desktop behaves exactly as before.

### Pass / fail
- **PASS** = `80 passed`; desktop unchanged; with no Google creds set the flow is inert (501) and no token
  can be stored; with creds, a connect seals ciphertext into the vault and the browser only sees `connected=id`.
- **Next (separate gate):** P3.4.4 — *use* the stored token (refresh if expired, attach server-side to
  MCP/API calls). Then P3.4.5 — wire the Connectors UI to these routes.
