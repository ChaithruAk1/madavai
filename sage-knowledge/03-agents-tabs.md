# Sage knowledge · Agents (tabs, teams, floor)
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Agents · Tab row · Agent Guide
aliases: guide, learn, how agents work, violet book, tour
What: A tab with a violet book glyph that opens the full Agent Guide / Flight School page.
Why: It teaches how agents work before you build — a 3-minute tour plus practice missions.
Behavior: Sits in the top "learning" tab strip, left of Ask Sage. Opens the chapter-rail tour, the BeanBox simulations, and the Do's & don'ts reference. New users land here automatically on first visit; afterwards the roster opens by default.

### Agents · Tab row · Ask Sage
aliases: mentor, chatbot, help, sage tab, ask
What: A tab that opens Sage's full-page chat — your agent buddy who answers any Madav-agent question.
Why: Faster than reading the guide; Sage gives a krisp answer and can whisk you to the right screen.
Behavior: Shares one continuous thread with the floating Sage dock. Replies are short and warm, and may add a "Take me there" button that jumps you straight to Studio, Teams, Recruiter, Floor or Activity.

### Agents · Tab row · Agent
aliases: agents tab, roster, my agents, crew, list
What: The main workforce tab listing every agent you've built.
Why: It's home base — where you create, organize, run, edit, swarm, export and delete agents.
Behavior: Shows the folder grid (or flat list), the New agent tile, and per-agent cards. The folder/all and tile/list toggles plus the New-group and Import buttons appear only on this tab.

### Agents · Tab row · Agents Team
aliases: teams tab, team, multi-agent, squads
What: The tab listing your saved teams of agents.
Why: Teams handle work too big for one agent — an assembly line or a coordinated department.
Behavior: Each team shows stacked member faces and a Brief the team / Edit / Delete row. A New team tile opens the team builder. Teams are made of agents, so build a couple of agents first.

### Agents · Tab row · Recruiter
aliases: recruiter tab, hire, staff a team, assemble
What: A tab where you describe work in one line and get a hire-ready team proposal.
Why: It staffs a whole team for you instead of hand-picking members.
Behavior: Reuses your existing roster first, then the persona crew, inventing a new specialist only when nobody fits. You can refine the proposal, then Hire it.

### Agents · Tab row · Floor
aliases: floor tab, workforce, live status, radar
What: A tab showing your whole workforce alive, grouped by state and refreshing every few seconds.
Why: One screen to see who's working, who just finished, who's scheduled, and who's resting.
Behavior: Living portraits change mood by state; a count strip sits up top. Clicking a tile opens that agent's latest conversation.

### Agents · Tab row · Activity
aliases: activity tab, recent, history, past conversations
What: A tab listing recent agent and team conversations, kept out of your general chat history.
Why: So agent missions are easy to find and reopen later.
Behavior: Each entry shows the title, the agent or team name, and how long ago it ran. Click any to reopen and pick up where the agent left off.

### Agents · Agent card · Portrait
aliases: face, avatar, identity, agent picture
What: The procedural portrait shown on every agent card and row.
Why: Every agent gets a unique, recognizable face in its identity color.
Behavior: Deterministic from the agent's id. On the Floor it animates by mood — running while working, cheering when just finished, sleeping while resting.

### Agents · Agent card · Tool pills
aliases: capability pills, tools, what it can do, badges
What: Small labelled pills under an agent's name showing its enabled capabilities.
Why: A glance tells you what an agent can touch — Files, Terminal, Connectors, Skills, Browser, Desktop.
Behavior: Only enabled capabilities show a pill. Terminal, Browser and Desktop are desktop-only. Change them in the Studio under Blueprint & capabilities.

### Agents · Agent card · Pinned-model pill
aliases: model pill, cpu badge, locked model, pinned model
What: A CPU pill showing a model name when an agent is pinned to a specific model.
Why: Most agents run on whatever your selector is set to; a pin overrides that for this one.
Behavior: Only appears when a model is pinned (set in the Studio). The pin is stripped from .agent exports and is never an API key.

