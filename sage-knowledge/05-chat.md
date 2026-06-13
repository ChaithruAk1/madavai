# Sage knowledge · Chat, Collaborate & Build surfaces
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Top bar · Let's Chat / Let's Collaborate / Let's Buildaliases: mode switch, chat vs build, work surfaces
What: The three primary work modes in the top navigation.
Why: Each surface points Madav at a different kind of work.
Behavior: "Let's Chat" (Conversation) is plain talk — no folder. "Let's Collaborate" (Work on a folder) and "Let's Build" (Code in a repo) are agent modes: they add a folder bar, a permission picker and an environment picker, and can read/edit files and run commands. A running turn keeps running when you switch tabs; each mode remembers its own conversation, restored when you return.

### Hero · Greeting
aliases: home screen, empty state, good morning
What: The greeting shown above the composer before any message exists.
Why: A calm starting point that adapts to who and what you're working as.
Behavior: A plain session greets you by first name and time of day ("Good morning, Sam"). When a custom agent is attached you instead see that agent's name, glyph and description; a team shows stacked member faces, the team name and its mode; a project‑scoped Collaborate task shows the project name with "instructions & knowledge are applied."

### Composer · Message box
aliases: text area, input, prompt box, type hereWhat: The main place you type your message.
Why: It's how you talk to Madav.
Behavior: Enter sends; Shift+Enter makes a new line. The box grows as you type up to ~200px then scrolls. Placeholder hints change by mode and note "/ commands · @ files". Typing "/" at the start opens commands+skills; typing "@" opens the file/connector mention menu. Ctrl/Cmd+U opens the file picker; Backspace on an empty box with an attached skill removes the skill.

### Composer · Send button
aliases: arrow up, submit, send arrow
What: The up‑arrow button that sends your message.
Why: Sends what you've typed plus any attachments.
Behavior: Enabled only when there's text, an attachment, or an attached skill. While a turn is running it becomes a Stop (square) button that interrupts the agent. Clicking Send packages attached text files inline, images as vision data, and any skill instruction, then clears the composer.

### Composer · Stop buttonaliases: square, interrupt, halt
What: Replaces Send while Madav is working.
Why: Lets you cut a turn short.
Behavior: Shown only while busy. Clicking it interrupts the live session and clears the busy state. The turn keeps running if you merely navigate away — only Stop actually halts it.

### Composer · Voice input (mic)
aliases: microphone, dictate, speech to text, push to talk
What: The mic button that turns speech into text in the box.
Why: Talk instead of type.
Behavior: Click to record, click again to stop (push‑to‑talk). On desktop it transcribes through your own OpenAI or Groq (Whisper) key; if no key is found it switches that machine permanently to the built‑in Windows voice engine (no key needed) — tap once more and speak. On the web it falls back to Chrome's browser speech. The mic only appears when Voice is on in Settings → Extras.

### Composer · "+" Add menu
aliases: plus button, attach menu, add
What: The "+" button opening the attach/insert menu.
Why: One place for files, mentions, GitHub, skills, projects and connectors.
Behavior: Opens a menu with: Add files or photos, Mention file / connector, Add from GitHub, Skills (submenu), Add to project, and Connectors. Closes when you click outside.

### Add menu · Add files or photos
aliases: attach file, upload, paperclip, Ctrl+U
What: Opens your system file picker to attach files.
Why: Give Madav documents or images to work with.
Behavior: Shortcut Ctrl/Cmd+U. Images attach as thumbnails for vision. Spreadsheets (.xlsx/.xls) are parsed to CSV per sheet; Word .docx is extracted to text; plain text is inlined. You can also paste or drag files straight in. Each attachment shows as a removable chip.

### Add menu · Mention file / connector
aliases: @ mention, reference file, @ menu
What: Inserts an "@" to mention a file in the working folder or a connector.
Why: Point Madav at a specific file or connected service without attaching it.
Behavior: Same as typing "@". Connectors you've enabled and files from the linked folder appear; arrow keys navigate, Enter/Tab inserts. Names with spaces are quoted (@"My File"). With no folder or connectors it prompts you to link one first.

