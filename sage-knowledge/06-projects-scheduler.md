# Sage knowledge · Workrooms, Scheduler & Via Mobile
<!-- generated from source 2026-06-12 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->
<!-- Projects became WORKROOMS (2026-06-12): rooms staffed by agent crews. -->

### Workrooms · New workroom
aliases: create workroom, new project, add room, open a workroom, start a project
What: The "New workroom" button (top right of Workrooms) opens an "Open a new workroom" dialog with two fields.
Why: A workroom gathers one effort's brief (instructions), knowledge shelf, linked folder/repo, agent crew, and all its chats and task runs.
Behavior: The first field names the room (Enter creates it immediately; blank becomes "Untitled workroom"). "The brief" is optional and saves as the room's standing instructions, shaping every chat and crew mission from day one. "Open workroom" creates it (the room gets an automatic identity color and glyph) and takes you inside; "Cancel" or clicking outside closes the dialog.

### Workrooms · Search & sort
aliases: find workroom, filter rooms, sort workrooms, order by name, order by date
What: The "Search workrooms…" box and the up/down-arrows sort toggle in the header.
Why: Jump straight to a room when the shelf grows.
Behavior: Search filters live as you type, matching the room name only (case-insensitive). The sort button flips between recent-activity order (most recently active room first) and A–Z; its tooltip names the order you'd switch to.

### Workrooms · Room banners (the shelf)
aliases: room banner, workroom list, project cards, open workroom, pulse line, crew strip, knowledge meter
What: Each workroom is a wide horizontal banner: a colored spine with the room's glyph on the left, the room's name with a pulse line beneath it, the crew strip (faces of its assigned agents), and a knowledge meter on the right.
Why: One glance tells you what the room is, who staffs it, how much it knows, and whether it's been busy.
Behavior: Clicking a banner opens the room. The pulse line reads "3 runs today · 2h ago" when active, "last activity 2 days ago" when idle, or "quiet — put the crew to work" when nothing has happened yet. The crew strip shows up to five agent portraits (+N for more, "no crew" when empty); the meter fills with the volume of knowledge and is labeled with the source count. Every room's color and glyph are assigned automatically, like agents.

### Workroom · All workrooms (back)
aliases: back to workrooms, leave room, return to list
What: The "All workrooms" button with a left arrow at the top of a room.
Why: Return to the shelf without losing anything.
Behavior: Closes the room and reloads the shelf so pulse lines are fresh. Everything in a room saves as you go, so backing out is always safe.

### Workroom · Room header & Close
aliases: room title, delete workroom, remove project, trash room, gradient header
What: The room's header — a soft gradient band in the room's identity color with its glyph, name, pulse line, and a small red trash button.
Why: Confirms which room you're in and how alive it is; the trash retires it.
Behavior: The trash asks "Close workroom \"name\"? Its conversations are deleted too." — accepting deletes the room and its chat history and returns you to the shelf. There is no undo, so export anything you need first.

### Workroom · Instructions
aliases: room instructions, brief, project instructions, custom instructions, standing orders
What: The "Instructions" box in the left zone — standing instructions every chat and crew mission in this room follows.
Why: Set goals, tone, rules, and context once instead of repeating them in every chat or mission.
Behavior: Free-form text; saves automatically when you click away (on blur) — no Save button. The brief is injected into room chats, room-scoped Collaborate tasks, crew missions launched with "Put to work", and scheduled runs targeted at this room.
Example: "You are reviewing legal contracts. Always flag liability clauses."

### Workroom · Knowledge shelf
aliases: knowledge, book spines, add files, paste text, project files, remove knowledge
What: The "Knowledge" section in the left zone — each item is a book-spine row (a colored spine edge, the name, its size in thousands of characters) with a trash button, plus "Add files" and "Paste text…" inputs below.
Why: Whatever sits on the shelf, the whole room — chats and crew alike — can draw on.
Behavior: "Add files" opens a native dialog on desktop (text is extracted, including from PDFs); the web build uses a browser picker (xlsx→CSV, docx→text, txt/md/code as-is; PDFs need the desktop app). "Paste text…" saves a snippet as a knowledge item named "Note". The trash on a row removes that item immediately, no confirmation. When empty: "An empty shelf. Add documents, data, or notes the room should know."