### Agents · Agent card · Track record
aliases: missions, clean percent, stats, n missions x% clean, record
What: A line like "12 missions · 92% clean · last 2h ago" on an agent's card.
Why: It tells you how much an agent has done and how reliably, so you can trust it with bigger jobs.
Behavior: Counts every run — chat, teams, schedules, webhooks and swarms. The full per-run list lives in the Studio Blueprint under Track record. The list layout shows a compact "N · X%".

### Agents · Agent card · Put to work
aliases: run, launch, rocket, start agent
What: The primary rocket button that puts an agent to work in a real chat session.
Why: This is how you actually use an agent on a live task, with its tools active.
Behavior: Opens a session running the agent on your selected (or pinned) model. Unlike the Studio bench, tools really fire here.

### Agents · Agent card · Open in Studio
aliases: edit, pencil, change agent, open studio
What: The pencil button that opens an agent in the Agent Studio for editing.
Why: To refine instructions, capabilities, model, knowledge or identity by talking to the Designer.
Behavior: Loads the agent into the Studio with its blueprint ready to change. Saving snapshots the previous version (last 10 kept).

### Agents · Agent card · Delete
aliases: trash, remove agent, bin
What: The trash button that permanently removes an agent.
Why: To retire an agent you no longer need.
Behavior: Removes it from the roster immediately. Teams that included it simply lose that member. Exception: EdgeTrader pack workers (ET Quant Analyst, ET Bull, etc.) show no trash button while the pack is active — turn off "EdgeTrader analysis pack" in Settings → Extras to manage them.

### Agents · Organization · Edge Trader folder
aliases: edgetrader folder, edge trader group, et agents folder
What: A folder the EdgeTrader pack's six workers are filed into automatically.
Why: Keeps the pack's relay crew grouped and recognizable instead of scattered through the roster.
Behavior: Created automatically while the EdgeTrader pack is active (Settings → Extras) for any pack worker without a folder — all nine (the six relay stations plus the three optional lenses) file here. You can drag a worker to another folder and it stays there; deleting the folder just refiles loose pack workers back on the next visit. Pack workers AND the EdgeTrader team can't be deleted while the pack is active; turn the pack off in Settings → Extras to manage them.

### Agents · Agent card · Export .agent
aliases: download, share agent, .agent file, export
What: The download button that exports an agent as a shareable .agent file.
Why: To hand an agent to a teammate or back it up before a big edit.
Behavior: Writes a portable file with the agent's blueprint and knowledge — but its model pin and learned memory do NOT travel. Don't put secrets in instructions or knowledge, since those are included. Import shared files with the Import button.

### Agents · Organization · Folder view (default)
aliases: folders, folder grid, browse by folder, file agents
What: The default landing for the Agent tab — a grid of folders rather than every agent.
Why: It scales to hundreds of agents; you enter a folder to see its agents.
Behavior: Shows an Ungrouped folder plus each group you've made, each with member faces and a count. Click a folder to enter (with a breadcrumb back to Folders). Search temporarily shows matching agents flat.

### Agents · Organization · Drag-drop filing
aliases: drag agent, move to folder, file agent, sort
What: Dragging an agent onto a folder or group to file it there.
Why: Quick organizing without menus.
Behavior: Pick up any agent card or row and drop it on a folder (or a group header in flat view); the target highlights. Dropping on Ungrouped clears its group. Engines ignore folders entirely — they're purely for your tidiness.

### Agents · Organization · Folders ⟷ All toggle
aliases: nav toggle, folder vs all, browse mode
What: A two-button toggle switching between folder browsing and one flat list of all agents.
Why: Folders for many agents; All for a quick single scroll.
Behavior: Folder (folder icon) is the default; List icon shows every agent at once, grouped by folder. The choice is remembered per user. Appears only on the Agent tab.