### Add menu · Add from GitHubaliases: GitHub content, import from repoWhat: Opens a dialog to pull content in from GitHub.
Why: Attach files straight from a GitHub repository.
Behavior: Opens the "Add content from GitHub" modal; chosen items are added to the composer as attachments. (Distinct from "Connect a GitHub repo," which clones a whole repo as your Build workspace.)

### Add menu · Skills
aliases: skills submenu, attach skill, puzzle
What: A submenu listing your installed skills.
Why: Hand a request to a specialized skill.
Behavior: Expands to your enabled skills; picking one attaches it as a chip so your next message runs through it. "Manage / add skills" jumps to the Skills screen. Empty until you install skills.

### Add menu · Add to project / Connectors
aliases: project, connectors menu itemsWhat: Shortcuts from the "+" menu to the Projects and Connectors screens.
Why: Quick navigation to manage saved workspaces or connected services.
Behavior: "Add to project" opens the Projects screen; "Connectors" opens the Connectors screen.

### Composer · "/" Slash commands
aliases: slash menu, commands, quick actions
What: Type "/" at the line start for inline commands and skills.
Why: Fast in-place actions without leaving the box.
Behavior: Commands run in place — /add-files opens the picker, /new starts a fresh chat/task/session (label varies by mode), /folder chooses a working folder. Below the commands, your skills appear; choosing one attaches it. Arrow keys move, Enter/Tab confirms, Escape closes. No match offers "Manage skills →".

### Composer · "@" Mentions
aliases: at mention, file picker inline, connectors inline
What: Type "@" to mention connectors and folder files.
Why: Reference a file or service precisely inside your message.
Behavior: Connectors list first, then up to 40 matching files from the linked folder. Folders show a slash. Multi‑word names are auto‑quoted. Requires a linked folder for files and enabled connectors for services.

### Composer · Attachments (file parsing)
aliases: xlsx, docx, pdf, binary files, what files work
What: How attached files are turned into something Madav can read.
Why: Different file types need different handling.
Behavior: Spreadsheets become CSV (first 8 sheets); .docx becomes plain text; images go in as vision. A PDF attaches with a note that chat can't extract PDF text yet — add it to a Project's knowledge instead, since Projects parse PDFs. True binaries (zip, exe, media, fonts, etc.) attach with a note that their contents weren't included, so they never dump garbage into the chat.

