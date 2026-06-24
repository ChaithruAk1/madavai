# Stage 1 — Chat Engine: First-Time-User Test Plan (Desktop + Web)

_Written for someone using Madav for the very first time. No technical knowledge needed. Just follow the steps in order. Last updated 18 June 2026._

## What you're testing and why
The "chat engine" is the part that powers a normal conversation in **Let's Chat** — sending a message, getting a reply, the assistant searching the web or making an image, handling long chats, and so on.

**The big idea of this stage:** the web app and the desktop app now use the *same* chat engine under the hood. So the most important thing you're checking is: **does Let's Chat behave the same on both, and does everything work?**

👉 **Do every test twice — once in the desktop app, once in the web app — and note if they behave the same.**

---

## Part A — Before you start (5-minute setup)

1. **Open both apps** (you'll switch between them):
   - **Desktop:** open the Madav desktop application like any other program.
   - **Web:** open the Madav website in your browser and **sign in** (web needs sign-in for things like web search).
2. **Make sure a model is selected.** Near the message box (or in Settings) there's a **model picker**. Pick any normal model you have set up. If nothing's there, open **Settings → add a provider and an API key**.
3. **Turn on image generation** (for the image test): go to **Settings → Extras → Image generation** and switch it **on**. (This needs an image-capable model selected.)
4. Have a **small photo file** and a **small text file (.txt)** handy on your computer for the attachment tests.

> Tip: keep this document open beside the app and tick the results table at the bottom as you go.

---

## Part B — How to read each test
- **Steps** = exactly what to click/type.
- **Example** = the exact words you can type in.
- **✅ Pass looks like** = what you should see if it's working.
- **❌ Problem looks like** = warning signs to write down.
- **Both apps:** unless noted, expect the **same** result on desktop and web.

---

## Part C — Orientation (the chat screen)
- The big empty area in the middle is where the **conversation** appears.
- At the bottom is the **message box** (type here).
- The round **arrow (↑) button** = **Send**. While the assistant is working it becomes a **square ■ = Stop**.
- There's a **microphone** (voice), a **paperclip/attach** for files, and typing **/** opens a **menu** of shortcuts/skills.
- Somewhere near the top is **New chat** (starts a fresh conversation) and a list/history of past chats.

---

## Part D — The tests

### GROUP 1 — The basics

**Test 1.1 — Open Let's Chat**
- **Steps:** Click **Let's Chat**.
- **✅ Pass:** A conversation screen opens with an empty message box ready to type.
- **❌ Problem:** Blank/frozen screen, or an error.

**Test 1.2 — Send a simple message and watch it reply**
- **Steps:** Click the message box, type the example, press **Enter** (or the ↑ Send button).
- **Example:** `Hello! Tell me one fun fact about octopuses.`
- **✅ Pass:** The reply appears and **streams in word-by-word**, then finishes with a sensible answer.
- **❌ Problem:** Nothing happens, an error appears, or the text never finishes.

**Test 1.3 — It remembers earlier in the same chat**
- **Steps:** Right after Test 1.2, send the example below.
- **Example:** `What animal did I just ask you about?`
- **✅ Pass:** It answers "octopuses" (it remembered).
- **❌ Problem:** It has no idea what you mean.

**Test 1.4 — New chat clears everything**
- **Steps:** Click **New chat**.
- **✅ Pass:** The conversation area goes empty and you can start fresh.
- **❌ Problem:** The old messages are still there.

**Test 1.5 — Past chats are saved**
- **Steps:** Look at the list/history of previous chats; click an earlier one.
- **✅ Pass:** Your earlier conversation re-opens with its messages.
- **❌ Problem:** History is missing or opens the wrong chat.

---

### GROUP 2 — The assistant using tools
These tools should run **automatically, with no pop-up asking for permission.** (That auto-run with no pop-up is itself part of what we're testing.)

**Test 2.1 — Web search**
- **Steps:** Send the example. _(Web app: make sure you're signed in.)_
- **Example:** `Search the web for one recent news headline about space, and tell me the source.`
- **✅ Pass:** You see a small **"web search" step/card** appear by itself (no permission pop-up), then an answer that references what it found.
- **❌ Problem:** A permission pop-up appears for the search, or it says it can't search, or it makes up a headline without searching.

**Test 2.2 — Fetch a web page**
- **Steps:** Send the example.
- **Example:** `Fetch https://example.com and summarize what's on the page.`
- **✅ Pass:** It retrieves the page and gives a short summary.
- **❌ Problem:** It can't fetch, or invents content.

**Test 2.3 — Make an image** _(needs image generation ON + an image-capable model)_
- **Steps:** Send the example.
- **Example:** `Create an image of a friendly robot reading a book under a tree.`
- **✅ Pass:** An **actual picture appears** in the chat (no permission pop-up), and the assistant adds a one-line description.
- **❌ Problem:** It says it made an image but **no picture shows**, or a permission pop-up appears, or it says image generation is off (then turn it on in Settings → Extras and retry).

**Test 2.4 — Deep research** _(this one is slower on purpose)_
- **Steps:** Send the example and wait — it does several searches.
- **Example:** `Do deep research on the health benefits and risks of green tea, with sources.`
- **✅ Pass:** It works through multiple steps and returns a fuller, organized answer with sources.
- **❌ Problem:** It errors, or returns a one-line answer with no research.

**Test 2.5 — Remember something**
- **Steps:** Send the first example; then start a **New chat** and send the second.
- **Example A:** `Please remember that my favorite color is teal.`
- **Example B (new chat):** `What's my favorite color?`
- **✅ Pass:** In the new chat it recalls "teal."
- **❌ Problem:** It doesn't remember across the new chat.

**Test 2.6 — It asks you a question when it needs to** _(may not always trigger)_
- **Steps:** Send a deliberately vague request.
- **Example:** `Book me the usual.`
- **✅ Pass:** Instead of guessing wildly, it asks you to clarify what "the usual" means.
- **❌ Problem:** It crashes or pretends to do something impossible.

---

### GROUP 3 — Attachments and other input

**Test 3.1 — Attach a photo and ask about it** _(needs a vision-capable model)_
- **Steps:** Click attach (paperclip), choose your photo, then ask the example.
- **Example:** `What's in this picture?`
- **✅ Pass:** You see the photo attached, and it describes the image correctly.
- **❌ Problem:** The photo doesn't attach, or it can't "see" it.

**Test 3.2 — Paste an image**
- **Steps:** Copy any image, click the message box, paste (Ctrl+V).
- **✅ Pass:** The image shows as an attached preview.
- **❌ Problem:** Nothing attaches.

**Test 3.3 — Attach a text file and ask about it**
- **Steps:** Attach your `.txt` file, then ask the example.
- **Example:** `Summarize the attached file in two sentences.`
- **✅ Pass:** It reads the file's text and summarizes it.
- **❌ Problem:** It ignores the file or errors.

**Test 3.4 — The "/" shortcut menu**
- **Steps:** In the empty message box, type `/`.
- **✅ Pass:** A small menu of shortcuts/skills pops up.
- **❌ Problem:** Nothing happens.

**Test 3.5 — Voice input (microphone)** _(only if voice is enabled in your build)_
- **Steps:** Click the **mic**, say a short sentence, stop.
- **✅ Pass:** Your spoken words appear as text in the message box.
- **❌ Problem:** Mic does nothing, or no text appears.

---

### GROUP 4 — Long chats and stopping

**Test 4.1 — Stop a reply mid-way**
- **Steps:** Send the example, and while it's streaming click the **square ■ Stop** button.
- **Example:** `Write a long, detailed 8-paragraph story about a lighthouse keeper.`
- **✅ Pass:** The reply stops promptly where it was; the app stays responsive and you can send a new message.
- **❌ Problem:** It ignores Stop, freezes, or errors.

**Test 4.2 — Very long conversation (auto-summarizing)**
- **Steps:** Have a long back-and-forth: paste a big chunk of text (a few pages) and ask about it, then keep asking follow-ups — 10+ exchanges, or paste large text a couple of times.
- **✅ Pass:** At some point a small **"compacting / compact context" step appears by itself**, the chat keeps going smoothly, and it still answers correctly about earlier parts.
- **❌ Problem:** It suddenly errors with something about "too long," loses the thread completely, or freezes.

**Test 4.3 — It doesn't get stuck repeating itself**
- **Steps:** Give it a task that might tempt it to retry the same thing (e.g. search for something that won't return much).
- **Example:** `Search the web for "asdkfjghqwointlkjzxcv12345" and keep trying until you find it.`
- **✅ Pass:** After a couple of tries it stops, explains it couldn't find anything, and doesn't loop forever.
- **❌ Problem:** It repeats the identical search over and over without stopping.

---

### GROUP 5 — Models and robustness

**Test 5.1 — Switch the model mid-use**
- **Steps:** Open the **model picker**, choose a different model, send a message.
- **Example:** `Which model am I talking to now, roughly?`
- **✅ Pass:** It replies normally on the new model.
- **❌ Problem:** Switching breaks the chat or errors.

**Test 5.2 — A strict provider's tools still work** _(if you have an NVIDIA model)_
- **Steps:** Select an NVIDIA model, then ask it to use a tool.
- **Example:** `Search the web for the capital of Australia.`
- **✅ Pass:** The search runs and it answers (Canberra).
- **❌ Problem:** An error mentioning "tool" or "type" — write it down (that's the exact kind of bug this stage fixed).

**Test 5.3 — A simpler/older model still chats** _(optional, if you have one)_
- **Steps:** Select a basic model that may not support tools, ask it a tool-y question.
- **Example:** `Search the web for a chocolate cake recipe.`
- **✅ Pass:** Either it searches, or it gracefully answers from its own knowledge — but it does **not** crash or print weird code-looking blocks.
- **❌ Problem:** It errors, or shows raw `tool` blocks that never run.

**Test 5.4 — Friendly error when nothing is set up** _(negative test)_
- **Steps:** In Settings, temporarily clear the selected model/provider (or use a fresh setup), then try to send a message.
- **✅ Pass:** A clear, friendly message tells you to add a provider/model — not a scary technical crash.
- **❌ Problem:** A confusing error or a frozen screen. _(Put your model back afterward.)_

---

### GROUP 6 — Chat working with your other features (skills, connectors, research, agents, projects)
The chat engine is what lets the assistant reach your skills, connected services, agents, and project knowledge. Each of these features gets its **own deeper testing later** (its own stage) — here we just confirm **chat can use them**. If you don't have one set up yet, skip that test and we'll cover it in its stage.

**Test 6.1 — Use a Skill in chat**
- **Prereq:** at least one skill installed (check the **Skills** page).
- **Steps:** In **Let's Chat**, type `/` to open the menu, pick a skill, then send a request it handles.
- **Example:** type `/`, choose your skill, then ask something it's built for.
- **✅ Pass:** the skill attaches to your message (you see it tagged), and the reply clearly follows the skill's instructions.
- **❌ Problem:** the `/` menu shows no skills, or the skill is ignored/errors.

**Test 6.2 — Use a connected service (Connector / MCP) in chat**
- **Prereq:** an outside service connected under **Connectors**.
- **Steps:** ask chat to use it.
- **Example:** `Use my <connected service> to <something it supports, e.g. list my recent items>.`
- **✅ Pass:** a step/card for that service appears and runs, and you get a real result. _(The first use may ask you to approve or sign in to the connector — that's expected.)_
- **❌ Problem:** chat can't see the connector, the tool never runs, or it errors.

**Test 6.3 — Deep research (cross-check)**
- This is **Test 2.4** — re-confirm it here as your "chat uses research" check.

**Test 6.4 — Try an Agent**
- **Prereq:** an agent created in **Agents (Agent Studio)**.
- **Steps:** open Agent Studio, pick your agent, and use its **Try/Run** option to chat with it.
- **Example:** ask it something inside its job/role.
- **✅ Pass:** it chats in its defined role and can use the tools you allowed it.
- **❌ Problem:** it won't start, ignores its role, or errors.

**Test 6.5 — Chat inside a Project**
- **Prereq:** a **Project** (Workroom) with some files/knowledge added.
- **Steps:** open **Projects** → open your project → chat there.
- **Example:** ask a question whose answer is in the project's files.
- **✅ Pass:** it answers using the project's own knowledge (not just general knowledge).
- **❌ Problem:** it ignores the project knowledge or errors.

**Test 6.6 — Memory / track record (cross-check)**
- This is **Test 2.5** — confirm it remembers across chats as part of this group too.

---

## Part E — Desktop vs Web: what should match, and what's allowed to differ

**Should behave the SAME on both** (this is the heart of the test):
- Sending messages, streaming replies, memory within a chat.
- Web search, web fetch, image generation, deep research, remember — including **auto-run with no permission pop-up**.
- Long-chat summarizing, Stop, the loop-safety behavior.

**Allowed to differ** (normal, not a bug):
- The **web app may need sign-in** for web search; the desktop app may not.
- Tiny visual differences in spacing/animation.
- Some heavy features (a built-in terminal, running local models) **don't exist on web at all** — but those aren't part of plain Let's Chat, so they shouldn't come up here.

If something works on one but **not** the other, that's the most important kind of thing to note.

---

## Part F — Results table (tick as you go)

| Test | Desktop ✅/❌ | Web ✅/❌ | Same on both? | Notes |
|------|:---:|:---:|:---:|-------|
| 1.1 Open Let's Chat | | | | |
| 1.2 Simple message streams | | | | |
| 1.3 Remembers in-chat | | | | |
| 1.4 New chat clears | | | | |
| 1.5 History saved | | | | |
| 2.1 Web search (auto) | | | | |
| 2.2 Fetch a page | | | | |
| 2.3 Make an image | | | | |
| 2.4 Deep research | | | | |
| 2.5 Remember across chats | | | | |
| 2.6 Asks when unclear | | | | |
| 3.1 Attach photo (vision) | | | | |
| 3.2 Paste image | | | | |
| 3.3 Attach text file | | | | |
| 3.4 "/" menu | | | | |
| 3.5 Voice mic | | | | |
| 4.1 Stop mid-reply | | | | |
| 4.2 Long chat summarizes | | | | |
| 4.3 No endless repeat | | | | |
| 5.1 Switch model | | | | |
| 5.2 NVIDIA tools work | | | | |
| 5.3 Simple model chats | | | | |
| 5.4 Friendly setup error | | | | |
| 6.1 Use a Skill in chat | | | | |
| 6.2 Use a Connector/MCP | | | | |
| 6.3 Deep research (cross-check) | | | | |
| 6.4 Try an Agent | | | | |
| 6.5 Chat inside a Project | | | | |
| 6.6 Memory across chats | | | | |

---

## Part G — If something fails
Just note it in the table and tell me:
1. **Which test number**, and **desktop or web**.
2. **What you typed** and **what happened** (a screenshot is perfect).
3. Anything red or any error words you saw.

I'll take it from there — I do the fixing; you just point at what looked wrong. And remember: while you test, **I'll also be running the automated test suite** (hundreds of checks) on the chat engine, so we catch problems from both directions.
