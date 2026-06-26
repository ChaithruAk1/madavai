# Madav — Full Application E2E Test Script

**Purpose:** validate the entire Madav desktop app end‑to‑end, with special focus on everything built/changed in this rebuild. Run top to bottom in one sitting. Plain English, click‑by‑click.

**How to use:** each test has a **Scenario**, numbered **Steps**, an exact **Example input** (type it verbatim), the **Expected** result, and a **Pass ☐** box. If anything fails, note the test ID + what you saw and stop on that area.

**Conventions:**
- "Composer" = the **Ask Madav** box at the bottom.
- "Model picker" = the model name shown at the bottom of the composer (e.g. `claude-sonnet-4-6`).
- "Strong model" = Claude Sonnet/Opus, GPT‑4/4o/5, Gemini Pro, DeepSeek. "Weak model" = Haiku, Flash, or a small (<20B) model.
- 🟦 = a test of something built/changed in this rebuild.

---

## PART 0 — Setup & first launch

### T0.1 — Build & launch
**Scenario:** the app builds and opens clean.
**Steps:**
1. Close any running Madav. Open PowerShell in `C:\Projects\ClaudeCodeUI\MadavNew`.
2. Run `npm run electron:dev`.
**Expected:** the app window opens. 🟦 You see the **new MADAV wordmark + M** top‑left, and 🟦 the **Sage helper sits minimized in the bottom‑right** (a small round face, no pop‑up bubble).
**Pass:** ☐

### T0.2 — Sign in
**Steps:** 1. If prompted, sign in (Google/GitHub). 2. Confirm your account name shows bottom‑left.
**Expected:** signed in; main screen loads.
**Pass:** ☐

### T0.3 — Add a model / provider
**Scenario:** a working model is configured (everything else depends on this).
**Steps:**
1. Sidebar → **Models** → **Model configuration**.
2. Add a provider: pick the kind (e.g. Anthropic / OpenRouter), paste your **API key**, choose a **model**, Save.
3. Bottom model picker → select that model.
**Expected:** the model picker shows your model; the online dot is green.
**Pass:** ☐

### T0.4 — 🟦 Default theme color
**Scenario:** the new default accent is the teal you set.
**Steps:** 1. Use the app in **dark** theme. 2. Switch to **light** (Settings → appearance).
**Expected:** 🟦 In BOTH dark and light, the accent (buttons, highlights, active tabs) is **teal `#00aabd`** (RGB 0,170,189). The "built to think with you." tagline under the wordmark is white on dark, brand‑blue on light.
**Pass:** ☐

---

## PART 1 — Let's Chat (plain conversation)

### T1.1 — Basic chat + streaming
**Steps:** 1. Top bar → **Let's Chat**. 2. Type the example, Enter.
**Example input:** `In two sentences, what is Madav?`
**Expected:** a streamed answer appears; no errors.
**Pass:** ☐

### T1.2 — Model switch mid‑session
**Steps:** 1. Change the model picker to a different model. 2. Ask `Say hello and name the model you are.`
**Expected:** the reply comes from the newly selected model.
**Pass:** ☐

### T1.3 — 🟦 Native Anthropic engine (SDK removed)
**Scenario:** Claude models now run on Madav's own engine, not the third‑party SDK.
**Steps:** 1. Pick a **Claude** model (Sonnet/Opus). 2. Ask `Give me a 3-step plan to learn guitar.`
**Expected:** a normal streamed answer. (Under the hood this is Madav's native loop — there is no SDK fallback anymore; if a Claude model ever errors here, that's the thing to report.)
**Pass:** ☐

---

## PART 2 — Documents in chat (Excel · Word · PDF · PowerPoint) 🟦

The document engine is core. Do 2.1–2.5 with a **strong model**, then 2.6 with a **weak model**.

### T2.1 — Excel with a chart
**Steps:** 1. Strong model in Let's Chat. 2. Type the example, Enter.
**Example input:** `Make an Excel model of a 12-month SaaS budget — columns Month, MRR, Costs; add KPI tiles for LTV and CAC; add a line chart of MRR.`
**Expected:** a card appears in the reply (Excel icon + filename + **Download / View**). Download → opens in Excel: **styled sheet, KPI tiles, real numbers, a native line chart**.
**Pass:** ☐

### T2.2 — Word document
**Example input:** `Write a one-page Word brief titled "Q3 Launch Plan" with sections Overview, Goals, Risks, and a 3-row timeline table.`
**Expected:** a card → Download → a styled `.docx` with the heading, sections, and the table.
**Pass:** ☐

