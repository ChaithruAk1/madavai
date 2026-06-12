# Sage knowledge · Sidebar, Interface & Tools
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Top bar · Collapse sidebar
aliases: hide sidebar, expand sidebar, icon rail, Ctrl+B
What: The panel icon at the far left of the top bar that collapses the sidebar to a slim icon rail or expands it back.
Why: Reclaims width for chat or code while keeping one-click navigation.
Behavior: Click it (or press Ctrl+B) to toggle. When collapsed, sidebar text labels hide and only icons remain; the Madav brand block in the top bar also hides. The tooltip reads "Collapse sidebar (Ctrl+B)" or "Expand sidebar (Ctrl+B)" depending on state.

### Top bar · Madav brand
aliases: logo, wordmark, tagline, by Chaithrodaya Sukruth
What: The Think logo plus the "Madav" wordmark and the tagline "by Chaithrodaya Sukruth", shown at the top-left.
Why: Tells you which app and edition you're in at a glance.
Behavior: Purely informational — it isn't clickable. It only appears while the sidebar is expanded; collapsing the sidebar hides the brand block to save space.

### Top bar · Mode tabs (Let's Chat / Let's Collaborate / Let's Build)
aliases: mode switch, chat mode, cowork mode, code mode
What: Three center tabs that switch the whole app between modes: "Let's Chat" (conversation), "Let's Collaborate" (work on a folder), and "Let's Build" (code in a repo).
Why: Each mode shapes the workspace and which Recents you see.
Behavior: Click a tab to switch; the active tab is highlighted. The sidebar's new-conversation button relabels to match the mode, and Recents reload for that mode's history.

### Top bar · Online status chip
aliases: online dot, offline indicator, connection status
What: A small chip on the right with a colored dot reading "online", "offline", or "checking…".
Why: Instantly shows whether your active model is reachable before you send anything.
Behavior: Green glowing dot means the active model responded; red means offline (the text also turns red); grey means the check is still running. Hover for the tooltip "Active model is online/offline/checking…". It reflects the model endpoint, not your sidebar selection.

