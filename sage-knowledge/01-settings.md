# Sage knowledge · Settings
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Settings · Settings sidebar
aliases: settings menu, left nav, sections list, settings tabs
What: The left-hand column listing every Settings page: Profile, Terminal access, Community, Product requests, and (when allowed) Extras, Agent Browser, Admin Analytics.
Why: Lets you jump between settings areas without leaving the screen.
Behavior: Profile and Terminal access are visible to everyone. Extras appears only for Creator, Complimentary, or admin accounts. Agent Browser and Admin Analytics appear only for admins — if you don't see them, your account isn't an admin. Clicking an item swaps the right-hand pane immediately; nothing is saved or lost by switching.

### Settings → Profile · Account card
aliases: account, my account, profile card, subscription status, who am i
What: The card at the top of Profile showing your avatar, name, email, sign-in provider, and subscription status badge.
Why: One glance tells you who's signed in and whether your plan is active.
Behavior: Reads live data from the auth server; it's hidden entirely if you're not signed in. The badge shows "Creator", "Complimentary", "Active · <plan>", "Free trial · N days left", or "Trial ended". Creator and Complimentary accounts see a note instead of billing buttons ("Creator access — all features, no subscription.").

### Settings → Profile · Manage subscription
aliases: billing, manage plan, payment, billing portal, change card
What: A button on the Account card that opens the billing portal for your subscription.
Why: Use it to update payment details, change plans, or cancel.
Behavior: Shown only when your status is "active" and you're a billable account (not Creator or Complimentary). It opens the external billing portal; if that fails, an error message appears on the card ("Couldn't open the billing portal…").

### Settings → Profile · Subscribe
aliases: buy, upgrade, start subscription, pay, checkout
What: A button on the Account card that starts a subscription checkout.
Why: Appears when you're on a trial or your trial ended and you want full access.
Behavior: Shown for billable accounts that aren't currently active. Clicking opens checkout in your browser; the card shows "Complete checkout in your browser; your status updates shortly." Errors are shown inline. Creator and Complimentary accounts never see this — they don't need a subscription.

### Settings → Profile · Sign out
aliases: log out, logout, sign off, switch account, disconnect
What: A button on the Account card that signs you out of your Madav account.
Why: Use it to switch accounts or sign out on a shared machine.
Behavior: Signs out via the auth server and reloads the whole app immediately — unsent text in other screens is lost, so finish what you're doing first.

### Settings → Profile → Appearance · Theme
aliases: dark mode, light mode, color scheme, appearance, system theme
What: A dropdown choosing the app's color theme: Dark, Light, or "System (match OS)".
Why: Pick what's easy on your eyes, or let it follow your operating system.
Behavior: Saves and applies immediately on change — there is no Save button for this. Default is Dark when nothing has been chosen. "System (match OS)" tracks your OS light/dark setting.

### Settings → Profile → Appearance · Accent color
aliases: accent, highlight color, theme color, custom color, brand color
What: Two choices — "Default", the built-in multi-color accent, or "Custom", a color picker for your own accent.
Why: Personalizes buttons, highlights, and active states across the app.
Behavior: Clicking Default restores the multi-color look. "Custom" is actually a native color picker hidden under the chip — click it and choose any color. Saves and applies immediately; no Save button.
Example: Click Custom, pick #13c2d6, and the app's highlights turn teal right away.

### Settings → Profile · Instructions for Madav
aliases: custom instructions, system prompt, global instructions, persona, rules
What: A text box for instructions applied to every conversation — Chat, Code, Cowork, and Projects.
Why: Set tone, role, and standing rules once instead of repeating them per chat.
Behavior: Unlike most Profile controls, this does NOT save as you type — you must click the Save button below it; a "Saved ✓" confirmation flashes for about 1.5 seconds. Leave it empty and no instructions are injected.
Example: "Be warm and concise. I'm a senior engineer — skip the basics. Prefer TypeScript and show code diffs."

### Settings → Profile → Memory · Remember things about me across chats
aliases: memory toggle, remember me, cross-chat memory, forget, memory switch
What: A checkbox controlling whether Madav remembers durable facts about you (preferences, projects, corrections) across all conversations.
Why: Memory makes every chat smarter about you; turn it off if you'd rather start fresh each time.
Behavior: Default ON. Saves immediately on change. Turning it off keeps existing notes but stops using them and stops learning new ones — nothing is deleted. Memory is stored only in a local file on this device and is injected only into your own model's prompts. This is the same switch as "Cross-chat memory" in Extras — one source of truth.