### Workroom · Linked folder & repo
aliases: link folder, attach folder, github url, clone repo, git pull, unlink source
What: The "Linked folder & repo" section in the left zone: a "Link folder" button, or a "github.com/user/repo.git" field with a GitHub button.
Why: The linked folder is where the room's file work happens — Collaborate sessions and crew agents with file tools all operate there.
Behavior: A room has one source at a time. Link folder opens a native picker (desktop); the GitHub button clones the repo locally ("Cloning…", then the path bar). Once linked, the path shows in a bar with a refresh button (tooltip "git pull") for repos and an "Unlink" button that detaches the source without touching the files. Errors surface inline beneath the section.

### Workroom · Composer & "Work in the room's folder"
aliases: room chat box, start chat, collaborate in room, cowork button, start task
What: The composer at the top of the center zone, with a "Work in the room's folder (Let's Collaborate)" button beneath it.
Why: Two ways to make the room produce: a knowledge-grounded chat, or real file work in its folder.
Behavior: Sending a message opens a fresh chat scoped to the room — the brief and knowledge ride along — and the conversation lands in the work feed. The Collaborate button needs a linked folder (you're prompted to link one otherwise) and opens a Collaborate workspace pointed at the room's folder, tagged to the room.

### Workroom · Work feed
aliases: feed, chats and tasks, history, filter chips, by agent filter, room activity
What: The center zone — every chat and every task run this room produced, merged into one chronological feed, with filter chips above it (All · Chats · Tasks · one chip per crew agent).
Why: One place to find everything the room has done, no matter who or what did it.
Behavior: Newest first; each row shows an icon (speech bubble for chats, hammer for task runs), the title, the agent's name when an agent ran it, message count, and relative time. Clicking a row reopens that chat or session where it left off; the row's trash deletes just that item immediately. An agent chip filters the feed to that agent's runs (click again to clear). Runs launched from the room — including crew missions and scheduled room tasks — are tagged with the room automatically.

### Workroom · Crew
aliases: agents in room, staff agents, assign agent, crew zone, agent portraits, moods
What: The right zone — the room's assigned agents, each card showing the agent's living portrait (its mood reflects recent work in this room), name, role line, and per-room track record, with an "+ Assign an agent…" dropdown beneath.
Why: Agents are part of the room's ecosystem: a staffed agent works with the room's brief, knowledge, and folder.
Behavior: Assign adds a roster agent to the crew (it appears on the room's banner too); the small trash removes it from the crew without deleting the agent. The track record line ("4 missions here · 100% clean") counts only this room's runs. Portrait moods: waving hello when it hasn't run here yet, happy after a fresh clean run, focused after a failure, calm otherwise.

### Workroom · Open a note (knowledge viewer)
aliases: read note, view knowledge, open knowledge item, edit note, what is inside my notes
What: Clicking any book-spine row on the Knowledge shelf opens that item in a viewer window: its name (editable), character count, and the full content in an editable text area.
Why: A shelf you can't open isn't a shelf — come back days later and read exactly what the room knows.
Behavior: Edit the name or content and click "Save changes" to update the item in place; "Close" (or clicking outside) discards edits. The window is resizable like every Madav dialog — drag its bottom-right corner. The trash on the row still deletes the item without opening it.

### Workroom · Share & Import (rooms travel with their crew)
aliases: share project, export workroom, send room to someone, import workroom, madavroom file
What: The share button in a room's header exports a portable `.madavroom.json` file; the "Import" button on the Workrooms shelf loads one.
Why: Hand a colleague a ready-to-work room — brief, knowledge shelf, identity, AND the crew agents that staff it.
Behavior: Export bundles the room's name, brief, knowledge, identity, and the full definitions of its crew agents. The linked folder path and chat history deliberately stay private on your machine (a referenced GitHub URL is included as a note to relink). Import recreates the room and adds any missing crew agents to the recipient's Agents roster — for safety, imported agents arrive with full autonomy stripped (ask-permission mode) and no model pin (they use the default model). Agents the recipient already has (same id and name) are reused, not duplicated.

### Workroom · Put to work
aliases: launch agent in room, run crew agent, put to work in this room, agent mission
What: The "Put to work" button on each crew card.
Why: Launches that agent on a mission inside the room — its own instructions plus the room's brief, knowledge, and folder, all at once.
Behavior: Agents with file or shell tools open a Let's Collaborate session in the room's linked folder (you're asked to link one first if missing); others open a chat. Either way the run is tagged with the room: it lands in the work feed, counts toward the agent's per-room track record, and the agent's pinned model is respected. The recruiter hint below the crew points to Agents for hiring specialists you can then staff here.

### Scheduled tasks · New task
aliases: create task, add scheduled task, new automation, task menu
What: The "New task" button opens a small menu: "Create with Madav" (guided/chat-driven) or "Set up manually" (a form).
Why: Two paths to the same task — describe it conversationally, or fill in fields yourself.
Behavior: "Create with Madav" opens a wizard where Madav asks one question at a time (toggle "Ask me adaptively" off for fixed steps: describe → frequency → when → target → review). "Set up manually" opens the full form directly. Both end in the same saved task. On an empty list, "Daily brief" and "Weekly review" starter chips prefill the form.

### Scheduled tasks · Name & Description
aliases: task name, task description, required fields
What: The two required fields (marked *) at the top of the task form, plus the larger prompt box below them.
Why: Name and description identify the task in the list; the prompt is what actually runs.
Behavior: Save is disabled until both Name and Description have text. The prompt box ("What should Madav do each run?") is the instruction executed on every run — except for the Daily brief target, where it just adds extra topics on top of the built-in digest.
Example: Name "daily-briefing", prompt "Summarize my unread emails and today's calendar."

### Scheduled tasks · Target dropdown
aliases: where it runs, run target, task destination, chat folder agent team brief, workroom target, room and agent combo
What: The select choosing where each run executes: "Let's Chat (plain)", "Work in a project" (a workroom), "Let's Collaborate (folder)", "Run an agent", "Run an agent team", or "Daily brief (your activity digest)".
Why: The target decides what the run can touch and how your prompt is interpreted.
Behavior: Chat is plain Q&A with no file access. The workroom target adds two dropdowns: pick the room, then "Run as" — the room itself, or a specific agent (crew members are marked "· crew"). With an agent chosen, that agent runs the task headless inside the room: its own instructions plus the room's brief, knowledge, and linked folder, and the run lands in the room's work feed and the agent's per-room track record. Folder gives file and shell access via "Choose folder". Agent and Team run a saved agent or team with your prompt as their mission (agents can take an optional working folder). Daily brief summarizes recent conversations, agent work, and today's schedules — the prompt only adds topics.

### Scheduled tasks · Frequency
aliases: schedule, how often, interval, daily time, weekly day, manual
What: The Frequency select: Manual, Every N minutes, Daily, or Weekly, with extra inputs as needed.
Why: Decide whether the task runs itself or waits for you.
Behavior: "Every N minutes" reveals a minutes box (default 60); Daily and Weekly reveal a time picker (default 09:00), and Weekly adds a weekday select (Sun–Sat). Manual means it only runs when you press Play. The list shows the result as "Every 60 min", "Daily at 09:00", or "Weekly · Mon 09:00", and the banner reminds you tasks only run while the computer is awake — the "Keep awake" checkbox prevents sleep.

### Scheduled tasks · Permission & model
aliases: ask before changes, auto-approve, task model, model picker in task
What: The "Ask before changes" / "Auto-approve" select and the model picker on the task form.
Why: Scheduled runs may need to act without you watching.
Behavior: "Ask before changes" pauses for approval on risky actions; "Auto-approve" lets the run proceed unattended — pick it for tasks that fire while you're away, with care. The model picker chooses a specific provider model for this task, or "Default model" to follow your current selection.

### Scheduled tasks · Task rows (Run now, delete, last run)
aliases: run task now, play button, delete task, task list, last run time
What: Each task row shows its name (with a clock icon when scheduled), description, frequency, last-run time, a Play button, and a trash button.
Why: Run, inspect, or remove tasks at a glance.
Behavior: The Play button is "run now" — it fires the task immediately (a spinner shows while running) and updates the last-run column ("just now", "2h ago", "never run"). The trash button deletes the task immediately, no confirmation. Clicking anywhere else on the row opens it for editing; setting Frequency to Manual is how you effectively pause a schedule — there is no separate pause switch.

### Scheduled tasks · Search & sort
aliases: find task, filter tasks, sort tasks, order by recent
What: The "Search tasks…" box and the arrows sort toggle in the header.
Why: Manage a long task list quickly.
Behavior: Search matches the task name and description as you type. The sort button flips between alphabetical and most-recently-run order; its tooltip names the order you'd switch to.

### Scheduled tasks · Webhook triggers
aliases: webhooks, POST hook, fire agent from outside, zapier trigger, curl example
What: A desktop-only card letting external systems (Zapier, mail rules, CI, cron) fire an agent, team, or scheduled task via `POST http://127.0.0.1:<port>/hook/<agent|team|task>/<id>` with a JSON `{"prompt": …}` body.
Why: Connect Madav to anything that can make an HTTP request.
Behavior: Ticking "Enabled" generates a bearer token automatically and starts a listener (status shows "listening on :8765" or an error). You can change the Port, pick what to fire ("Agent" / "Team" / "Scheduled task" plus a target), and "Copy example" copies a ready curl command; the raw command stays collapsed behind a "Show the raw command" reveal so the card reads clean. It's token-protected and local-only by default (127.0.0.1) — anyone with the token can run your agents, so treat it like a password. Not available in the web build.

### Via Mobile · Enable Telegram bot
aliases: turn on bot, telegram remote, enable via mobile, bot on off
What: The "Enable Telegram bot" checkbox in Bot setup.
Why: Switches on remote control of this machine through your private Telegram bot.
Behavior: Tick it, then click Apply to actually start the bot — the status chip turns green with "online @•••••" when running (the bot's username is masked for privacy). Untick and Apply to stop. Remember the warning above it: this is remote control of this machine, restricted to your allowed Telegram user ids, and the app must be open and online to respond.

### Via Mobile · Bot token (from @BotFather)
aliases: telegram token, api token, botfather token, bot key
What: A password-masked field for the HTTP API token BotFather gives you when you create a bot.
Why: The token is how Madav logs in as your bot.
Behavior: Paste the whole token (like `123456:ABC-…`); it displays masked and saves as you type, but takes effect only after Apply. Keep it secret — anyone holding it can message as your bot. The collapsible "How to set up your Telegram bot" guide above walks through getting one via `/newbot`.

### Via Mobile · Allowed Telegram user id(s)
aliases: allowed users, whitelist, user id, who can use the bot
What: A password-masked, comma-separated field of numeric Telegram user ids permitted to use the bot.
Why: This allow-list is the security boundary — only these ids can drive your machine.
Behavior: Find your id by messaging `@userinfobot` in Telegram; paste the number here, adding more separated by commas if needed. Anyone not listed is ignored. Because remote runs auto-approve tools, keep this list tight.
Example: `123456789, 987654321`

### Via Mobile · Run target when working independently
aliases: bot run target, chat or folder, bot file access, default target
What: A select — "Chat (no file/shell access — safest)" or "A folder (agent can edit files & run commands)" — used when the bot isn't continuing a Collaborate session.
Why: Decides how much power phone messages get by default.
Behavior: Chat answers questions only; Folder reveals a "Choose folder" button and lets the bot read, edit, and run commands in that one folder — only point it at a folder you trust it with. When you're linked to a Let's Collaborate project, this is bypassed: the bot uses that project's own folder instead (`/sessions` and `/use <name>` in Telegram switch projects).

### Via Mobile · Apply
aliases: save bot settings, apply messaging, restart bot
What: The Apply button at the bottom of Bot setup.
Why: Settings are stored as you type, but the bot itself only restarts when you Apply.
Behavior: Saves everything and (re)starts the Telegram bot with the current token, allow-list, and target. A status chip appears beside it showing the live result — green when running, grey with the reason otherwise. The note below reminds you it uses your active provider; send `/start` to your bot to test.

### Via Mobile · Open in Telegram
aliases: t.me link, open bot, test bot, telegram deep link
What: The "Open in Telegram" button in the "Open your bot" panel, shown once the bot is online and its username is known.
Why: One tap to reach your bot without searching Telegram.
Behavior: Opens the bot's `t.me/<username>` deep link in your default handler. From there press Start and send any message; the reply runs on this computer and also appears in the Requests list. On a phone, search the bot's username or use the link BotFather gave you instead.

### Via Mobile · Auto-continue my current Let's Collaborate session
aliases: auto continue, continue on phone, session handoff, phone link
What: A checkbox (on by default) that automatically binds the bot to whatever Let's Collaborate session you're working on at the desktop.
Why: Walk away from your desk and keep texting the same session — no setup.
Behavior: With it on, phone messages continue your current desktop Collaborate session and are written back into it; you never need the "Continue on phone" chip that appears on Collaborate sessions for manual linking. Turn it off if you want the phone (via `/use`) — not the desktop — to decide which project is active. A "Continuing a desktop session" bar appears when linked, with an Unlink button (or send `/unlink` in Telegram).

### Via Mobile · Requests
aliases: request history, bot log, phone requests, clear history
What: The "Requests" list — every bot request ever made, kept across restarts, each card showing time, source, sender, target, status (green ok / red error), your message, and the output.
Why: An audit trail of everything your phone made this machine do.
Behavior: Each card has a trash icon ("Delete this request") that removes just that entry. The "Clear" button in the header deletes the entire history after a confirmation ("This cannot be undone"). The list refreshes automatically every few seconds; the Refresh button forces it. When empty, the placeholder tells you whether the bot is online or still needs setup.