### Sidebar · New chat / New task / New session
aliases: new conversation, plus button, start chat
What: The top sidebar button that starts a fresh conversation. Its label follows the mode: "New chat" (Let's Chat), "New task" (Let's Collaborate), "New session" (Let's Build).
Why: One consistent place to begin work, whatever mode you're in.
Behavior: Click to open a blank conversation in the current mode; your previous one stays safe in Recents. When the sidebar is collapsed only the plus icon shows.

### Sidebar · Navigation entries
aliases: Projects, Agents, Studio, Terminal, Scheduler, Consumption, nav menu
What: Direct nav items — Projects, Agents, Studio, Terminal up top; Scheduler and Consumption near the bottom.
Why: Jump straight to a workspace area without leaving your conversation behind.
Behavior: Click to open that screen; the active item is highlighted. Entries respect the Extras switchboard (Settings → Extras): a feature explicitly switched off disappears from the nav entirely. A Test Center entry additionally appears only for admin accounts on builds that include the QA tools.

### Sidebar · Interface group
aliases: interface section, Skills menu, Connectors menu, Plugins menu, Via Mobile
What: A collapsible group holding Skills, Connectors, Plugins, and Via Mobile.
Why: Keeps extension-related screens tucked away until you need them.
Behavior: Click "Interface" to expand or collapse; the caret flips between right and down. The group is collapsed by default, auto-opens while you're on one of its screens, and re-collapses when you navigate away. Items hidden via Settings → Extras don't appear inside the group.

### Sidebar · Models group
aliases: model configuration, models overview, models speed check
What: A collapsible group holding Model configuration, Models overview, and Models speed check.
Why: Gathers everything about choosing and benchmarking models in one place.
Behavior: Click "Models" to expand or collapse. Like the Interface group, it stays collapsed by default, auto-opens while a Models screen is active, and folds back when you leave. The header highlights ("active-within") when you're inside one of its screens.

### Sidebar · Search chats…
aliases: search recents, find conversation, deep search, content search
What: The search box under the "Recents" label.
Why: Finds old conversations by title — or by what was said inside them.
Behavior: One or two characters filter visible titles instantly. Type 3+ characters and it switches to a deep content search across your messages (debounced ~250ms), showing each match with a "…snippet…" of the matching text under the title. No results shows "No matches anywhere in your chats — try different words."
Example: Searching "invoice" surfaces a chat titled "Friday plans" if the word appears in its messages.

### Sidebar · Recents list
aliases: history, past chats, conversations list
What: Your conversation history for the current mode (chat/cowork/code), newest first, up to 100 shown.
Why: Pick up any earlier conversation exactly where you left it.
Behavior: Click a row to reopen it; the open conversation is highlighted. Agent/team-bound conversations are excluded here — they live on the Agents screen. When empty it reads "Nothing here yet — your conversations will live here." Each row reveals export, share, and delete actions.

### Recents row · Export as Markdown
aliases: download chat, save conversation, export to PDF
What: The download icon on a Recents row.
Why: Get a readable copy of a conversation you can keep, send, or print.
Behavior: Click to download a .md file of the whole conversation — title, export timestamp, and every turn labelled "You" / "Madav" separated by dividers. Markdown opens anywhere and prints to PDF from any editor or browser. The filename comes from the chat title, trimmed to safe characters.

### Recents row · Share to community
aliases: share link, share chat, copy link
What: The share icon on a Recents row.
Why: Publish a conversation and hand someone a link.
Behavior: Click and Madav posts the title and messages to the share service, then copies the returned URL to your clipboard — the row briefly shows "Link copied ✓". If posting fails (e.g., offline), you'll see "Couldn't share" for a couple of seconds instead. The button is disabled while sharing is in flight.

### Recents row · Delete
aliases: remove chat, trash conversation
What: The trash icon on a Recents row.
Why: Clears conversations you no longer want in your history.
Behavior: Click to delete that conversation from your history. It doesn't open the chat first (the click is intercepted), and exported Markdown copies you saved earlier are unaffected.

### Sidebar · Update available banner
aliases: new version, download update, app update
What: A banner above the profile area reading "Update available · v<version>" with a Download button. Desktop only.
Why: Keeps your install current without nagging — it appears only when a newer version exists.
Behavior: On launch the desktop app compares its version against the account server's published version; if newer, the banner appears. Click "Download" to open the release link in your browser ("See site" if no direct link is provided). The web app never shows it — it updates itself on deploy.

### Sidebar · Free trial / Upgrade box
aliases: trial countdown, days left, upgrade button, trial ended
What: A box above your profile shown during a trial ("Free trial · N days left") or after one ends ("Trial ended"), each with an Upgrade button.
Why: A clear view of trial time remaining and the fastest path to a paid plan.
Behavior: Click "Upgrade" to open billing checkout (the button reads "Opening…" while it loads); without checkout support it falls back to the Profile page. Creator and Complimentary accounts never see this box — they're treated as settled accounts.

### Sidebar · Account button & plan label
aliases: profile, avatar, plan chip, Creator, Complimentary, Trial badge
What: The bottom sidebar button showing your avatar (or initial), name, and a plan label.
Why: One glance tells you who's signed in and on what footing.
Behavior: The label reads "Creator" or "Complimentary" for roster roles, your plan name (e.g., "Pro plan") when active, "Trial · Nd left" while trialing, "Trial ended" after expiry, or "Sign in" when signed out. Click to open the account menu; account data refreshes every 3 minutes so upgrades show without relaunching.

### Account menu · Settings
aliases: preferences, open settings
What: The first item in the account menu (your email shows above it).
Why: Gateway to all app configuration — providers, appearance, extras, and more.
Behavior: Click to close the menu and open the Settings screen. The profile button also highlights while Settings is the active screen.

### Account menu · User Guide
aliases: help, documentation, manual
What: Opens the built-in User Guide.
Why: The full reference for every feature, beyond Sage's quick answers.
Behavior: Click to close the menu and open the Guide screen. There's no separate "Get help" item — it was removed as a duplicate; for live questions, Sage floats on every screen.

### Account menu · Language
aliases: response language, default language, language submenu
What: A submenu choosing the default language for the assistant's responses; the current choice ("Auto" or a language) shows beside it.
Why: Get every answer in your preferred language regardless of what you type in.
Behavior: Click "Language" to unfold an inline submenu of 13 options: "Default (model decides)" plus English, Spanish, French, German, Italian, Portuguese, Hindi, Arabic, Chinese, Japanese, Korean, and Russian. The active choice is ticked, and the setting saves immediately.

### Account menu · Manage subscription / View plans
aliases: billing, plans, subscription portal, upgrade plans
What: A billing item that adapts to your account: "Manage subscription" for paid (and Creator) accounts, "View plans" while trialing or after a trial ends.
Why: Direct line to billing without hunting through settings.
Behavior: "Manage subscription" opens the billing portal for active subscriptions; "View plans" opens checkout. Complimentary accounts see neither — there's nothing to bill.

### Account menu · Log out
aliases: sign out, switch account
What: The last item in the account menu.
Why: Ends your session, e.g., to switch accounts or hand off a machine.
Behavior: Click to sign out and reload the app to the sign-in state. Local settings stay on the machine; you'll just need to sign in again.

### Skills · Skills list & Reload
aliases: personal skills, skill catalog, refresh skills
What: The left panel listing every skill discovered in your skill folders, with a Reload button in its header.
Why: See and select everything the agent can be taught at a glance.
Behavior: Skills are discovered recursively — each subfolder containing a SKILL.md counts, with duplicate names de-duplicated. Disabled skills render dimmed. Click a skill to view its description, trigger ("/name + auto"), last-updated date, and full rendered SKILL.md. Reload rescans folders after you edit files on disk.

### Skills · Create skill
aliases: new skill, new-skill-name, starter skill
What: The "new-skill-name" input with a plus button at the bottom of the Skills list.
Why: Scaffolds a fresh skill so you can start writing instructions immediately.
Behavior: Type a name (defaults to "new-skill") and click the plus — a starter skill folder is created inside your primary skills folder. You'll need at least one skills folder added first, or you'll get "Add a skills folder first." Desktop only.

### Skills · Import folder / .zip
aliases: import skill, add skill from zip, .skill file
What: Two buttons — "Import folder" and ".zip" — that bring existing skills in.
Why: Install skills shared by others or built elsewhere without manual copying.
Behavior: "Import folder" copies a folder containing SKILL.md into your primary skills folder; if you pick a parent folder of several skills, each is imported (a count shows in the status line). ".zip" accepts .zip and .skill archives. Both guard against importing a folder already in your skills path. Desktop only.

### Skills · Folders
aliases: skills directories, add folder, primary folder
What: The "Folders" button reveals the list of folders Madav scans for skills, with "Add folder" and per-folder remove (X) controls.
Why: Skills can live wherever you like — a synced drive, a repo, anywhere.
Behavior: The first folder is badged "primary" — creations and imports land there. "Add folder" opens a directory picker; removing a folder stops scanning it but deletes nothing from disk. Changes save instantly and the list rescans. Desktop only.

### Skills · Enable toggle
aliases: turn skill on, disable skill, skill switch
What: The toggle in a skill's detail header.
Why: Park a skill without deleting it — handy when two skills overlap.
Behavior: Green/right means enabled: the skill is offered to the agent (triggered by "/name" or automatically when a request matches). Toggled off, it's dimmed in the list and ignored entirely. The setting persists per skill directory across restarts.

### Skills · Delete
aliases: remove skill, trash skill
What: The trash button in a skill's detail header.
Why: Permanently removes a skill you no longer want.
Behavior: A confirm dialog shows the skill name and its folder path first. Confirming deletes the skill's folder from disk (recursively) and clears any disabled flag for it. This can't be undone from the app — re-import if you kept a copy.

### Skills · Web version note
aliases: skills in browser, desktop only skills
What: A banner shown in the web app: "Skill folders, import and creation need the desktop app — the browser can't manage files on your computer."
Why: Honest signposting — skills are folders on a real disk.
Behavior: On web you can't add folders, create, or import skills; the desktop app unlocks all of it.

### Connectors · App gallery
aliases: connector directory, MCP registry, one-click add, search connectors
What: A searchable gallery of integrations from the Model Context Protocol registry, with Filter (All / Remote (URL) / Local (npm)) and Sort (Name / Recent) selects.
Why: Add popular apps with one click instead of hand-writing server configs.
Behavior: Type in "Search connectors…" to query the registry (debounced). Each card shows the app, a "Remote"/"Local" tag, and "New" within 30 days of an update. Click the plus to add it instantly — already-added cards show a check. Packages that aren't one-click installable say so with the package type. If the registry is unreachable a cached list is shown.

### Connectors · Custom MCP server
aliases: manual connector, add MCP, custom server
What: The "Custom MCP server" button under "Your connectors".
Why: Connect anything the gallery doesn't list — including your own servers.
Behavior: Creates a blank connector named "New connector" (command "npx") and opens its editor so you can fill in the command, arguments, and tokens yourself. It appears in your connectors list immediately and saves as you type.

### Connectors · Connector editor (credentials & enabled)
aliases: connector settings, tokens, env vars, enable connector, your connectors cards
What: "Your connectors" shows each configured connector as a card (name, command summary, Enabled/Off). Clicking a card goes INSIDE its setup page — Display name, Command, Arguments (space-separated), "Environment / tokens (KEY=VALUE per line)", an "enabled" checkbox and a delete (trash) button; "← All connectors" returns to the cards.
Why: Cloud apps need a token or sign-in; the checkbox lets you pause a connector without losing its setup.
Behavior: Every edit saves immediately. Enabled connectors show a green "Enabled" status and are available to the agent in Chat, Cowork, Code, and Projects; "Off" ones stay configured but inactive. Trash removes the connector outright. The registry gallery hides while you're inside a connector.
Example: Paste `GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...` on its own line to authorize a GitHub connector.

### Connectors · Test connection
aliases: verify connector, list tools, connection check
What: The "Test connection" button in a connector's editor.
Why: Confirms the server starts and your credentials work before you rely on it mid-task.
Behavior: Click and Madav launches the server: success reports "Connected — N tools" and lists every available tool as a badge; failure shows "Failed: <reason>" in red so you can fix the command or token. Status text shows "Connecting…" while it runs.

### Connectors · Web version note
aliases: connectors in browser, directory desktop only
What: In the web app, the gallery area shows "Directory available in the desktop app."
Why: Browsing and launching local MCP servers needs the desktop runtime.
Behavior: On web the registry gallery doesn't load; use the desktop app to browse, add, and test connectors.

### Plugins · Import plugin (.plugin / .zip)
aliases: install plugin, plugin bundle, add plugin
What: The Plugins screen's primary button for installing a plugin — a single bundle that registers multiple Skills and Connectors (and optionally commands) at once.
Why: The easy way to share a whole setup as one boxed kit.
Behavior: Installation isn't wired yet: clicking shows "Plugin installation isn't wired yet — for now add Skills and Connectors individually below." The page reads "No plugins installed yet." The .plugin (zip + manifest) installer is the planned next step.

### Plugins · What a plugin bundles
aliases: plugin contents, plugin parts, skills connectors commands
What: Three explainer cards — Skills, Connectors, and Commands — describing what a plugin packages.
Why: Helps you assemble the same setup by hand until the installer ships.
Behavior: The Skills and Connectors cards are clickable and jump straight to those screens ("Open Skills →", "Open Connectors →"). The Commands card (optional slash commands and hooks a bundle ships) is informational only.

### Consumption · Range selector
aliases: 7 days, 30 days, all time, time range
What: The segmented control at the top right of the Consumption dashboard: "7 days", "30 days", "All time".
Why: Inspect a recent burst or your full history with one click.
Behavior: Clicking reloads every card and chart for that window. With no activity yet, the dashboard shows "No activity yet — send a few messages and come back."

### Consumption · KPI cards
aliases: messages count, tokens, est. spend, sessions, active days, streak
What: Headline cards: Messages, Tokens (est.), Est. spend (N% priced), Sessions, Active days, and Current streak.
Why: Your usage story in five seconds.
Behavior: "Est. spend (N% priced)" multiplies tokens by a blended per-token price from the OpenRouter catalog; N% is the share of tokens from models with published pricing — local/unpriced models are honestly excluded, and the card hides at 0% coverage. Tokens are estimated from text length (~4 chars/token); tiny spends show four decimals.

### Consumption · Activity over time
aliases: area chart, tokens per day, usage graph
What: The "Activity over time" panel — an area chart of tokens per day across the selected range.
Why: Spot busy stretches and quiet gaps instantly.
Behavior: Move your mouse across the chart and a marker snaps to the nearest day, with a tooltip showing exact tokens and the date. On wide windows it sits beside the heatmap; on narrow ones they stack.

### Consumption · Daily activity heatmap
aliases: contribution graph, calendar heatmap, 14 weeks
What: The "Daily activity" panel — a GitHub-style grid of the last 14 weeks, one square per day.
Why: Reveals your working rhythm — streaks, weekends, gaps.
Behavior: Squares deepen through five intensity levels relative to your own busiest day (see the "Less … More" legend). Hover any square for its date and token count.

### Consumption · Tokens by model
aliases: model donut, model share, token split
What: The "Tokens by model" donut splitting token usage across your top 6 models.
Why: Shows which models actually do your work — useful before tuning cost or defaults.
Behavior: Hover a segment (or its legend row) and the center switches from total tokens to that model's percentage and short name, dimming other segments. Shows "No model usage yet." until you've sent something.

### Consumption · Highlights
aliases: top model, peak hour, longest streak, avg per session
What: The "Highlights" panel: Top model, Peak hour, Longest streak, and Avg / session, plus per-model bars underneath.
Why: The fun superlatives — and a quick per-model comparison.
Behavior: The bars rank your top 5 models by tokens, each labelled with token count and message count (e.g., "12.4K · 87m"). Values recompute when you change the time range.

### Terminal · PTY / compat badge
aliases: pty mode, compatibility shell, full terminal
What: A small badge in the Terminal header reading "PTY" (green) or "compat".
Why: Tells you how capable this shell session is.
Behavior: "PTY" means a real pseudo-terminal — history, arrow keys, tab completion, and TUI apps all work. "compat" is a fallback pipe shell with basic line editing (backspace, Ctrl+C, Ctrl+U); the banner suggests running `npm run rebuild` for full PTY. The header also shows the working directory when one is set. Desktop only.

### Terminal · Run madav
aliases: start agent in terminal, madav command
What: The "Run madav" chip at the right of the Terminal header.
Why: Launches the Madav agent inside your shell without typing the command.
Behavior: Clicking types `madav` into the active shell and presses Enter, then focuses the terminal so you can keep typing. You can equally type `madav` yourself — the chip is just a shortcut.

### Terminal · Web signpost & Get the desktop app
aliases: terminal in browser, desktop app download
What: In the web app, Terminal shows "Terminal lives in the desktop app" with a perks list and a "Get the desktop app" button.
Why: A real shell needs access to your computer, which a browser can't provide.
Behavior: The card lists what desktop unlocks — any command (git, npm, builds), dev servers, the `madav` agent, full machine access. The button opens the download page; the footer notes availability for Windows, macOS, and Linux.

### Test Center · Admin QA area
aliases: testcenter, QA tools, admin testing
What: An internal quality-assurance area for the Madav team.
Why: Lets admins verify builds; it's not part of the everyday product.
Behavior: The sidebar entry appears only when you're signed in as an admin AND the build includes the QA tools — end-user installers downloaded from the website never ship them, so most users will never see it. If you don't have it, nothing is missing from your install.

### Test Center · Sage Librarian tab
aliases: librarian, knowledge sweep, drift scan, sage knowledge update
What: An admin maintenance tab that keeps Sage's control-level knowledge in sync with the source code.
Why: Renamed or changed controls would otherwise make Sage confidently describe labels that no longer exist.
Behavior: Admin-only, desktop-only, and only when Madav runs from the source tree (never in shipped installers). "Scan for drift" git-compares the code since the last sweep and lists stale knowledge areas; "Generate update" has the active model rewrite that area file from current source; the proposal shows an entry-level diff (new / updated / removed). Nothing is written until the admin clicks "Apply (writes the file)" — every apply keeps a backup with one-click roll back.

### Sage Librarian · Apply (writes the file)
aliases: apply proposal, approve knowledge update
What: The approval button on a Librarian proposal — the only action that writes a knowledge file.
Why: Wrong knowledge poisons Sage, so a human reviews every change before it lands.
Behavior: Refuses if the file changed on disk after the proposal was generated (re-scan and regenerate). Writes a timestamped backup first; "Roll back" restores it instantly. When the last pending proposal is applied, the sweep baseline advances so the next scan starts from here. Changes reach Sage on the next build or dev reload.