### Agents · Organization · Tile ⟷ List toggle
aliases: layout, grid vs list, tiles, view layout
What: A toggle choosing card tiles or compact rows for agents and teams.
Why: Tiles are richer; list is denser for long rosters.
Behavior: Grid icon = tiles, list icon = rows. List is the default. Remembered per user and applies to the Agent and Agents Team tabs (and the Floor's density).

### Agents · Organization · New group
aliases: folder plus, create folder, add group, new folder
What: The folder-plus button that creates a new group (folder) for agents.
Why: To organize your roster into named buckets.
Behavior: Opens an inline name box; Enter saves, Escape cancels. Rename or delete a group from its header — deleting a group moves its agents back to the main list, never deleting them. Appears only on the Agent tab.

### Agents · Organization · Import .agent
aliases: upload, import agent, add shared agent
What: The upload button that imports a .agent file someone shared.
Why: To add an agent built elsewhere into your roster.
Behavior: Lands as a fresh agent (new id, model pin stripped). Appears only on the Agent tab.

### Agents · Agent tab · New agent tile
aliases: create agent, add agent, new, build agent
What: The first tile/row on the Agent tab that opens the Studio with a blank agent.
Why: The fastest way to start building — "describe it, shape it, test it, all in one room."
Behavior: Opens the Agent Studio Designer. If no model is selected yet, it prompts you to pick one first (top right) — agents run on a model. When you have no agents, a "hire from the crew" persona gallery also appears.

### Agents · Teams tab · Team card
aliases: team tile, team row, stacked faces, squad card
What: A card showing a saved team — stacked member faces, its mode, member count and names.
Why: A glance shows who's on the team and how they work.
Behavior: Labels Relay line or Managed plus the roster. Member faces always reflect the live agents, so editing an agent flows into every team it's on.

### Agents · Teams tab · Brief the team
aliases: run team, launch team, rocket, start mission
What: The primary button that puts a whole team to work on one brief.
Why: You brief once and the whole team runs the mission together.
Behavior: Runs in a chat session with Mission Control showing every member live. Disabled if the team has no surviving members. Up to 6 agents run per mission.

### Agents · Team builder · Name & identity
aliases: team name, rename team, team face, identity
What: The name field and face at the top of the team builder.
Why: To give the team a recognizable name and look.
Behavior: Type a name (defaults to "Untitled team" if left blank). Save & close or Brief the team from the top bar. The face is auto-assigned from the name.

### Agents · Team builder · Relay line mode
aliases: relay, assembly line, pipeline, sequential, one after another
What: A mode card where agents work one after another down a line.
Why: Best for chained work — research, then draft, then polish.
Behavior: Each member receives everything the earlier members produced and adds its craft; the last station's output is your deliverable. Order matters, so the line-up shows ↑/↓ arrows to reorder.
Example: Digger → Drafter → Polisher turns facts into a finished blog post.

### Agents · Team builder · Managed mode
aliases: managed, manager, coordinator, parallel, factory floor
What: A mode card where a coordinator splits the mission and runs members in parallel.
Why: Best for work that breaks into independent pieces — a launch kit's ads, FAQ, posts and email at once.
Behavior: The Coordinator gives each agent its own slice, all run at the same time, then it merges the pieces into one deliverable. After the first wave it can review results and dispatch follow-up sub-tasks, even recruiting bench agents beyond the line-up.
Example: Adsmith, Faqster, Socialite, Mailwright all light up together, then merge.

### Agents · Team builder · Line-up & ordering
aliases: members, add member, reorder, arrows, lineup
What: The numbered list of team members with controls to add, reorder and remove.
Why: To assemble exactly who's on the team and (for Relay) in what order.
Behavior: Add agents from your bench below; each appears with a number. In Relay mode ↑/↓ arrows move a member earlier or later; the trash icon removes one. A team needs at least one member to save.

### Agents · Team builder · Mission budget
aliases: budget, token cap, cost guardrail, hard stop
What: An optional field capping tokens per mission, in thousands.
Why: A cost guardrail, especially for Managed teams that can re-plan — re-planning is powerful but not free.
Behavior: Mission Control shows a live meter and the mission hard-stops at the cap. Leave it empty for no cap.

### Agents · Recruiter · Describe the work
aliases: brief, describe mission, recruiter input, assemble
What: The input where you describe the work that needs doing.
Why: One plain sentence is enough for the Recruiter to staff a team.
Behavior: Press Assemble (or Enter) and it returns a proposal. Example brief: "every Monday I need last week's sales summarized and turned into a client-ready report."

### Agents · Recruiter · Proposal & member tags
aliases: proposal, roster crew new-hire, tags, team suggestion
What: The proposed team card — name, mode, members, and a tag on each member.
Why: The tags show where each member comes from so you know what's being reused versus created.
Behavior: "roster" = reused from your agents, "crew" = a ready-made persona, "new hire" = a fresh specialist invented only when nobody fits. The card also notes Relay vs Managed and any suggested budget.

### Agents · Recruiter · Refine
aliases: refine, rework, adjust proposal, tweak
What: Re-typing in the bar to rework an existing proposal instead of starting over.
Why: To nudge the team — change the mode, add a budget, swap a role.
Behavior: Once a proposal exists the button becomes Refine; your new text reworks the same proposal. Dismiss clears it.

### Agents · Recruiter · Hire this team
aliases: hire, create team, accept proposal, confirm
What: The button that creates any missing agents plus the team in one save.
Why: It turns the proposal into real, runnable agents and a team.
Behavior: New members land on the Agent tab, the team on the Agents Team tab, and you're taken there to brief it.

### Agents · Floor · Status strip
aliases: counts, strip, totals, summary
What: A row of live counts at the top of the Floor.
Why: An instant read on the whole workforce.
Behavior: Shows working now, finished recently, on schedules, resting, and missions all-time. Updates every few seconds.

### Agents · Floor · State groups
aliases: working now, finished recently, on a schedule, resting, sections
What: The Floor groups agents into Working now, Finished recently, On a schedule, and Resting — ready for work.
Why: To see everyone organized by what they're doing right now.
Behavior: "Working" means active in the last 3 minutes; "finished" within the last hour; scheduled agents wear a clock badge. Each agent's portrait shows the matching mood — running, cheering, or sleeping.

### Agents · Floor · Collapsible sections
aliases: collapse, expand, hide section, show section
What: Each Floor state group has a header you can collapse or expand.
Why: To tuck away groups you're not watching.
Behavior: Click a section header to toggle; the chevron and a show/hide hint reflect the state, and your choice is remembered.

### Agents · Floor · Tile (open conversation)
aliases: floor tile, click to watch, open session, working now
What: An agent's tile on the Floor, clickable to open its latest conversation.
Why: "Working now" becomes a door — click to watch the live mission, not just a status light.
Behavior: Clicking opens the agent's newest session (the live one while it's working, or the most recent otherwise). A "working now — click to watch" label shows while active.