### Settings → Profile → Memory · Edit
aliases: edit memory, change notes, modify memories, edit list
What: A button on the Memory card that turns the remembered-notes list into an editable text box, one memory per line.
Why: Fix a wrong fact or remove a single note without wiping everything.
Behavior: Opens the full list as plain text. Clicking "Save memory" parses each non-empty line (leading "-" or "•" bullets are stripped) and replaces the entire stored list; "Cancel" discards your edits. Until you save, nothing changes on disk.

### Settings → Profile → Memory · Forget everything
aliases: clear memory, delete memories, wipe notes, erase, reset memory
What: A button that deletes all remembered notes at once.
Why: A clean slate — useful if memory has accumulated stale or unwanted facts.
Behavior: Acts immediately with no confirmation dialog, and there is no undo — the list empties on the spot. The button only appears when at least one note exists. The memory feature itself stays on; new facts will be learned again as you chat.

### Settings → Profile → Advanced · Account server URL
aliases: auth server, server address, backend url, account url, self-hosted
What: A field (tucked inside the collapsed "Advanced" section) holding the URL of the account/auth server Madav talks to.
Why: Only needed if you run your own account server or a non-default deployment.
Behavior: Saves immediately on change. The placeholder shows the local default style ("http://127.0.0.1:8787 (or your deployed https URL)"). A wrong value breaks sign-in and subscription checks, so leave it alone unless you know your deployment's address.

### Settings → Terminal access · Enable terminal access
aliases: cli, command line, madav command, terminal setup, shell agent
What: A button that provisions the `madav` CLI so you can run Madav as a coding agent in any terminal.
Why: Same brain as the desktop app, but in your shell — great for working inside project folders.
Behavior: One click writes your existing provider settings to a local config and adds a `madav` command to your PATH — no API key re-entry. It's set up automatically for active subscribers; this button re-runs that. Once configured the button label changes to "Re-run setup". Requires Node.js; if it's missing the card links to nodejs.org. Subscription is checked each time the CLI starts. In the web version this whole card is replaced by a notice — setup only works from the desktop app.
Example: After enabling, `cd` into a project and type `madav`; inside the CLI, `/help` lists commands and `/undo` reverts the last edit.

### Settings → Terminal access · Disable
aliases: turn off cli, remove command, uninstall cli, disable terminal
What: A button that turns off terminal access.
Why: Use it if you no longer want the `madav` command available in your shell.
Behavior: Appears only when the CLI is already configured. Removes the setup immediately and refreshes the status shown on the card. You can re-enable any time with one click — your provider settings in the app are untouched.

### Settings → Terminal access · Copy
aliases: copy command, clipboard, copy madav
What: A small button next to the `madav` command shown after a successful setup.
Why: Saves you typing the command in your terminal.
Behavior: Copies the literal text "madav" to your clipboard. It appears inside the green "Ready" panel along with the model the CLI will use; open a new terminal so the PATH change is picked up.

### Settings · Community
aliases: forum, discussions, chat with users, community page
What: A sidebar entry opening the in-app Community screen.
Why: A place to talk with other Madav users.
Behavior: Visible to everyone. Admins get extra moderation abilities on this screen (the page is passed your admin status). The Community page itself has its own controls documented separately.

### Settings · Product requests
aliases: feature request, feedback, suggest feature, ideas, wishlist
What: A sidebar entry opening the Product requests screen, where you suggest and vote on features.
Why: The direct channel to influence what gets built next.
Behavior: Visible to everyone. Admins see additional management controls on the page. Like Community, the page's own controls are documented separately.

### Settings → Extras · Extras switchboard
aliases: feature flags, switchboard, enable features, turn off features, extras page
What: The feature switchboard — a list of toggles turning this install's capabilities on or off for users.
Why: Lets the install owner tailor which features are available without rebuilding the app.
Behavior: Visible only to Creator, Complimentary, and admin accounts. Every feature defaults to ON (an absent flag means ON; only an explicit off disables). Each toggle re-reads settings from disk before saving, so it never clobbers another writer. Features marked "not in this build" are greyed out and can't be toggled. Interface features (Sage, Studio, Terminal, Scheduler, Via Mobile, voice) apply immediately; engine features (image generation, office files) apply from the next message — running missions keep the tools they started with.

