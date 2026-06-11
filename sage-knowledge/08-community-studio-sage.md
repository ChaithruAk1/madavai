# Sage knowledge · Community, Studio, Onboarding & Sage himself
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Community · Category chips (All · General · Ideas · Help · Showcase)
aliases: forum categories, filter threads, community tabs
What: A chip row above the thread list that filters threads by category.
Why: Lets you browse just questions (Help), ideas, show-and-tell (Showcase), or everything at once.
Behavior: "All" is selected by default; clicking any chip reloads the list filtered to that category. The active chip is highlighted. The same four categories are what you pick when posting a new thread.

### Community · New thread
aliases: post a thread, start a discussion, + New thread button
What: The "+ New thread" button at the right of the category bar; it toggles the new-thread form open and closed.
Why: This is how you start any conversation in the Community.
Behavior: The form has three fields — "Thread title", a category dropdown (General/Ideas/Help/Showcase, defaults to General), and a "Write your post…" textarea. "Cancel" closes it; "Create thread" posts (it shows "Posting…" while busy), then the form clears and the list refreshes.

### Community · Thread title field
aliases: title rules, title too short, 140 characters
What: The "Thread title" input in the new-thread form.
Why: A clear title is what others see in the list.
Behavior: Must be at least 4 characters ("Title must be at least 4 characters.") and under 140 ("Title must be under 140 characters."); the input also hard-caps typing at 140.

### Community · Write your post… body
aliases: thread body, post length, 8000 characters
What: The post textarea in the new-thread form.
Why: Holds your actual question or write-up.
Behavior: Needs at least 4 characters ("Please write a little more.") and at most 8000 ("Post is too long (8000 char max)."). Bodies are plain text only — no markdown or HTML rendering — shown with line breaks preserved.

### Community · Thread row
aliases: thread list item, replies count, last activity, pinned badge
What: Each row in the Community list — title, category tag, author, relative time, and a reply counter on the right.
Why: One glance tells you what's hot and how active it is.
Behavior: A pin badge appears before the title on pinned threads (admins pin important ones to keep them visible), and a small lock icon marks locked threads. The time shown is last activity (falls back to creation time), formatted like "5m ago", "3h ago", "2d ago", "1mo ago". The right-hand number with the speech-bubble icon is the reply count. Click anywhere on the row to open the thread.

### Community · Thread view (posts)
aliases: open thread, read replies, back button
What: The single-thread page: title (with pin badge if pinned), category tag, author and age, then every reply with its author and relative time.
Why: Where the conversation actually happens.
Behavior: "← Back to community" (top left) returns to the list. Replies render as plain text with line breaks kept. If there are no replies yet you'll see "No replies yet."; a missing thread shows "This thread couldn't be found."

### Community · Reply composer
aliases: write a reply, reply button, answer a thread
What: The "Write a reply…" textarea and "Reply" button at the bottom of an open thread.
Why: How you join the conversation.
Behavior: Reply is disabled until you type something; it shows "Posting…" while sending, then clears and the thread refreshes. Replies max out at 8000 characters ("Reply is too long (8000 char max)."). The composer disappears entirely on locked threads.

### Community · Locked thread notice
aliases: thread is locked, can't reply, lock icon
What: A notice that replaces the reply composer: "This thread is locked — no new replies."
Why: Admins lock threads that are resolved or off the rails; the content stays readable.
Behavior: You can still read everything, but no one can add replies until an admin presses Unlock. Locked threads also show a small lock icon in the list.

### Community · Pin / Lock / Delete (admin)
aliases: moderate thread, pin thread, lock thread, delete thread, mod buttons
What: Admin-only moderation buttons under a thread's header: "Pin"/"Unpin", "Lock"/"Unlock", and "Delete".
Why: Keeps the forum tidy — pinned threads stay prominent, locked ones stop new replies, spam gets removed.
Behavior: Only admins see these. Pin and Lock toggle instantly and the thread reloads. Delete asks "Delete this thread permanently?" first, and on confirm removes the thread and returns you to the list.