### Agents · Floor · Put to work (rocket)
aliases: rocket, run from floor, launch, start
What: The small rocket button on each Floor tile.
Why: To put that agent to work without leaving the Floor.
Behavior: Starts a fresh session for the agent; clicking it doesn't trigger the tile's open-conversation action.

### Agents · Activity · Recent conversation
aliases: recent run, reopen, past mission, continue
What: A clickable entry for a past agent or team conversation.
Why: To revisit or continue a mission later.
Behavior: Shows the title, the agent or team name, and how long ago it ran (folder runs are marked). Click to reopen and pick up where the agent left off.

### Agents · Mission Control · Stations
aliases: workstations, members, station tiles, floor view
What: One tile per team member in Mission Control, lighting up as work moves.
Why: To watch every member's status live during a team mission.
Behavior: Each station shows standing by, working (with a rotating verb), done with a clipped output preview, or failed. In Relay they clear in turn; in Managed they glow at once.

### Agents · Mission Control · Coordinator plan & Assembly
aliases: coordinator, plan station, assembly, merge, synthesize
What: Extra stations in Managed missions — a Coordinator that splits the mission and an Assembly that merges results.
Why: They make the split-then-merge of Managed mode visible.
Behavior: The Coordinator shows "splitting the mission…" then its plan; the Assembly shows "synthesizing the deliverable…" then "delivered." These appear only for Managed teams.

