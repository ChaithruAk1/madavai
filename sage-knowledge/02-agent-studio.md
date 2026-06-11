# Sage knowledge · Agent Studio
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Agent Studio · Name your agent (name input)
aliases: agent name, rename, name field, title, what to call it
What: The top-bar text field where you name the agent, placeholder "Name your agent — or go with '<nickname>'".
Why: A clear name makes the agent easy to find, brief, and put on teams.
Behavior: Leave it blank and the agent keeps a stable human nickname (Aria, Finn, Luna…) derived from its id — same agent, same nickname, every time, never "Untitled". On save or Put to work, a blank name is filled with that nickname. Names cap at 60 characters.
Example: Type "Reviewer" or just let it ride as "Cleo".

### Agent Studio · Change look (identity face button)
aliases: face, avatar, glyph, color, identity, cycle look
What: The little colored glyph tile beside the name (and in the Designer header) — click it to cycle the agent's look.
Why: A visual identity makes each agent instantly recognizable across the Studio, Floor, and chats.
Behavior: Each click advances both the color and the glyph by one step through fixed palettes (8 colors, 12 glyphs). New agents get an auto-identity hashed from their id, so it's stable until you change it. Cosmetic only — it never affects behavior. Both the top-bar tile and the Designer-header tile do the same thing.

### Agent Studio · Designer
aliases: build by chat, left pane, designer chat, talk to designer, drafting table
What: The left-hand chat where you describe the agent in plain words and a model writes the blueprint for you.
Why: You shouldn't have to hand-write system instructions — describe the job and the fields fill themselves.
Behavior: Each message updates name, purpose, instructions, and capability toggles, keeping anything you didn't ask to change. It only flips on tools the agent genuinely needs. If it can't produce a usable config it still shows the reply plus a quiet "no blueprint change" notice — edit the fields directly or rephrase.
Example: "make it review code for security issues and report in a table."

### Agent Studio · Designer meter (4 dots)
aliases: blueprint progress, completeness dots, header meter, 4 dots, readiness
What: Four dots in the Designer header that light up as the blueprint fills: name · instructions · capabilities · model.
Why: A glance tells you how complete the agent is before you put it to work.
Behavior: A dot turns on when that piece exists — any name, any instructions, at least one capability toggled, and a pinned-or-selector model. The same count appears as "X of 4 set" on the Blueprint bar. Hover the meter for the tooltip naming each dot. Only instructions are strictly required to run; the dots are guidance, not a gate.

### Agent Studio · Casting call (personas)
aliases: hire persona, ready-made agents, crew, who are you hiring, templates
What: The empty-state directory of ready-made specialists, grouped by profession (Engineering, Marketing, Research…), shown before you've written instructions.
Why: Start from a complete, battle-tested blueprint instead of a blank page.
Behavior: Clicking a persona chip runs hirePersona — it loads that persona's full name, purpose, detailed instructions, capability toggles, and a fresh identity into the draft, then drops a Designer note. It's a starting point: reshape it in the Designer or Blueprint afterward. The casting call hides once instructions exist.
Example: Click "Reviewer" to load a code-review agent, then tell the Designer "also check for missing tests."

### Agent Studio · Refine chips
aliases: quick refinements, one-tap, sharpen, guardrails, refine row
What: A row of one-tap buttons (Sharpen, Guardrails, Output format, Edge cases, Warmer tone) above the Designer composer.
Why: Common improvements you'd otherwise have to type out, one click away.
Behavior: Each chip sends a crafted instruction through the normal Designer flow, so the blueprint updates just as if you'd typed the request. They appear only once instructions exist, and disable while the Designer is drafting. Hover a chip to read the exact brief it sends.
Example: "Output format" makes the agent always answer in a fixed structure.

