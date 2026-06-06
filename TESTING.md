# Thinkflux — Full Test Plan

Work top to bottom. Each item: do the steps, confirm the expected result, tick the box.
Mark anything broken with `❌ + note` so we can fix it together.

Legend: 🖥 desktop app · 🌐 chrome extension · ⚠ known-fragile area

---

## 0. Pre-flight
- [ ] `npm install` completes (undici present).
- [ ] `npm run electron:dev` launches the window; no red errors in the terminal or DevTools console.
- [ ] App title bar / taskbar shows the **Thinkflux** name; window icon is the synapse mark.
- [ ] Top nav shows **Let's Talk / Let's Collaborate / Let's Build**, sidebar shows **Projects, Skills, Connectors, Dispatch, Consumption**, Settings bottom-left.
- [ ] Hero shows the large animated synapse + greeting; input accepts typing.

## A. Providers & models 🖥
- [ ] Settings → Model configuration lists all providers (OpenRouter, NVIDIA NIM, Gemini, DeepSeek, Ollama, LM Studio, llama.cpp, Anthropic).
- [ ] For each provider you use: paste key → **Save & load models** → model list caches (count shown).
- [ ] Model picker (top bar) shows cached models grouped by provider; switching changes the active model.
- [ ] Cloud vs local badge correct; online/offline dot reflects reachability.
- [ ] **Default model**: set one, restart app → it's selected on launch. ⚠
- [ ] Ollama/LM Studio: with the local server running, models load and chat works with no key.

## B. Let's Talk (chat) 🖥
- [ ] Send "hi" → clean one-line reply, **no `<think>` / chain-of-thought leak**. ⚠ (test a reasoning model too)
- [ ] Ask the date → correct current date (no "I don't know").
- [ ] Multi-turn context retained within a conversation.
- [ ] Switch provider mid-session → next message uses the new model (terminal `[thinkflux] turn` log confirms).
- [ ] Error path: select a provider with no key → clear "No API key" message, not a raw 401.

## C. Let's Collaborate (cowork) 🖥
- [ ] Choose folder → path shows in the bar.
- [ ] "List the files here" → actually lists them.
- [ ] "Create a file notes.txt with X" → file appears on disk after approval.
- [ ] "Edit notes.txt to …" → change applied.
- [ ] run_bash works (e.g. "run `echo hi`").
- [ ] No premature "Created the file" before approval. ⚠

## D. Let's Build (code) 🖥
- [ ] Point at a real repo folder; "find where X is defined" → uses search/read tools, finds it.
- [ ] Makes a surgical edit; explains the change without dumping raw tool JSON.

## E. Permissions 🖥
- [ ] Permission mode picker shows: default / acceptEdits / bypass / plan.
- [ ] `default`: a write/bash tool prompts the modal; **Allow once** proceeds, **Decline** stops.
- [ ] Modal is dismissable — **Esc** and clicking the dark backdrop both cancel (no frozen input). ⚠
- [ ] `acceptEdits`: edits auto-approve, no prompt.
- [ ] `bypass`: everything auto-approves.
- [ ] `plan`: read-only; refuses to mutate.

## F. Projects 🖥
- [ ] Create a project; set custom instructions.
- [ ] Add knowledge (text + file) → persists.
- [ ] Link a folder → agent can read/edit those files.
- [ ] Link a GitHub repo → pull works.
- [ ] Start a conversation; close & reopen app → conversation + title persisted.

## G. Skills 🖥
- [ ] Skills list scans configured folders; shows your skills.
- [ ] Toggle a skill off → it's no longer used; on → used again.
- [ ] Create a new skill → SKILL.md scaffold mentions **Thinkflux** (not Chai/Chakra).
- [ ] In chat with a matching skill, the model calls `load_skill` and follows it. ⚠
- [ ] Import skill folder / zip works.

## H. Connectors (MCP) 🖥
- [ ] Add an MCP server; **Test** reports success/failure clearly.
- [ ] Enable it → its tools are available to the agent and honor permissions.