### Composer · "Select Folder" button
aliases: choose folder, change folder, working directory, choose environment, select folder
What: The button that picks the working folder, on the row BELOW the message bar (left of the model selector).
Why: Agent modes need a folder to read and edit.
Behavior: In Collaborate/Build it reads "Select Folder" (or the folder's name once set). In Build the menu also offers your GitHub repos (connect an account or add one by URL); in Collaborate it's local folders only — repos are a coding thing. On the web, folders work only in Chrome or Edge and edits are file‑only — running npm/git/tests needs the desktop app. Picking a folder starts a fresh conversation.

### Folder bar · Continue on phone
aliases: on phone, Telegram, mobile link, smartphone
What: Links the current Collaborate session to your Telegram bot.
Why: Carry on the task from your phone, with replies appearing here on return.
Behavior: In Collaborate, when auto‑continue is on (default) the phone icon auto‑links whichever Cowork session is active while the bot is online; turn auto off in Via Mobile to pin a session manually with "Continue on phone" / "On phone · Unlink." If the bot is offline you're told to enable it in Via Mobile first.

### Model row · Model selector
aliases: choose model, switch model, provider
What: The model selector pill centered on its own row BELOW the message bar.
Why: Pick which model and provider runs your turn.
Behavior: Opens a wide browser of every configured provider's models with search, a maker filter, and chips (All/Free/Paid · Cloud/Local · Coding/Reasoning/Vision/Fast/Agentic). Choosing one sets both the active provider and that provider's model. A refresh action re‑queries each provider's model list. On launch the active model snaps to your saved Default Model.

### Model row · "Permission" picker
aliases: permission mode, ask first, accept edits, act freely, plan mode, ask before changes
What: The "Permission" button right of the model selector — sets how freely Madav may act in agent modes.
Why: Trade speed for control over edits and commands.
Behavior: Four modes — "Ask before changes" (default: approve each edit/command), "Auto‑accept edits" (apply file edits, still ask for commands), "Act — trust all" (run everything without asking), and "Read‑only" (inspect only, never modify). The button always reads "Permission"; the current mode shows in its tooltip and menu checkmark. Reads are always free in every mode. Appears only in Collaborate and Build; changing it updates the live session immediately.

### Composer · The "Ask Madav" bar
aliases: message box, chat bar, input pill, composer
What: The single rounded bar — "+" for attachments, the "Ask Madav" input, a mic, and a round theme‑colored send button that appears while you type.
Why: One clean place to talk to Madav on all three surfaces.
Behavior: The mic is always present (when Voice is enabled in Extras); the send circle pops in the moment the box has content and becomes Stop while a reply streams. The bar grows as you type and a soft accent glow spreads behind it. The "+" menu holds files/photos, @‑mentions, GitHub content, skills, projects and connectors.

### Message · Copy / Edit / Retry
aliases: message actions, copy reply, redo, change my message
What: The small actions under each message.
Why: Reuse, fix or regenerate a turn.
Behavior: Copy (on any non‑empty message) copies the raw text, briefly showing a check. Edit (your messages only) opens an inline editor — Ctrl/Cmd+Enter saves and re‑sends, dropping everything after it. Retry (assistant messages only) re‑runs from the previous user message as a fresh turn.

### Message · Rendering & file cards
aliases: markdown, formatting, artifact pill, office docs
What: How replies and produced files are displayed.
Why: Readable formatting plus one‑click access to generated artifacts.
Behavior: Assistant replies render as Markdown (a leading junk‑JSON blob from weak models is stripped); user images show as thumbnails. When a reply contains a self‑contained artifact (a page, diagram, doc or component) an "Open …" pill appears that opens it in the side panel.

### Tool card · Worked step
aliases: tool step, what did it do, activity row, human verbs
What: A collapsed card describing one action the agent took.
Why: Shows the work in plain English instead of raw tool names.
Behavior: Each card is a human sentence with an icon — "Read file.js," "Created folder ABC," "Searched …," "Git: commit." Click to expand: shell steps show the literal "$ command," other tools show their inputs, and outputs render (diffs are color‑coded). A spinner marks running steps; "declined" marks denied ones.

### Work strip · "✓ Worked — N steps"
aliases: collapsed steps, worked summary, expand work
What: One quiet line standing in for a burst of routine tool steps.
Why: Keeps the chat a conversation — your words and the agent's words — while the busywork folds away.
Behavior: Consecutive routine steps collapse into a single strip showing "Working" with a spinner while live, then "Worked — N steps." Click to expand every step; click again to collapse. Images and questions always stand alone, never folded in. The live side panels still show each step as it happens.

### Permission modal · Allow / Decline
aliases: permission prompt, approve change, allow once, allow for session
What: The dialog asking before Madav changes your folder.
Why: A safety check before edits and commands when you're in "Ask before changes."
Behavior: Shows a dialog when Madav wants to edit a file or run a command in a restricted context. It names the specific action (e.g., "Run a command?" or "Edit file?") and displays the exact command or path. "Allow once" applies the action just this time; "Allow for session" switches to trust‑all for the remainder of the session; "Decline" (or pressing Escape or clicking outside) aborts the request. Multiple requests can be queued, with only one modal visible at a time. Reads are always permitted regardless of mode.

### Mid‑mission question modal
aliases: agent needs input, ask the human, answer & resume, skip
What: A modal where a paused agent asks you something mid‑task.
Why: The agent hit a decision only you can make; answering resumes it.
Behavior: Shows the question with optional answer chips you can click. Type a custom answer and press Enter or “Answer & resume.” “Skip — let it decide” hands control back with your best‑judgment note. This decision‑question is distinct from the permission prompt: it concerns choices, not granting access. It can be queued if several members ask simultaneously.

### Resume mission banner
aliases: mission interrupted, continue team mission, checkpoint
What: A banner offering to resume an interrupted team mission.
Why: Long team missions checkpoint, so you don’t lose finished work.
Behavior: Appears on a team conversation that has an unfinished checkpoint while idle, noting how many steps were already done. “Resume mission” continues from the checkpoint; the × dismisses the banner.