### Community · Offline state
aliases: community not loading, server unreachable
What: The message "The community server isn't reachable. Check your connection and try again."
Why: The Community lives on the account server; without a connection there's nothing to show.
Behavior: Appears in place of the list or thread when the server can't be reached. Posting attempts fail with the same wording. Fix your connection and revisit the screen — it reloads automatically when you change category or reopen a thread.

### Product requests · Votes banner
aliases: 10000 votes, minimum votes, feature consideration rule
What: The banner at the top of Product requests. Exact text: "Minimum 10,000+ votes are required for a feature to be considered — final decision rests with the admin."
Why: Sets expectations — voting signals demand, but it isn't a guarantee.
Behavior: Always visible above the sort/filter bar. Even past 10,000 votes, the admin makes the final call and reflects it through the status badge and an optional admin note.

### Product requests · Top voted / Newest
aliases: sort requests, order by votes, latest requests
What: Two sort chips on the left of the bar.
Why: "Top voted" shows what the community wants most; "Newest" shows fresh ideas.
Behavior: "Top voted" (the default) sorts by vote count descending; "Newest" sorts by creation date, latest first. Sorting combines with whichever status filter chip is active.

### Product requests · Status filter chips
aliases: filter by status, All Requested Approved Building Deployed Rejected
What: Chips — All, Requested, Approved, Building, Deployed, Rejected — that filter the board to one status.
Why: Quickly see what's in flight (Building) or already shipped (Deployed).
Behavior: "All" is default; one chip is active at a time and combines with the Top voted/Newest sort. Note the chip order differs slightly from the badge lifecycle order — Rejected sits last.