## I. Dispatch (background + scheduled) 🖥
- [ ] Create a task with a prompt + target (chat / folder).
- [ ] **Run now** → produces output; appears in runs history.
- [ ] Schedule (every N min / daily) → fires at the right time.
- [ ] Folder target actually edits files (uses OpenAI-compatible provider).

## J. Consumption 🖥
- [ ] After some usage, charts populate (messages, tokens, by-model, streak, peak hour).
- [ ] Favorite model / active days look right.

## K. Live Artifacts 🖥
- [ ] Ask for an HTML/SVG artifact → renders in the artifact panel; close works.

## L. Composer 🖥
- [ ] "+" menu: Add files, Add to project, Add from GitHub, Skills, Connectors, Use style — each navigates correctly.
- [ ] Attach a text file → its content is used as context.
- [ ] Mic button: voice input transcribes (or shows the "not available" notice gracefully).
- [ ] Folder / permission / model controls sit **below** the input and work.

## M. Telegram bot 🖥
- [ ] Settings → Messaging: paste a valid BotFather token, your user id, target = chat → **Apply**.
- [ ] Status shows `validated @bot` → `online @bot` (not "error").
- [ ] Message the bot `/start` → connected reply; send a prompt → it runs and replies.
- [ ] A non-allowed user id is refused.
- [ ] Bad token → clear "bad token" status, not generic "error". ⚠

## N. Account → Profile 🖥
- [ ] Profile: set name/email/avatar → persists.
- [ ] "Link your profile": Google sign-in (needs your Google Client ID) fills name/email/avatar.
- [ ] GitHub sign-in (device flow, needs GitHub Client ID) fills profile.
- [ ] Instructions for Thinkflux: set text → applied to every conversation (verify the model obeys it).

## O. Claude Sign in (subscription mode) 🖥 ⚠
- [ ] Run `claude login` in a terminal first.
- [ ] Settings → Claude Sign in → tick **Use my Claude subscription** (API key blank).
- [ ] Pick an Anthropic model → chat works with no API key.
- [ ] Usage shows on your plan's credits at console.anthropic.com, **not** pay-as-you-go.
- [ ] Cowork/Code on Anthropic also bills the subscription.

## P. Corporate proxy 🖥
- [ ] Settings → Model configuration → Corporate proxy: set a proxy URL → restart.
- [ ] Terminal logs `[thinkflux] proxy enabled → …`.
- [ ] Cloud provider calls route through the proxy; **local Ollama still works** (bypassed).

## Q. Build & packaging 🖥
- [ ] `npm run electron:build` succeeds.
- [ ] `release/` has the installer **and** `Thinkflux-portable-<ver>.exe` **and** `win-unpacked/`.
- [ ] Portable exe runs by double-click — no install, no admin; synapse icon on the exe/shortcut.
- [ ] Fresh machine: config starts empty (re-enter keys), then everything works.

## R. Chrome extension 🌐
- [ ] `chrome://extensions` → Developer mode → Load unpacked → `extension/` loads with no errors.
- [ ] Side panel opens; synapse icon shown.
- [ ] ⚙ provider editor lists the 6 defaults; **Load models** caches each provider's models.
- [ ] Header model dropdown grouped by provider; green dot when active provider has a key/local.
- [ ] Simple goal ("type X in the search box and search") → observes, types, submits.
- [ ] Read-only goal ("summarize this page in 3 bullets") → answers from page text.
- [ ] Error surfaces full URL + body (404 etc.), not a bare code. ⚠
- [ ] Multi-step goal on a clean site (e.g. find pricing → report cheapest plan).

---

## Watch-list (most likely to misbehave)
1. Reasoning models leaking thoughts despite the stripper — try several models.
2. Default-model-on-startup snapping to the right provider.
3. Permission modal not freezing the UI.
4. Telegram token/format edge cases.
5. Anthropic subscription billing actually hitting the plan (only you can verify).
6. Extension element-selection reliability on JS-heavy sites.

> Tip: keep the terminal (and DevTools console) visible while testing — the
> `[thinkflux]` logs and any red errors are the fastest way to pinpoint a failure.
> Paste me whatever breaks and we'll fix it.
