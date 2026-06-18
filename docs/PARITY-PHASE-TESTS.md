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
