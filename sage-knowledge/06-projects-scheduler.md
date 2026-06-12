# Sage knowledge · Projects, Scheduler & Via Mobile
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Projects · New project
aliases: create project, add project, new project dialog, start a project
What: The "New project" button (top right of Projects) opens a "Create a personal project" dialog with two fields.
Why: Projects group chats, Collaborate tasks, instructions, and knowledge files around one effort.
Behavior: "What are you working on?" names the project (Enter creates it immediately; blank becomes "Untitled project"). "What are you trying to achieve?" is optional and is saved as the project's Instructions, so it shapes every chat from day one. "Create project" makes it and opens its page; "Cancel" or clicking outside closes the dialog.

### Projects · Search projects…
aliases: find project, filter projects, project search
What: The search box in the Projects header.
Why: Jump straight to a project when the grid grows.
Behavior: Filters live as you type, matching the project name only (case-insensitive) — it does not search instructions or knowledge. Clearing the box restores the full grid.

### Projects · Sort toggle
aliases: sort projects, order by name, order by date, arrow button
What: The up/down-arrows icon button next to search; its tooltip reads "Sort by name" or "Sort by date".
Why: Switch between recency and alphabetical browsing.
Behavior: Toggles between the two orders. Date order puts the most recently updated (or created) project first; name order is A–Z. The tooltip always names the order you'd switch *to*.

### Projects · Project cards
aliases: project tile, project grid, open project
What: Each card in the grid shows the project name, the first 100 characters of its instructions (or "No instructions yet"), and how long ago it was touched.
Why: A quick scan of what each project is about and how fresh it is.
Behavior: Clicking a card opens that project's page. The timestamp shows relative time ("3h ago", "2 days ago") and falls back to a date for older projects. If you have no projects, the area instead says "No projects yet. Click \"New project\" to create one."

### Project page · All projects (back)
aliases: back to projects, leave project, return to list
What: The "All projects" button with a left arrow at the top of a project page.
Why: Return to the grid without losing anything.
Behavior: Closes the project page and reloads the projects list so updated timestamps are fresh. Everything in the project saves as you go, so backing out is always safe.

### Project page · Delete project
aliases: remove project, trash project, delete this project
What: The small red trash button beside the project title.
Why: Retire a project and its chat history in one move.
Behavior: Asks you to confirm with "Delete project \"name\" and all its conversations?" — accepting deletes the project and returns you to the list. This removes the project's conversations too, so export anything you need first; there is no undo.

### Project page · Chat composer
aliases: project chat box, message box, ask in project, start chat here
What: The message composer at the top of the project page.
Why: Start a new chat that automatically carries this project's instructions and knowledge.
Behavior: Sending a message opens a fresh Let's Chat conversation scoped to the project, with your text as the first message. The conversation then appears in the "Chats · Let's Chat" list below so you can return to it later.

### Project page · Start work in Let's Collaborate
aliases: cowork in project, collaborate button, work on project files, start task
What: The button under the composer that launches a Let's Collaborate session for this project.
Why: Collaborate sessions can read, edit, and run things in the project's linked folder — real work, not just chat.
Behavior: Requires a linked folder: if none is set, you get "Link a folder to this project first (Files & sources) to start work in Let's Collaborate." With a folder linked, it opens a Collaborate workspace pointed at that folder and tagged to the project, and the resulting task shows up under "Tasks · Let's Collaborate".

### Project page · Chats · Let's Chat
aliases: project conversations, chat list, past chats, conversation history
What: The list of this project's chat conversations, each showing its title and message count.
Why: Every chat started here stays attached to the project for easy pickup.
Behavior: Clicking a row reopens that conversation. The small trash button on each row deletes just that conversation immediately — no confirmation — and the list refreshes. If the project has no chats or tasks yet, you'll see a hint to start one instead.