### T2.3 — PDF
**Example input:** `Produce the same Q3 brief as a PDF.`
**Expected:** a card → Download → a styled `.pdf` with the same structure.
**Pass:** ☐

### T2.4 — PowerPoint (strong model = designed deck)
**Example input:** `Build a 6-slide investor deck on the AI agents market — a title slide, a market-size slide with a bar chart, 3 content slides with icon cards, and a closing slide. Dark theme.`
**Expected:** a **deck** card appears → it builds (runs the model's slide code) → Download → a dense, designed `.pptx`: dark slides, a real chart, icon badges, big stat numbers.
**Pass:** ☐

### T2.5 — Change request re‑renders
**Steps:** After T2.4, type the example.
**Example input:** `Make the deck navy blue and add a "Risks" slide.`
**Expected:** a fresh full deck card re‑renders with the changes (not a half/partial card).
**Pass:** ☐

### T2.6 — 🟦 Weak model = safe template path
**Steps:** 1. Switch to a **weak model** (Haiku/Flash). 2. Ask `Make a 4-slide deck on remote work and a small Excel table of pros/cons.`
**Expected:** you still get valid `.pptx` and `.xlsx` cards — but via the **template** path (the weak model supplies content as data, Madav styles it). No broken/empty files.
**Pass:** ☐

### T2.7 — Card safety while streaming
**Scenario:** a document card must not offer Download until the reply is finished.
**Steps:** Watch any document card as the reply streams.
**Expected:** Download/View appear **only after** the reply completes (never mid‑stream).
**Pass:** ☐

---

## PART 3 — Let's Collaborate (work inside a folder)

### T3.1 — Pick a folder & read a file
**Steps:**
1. Create a test folder on disk with one small `.csv` or `.xlsx` (a few rows of numbers).
2. Top bar → **Let's Collaborate**. Click **Select Folder** (the row below the composer) → pick that folder.
3. Type the example, Enter.
**Example input:** `Open the spreadsheet in this folder and tell me the total of the amount column.`
**Expected:** it reads the file, computes the real total, answers with the number. "Worked" step cards appear.
**Pass:** ☐

### T3.2 — Save a result into the folder
**Example input:** `Build a one-page summary report of this data and save it into this folder as Summary.xlsx.`
**Expected:** the file is **written into your folder** (check on disk); an **Open / Show‑in‑folder** card appears.
**Pass:** ☐

### T3.3 — Permission prompt
**Steps:** 1. Set permission to **Ask first** (selector right of the model picker). 2. Ask it to edit/create a file.
**Expected:** a permission prompt appears before the change; approving it lets the action proceed.
**Pass:** ☐

---

## PART 4 — Workrooms / Projects (the de‑hacked clean loop) 🟦

This area was rebuilt — verify the old "report router" is gone.

### T4.1 — Create a Workroom linked to a folder
**Steps:** 1. Sidebar → **Projects** (Workrooms). 2. Create a room; link the folder from T3.1 (with the data file). 3. Open the room.
**Expected:** the room opens with its instructions/feed/crew zones.
**Pass:** ☐

### T4.2 — 🟦 File‑listing is NOT a report
**Scenario:** a question about the files must not trigger a data‑report build.
**Steps:** With a **strong model**, in the room, type the example.
**Example input:** `List the files in this folder and tell me which one is biggest.`
**Expected:** it simply **lists the files and names the biggest**. ❌ It must NOT spin up a report or show column‑join errors (that was the old router — removed).
**Pass:** ☐

### T4.3 — 🟦 Report on explicit request
**Example input:** `Build a summary report from this data and save it in the folder.`
**Expected:** the model reads, computes (runs real code), saves the file, and an Open/Download card appears — following your prompt, no hidden pipeline.
**Pass:** ☐

### T4.4 — 🟦 Weak‑model honesty
**Steps:** Switch to a weak model; repeat T4.3.
**Expected:** it either does a simpler version or you're steered toward a "Recommended" model in the picker — no silent stall, no rigid hidden pipeline.
**Pass:** ☐

---

## PART 5 — Let's Build (coding on a folder)

### T5.1 — Explore & edit code
**Steps:** 1. Make a tiny folder with one `.js` file (e.g. a function with a bug). 2. Top bar → **Let's Build** → Select Folder → pick it. 3. Type the example.
**Example input:** `Find the bug in this file, fix it, and explain the fix in one line.`
**Expected:** it reads the file, makes a targeted edit (with a permission prompt per your mode), explains briefly.
**Pass:** ☐

---

## PART 6 — Agents (the workforce)

### T6.1 — Run a built‑in agent
**Steps:** 1. Sidebar → **Agents**. 2. Pick a built‑in agent (e.g. **Analyst**) → **Put to work** / Bench. 3. Give it the example.
**Example input:** `Profile this dataset: 10, 22, 35, 41, 50 — mean, median, and one insight.`
**Expected:** the agent runs, uses tools as needed, returns the computed answer.
**Pass:** ☐

### T6.2 — Agent makes a document
**Example input (to an agent):** `Create a 1-page Excel summary of those numbers with a chart.`
**Expected:** the same document card appears — agents share the office capability.
**Pass:** ☐

### T6.3 — A small team (optional)
**Steps:** Use the **Recruiter** ("describe the work → it staffs a team") with `Research a topic and write a short brief` and run it.
**Expected:** a team runs (Relay or Managed); you can watch it in Mission Control.
**Pass:** ☐

---

## PART 7 — Playbook (Skills)

### T7.1 — Run a play on demand
**Steps:** 1. Sidebar → **Playbook**. 2. In any chat, type `/` to see plays; pick one (or a built‑in).
**Expected:** the play runs and produces its result.
**Pass:** ☐

### T7.2 — Record chip
**Steps:** Click the **Record** chip in the top bar; do a couple of actions; stop.
**Expected:** Madav drafts a play from the recording and waits for your approval.
**Pass:** ☐

---

## PART 8 — Models section

### T8.1 — Models overview
**Steps:** Sidebar → **Models** → **Models overview**. Sort/filter; open compare.
**Expected:** the catalog lists models with capabilities/benchmarks/cost; compare works.
**Pass:** ☐

### T8.2 — Speed Check
**Steps:** **Models** → **Speed Check** → pick 2 models → run.
**Expected:** real tokens/sec + a quality read for each.
**Pass:** ☐

---

## PART 9 — Connectors

### T9.1 — Browse + connect (desktop)
**Steps:** 1. Sidebar → **Connectors**. 2. Pick one (e.g. GitHub) → start connect → finish OAuth.
**Expected:** the connector shows connected; its tools become available to chat/agents. (If you don't want to OAuth now, just confirm the catalog + the connect flow opens.)
**Pass:** ☐

---

## PART 10 — Scheduler

### T10.1 — Schedule a task
**Steps:** 1. Sidebar → **Scheduler**. 2. Create a schedule (e.g. a task every day at a time, or "in 5 minutes"). 3. Save.
**Expected:** the schedule is listed; (optionally) it fires at the set time and the run appears.
**Pass:** ☐

---

## PART 11 — Terminal

### T11.1 — Run a command
**Steps:** 1. Sidebar → **Terminal**. 2. Type `echo hello` (or `dir`), Enter.
**Expected:** the command runs in a real terminal and prints output. 🟦 (This uses node‑pty, which is also Mac‑ready.)
**Pass:** ☐

---

## PART 12 — Consumption

### T12.1 — Usage dashboard
**Steps:** Sidebar → **Consumption**.
**Expected:** tokens over time, model share, estimated spend render from your usage.
**Pass:** ☐

---

## PART 13 — Sage helper 🟦

### T13.1 — Minimized + bottom‑right
**Expected:** 🟦 Sage rests as a small face in the **bottom‑right**; no auto pop‑up. Hovering shows the "need help?" bubble.
**Pass:** ☐

### T13.2 — Ask Sage
**Steps:** Click Sage → type the example.
**Example input:** `How do I connect a GitHub repo to a Workroom?`
**Expected:** a short, plain‑English answer with exact steps; it may offer a "Take me there" button.
**Pass:** ☐

### T13.3 — Navigate
**Example input (to Sage):** `Open the Scheduler.`
**Expected:** it takes you to the Scheduler screen.
**Pass:** ☐

---

## PART 14 — Flag‑guarded features (each OFF by default) 🟦

These are env vars set **before** launch. Turn on → test → turn off. Quit the app between changes.

### T14.1 — RAG / Knowledge
**Steps:** 1. Quit. `$env:MADAV_KNOWLEDGE="1"; npm run electron:dev`. 2. In a Workroom, add 1–2 docs to the knowledge shelf with a specific fact. 3. Ask a question only answerable from them.
**Expected:** the answer uses the doc content. Quit + `Remove-Item Env:\MADAV_KNOWLEDGE` → back to normal.
**Pass:** ☐

### T14.2 — Crash reporting (local only)
**Steps:** Quit. `$env:MADAV_CRASH_REPORTS="1"; npm run electron:dev`. Use the app.
**Expected:** crash details (if any) are captured **locally only** — confirm nothing is sent over the network. Unset after.
**Pass:** ☐

### T14.3 — RBAC (cloud/gateway only)
**Note:** RBAC is enforced at the cloud gateway. If you're not running the server, mark **N/A**. If you are: `MADAV_RBAC=1` → confirm roles (owner/admin/member/viewer) gate access; with the flag OFF it's the legacy single‑workspace. **Do not** enable on live until the per‑user‑workspace cutover is reviewed.
**Pass:** ☐ / N/A ☐

---

## PART 15 — Voice & Desktop control (Windows)

### T15.1 — Voice input
**Steps:** Click the **mic** in the composer; say a sentence.
**Expected:** your words are transcribed into the box (Windows built‑in speech; no key needed).
**Pass:** ☐

### T15.2 — Desktop control (optional)
**Steps:** In an agent's Blueprint, turn on **Desktop** capability; ask it to `open Notepad and type "hello"`.
**Expected:** it focuses/opens Notepad and types — asking permission per action; credential fields always refused.
**Pass:** ☐

---

## PART 16 — Resilience

### T16.1 — App survives an error
**Scenario:** a bad action must not crash the app or lose your chats.
**Steps:** Trigger a deliberate failure (e.g. point Collaborate at a missing file, or use a model with a wrong key).
**Expected:** you get a **friendly error message**; the app stays open and your chat history is intact (global crash guard).
**Pass:** ☐

---

## PART 17 — Settings & Extras

### T17.1 — Theme & accent
**Steps:** Settings → appearance → toggle light/dark; try the accent options.
**Expected:** 🟦 default accent is `#00aabd`; changing it works; the choice persists.
**Pass:** ☐

### T17.2 — Extras switchboard
**Steps:** Settings → **Extras** (Creator/Complimentary accounts only). Toggle one feature off (e.g. Studio) → confirm it disappears from the sidebar → toggle back on.
**Expected:** turning a feature off hides it; on restores it.
**Pass:** ☐

---

## PART 18 — Build the installer

### T18.1 — Windows installer
**Steps:** 1. Close the app + any Explorer window in `release\`. 2. `Remove-Item -Recurse -Force .\release\*`. 3. `npm run electron:build`.
**Expected:** the renderer builds, electron‑builder packages, and a **Madav setup .exe** lands in `release\`. (If you hit `EPERM win-unpacked.tmp`, it's a Windows lock — close Madav/Explorer, add a Defender exclusion for the project folder, retry.)
**Pass:** ☐

---

## PART 19 — macOS (when you have a Mac / CI) 🟦

The mac build is **wired but unbuilt** (needs macOS). When ready: on a Mac, `npm run electron:build:mac` → a `.dmg`. Follow `MAC-DESKTOP-BUILD-SCOPE.md` for Apple signing + notarization. On Mac, the 3 Windows‑only features (desktop control, voice, CLI install) degrade gracefully; everything else (chat, documents, projects, terminal) works.
**Pass:** ☐ / Pending Mac ☐

## PART 20 — Local Models (Ollama / HuggingFace / LM Studio) 🟦

> Desktop only. Lets you run models on your own machine — private, offline, no API key.

### T20.1 — Open the page
**Steps:** Sidebar → **Models** group → **Local Models**.
**Expected:** a page with three pills at the top — **Ollama · HuggingFace · LM Studio**. Each pill has a small dot: green = that engine is running on your machine, grey = not detected. Below is a status card, a search box, and an "Installed on this machine" list.
**Pass:** ☐

### T20.2 — Install the engine in the background (only if Ollama shows "Not detected")
**Steps:** With **Ollama** selected and showing "Not detected", click **Install Ollama**.
**Expected:** a "Downloading… %" indicator, then "Installing…", with no setup windows to click through. After a few minutes click the **↻ re-check** button — the status flips to **Ready · v…** and the dot goes green. (On a Mac it instead opens the Ollama download page — that's expected.)
**Pass:** ☐

### T20.3 — Search and pull a model
**Steps:** On **Ollama**, type the example and press **Search**, then click **Pull** on a small model.
**Example input:** `llama3.2`
**Expected:** a list of matches (the first row lets you pull exactly what you typed). Clicking **Pull** shows a live progress bar that climbs to 100%, then the row flips to **✓ Installed** and the model appears under "Installed on this machine".
**Pass:** ☐

### T20.4 — Model health
**Expected:** in the installed list each model shows its size on disk; a model that's currently loaded in memory shows a green dot and a **running** chip. (A model loads when you actually chat with it.)
**Pass:** ☐

### T20.5 — Pulled model is selectable for execution
**Steps:** Open the model picker (top of any chat). Look under the **Ollama (local)** group.
**Expected:** the model you just pulled is listed and **selectable**. Pick it and send a message — it answers, running locally.
**Pass:** ☐

### T20.6 — Pulled model shows in Models overview
**Steps:** Sidebar → **Models** → **Models overview**.
**Expected:** your local model is listed with its details (maker, size, and any capability tags like tools/vision/reasoning that Madav knows for that family).
**Pass:** ☐

### T20.7 — HuggingFace (GGUF via Ollama)
**Steps:** Click the **HuggingFace** pill. Type the example, **Search**, then **Pull** a small GGUF model. (Needs Ollama installed — HuggingFace models run through it.)
**Example input:** `qwen2.5`
**Expected:** results from the HuggingFace hub with download counts; **Pull** streams progress the same way; when done the model appears in the installed list **and** in the model picker under Ollama (local).
**Pass:** ☐

### T20.8 — LM Studio (only if you use LM Studio)
**Steps:** Click the **LM Studio** pill.
**Expected:** if LM Studio's command‑line tool is installed, status shows **Ready** and your LM Studio models appear; if not, it says how to enable it and **Get LM Studio** opens the download page. Search/pull/remove behave like the other tabs.
**Pass:** ☐

### T20.9 — Remove a model
**Steps:** In "Installed on this machine", click the **🗑 trash** on a model.
**Expected:** it disappears from the list and (after the selector refreshes) from the model picker. No crash.
**Pass:** ☐

### T20.10 — Web app shows the right notice
**Steps:** Open the **web** version (madav.ai) → Models → Local Models.
**Expected:** the page loads but explains local models are a **desktop** feature — no errors, no broken buttons.
**Pass:** ☐

### T20.11 — Browse by goal (no typing)
**Steps:** On **Local Models** (don't search), look at the **goal tiles**: *Private ChatGPT · Coding assistant · Deep reasoning · Sees images · Tiny & fast*. Click **Coding assistant**.
**Expected:** a gallery of model cards appears and filters to coding models. Each card shows a friendly name, a one-line description, size, capability chips, and a **Pull** button. Switching tiles re-filters instantly.
**Pass:** ☐

### T20.12 — "Fits your machine" badge
**Expected:** a line states your machine's RAM, and each card carries a colored badge — green **Runs great**, amber **Will be slow**, or red **Too big** — based on the model's size vs. your memory. On the **HuggingFace** tab, the gallery is a live "most-downloaded" feed with the same badges.
**Pass:** ☐

### T20.13 — Use (activate) a model
**Steps:** In "Installed on this machine", click **Use** on a model.
**Expected:** that row shows an **Active** badge and highlights. Open a new chat — the model picker shows it as the selected model, and a message runs on it locally.
**Pass:** ☐

### T20.14 — Stop (unload) a running model
**Steps:** Chat with a local model so it loads (green dot + **running**), return to Local Models, click **Stop** on that row.
**Expected:** after a moment the green dot/running chip clears (the model is unloaded from memory, freeing RAM/VRAM). No crash.
**Pass:** ☐

### T20.15 — Friendly names
**Expected:** models read as real names (e.g. **DeepSeek R1 32B**, **GPT OSS 120B**) with the exact technical id shown small beneath — nothing lost for copy/run.
**Pass:** ☐

---

## Sign‑off

- [ ] Parts 0–18 + Part 20 all ✅ (Part 19 pending a Mac).
- [ ] Note any failures with the test ID.
- [ ] Commit anything still uncommitted; `git status` shows a clean tree.

**Tester:** ____________  **Date:** ____________  **Build/version:** ____________

> Anything that fails: give me the **test ID + exactly what you saw** and I'll fix it forward.