### Agents · Mission Control · Status strip
aliases: strip, stations cleared, mission complete, dispatching
What: A live line under the header counting stations cleared.
Why: A quick read on overall mission progress.
Behavior: Reads "Floor is quiet" before briefing, "N agents on the floor · X/Y stations cleared" while running, and "Mission complete" at the end.

### Agents · Mission Control · Elapsed clock
aliases: timer, elapsed, runtime, clock
What: A running mm:ss clock shown while a mission is in progress.
Why: To see how long the mission has been running.
Behavior: Counts up from the start and stops once the mission finishes.

### Agents · Mission Control · Budget meter
aliases: budget bar, token meter, hard stop, cost
What: A live token meter shown when the mission has a budget.
Why: To watch spend against the cap you set in the team builder.
Behavior: Fills as tokens are used, showing "used / max tok," and turns danger-colored at the cap, where the mission hard-stops. Hidden when no budget is set.

### Agents · Solo Ops · Live panel
aliases: agentops, solo mission, tool steps, side panel
What: A live side panel for solo (single-agent) runs, sibling to Mission Control.
Why: To watch a solo agent's tool steps as they happen.
Behavior: Shows the agent's working portrait, an elapsed clock, and each tool step (running, done, or denied). When finished it summarizes "finished · N tool steps · time."

### Agents · Swarm · Swarm button
aliases: swarm, parallel list, layers icon, batch, ⧉
What: The layers button on an agent's card that runs it across a whole list in parallel.
Why: Volume work — research 50 leads or classify 200 tickets — without 50 separate chats.
Behavior: Opens a modal: paste a list (one item per line) and a brief containing {item}, pick 1–6 to run in parallel, then Run swarm. Progress shows per item and you copy one compiled report at the end. Appears only when swarms are available.

### Agents · Guide page · Chapter rail
aliases: chapters, rail, lessons, tour steps
What: The numbered rail of guide chapters on the Tour & practice page.
Why: To step through how agents work, from a single hire to teams and beyond.
Behavior: Click a chapter to bring it on stage with a diagram; Back/Next page through. Read chapters get a check; the matching Flight School mission scrolls into view.

### Agents · Guide page · Flight school sims
aliases: flight school, simulations, beanbox missions, practice
What: Eleven hands-on practice missions on the right of the guide, each with a goal, story and steps.
Why: They teach by doing — you build a real workforce while you learn.
Behavior: Each mission has a "Start"/"Open Teams"/"Open Agents" button that jumps you to the right screen (some pre-fill the Designer). The mission matching the current chapter is highlighted.

### Agents · Guide page · BeanBox story
aliases: beanbox, story, coffee subscription, continuous story
What: The single continuous story tying all eleven Flight School missions together.
Why: One narrative — standing up the AI workforce for BeanBox, a coffee-subscription business — makes each lesson build on the last.
Behavior: Chapters run 1 → 11, reusing the agents and teams you built earlier, ending with the whole operation alive on the Floor.

### Agents · Guide page · Tour & practice / Do's & don'ts / Ask Sage
aliases: subnav, reference, dos and donts, guide tabs
What: The three guide sub-tabs — Tour & practice, Do's & don'ts, and Ask Sage.
Why: Tour teaches, the reference gives quick do/don't guidance and a capability map, and Ask Sage answers anything.
Behavior: The reference lists do's, don'ts, what each engine capability does, and where each works. A "Go to Studio" link leaves the guide for building.