### Project page · Tasks · Let's Collaborate
aliases: project tasks, collaborate sessions, cowork history, task list
What: The list of Let's Collaborate sessions scoped to this project, with title, message count, and last-updated time.
Why: Folder work done for this project stays findable next to its chats.
Behavior: Clicking a row reopens that Collaborate session where it left off. Each row's trash button deletes that session immediately, without a confirmation prompt. Only sessions started from this project (or otherwise tagged with its id) appear here.

### Project page · Instructions
aliases: project instructions, custom instructions, system prompt for project, project rules
What: The "Instructions" box in the right rail — "Tailors Madav's responses across every chat in this project."
Why: Set tone, role, rules, and standing context once instead of repeating it in every chat.
Behavior: Free-form text; it saves automatically when you click away from the box (on blur) — there's no Save button. The first 100 characters also become the project card's description on the Projects grid.
Example: "You are reviewing legal contracts. Always flag liability clauses."

### Project page · Link folder
aliases: attach folder, project folder, connect directory, local folder
What: The "Link folder" button under Files & sources.
Why: A linked folder is what powers "Start work in Let's Collaborate" — file and shell access lives there.
Behavior: Opens a native folder picker (desktop) and shows the chosen path in a bar with an "Unlink" button. A project has one source at a time: while a folder is linked, the GitHub field is hidden. Unlink detaches the path without touching the files themselves.

### Project page · GitHub URL
aliases: link github, clone repo, git pull, connect repository
What: The "github.com/user/repo.git" field with a GitHub button beside it, shown when no folder is linked.
Why: Work against a repository without cloning it by hand.
Behavior: Clicking the GitHub button clones the repo locally ("Cloning…" appears, then the path bar). Once linked, a refresh button (tooltip "git pull") fetches the latest commits, reporting "Updated from GitHub" or an error. "Unlink" detaches the source so you can link a folder or a different repo. Errors surface inline under Files & sources.

### Project page · Add files
aliases: upload files, attach documents, add knowledge files, import file
What: The "Add files" button in Files & sources, which adds documents to the project's knowledge.
Why: Give every chat and task in the project reference material to draw on.
Behavior: On desktop it opens a native dialog and the app extracts text, including from PDFs. On the web build it uses a browser picker (up to 8 files per batch): xlsx/xls sheets become CSV text, docx is converted to plain text, and txt/md/csv/code files are read as-is — but PDFs show "PDFs need the desktop app (it extracts their text)." Each file becomes a removable knowledge item.

### Project page · Paste text…
aliases: add text, paste note, text knowledge, quick note
What: The "Paste text…" input with the document button beside it, in Files & sources.
Why: Drop in a snippet — an email, spec, or note — without making a file.
Behavior: Type or paste, then click the button (tooltip "Add text"); the content is saved as a knowledge item named "Note" and the field clears. Empty input is ignored. The note then behaves exactly like an added file.

### Project page · Knowledge items
aliases: knowledge list, project files list, remove file, attached documents
What: The rows under Files & sources, one per knowledge item, showing its name, size in characters ("1234c"), and a trash button.
Why: See and prune exactly what context the project carries.
Behavior: The trash button removes that item from the project immediately — no confirmation. When empty, the area reads "Add PDFs, documents, or text to reference in this project." Items count toward what Madav reads each chat, so trim stale ones.

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
aliases: where it runs, run target, task destination, chat folder agent team brief
What: The select choosing where each run executes: "Let's Chat (plain)", "Work in a project", "Let's Collaborate (folder)", "Run an agent", "Run an agent team", or "Daily brief (your activity digest)".
Why: The target decides what the run can touch and how your prompt is interpreted.
Behavior: Chat is plain Q&A with no file access. Project uses a project's knowledge and instructions (pick one from the extra dropdown). Folder gives file and shell access via "Choose folder". Agent and Team run a saved agent or team with your prompt as their mission (agents can take an optional working folder). Daily brief summarizes recent conversations, agent work, and today's schedules — the prompt only adds topics.

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