### Agent Studio · Designer composer
aliases: designer input, send box, message designer, chat input
What: The text box at the bottom of the Designer pane where you type instructions to the designer.
Why: It's how you talk to the designer to create or refine the agent.
Behavior: Press Enter or the up-arrow to send. Every message goes to the designer model, which returns a short reply plus the full updated config. The send button disables while drafting or when empty. This shapes the blueprint — it does not test the agent (that's the Bench).

### Agent Studio · Blueprint & capabilities
aliases: blueprint bar, capabilities panel, raw config, expand blueprint, advanced
What: The collapsible bar under the Designer that opens the raw editable config — purpose, instructions, capabilities, knowledge, model pin, and more.
Why: Direct control when you want to edit fields by hand instead of via chat.
Behavior: The bar shows "X of 4 set" plus a strip of six capability icons (files, terminal, connectors, skills, browser, desktop) — an icon is highlighted when that tool is on. Click the bar to expand or collapse it. Everything the Designer writes also lives here and stays in sync.

### Agent Studio · Purpose (blueprint field)
aliases: description, one sentence, what it's for, summary
What: A one-line description of what the agent is for, in the Blueprint.
Why: It shows on the agent card, in teams, and the Recruiter, so people know what each agent does at a glance.
Behavior: One sentence, caps at 200 characters. The Designer fills it automatically; edit it freely. Purely descriptive — it doesn't change behavior, though it is included as context on the Bench.

### Agent Studio · Instructions (blueprint textarea)
aliases: system prompt, behavior, how it thinks, rules
What: The textarea holding the agent's full system instructions — its role, method, output format, and what it must never do.
Why: This is the heart of the agent: it defines how it behaves on every task.
Behavior: Required to run (Put to work and the Bench both need it). The Designer writes detailed second-person instructions; edit directly anytime. Distinct from Knowledge: Instructions = how the agent behaves. Knowledge = reference material it should know. Keep secrets out — instructions travel with .agent exports.

### Agent Studio · Capabilities (pills)
aliases: tools, files, terminal, shell, connectors, skills, browser, desktop, permissions
What: Six ON/OFF pills granting the agent capabilities: Files, Terminal (shell), Connectors, Skills, Browser, Desktop.
Why: An agent should hold only the powers its job needs — least privilege.
Behavior: Each pill is a permission switch; cyan/highlighted = granted. Files reads/writes in a working folder; Terminal runs shell commands (desktop only); Connectors are your enabled MCP apps (mail, GitHub, Slack…); Skills loads installed playbooks; Browser drives Madav's own visible window; Desktop operates native Windows apps. The pill only grants permission — the actual setup (connecting an MCP, installing a skill) lives elsewhere. Browser hides if your admin disabled it.

### Agent Studio · Allowed sites (browserAllow)
aliases: site allowlist, domains, browser allow, allowed domains, web allowlist
What: An optional comma-separated list of domains the Browser capability may visit, shown only when Browser is on.
Why: Confine a web agent to trusted sites instead of the whole internet.
Behavior: Empty = any site. Enter domains like "github.com, news.ycombinator.com". Regardless of the list, navigation, clicks, and form-fills ask your permission, and passwords and payment fields are always refused. Pair an allowlist with the "Act freely" autonomy mode if you want unattended browsing.

### Agent Studio · Allowed apps (desktopAllow)
aliases: app allowlist, desktop allow, allowed apps, windows apps, process names
What: An optional comma-separated list of window-title or process names the Desktop capability may touch, shown only when Desktop is on.
Why: Limit native-app control to specific applications.
Behavior: Empty = any app. Enter names like "notepad, excel, spotify". Focusing, clicks, and typing ask your permission; password/credential fields are always refused. Windows only.

### Agent Studio · Knowledge
aliases: reference files, attach docs, RAG, knowledge images, screenshots, library
What: Reference material the agent always knows — up to 24 files, mixing text documents and images.
Why: Give the agent facts, examples, or visuals to work from without pasting them every time.
Behavior: Text files (md, txt, csv, json, code… ≤1MB each) are retrieved per task — only relevant passages are injected, so large libraries are fine. Up to 6 images (png/jpg/webp/gif ≤1.5MB each) show as thumbnails and are shown to vision-capable models at the start of each conversation. Crucial distinction: Instructions = how the agent behaves. Knowledge = reference material it should know. For PDFs/Word, use a Project instead. Don't store secrets — knowledge travels with .agent exports.

### Agent Studio · Memory
aliases: learns across missions, remembers, forget, learnings, per-agent memory
What: The Blueprint section showing what the agent has learned, with a per-agent on/off toggle and view/edit/clear controls.
Why: Correct an agent once in plain words and it stops re-making the mistake.
Behavior: After each mission the agent extracts durable learnings (your preferences, corrections, stable facts) and applies them next time. "Learn across missions" toggles it off per agent (old notes are kept but unused, nothing new is learned). Edit notes one-per-line and Save, or "Forget everything" to clear. Memory is private — it never travels with .agent exports. Swarms read memory only.

### Agent Studio · Track record (run history)
aliases: run history, missions, history, past runs, clean percentage
What: A Blueprint section listing the agent's recorded missions with status, source, tokens, and a summary.
Why: Know which agents you can trust before handing them bigger jobs, and audit what a triggered agent did overnight.
Behavior: Every chat run, team mission, scheduled trigger, webhook, and swarm lands here. Shows the latest 10 with a ✓/✗, relative time, source label, approximate tokens, and summary. The agent card carries the headline "X missions · Y% clean". Desktop-only — hides if the bridge can't provide history.

### Agent Studio · Versions
aliases: version history, restore, rollback, snapshots, undo blueprint
What: A Blueprint section keeping the last 10 saved blueprints, each restorable.
Why: Every experiment is reversible — roll back a bad edit instantly.
Behavior: Each Studio save snapshots the previous blueprint before overwriting (last 10 kept). Restore loads that version's name, purpose, instructions, capabilities, knowledge, and identity into the draft — you still need to Save to keep it. Memory and run history are not versioned. Desktop-only.

### Agent Studio · Craft (quality vs cost)
aliases: thorough, reviewer, text-protocol tools, economy model, rigor
What: A Blueprint section with four switches that trade extra cost for extra rigor.
Why: Tune the quality/cost balance per agent without touching the always-on reliability layer.
Behavior: The base reliability (plan tracking, self-repair, compaction, read-before-edit) is always on and free. Thorough mode adds one self-review pass before every final answer (+1 call). Reviewer has a second model check every file change against the brief (+1 small call per edit). Text-protocol tools enable tool use for models without native tool calling (most local models). Economy model (profileId::model-id) runs scouts and the reviewer cheaply; empty = the agent's own model does everything.

### Agent Studio · Pinned model (model pin)
aliases: pin model, unpin, model override, embedded picker, which model
What: A model picker in the Blueprint that locks this agent to one model regardless of the live selector.
Why: Keep a sensitive or capability-specific agent on the right model even when you switch the global selector.
Behavior: Pick a model to pin it; the agent always runs on it. Click Unpin to clear the pin — then it uses the live selector ("Unpinned — uses the live selector"). There's also a model picker in the top bar that drives the live selector globally. Model pins are private and never travel with .agent exports.

### Agent Studio · Autonomy
aliases: permission mode, ask first, act freely, skip and decide, risky actions
What: A Blueprint picker setting how the agent handles risky actions (file edits, terminal commands, browser/desktop): Ask first · Act freely · Skip & decide.
Why: Match the agent's freedom to how much you trust it.
Behavior: Ask first (default) pauses for your permission before each risky action. Act freely runs everything automatically, no prompts — only for agents you fully trust; pair with an allowlist and a trusted folder. Skip & decide auto-declines risky actions (no prompt) and the agent adapts or reports what it couldn't do; reads are always allowed. This governs permission prompts — separate from mid-mission ask_user questions, where the agent pauses to ask YOU a decision (budget? audience?) and your answer resumes the run.

### Agent Studio · Save
aliases: save agent, save draft, keep changes, persist
What: The top-bar button that saves the agent's blueprint without opening a session.
Why: Keep your work and bank a version snapshot before bigger edits.
Behavior: Saves the draft, snapshots the previous blueprint (Versions, last 10), fills a blank name with the nickname, and flashes "Saved". It does not start a run. Save errors show inline. Use it before experimenting so Versions can roll you back.

### Agent Studio · Put to work
aliases: launch, run agent, start session, deploy, go live
What: The primary top-bar button that saves the agent and opens a real working session.
Why: Move from designing to actually using the agent on a real task.
Behavior: Saves first, then launches a full session where the agent's real capabilities are active — files, terminal, connectors, browser all switch on (unlike the Bench). If Files or Terminal are on you'll pick a working folder when the session starts. Disabled until instructions exist or while saving.

### Agent Studio · Bench
aliases: test bench, live test, try it, right pane, sandbox
What: The right-hand chat for testing the agent's instructions live, right now.
Why: Validate behavior and tone before putting the agent to real work.
Behavior: The Bench runs instructions ONLY — files, terminal, connectors, browser, and skills do NOT run here; they switch on only in a real session (Put to work). It uses the agent's purpose and instructions as the system prompt. Needs instructions to start. Great for checking wording and output format; not for testing tool actions.
Example: Paste a sample email and confirm it replies in your required format.

### Agent Studio · Suggest 3 test prompts
aliases: test ideas, suggest tests, draft tests, example prompts, bench ideas
What: A Bench button that drafts three realistic test prompts tailored to this agent.
Why: Skip thinking up test cases — get a typical task, an edge case, and a guardrail probe.
Behavior: One model call returns three short prompts (one typical with inline sample input, one harder/edge case, one probing limits). Click any to run it on the Bench; the refresh control drafts three new ones. Available once instructions exist and the Bench is empty.

### Agent Studio · Re-run / Reset bench
aliases: rerun test, replay, reset, clear bench, compare
What: Two small Bench-header controls: Re-run the last test (play icon) and Reset the bench (circular arrow).
Why: Compare the agent's answer before and after a blueprint change, or start the test fresh.
Behavior: Re-run resends your most recent Bench question — tweak the instructions, re-run, and see the difference. Reset clears the Bench conversation entirely. Re-run appears only after you've asked something; Reset appears whenever there are messages.

### Agent Studio · Export / Import .agent file
aliases: share agent, export, import, .agent file, portable, backup
What: Buttons to export an agent to a portable .agent file (in the Blueprint) and import one (from the agent list).
Why: Share an agent with someone or back it up before a big edit.
Behavior: Export carries instructions, capabilities, and knowledge — but NOT memory or model pins (those stay private). Import brings the agent in with a fresh id and the model pin stripped, so it runs on your own model. Don't put secrets in instructions or knowledge — they travel with the file.