### Settings → Extras · Sage helper
aliases: sage, sara, in-app guide, help assistant, floating helper
What: A toggle for the floating in-app guide (Sage/Sara) that answers questions about the app on every screen.
Why: Turn it off if you don't want the helper available to users of this install.
Behavior: Default ON. Saves immediately on toggle and applies immediately (it's an interface feature). Visible only on the Extras page, i.e. to Creator/Complimentary/admin accounts.

### Settings → Extras · Voice input
aliases: microphone, mic, speech, dictation, talk to chat
What: A toggle for the microphone buttons in the chat composer and in Sage — speak instead of typing.
Why: Disable it to remove voice input from this install entirely.
Behavior: Default ON. Saves immediately and applies immediately. Greyed out with "not in this build" if the installer excluded the feature.

### Settings → Extras · Image generation
aliases: create image, generate pictures, image tool, ai images
What: A toggle for the create_image tool available in chats and agent missions.
Why: Turn off to prevent image creation, or because your model can't do it anyway.
Behavior: Default ON. Saves immediately, but as an engine feature it applies from the next message — running missions keep the tools they started with. Note it uses the currently selected model, which must be image-capable for results.

### Settings → Extras · Office file creation
aliases: spreadsheets, word docs, powerpoint, pdf, officedoc, excel
What: A toggle for building real spreadsheets, Word documents, PowerPoint decks, and PDFs in chat (officedoc cards).
Why: Disable if you don't want users producing office files from this install.
Behavior: Default ON. Saves immediately; engine feature, so it takes effect from the next message rather than mid-conversation.

### Settings → Extras · Agent Browser
aliases: browser toggle, web browsing, live sites, browser master switch
What: A toggle letting agents drive a real browser window to research and act on live sites — marked "master switch".
Why: The single biggest capability/risk trade-off: agents touching the live web.
Behavior: Default ON. This is a unified view of the same switch as "Agent Browser feature" on the admin Agent Browser page (settings key agentBrowser.enabled) — flipping either changes both; there is exactly one source of truth. Admins always keep the browser themselves; the switch governs non-admin users. The detailed guardrails (allowlist, injection shield, secret fields) live on the admin Agent Browser page.

### Settings → Extras · Cross-chat memory
aliases: memory switch, remember user, persistent memory, memory master
What: A toggle for Madav remembering durable facts about the user across conversations — marked "master switch".
Why: Same control as the Memory card checkbox, surfaced here for the install owner.
Behavior: Default ON. Maps to the same settings key (userMemory.enabled) as "Remember things about me across chats" on the Profile Memory card — they are one switch. Turning it off keeps stored notes but stops using or adding to them.

### Settings → Extras · Desktop control
aliases: computer use, native apps, windows control, click and type, automation
What: A toggle letting agents operate native Windows applications — open, read, click, type.
Why: Powerful automation that some owners will prefer to keep off.
Behavior: Default ON. Comes with built-in safety: app allowlists and refusal to type into credential fields (per its catalog description). Saves immediately on toggle. Greyed out if not included in this build.

### Settings → Extras · Deep Research
aliases: research, web research, cited reports, deep research tool
What: A toggle for multi-source web research with cited reports (the deep_research tool).
Why: Disable to remove the heavyweight research capability from this install.
Behavior: Default ON. Saves immediately on toggle. Disabled with a "not in this build" tag when the installer excluded it.

### Settings → Extras · Studio
aliases: studio launcher, build pages, create apps, studio toggle
What: A toggle for the Studio launcher — build web pages, documents, games, and diagrams from a prompt.
Why: Hide Studio entirely from users of this install.
Behavior: Default ON. Interface feature — saving is immediate and the change applies immediately, no restart needed.

### Settings → Extras · Terminal
aliases: terminal panel, in-app terminal, console, shell panel
What: A toggle for the in-app terminal panel.
Why: Some owners don't want users running shell commands from inside the app.
Behavior: Default ON. Interface feature — applies immediately on toggle. Note this is the in-app panel, separate from "Terminal access" (the madav CLI), which has its own settings page.

### Settings → Extras · Scheduler
aliases: scheduled tasks, triggers, webhooks, cron, automation screen
What: A toggle for the Scheduler — the scheduled tasks, agent triggers, and webhooks screen.
Why: Turn off to remove timed and triggered automation from this install.
Behavior: Default ON. Interface feature — saves and applies immediately.

### Settings → Extras · Via Mobile
aliases: telegram, phone control, mobile access, remote control
What: A toggle for controlling Madav from your phone over Telegram.
Why: Disable if you don't want a remote phone channel into this install.
Behavior: Default ON. Interface feature — saves and applies immediately on toggle.

### Settings → Agent Browser · Agent Browser feature
aliases: master switch, browser on off, disable browsing, kill switch
What: The master switch deciding whether non-admin users get the Agent Browser at all. Admin-only page.
Why: The one lever to stop everyone else's agents from touching the live web.
Behavior: Default ON. You (admin) always keep the Agent Browser — this only governs non-admins. When off, the Browser capability is hidden in the Studio and agents that have it simply run without browser tools; all guardrails below it become inactive (shown greyed out with a hint). Saves immediately. Same underlying switch as the "Agent Browser" toggle in Extras.

### Settings → Agent Browser · Enforce site allowlist
aliases: allowlist, whitelist, allowed sites, domain restriction, block redirects
What: A toggle confining each browsing agent to the domains listed on its card; off-list redirects are blocked.
Why: A stray link or injected redirect can't take an agent somewhere unexpected.
Behavior: Default ON (recommended). Admin-only. Saves immediately; changes apply to the next browser action. Turning it off means agents may open ANY site and follow redirects anywhere — the row shows a warning. It's disabled (greyed) while the master Agent Browser feature is off. Per-agent allowlists are set on each agent in the Studio (Browser capability).

### Settings → Agent Browser · Default allowed sites
aliases: global allowlist, default domains, fallback sites, allowed domains box
What: A text box of domains every browsing agent may visit when it has no allowlist of its own.
Why: A safety net so agents without a Blueprint allowlist still stay on approved sites.
Behavior: Admin-only. Accepts one domain per line or comma-separated; subdomains are included automatically. An agent's own allowed-sites list (in its Blueprint) always wins over this default. Leave empty to allow any site for agents without a list. Saves as you type; greyed out and inactive while "Enforce site allowlist" is off or the feature is off.
Example: "github.com, docs.python.org" lets list-less agents browse those two domains and their subdomains only.

### Settings → Agent Browser · Shield against page-injected instructions
aliases: prompt injection, injection shield, untrusted pages, page hijack protection
What: A toggle that wraps page content so an agent treats it as data, never as commands — page text is marked UNTRUSTED.
Why: The single most important defense when agents read the open web; hidden text on a page could otherwise hijack the agent.
Behavior: Default ON — keep it on. Admin-only; saves immediately, applies to the next browser action; disabled while the master feature is off. Turning it off shows a warning that embedded page text could hijack the agent (prompt injection).

### Settings → Agent Browser · Allow agents to fill password & payment fields
aliases: secret fields, passwords, credit card, autofill credentials, sensitive fields
What: A toggle letting agents type into password, card, CVV, OTP, and SSN fields.
Why: Exists only for trusted, supervised automation on sites you control — almost everyone should leave it off.
Behavior: Default OFF, and the row is styled as dangerous for good reason: an agent auto-typing credentials into a web form is high-risk, especially if a page tries to trick it. When off, those fields are human-only — the agent hands the visible browser window to you to fill them yourself. Admin-only; saves immediately; disabled while the feature is off.

### Settings → Agent Browser · Full speed while minimized
aliases: background throttling, minimized speed, keep running, chromium throttle
What: A toggle keeping the agent's browser window running at full speed when minimized.
Why: Chromium throttles minimized windows by default, which can stall pages mid-task.
Behavior: Default ON. With it off, minimized agent-browser windows get throttled and long tasks may stall. Admin-only; saves immediately; applies to the next browser action; disabled while the master feature is off.

### Settings · Admin Analytics
aliases: admin panel, usage stats, user management, ban users, analytics
What: An admin-only sidebar entry opening usage statistics and user management.
Why: Where admins suspend/ban users or grant free access, and review usage.
Behavior: Visible only to admins — the entry simply doesn't exist for other accounts. The page hosts the Admin Panel; its internal controls are documented separately. There's nothing to configure on this entry itself; it's navigation.
