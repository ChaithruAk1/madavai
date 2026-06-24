# Test Guide — 2026-06-11 Queue Batch (10 features)

Step-by-step verification for everything built in the queue run. ~40 minutes total.
Run the tests in order — later ones reuse setup from earlier ones.

---

## 0 · Prerequisites (do these first)

1. Terminal 1: `npm run build` — must be GREEN. If red, stop and report the error
   (first suspects: Agents.jsx, webBridge.js, App.jsx, auth-server route block).
2. Terminal 1: `node server/auth-server.mjs` — the share/community/request endpoints
   are new; the server MUST be restarted.
3. Terminal 2: `npm run electron:dev` — FULL close-and-reopen if it was running
   (new main-process modules: desktop-driver, research, features).
4. Sign in with your Creator account. Pick a capable cloud model in the selector
   (OpenRouter DeepSeek/Qwen class or better) unless a step says otherwise.

---

## 1 · Designer follow-up robustness (2 min)

1. Sidebar → Agents → Agent tab → open an existing agent in the Studio (or create one).
2. Point the selector at your WEAKEST local model (LM Studio/Ollama).
3. In the Designer chat: "Change the instructions so it always answers in bullet points."
4. **PASS:** either the Blueprint visibly updates, OR the reply appears followed by the
   quiet line "(no blueprint change detected — edit the Blueprint fields directly, or
   rephrase your request)". **FAIL:** reply shows and nothing else happens (old bug).

## 2 · Screenshots in agent knowledge (4 min)

1. Studio → Blueprint → Knowledge → Add file → pick a PNG/JPG screenshot.
2. **PASS:** it appears in the list as a small thumbnail (not a character-count badge).
3. Try a >1.5MB image → friendly rejection message. Add 6 images → a 7th is refused.
4. Pin/select a VISION model (e.g. google/gemini-2.5-flash on OpenRouter), Put to work,
   first message: "What do you see in my knowledge image?"
5. **PASS:** the agent describes the screenshot. (A non-vision model erroring or
   ignoring it is EXPECTED — noted limitation.)

## 3 · Agent Browser "full speed while minimized" (3 min)

1. Settings → Agent Browser (admin section) → **PASS:** a "Full speed while minimized"
   toggle exists and is ON by default.
2. Give a browser-capable agent a multi-page task ("open example.com, then read 3
   linked pages and summarize"). When the browser window appears, MINIMIZE it.
3. **PASS:** tool cards keep landing in the chat at normal speed while minimized.

## 4 · Exact context windows (2 min, indirect)

1. Open Models overview once (this caches the OpenRouter catalog).
2. Run a long agent mission on a 200k-context cloud model → the "Tidied its working
   notes" card should NOT appear early.
3. Run the same on a small local model (8k–32k) → it may appear; mission continues.
4. **PASS:** no compaction-related errors; big-context models stop compacting
   prematurely. (Internal change — absence of weirdness is the pass.)

## 5 · Local-model capability registry (2 min)

1. Open the model picker → your Ollama/LM Studio group.
2. **PASS:** known families now show capability pills — e.g. `qwen2.5-coder:7b` shows
   coding + agentic, `llava` shows vision, `deepseek-r1` shows reasoning.
3. Models overview → local rows show the same in the capability columns.

## 6 · Shareable conversation links (3 min)

1. Sidebar → hover any recent chat → click the new Share2 icon (between export and delete).
2. **PASS:** "Link copied ✓" appears; paste the URL into any browser.
3. **PASS:** a clean dark read-only page renders the conversation — no scripts, role
   labels, "expires" footer. A garbage id in the URL → friendly 404 page.

## 7 · Deep Research (4 min)

NOTE: the tool lives in the agent loop — test in **Let's Collaborate** (any folder) or
with a custom agent; plain Let's Chat without skills/connectors has no tool loop.

1. In a Collaborate session: "Run a deep research: what are the current best practices
   for Electron app security in 2026?"
2. **PASS:** a permission prompt appears FIRST (research always asks — it spends model
   calls and reads the web). Approve it.
3. **PASS:** a "Researched …" card appears, then a structured answer with [1][2]-style
   citations and a "Sources:" list of real URLs.
4. Decline the permission instead → the agent acknowledges and moves on.
   (Known limits: DuckDuckGo may rate-limit repeated runs; JS-heavy pages read thin.)

## 8 · Desktop applications driver (6 min) — Windows only

1. Studio → your test agent → Capabilities → toggle **Desktop** on → in "Allowed apps"
   type: `notepad`.
2. Put to work → task: "Open Notepad and type 'Hello from Madav' into it."
3. **PASS:** permission prompts appear for open/focus/type (approve each — reads are
   free); Notepad opens; the text lands in it. Chat shows human cards ("Opened
   notepad", "Typed \"Hello from Madav\" into the app").
4. Guardrails: ask it to "open calculator" → refused (calc isn't in the allowlist you
   set). Clear the allowlist → calc works (empty = any).
5. Settings → Extras → **PASS:** "Desktop control" toggle exists; switch it OFF → the
   capability disappears from the Studio and the tools stop being offered.
6. Schedule the same agent in Scheduler and run it → **PASS:** the headless run does
   NOT get desktop tools (deliberate: unattended native-app control is disabled).

## 9 · Product Request board (5 min)

1. Settings → **Product requests** (visible to all users).
2. **PASS:** the banner reads "Minimum 10,000+ votes are required for a feature to be
   considered — final decision rests with the admin."
3. "+ New request" → title + detail → submit → card appears.
4. Click the ▲ vote → count increments and fills (Creator counts as subscribed);
   click again → un-votes.
5. As admin: the status dropdown on the card → set "Building" → chip turns amber;
   set "Deployed" → accent. Add an admin note → it shows as a quiet line.
6. Filters: status chips + Top voted/Newest sort work.
7. TRIAL test (second machine/browser with a trial account): vote button disabled,
   tooltip explains; forcing it via API returns the 403 message.

## 10 · Community forum (4 min)

1. Settings → **Community**.
2. New thread → category "Ideas" → title + body → it appears pinned-order in the list.
3. Open it → reply → post appears. Body renders as PLAIN TEXT (paste `<b>x</b>` —
   it must show literally, not bold).
4. Admin: pin → thread floats to top with a badge; lock → reply composer replaced by
   a locked notice; delete → thread + posts gone.
5. **PASS:** a second signed-in account sees the same threads (server-shared), and the
   author shows as a name or truncated email ("chai…"), never a full email.

---

## Two-channel installers (when ready to release)

Follow BUILD-CHANNELS.md: Settings → Extras → switch something visible OFF (e.g.
Studio) → `npm run electron:build` → install the PUBLIC setup on a clean profile →
Studio absent from the sidebar, Extras page absent for normal users, excluded .cjs
files absent from resources/app.asar. The ADMIN setup has everything regardless.

## If something fails
Copy the exact error ([VITE] terminal, [ELECTRON] terminal, or DevTools console
Ctrl+Shift+I) and report it with the test number.