### Product requests · Status badge (the 5 statuses)
aliases: request status meanings, status colors, requested approved rejected building deployed
What: The colored badge on each request card showing its lifecycle stage.
Why: One word tells you where the idea stands.
Behavior: requested = newly submitted, awaiting review (neutral gray text). approved = admin accepted it for the roadmap (green, #34d399). rejected = won't be built (red/danger). building = actively in development (amber, #f0b429). deployed = shipped — it's in the app (accent color). Admins move requests through these via the "Set status:" dropdown, often with a note.

### Product requests · + New request
aliases: suggest a feature, submit request, feature request form
What: The "+ New request" button (right of the bar) toggling a two-field form: "Short, clear title" and "What's the idea, and why does it matter?".
Why: How any signed-in user proposes a feature.
Behavior: Title must be 4–120 characters; detail must be 10–2000 ("Please add a little more detail (10+ characters)." / "Detail must be under 2000 characters."). "Submit request" shows "Submitting…" while sending, then clears and the board refreshes; "Cancel" closes the form.

### Product requests · ▲ vote button
aliases: upvote, vote on request, can't vote on trial, remove vote
What: The up-chevron button with a count on each card's left edge.
Why: Votes are how the community ranks ideas toward that 10,000+ bar.
Behavior: Click to upvote; click again to remove your vote ("Remove your vote" tooltip when voted). The count updates optimistically and rolls back if the server refuses. Voting is paid-only: on a trial the button is disabled with tooltip "Voting unlocks once your trial converts to a subscription.", and a server 403 shows "Voting is available once your trial converts to a subscription."

### Product requests · Set status: (admin)
aliases: change request status, admin dropdown, admin note
What: Admin-only "Set status:" dropdown on each card with requested / approved / rejected / building / deployed.
Why: This is how the roadmap decision gets communicated back to voters.
Behavior: Only admins see it. Picking a status prompts: Optional note for "<status>" (shown to users) — leave it, edit it, or press Cancel to change status without touching the note. The card updates optimistically; the note appears to everyone as "Admin: <note>".

### Product requests · Author & time
aliases: who requested, when posted, relative time
What: The meta line under each request: author name and a relative timestamp.
Why: Context for how fresh and whose idea it is.
Behavior: Shows the author's name (or "Someone") plus times like "just now", "12m ago", "3h ago", "5d ago", "2mo ago", "1y ago" (or "recently" if unknown). The same style appears on Community threads and posts.

### Product requests · Detail expand
aliases: read full request, clamped text, expand description
What: The request description, clamped to a few lines by default.
Why: Keeps the board scannable while letting you read everything.
Behavior: Click the description text itself to expand it fully; click again to collapse. Each card remembers its own expanded state while you stay on the screen.

### Product requests · Offline state
aliases: requests not loading, board unreachable
What: "The community server isn't reachable. Check your connection and try again."
Why: The board lives on the account server.
Behavior: Replaces the list when the server can't be reached; submitting also fails with the same message. An empty (but online) board instead says "No requests here yet — be the first to suggest a feature."

### Studio · Prompt console
aliases: build console, describe an idea, what should we build today
What: The big textarea under "What should we build today?" with a sparkle icon and a "Create" button.
Why: The prompt is the hero — you lead with the idea; formats are optional lenses, not gates.
Behavior: Type your idea and press Create (or Ctrl/Cmd+Enter — the button tooltip reads "Create (⌘/Ctrl+Enter)"). Create stays disabled until you've typed something or picked a lens with a type. BrainEdge then forges the idea into a live, runnable preview you can refine.

### Studio · Rotating placeholder
aliases: example placeholder, cycling hint text
What: The console's placeholder, which cycles through real example ideas every ~3 seconds (e.g. "e.g. a tip & bill-split calculator with a clean dark UI").
Why: Instant inspiration when the box is empty.
Behavior: It cycles only while the box is empty — start typing and it pauses. The same examples appear as clickable chips in the "Need a spark? Try one" reel below.

### Studio · Shape it as (format lenses)
aliases: format pills, lens picker, app tool game visual document diagram quiz
What: Seven optional pills under "Shape it as (optional)": App / site, Tool, Game, Visual, Document, Diagram, Quiz.
Why: A lens tunes the output format (e.g. Diagram → Mermaid, Document → Markdown, Game → playable single-file HTML) without forcing you through a category picker.
Behavior: Clicking a lens selects it, pre-picks its first Type, and reveals Type chips (e.g. Landing page, Calculator, Flowchart) plus Style chips (Minimalist, Modern, Bold & colorful, Playful, Professional, Dark) for visual lenses — Document and Diagram skip Style. Click the same lens again to turn it off and go freeform.

### Studio · Need a spark? Try one
aliases: example reel, idea chips, try an example
What: Six clickable example ideas below the lenses, like "a one-button endless runner game".
Why: One tap fills the whole console for you.
Behavior: Clicking an example loads its text into the prompt, selects the matching lens and type, sets a style where relevant, and focuses the box — you can edit before pressing Create.

### Studio · Create
aliases: start building, what happens when I hit create, studio start
What: The "Create" button that launches the build.
Why: This is the moment your idea becomes a project.
Behavior: Studio composes a full prompt from your description plus any lens, type, and style (instructing the model to build a polished live preview without asking clarifying questions), then opens a FRESH Let's Chat session — it never reuses your last chat — and sends the prompt immediately. Your previous chat isn't lost; this just starts clean for the new idea.

### Onboarding · Provider choices
aliases: first run setup, pick a provider, welcome wizard
What: The first-run "Welcome to BrainEdge" card — "Let's get you talking to a model" — with four provider buttons: OpenRouter (marked "recommended" — "One key, 400+ models — has FREE models"), Google Gemini ("Free tier available"), NVIDIA NIM ("Free credits for developers"), and Local model ("LM Studio / Ollama on this computer — no key, fully private").
Why: The #1 support question is "why doesn't it answer?" — no API key; this fixes it in about 60 seconds.
Behavior: Pick one to start; you can add more providers later in Settings. Your key stays on this device.

### Onboarding · API key field
aliases: paste key, where to get a key, API key input
What: A password-style input shown for key-based providers, with a pointer like "Get a free key at openrouter.ai/keys, then paste it:" (Gemini: aistudio.google.com/apikey; NIM: build.nvidia.com).
Why: The key is what lets BrainEdge talk to the provider.
Behavior: Paste the key and press Enter or Connect. Choosing "Local model" skips this entirely — instead you're told to make sure LM Studio (or Ollama) is running with a model loaded.

### Onboarding · Connect
aliases: verify key, connect button, checking models
What: The "Connect" button (disabled until a key is entered, for key providers).
Why: It verifies your setup live before you ever hit a chat error.
Behavior: It saves the profile, then lists models from the provider — showing "Checking…" meanwhile. On success: "Connected — N models found. Starting on <model>." — it auto-picks a model with "free" in its name when available, otherwise the first one. On failure you'll see "Connected, but no models came back — double-check the key." or, for local, that nothing answered at the address.

### Onboarding · Start chatting / Skip for now
aliases: finish onboarding, skip setup, close wizard
What: The wizard's exit buttons.
Why: Onboarding is fully skippable — nothing is forced.
Behavior: After a successful Connect, "Start chatting →" closes the wizard and you're live. "Skip for now" (always available) closes it without configuring anything — you can set up a provider later in Settings; the wizard won't reappear on next launch.

### User Guide · BrainEdge User Guide
aliases: handbook, help docs, manual, open the guide, get help
What: A full-page, searchable 19-chapter handbook covering every BrainEdge feature — from Welcome and Providers through Chat, Collaborate, Build, Projects, Artifacts, Agents, Teams, Swarms, Scheduler, Browser, Voice, Connectors, Mobile, Consumption, Models, Account, and Troubleshooting.
Why: The complete reference, illustrated with built-in vector screen mockups (flows, step lists, tables, copyable "Try it" prompts) rather than screenshots.
Behavior: Open it from the sidebar account menu → "User Guide". A search box filters the chapter list, numbered in the left table of contents, and inline "→" buttons jump you straight to the real screen being described.

### Sage · Floating face
aliases: sage bubble, move sage, helper avatar, drag sage
What: Sage's round face floating in a corner of every screen — tooltip "Ask Sage — drag to move me".
Why: Help is always one tap away without occupying real estate.
Behavior: Tap to open the chat panel; press and drag to move him anywhere — the spot is remembered, clamped on-screen even if the window shrinks. He briefly peeks a "I'm Sage, need help?" nudge on first launch and occasionally after long idle stretches.

### Sage · Tuck away (×) and edge tab
aliases: hide sage, bring sage back, remove the bubble
What: A tiny × beside the floating face ("Tuck Sage away") that hides him, and a small edge tab showing his face that brings him back.
Why: For when you want a totally clean screen — without losing him forever.
Behavior: Tucking away persists across restarts. The tab ("Show Sage") stays at his spot; click it to restore the floating face. Inside the open panel, the "−" button ("Tuck away to the corner") does the same hide.

### Sage · Look gallery (smiley button)
aliases: change sage's face, choose avatar, Sara, pick a look
What: The smiley icon in the panel header ("Change Sage's look") opening a gallery of 14 portraits — eight Sage looks (classic, European, Indian, Nordic, African, silver…) and six female looks.
Why: Pick a buddy who feels like yours.
Behavior: The gallery's own label says it: "Pick a look — female looks answer as Sara". Choosing any female portrait renames the helper to Sara everywhere — greeting, tooltips, replies; male/neutral looks stay Sage. Your pick is saved permanently.

### Sage · New conversation (+)
aliases: clear sage chat, reset thread, start over with sage
What: The "+" button in the panel header, shown once the thread has messages.
Why: A clean slate when you switch topics.
Behavior: Clears the chat thread (which otherwise persists across restarts and is shared with the "Ask Sage" tab in Agents). It doesn't erase what Sage has quietly learned about how you work — only the visible conversation.

### Sage · Minimize (×)
aliases: close sage panel, collapse sage
What: The "×" button in the panel header, titled "Minimize".
Why: Done chatting? Shrink him back to the floating face.
Behavior: Collapses the panel to the corner face; your conversation, walkthrough, size, and position are all kept exactly as they were. Note the header's "−" is different — it tucks Sage away entirely.

### Sage · Resize grip
aliases: make sage bigger, resize panel, drag corner
What: A drag grip on the panel's free corner, titled "Drag to resize".
Why: Walkthroughs and long answers read better in a bigger window.
Behavior: Drag to resize between 320×380 and up to 760×900 (capped to your window); the panel grows away from its anchored corner. The size persists across sessions. The header itself ("Drag to move") relocates the whole panel.

### Sage · Mic (Talk to Sage)
aliases: voice input, speak to sage, microphone, dictate
What: The mic button beside Sage's input box ("Talk to Sage").
Why: Sometimes talking beats typing.
Behavior: Tap, speak, and your words are TYPED into the input box — you review them, then press Enter or the send arrow; nothing is sent automatically. On Windows desktop it uses the native Windows recognizer (no key, no network) and stops by itself on silence — the tooltip says "Listening — stops automatically". On the web build it uses the browser engine (Chromium browsers like Chrome or Edge); click again to stop. Hidden if voice is disabled in Extras.

### Sage · Walkthrough guide bar
aliases: step by step guide, Done — next, I'm stuck, guided steps
What: A live guide bar pinned in Sage's panel whenever he answers a how-to with numbered steps: "Step N of M", the topic, and the current step's text.
Why: It follows you across screens until the whole procedure is done — you're never left holding step one.
Behavior: Press "Done — next ▸" after completing each step ("Finish 🎉" on the last); "I'm stuck" sends Sage your exact step and current screen for targeted help; the small × ends the guide. If you wander screens with the panel closed, the floating face surfaces "Step N: …" so you stay oriented. Walkthroughs survive restarts.
Example: Ask "walk me through creating an agent" — the numbered reply becomes the guide bar.

### Sage · Take me there
aliases: navigation button, goto, open that screen
What: A "→ Take me to <Screen>" button under a Sage reply when a screen is relevant.
Why: No hunting through the sidebar — one tap lands you there.
Behavior: Sage can suggest a destination (button appears) or, when you explicitly ask "open settings" / "take me to models", navigate immediately on his own. He covers Let's Chat, Let's Collaborate, Let's Build, Studio, Projects, Agents, Models, Connectors, Scheduler, Consumption, Skills, Terminal, Settings, and the User Guide.

### Sage · Proactive tips
aliases: sage speech bubble, popup hint, dismiss tip
What: A small dismissible bubble by the floating face offering screen-specific help — e.g. on Agents: "Building agents? I can suggest a first hire or explain teams — just ask."
Why: Gentle, contextual nudges when you might be exploring.
Behavior: Appears only after ~16 seconds on Agents, Connectors, Models, Scheduler, or Collaborate screens, and only while the panel is closed. Click the bubble to open Sage with that question asked; click its × to dismiss — each tip stays dismissed for the session.

### Sage · What Sage can and cannot do
aliases: sage scope, can sage search the web, sage limitations, general questions
What: Sage's domain is BrainEdge only — its screens, features, agents, and your way of using them.
Why: He's a guide, not a general assistant — that keeps his answers exact.
Behavior: He answers from the app's built-in guides plus what he's learned about you; he has NO web access and never cites outside facts — if the guides don't cover it, he says so plainly. General questions get warmly redirected: world facts and chat to Let's Chat, coding to Let's Build, repeatable jobs to Agents. He thinks with whatever model your selector points at, so a broken key affects him too.
