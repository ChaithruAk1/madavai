# Sage knowledge · Models
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Model picker · Model button
aliases: model selector, top bar model, current model, change model, switch model
What: The button showing the provider and name of the model currently in use; clicking opens the model dropdown.
Why: Everything you run (chat, agents) uses whatever model this shows.
Behavior: Opens a searchable, filterable menu of every model loaded on your configured providers. Picking a row applies it immediately and closes the menu. If your saved value no longer matches a loaded model, the button shows the raw id (or "select model").

### Model picker · Search box
aliases: search models, find model, filter models, model search
What: A search field at the top of the model dropdown, placeholder "Search N models…" where N is the total loaded.
Why: With hundreds of models loaded, typing is faster than scrolling.
Behavior: Matches your text against both the model name and its id, case-insensitively, and narrows the list as you type. It combines with every other filter (cost, capability, maker). Search covers all models even when the list display is capped at 250 rows.
Example: Typing "qwen" shows every Qwen model across all providers.

### Model picker · Refresh button
aliases: reload models, refresh list, re-fetch models
What: A circular-arrow button beside the search box ("Reload models from providers").
Why: Pulls a fresh model list when a provider added or removed models.
Behavior: Only appears where a refresh handler is wired in (e.g. the top-bar picker). The icon spins while reloading; the list updates in place when done.

### Model picker · Cost chips (All / Free / Paid)
aliases: free models, paid models, cost filter, price filter
What: Three mutually exclusive chips — All, Free, Paid — at the top of the dropdown.
Why: Quickly limit the list to models that won't cost anything (or the opposite).
Behavior: Exactly one is active at a time. "Free" keeps local models and cloud models whose name carries a ":free" suffix; "Paid" keeps everything else. This is a name/provider heuristic, not live billing data — a free-tier model without the ":free" marker counts as paid here.

### Model picker · Capability chips (Coding · Reasoning · Vision · Fast · Agentic)
aliases: capability filter, coding filter, reasoning filter, vision filter, fast filter, agentic filter
What: Five toggle chips that filter models by detected capability.
Why: Find a model suited to a job — e.g. one that can both code and call tools.
Behavior: Multi-select and AND-combined: with Coding and Agentic both on, only models matching both remain. Each capability is detected independently, mostly from the model name plus OpenRouter catalog data (Reasoning, Vision) — so detection is a best guess for models without catalog metadata. Agentic uses real tool-calling data from the catalog or the local-family registry, falling back to "agent" in the name.

### Model picker · Maker dropdown
aliases: maker filter, by vendor, by company, filter by maker, nvidia models, meta models
What: A "Maker" select listing every model maker found in the loaded list (e.g. nvidia, meta-llama, qwen), each with its model count.
Why: On router providers like OpenRouter one account exposes dozens of makers — this isolates one.
Behavior: Only appears when more than one maker is present. The maker is read from the id prefix before "/" (or the provider name otherwise), and the list is sorted by how many models each maker has. "All makers · N" resets it.

### Model picker · Agent-ready only toggle
aliases: agent ready, tool capable only, agentic only toggle, agent studio model filter
What: An opt-in chip, "Agent-ready only", shown only in agent-related pickers (Agent Studio).
Why: Agents need function calling; this hides models not tagged tool-capable.
Behavior: Off by default — every model stays selectable, because local models often work as agents even without the tool-capable tag. Switching it on keeps only models with confirmed tool-calling capability (OpenRouter catalog, local family registry, or "agent" in the name). The tooltip states this explicitly.

### Model picker · Shown counter
aliases: x of y models, result count, how many models
What: A small "shown of total" counter (e.g. "37 of 412") at the right of the filter row.
Why: Confirms how much your active filters narrowed the list.
Behavior: Updates live as you type or toggle chips. When nothing matches, the list area instead says "No models match these filters. Clear a filter, or open Settings to add a provider."

### Model picker · Provider group headers
aliases: provider sections, group header, provider logo, models grouped by provider
What: Section headers inside the dropdown, one per provider, showing the provider's logo and per-group model count (e.g. "OpenRouter · 213").
Why: Makes it obvious which configured provider each model will run through.
Behavior: Logos are the provider site's favicon, fetched live; if the maker is unknown or the image fails, a colored one-letter monogram is shown instead. Groups with no matching models after filtering disappear entirely.

### Model picker · Row pills (capability + Free/Local/Cloud)
aliases: model tags, model badges, local pill, cloud pill, free pill, coding pill
What: Small colored pills on each model row: up to three capability tags (coding, reasoning, vision, agentic — "fast" only when nothing else applies) plus one host pill: Local, Free, or Cloud.
Why: Scan capabilities and cost/host at a glance without opening details.
Behavior: Local (green) means it runs on your machine via a local provider; Free (green) is a cloud model detected as free; Cloud (accent) is everything else. Capability tags use the same best-guess detection as the filter chips, so absence of a tag doesn't prove absence of the skill.

### Model picker · Selected-row highlight
aliases: current model checkmark, active model row, which model is selected
What: The currently selected model's row is highlighted and carries a check mark.
Why: Confirms what you're on while browsing alternatives.
Behavior: Exactly one row matches the active value; clicking any other row switches to it immediately and closes the menu.

### Model picker · 250-row display cap
aliases: showing first 250, list truncated, too many models, row limit
What: The dropdown renders at most 250 model rows; a footer note then reads "Showing the first 250 of N — type in the search box to narrow down."
Why: Keeps the menu instant even with 500+ models loaded.
Behavior: Only the display is capped — search and every filter still evaluate the full list, so narrowing always surfaces models beyond the first 250.

### Model picker · Local-model capability fallback registry
aliases: local model tags, why does my ollama model show agentic, localModels registry, family registry
What: Not a visible control — the curated table (src/data/localModels.js) that supplies capability tags for local models.
Why: Local providers (Ollama, LM Studio, llama.cpp) publish no capability metadata, so without it local models would look weaker than they are.
Behavior: Family-level and conservative: a capability is claimed only when the whole family reliably has it (e.g. qwen2.5-coder → coding+tools; llama-3 → tools only at 8B+). It only ever adds capabilities, never removes them. Unlisted local models simply show no tags.

### Models → Overview · Insight band stat tiles
aliases: stat tiles, dashboard tiles, models loaded count, free count, agent-ready count, open-weight count, speed-tested count
What: Five tiles above the table — "Models loaded", "Free to use", "Agent-ready", "Open-weight", "Speed-tested by you" — each showing a live count.
Why: Answers "what do I have?" before you read a single row.
Behavior: Every tile is also a one-click control: Free/Agent-ready/Open-weight toggle the matching filter; "Models loaded" clears all filters (it highlights when none are active); "Speed-tested by you" doesn't filter — it sorts the table by your measured speed, descending.

### Models → Overview · Filter chip bar
aliases: overview filters, filter chips, local cloud free chips, all chip
What: A row of combinable chips — All, Local, Cloud, Free, Agentic, Coding, Image, Reasoning, Fast, General, Open-weight — next to a search box.
Why: Slice the model table any way you need.
Behavior: Chips are multi-select and AND-combined (Local + Coding + Free shows only models matching all three). "All" is a master reset that highlights only when no filter is active. The search box matches name, maker, "best for" text, and run id. The header counts update: "X of Y shown".

### Models → Overview · Sortable column headers
aliases: sort table, sort by column, column sorting, sort models
What: Every table column header (Model, Best for, Context, Cost · $/1M, SWE-bench, HumanEval, Speed, Coding, Thinking, Image, Agentic, Host, Params, Download) sorts on click.
Why: Rank models by whatever matters to you right now.
Behavior: Clicking a header sorts ascending; clicking again flips direction (an arrow shows which). Default sort is Context, descending. Many headers carry hover hints explaining the metric. Missing values ("—") are ranked so they sort to the end rather than pretending to be zero.

### Models → Overview · SWE-bench and HumanEval columns
aliases: benchmarks, swe bench, humaneval, coding benchmark, benchmark scores
What: Two benchmark columns with percentage scores and small meter bars.
Why: A rough coding-strength comparison across well-known models.
Behavior: Honest caveat, stated on screen: these are approximate, curated figures for well-known models only — anything not in the curated set shows "—". A dash means no published data; numbers are never invented. Column hints repeat this ("SWE-bench Verified — approximate, curated for well-known models").

### Models → Overview · Speed column
aliases: tokens per second, t/s column, measured speed, speed tested
What: A column showing measured tokens/sec for models you've run through the Speed Check, with a meter bar scaled to your fastest.
Why: Real throughput from your machine and your keys — not vendor marketing.
Behavior: Pulled from your last Speed Check run; untested models show "—" with the hover hint "run a Speed Check to measure". Sorting by it (or clicking the "Speed-tested by you" tile) puts your fastest measured models first.

### Models → Overview · Thinking column
aliases: reasoning column, thinking mode, always-on toggle reasoning
What: A column labelling each model's reasoning mode: "Always-on", "Toggle", "No", or "—".
Why: Tells you whether a model reasons step-by-step by default, optionally, or not at all.
Behavior: Values come from the curated benchmark set when available, else from catalog flags. "Toggle" means thinking can be switched on per request; "—" means no data. Sorting ranks Always-on above Toggle above No.

### Models → Overview · Agentic column
aliases: agent column, tool calling column, agent capability rating
What: A column rating tool-calling/agent capability (curated qualitative labels, or Yes/—).
Why: Shows which models can reliably drive agents.
Behavior: Curated labels for well-known models; otherwise derived from tool-calling flags ("Yes") or "—" when unknown. Local models get their flags from the conservative family registry, which only adds capabilities.

### Models → Overview · Cost · $/1M column
aliases: price column, cost per million tokens, variable pricing, free cost
What: A column showing real price per 1M tokens as "input / output" (e.g. "$0.25 / $1.25"), or "Free"/"Paid" when no price is published, color-coded by tier (free → low → mid → high).
Why: Compare what models actually cost before committing.
Behavior: Prices come from the OpenRouter catalog when available. "Variable" appears when the router reports dynamic pricing (OpenRouter returns -1) — there is no fixed rate. Cost tiers drive the green→amber color scale; sorting puts free first ascending.

### Models → Overview · In-cell meter bars
aliases: little bars, mini bars in table, meters
What: Tiny horizontal bars inside Context, SWE-bench, HumanEval, and Speed cells.
Why: Turns raw numbers into instantly comparable visuals while scanning.
Behavior: Benchmark meters are absolute percentages; the speed meter is relative to your fastest measured model; the context meter uses a log scale so 10K and 10M both stay readable. No bar is drawn when there's no data.

### Models → Overview · Row expansion
aliases: expand row, inline details, wins and misses, row chevron
What: Clicking any row expands it inline with a description, green "wins" / red "misses" chips, key stats, and action buttons (Full details, Copy model id, download sources, Add to compare).
Why: Learn about a model without leaving the table.
Behavior: One row expands at a time; clicking again collapses it. Sparse rows (live models not in the curated catalog) show only a basic description noting that detailed specs aren't available. The side panel repeats Context, SWE-bench, HumanEval, your measured speed ("not tested" if none), Thinking, Agentic, and Harness.

### Models → Overview · Harness score
aliases: harness, tool discipline, agent mission score, score out of 10, not measured
What: A stat in the expanded row measuring tool discipline from your real agent missions: JSON accuracy, retries, failures, finished vs stalled.
Why: Real evidence of how a model behaves as an agent, on your workloads.
Behavior: Shown as "score/10 · N calls" once enough data exists. Until a model has accumulated enough tool calls it shows "measuring… (N calls)", and models with no agent history show "not measured" — the score is never guessed. It builds up automatically as you run agents on that model (desktop engine).

### Models → Overview · Compare checkboxes & compare bar
aliases: compare models, side by side, compare checkbox, pick models to compare
What: A checkbox at the left of each row (scale icon in the header) for picking models to compare; a floating bar appears once 2+ are picked.
Why: Stops the back-and-forth of comparing rows by memory.
Behavior: Maximum 4 models — further checkboxes disable until you remove one. The floating bar shows the count with "Compare side by side" and "Clear" buttons. You can also add/remove from an expanded row's "Add to compare" button.

### Models → Overview · Compare side by side card
aliases: comparison table, best value highlight, compare view
What: A modal table putting up to 4 picked models in columns across Context, Cost · $/1M, SWE-bench, HumanEval, Your speed, Thinking, Agentic, Host, Params, and License.
Why: One screen settles "which of these should I use?"
Behavior: For numeric rows the best value is highlighted with a "best" badge (highest for context/benchmarks/speed/params, lowest for cost). Rows where every model lacks data get no highlight. Qualitative rows (Thinking, Agentic, Host, License) are shown without a winner. Click outside or the X to close.

### Models → Overview · Full details card
aliases: model detail card, model info popup, release date, license badge
What: A modal card with the model's badges (VRAM or API host, context, parameter size, "released X ago" when the catalog has a release date, license), capability tags, a plain-language blurb, provider availability with free/paid tags, Wins/Misses lists, and download options.
Why: Everything known about one model in one place.
Behavior: Open it from an expanded row's "Full details" button. The release date is relative ("3mo ago") and appears only when the OpenRouter catalog provides it. Open-weight models get Hugging Face / Ollama / LM Studio buttons plus a copyable run command; closed models say "API only — no download".

### Models → Overview · Download button & source chooser
aliases: download model, get weights, hugging face, ollama download, open weights
What: A "Download" button in the last column for open-weight models, opening a chooser: Hugging Face (original & GGUF weights), Ollama (one-command local run, or library search), LM Studio (desktop GUI · GGUF).
Why: Open-weight models can be downloaded and run locally for free.
Behavior: Shown only when the license isn't proprietary; proprietary models show "API only". Links open externally; the menu closes on outside click or Escape. Ollama links go straight to the library page when the model is known to be there, otherwise to a search.

### Models → Speed check · Model selection panel
aliases: pick models to test, speed test selection, select all, show unavailable, provider host price filters
What: The left panel listing every model on your configured providers with checkboxes, a filter box, Provider/Host/Price dropdowns, "Select all" / "Clear" links, and a "Show unavailable" checkbox.
Why: Choose exactly which models to race.
Behavior: A model is testable if its cloud provider has an API key, or it's a local endpoint that's running — untestable ones are hidden unless "Show unavailable" is on (then shown greyed with "this provider has no key"). "Select all" selects only the currently filtered, testable models. The header counts "N available · M selected".

### Models → Speed check · Prompt presets & box
aliases: test prompt, prompt presets, short medium long code
What: Four preset chips (Short, Medium, Long, Code) and a textarea holding the single prompt sent to every selected model.
Why: The same prompt for everyone makes the timing comparable.
Behavior: Clicking a preset fills the box (clicking it again clears it); you can type anything custom. Replies are capped at 256 output tokens to keep runs fast and cheap.

### Models → Speed check · Also score answer quality
aliases: quality toggle, quiz toggle, score answers, graded quiz
What: A checkbox (on by default) that also asks each model a set of short auto-graded questions — reasoning, coding, agentic, instruction-following, structured extraction, honesty — and reports % correct.
Why: A fast model that answers wrong is useless; this adds a deterministic quality bar with no AI judge.
Behavior: Honest cost note: the quiz is 19 extra short calls per model on top of the main prompt — roughly 20 calls per model per run, which costs real money on paid models. Grading happens on the server (the answer key never ships in the app). It's a smoke test, not a full benchmark.

### Models → Speed check · Run speed test / Stop
aliases: start test, run button, stop test, cancel speed test, parallel test
What: The main button, "Run speed test (N)", and its in-flight replacement, "Stop".
Why: Kicks off the race; Stop aborts every in-flight request.
Behavior: All selected models receive the same prompt at the same time, in parallel. The run lives in the main process, so leaving the screen — or even closing the window on desktop — doesn't stop it; results keep streaming in when you return. Disabled until at least one testable model is selected.

### Models → Speed check · Live race lanes
aliases: race view, progress lanes, racing models, live streaming bars
What: While a run is in flight, a "Racing N models" panel shows one lane per model with a progress bar, live tok/s, and a status (streaming, scoring, done, failed).
Why: Watch the head-to-head happen instead of staring at a spinner.
Behavior: Each lane's bar fills as tokens stream (out of the 256-token cap); "scoring" appears while quiz answers are being graded. The header counts finished lanes. Partial results appear in the dashboard as they land.

### Models → Speed check · Winner band & KPI tiles
aliases: winner spotlight, fastest model, best quality, best value, hero tiles
What: After a run, a "Winner of this run" spotlight (with a one-line reason) beside up to four tiles: Fastest, Best quality, Best value (quality ÷ cost), plus Cheapest / Quickest start / Quickest overall as space allows.
Why: The headline verdict before you dig into charts.
Behavior: The winner is the best measured quality with throughput as tiebreak; without quality scoring, the fastest model wins. Clicking a tile re-sorts the ranking chart and table to that metric and spotlights that model. Cost tiles appear only when pricing is known (OpenRouter).

### Models → Speed check · Ranking chart, trade-offs scatter & measurements table
aliases: ranked bars, kpi chart, scatter plot, all measurements, results table
What: A ranked bar chart with a KPI switcher (Throughput, First token, Total time, Quality, Cost / run, Context), a speed-vs-quality scatter (dot size = cost), and an "All measurements" table where the best value per column is highlighted.
Why: Compare every model across every KPI at once.
Behavior: The chart, scatter, and table stay in sync — clicking a bar, dot, or tile jumps to and expands that model's table row, which shows the full breakdown including per-skill quiz scores. Only the top 15 results are compared side by side; unknown values show "—" and estimated token counts are marked "(est)". Results are a snapshot of one request — rerun for a steadier picture.

### Models → Speed check · Active-model snapshot guard
aliases: speed test changed my model, model reset after test, selection restored
What: Not a visible control — a safety guard around every run: your active provider and model are snapshotted when the test starts and restored when it ends.
Why: A benchmark must never repoint what your chat runs on.
Behavior: If anything changed the active selection while the test ran, the app puts it back exactly as you had it after the run finishes and logs a warning. You should never end a speed test on a different model than you started with.

### Models → Speed check · Failed models list
aliases: failed tests, why did a model fail, error reasons
What: A collapsed "N models failed" section under the results.
Why: Failures are normal (missing keys, no credit, rate limits) and shouldn't bury the wins.
Behavior: Expanding lists each failed model with a plain-language reason translated from the raw provider error — e.g. "Invalid or missing API key", "Out of credit", "Rate-limited / quota reached", "Model not available on this provider right now". Hover a reason for the raw error text.

### Models → Providers · Add provider dropdown
aliases: add provider, provider presets, new provider, connect openrouter, add ollama
What: A "+ Add provider…" dropdown with prefilled templates for popular providers (OpenAI, Anthropic, OpenRouter, Google Gemini, NVIDIA NIM, DeepSeek, Mistral, xAI, Groq, Together AI, Fireworks AI, Perplexity, Cerebras, DeepInfra, Hyperbolic, Ollama/LM Studio/llama.cpp local) plus "Custom (blank)".
Why: A preset fills the wire format and base URL — you only add your API key.
Behavior: Picking a preset creates the profile and opens its editor immediately. All presets are OpenAI-compatible except Anthropic. Local presets point at localhost ports and need no key.

### Models → Providers · Provider profile editor
aliases: provider settings, base url, api key field, wire format, kind, connection fields
What: The editor for one provider profile: Display name, Wire format (OpenAI-compatible /v1/chat/completions or Anthropic-compatible /v1/messages), Base URL, and API key (a password field).
Why: These four fields are everything BrainEdge needs to talk to a provider.
Behavior: Field edits save as you type. The API key placeholder says "leave blank for local" — local endpoints don't need one. The trash button deletes the profile (you can't delete the last one). A note clarifies: every provider stays available at once; the top-bar model selector decides which runs.

### Models → Providers · Save & load models
aliases: save provider, load models, cache model list, test only, fetch models
What: Two buttons: "Save & load models" (primary) and "Test only".
Why: Saving also fetches and caches the provider's model list, which is what fills the model picker, the Overview table, and the Speed Check.
Behavior: On success the status reads "Saved ✓ · N models available in the picker"; the list is cached on the profile, so pickers work without refetching. If the endpoint has no /v1/models, it saves anyway and tells you to enter the model id manually. "Test only" fetches without saving.

### Models → Providers · Default model
aliases: startup model, default on launch, model resets on restart, snap on launch
What: A model picker card choosing the model applied every time the app starts.
Why: Guarantees a known starting point regardless of what you experimented with last session.
Behavior: You can still switch models live in the top bar during a session — the selection snaps back to this default on next launch. Choosing a model here saves instantly ("Default model saved ✓").

### Models → Providers · Online/offline status dot
aliases: provider status, green dot, red dot, is my provider online, ping
What: A small colored dot in the top bar reflecting whether the active provider answers a ping.
Why: Instant signal that your endpoint is reachable before you send anything.
Behavior: Green = reachable, red = not responding, neutral grey = still checking. The active provider is pinged on selection and re-pinged every 30 seconds. For local providers a red dot usually means Ollama/LM Studio isn't running.

### Models → Providers · Backup & restore
aliases: export settings, backup file, restore backup, move to new machine, json backup
What: A card with "Download backup" and "Restore from backup" — one JSON file holding your providers, agents, teams, and preferences.
Why: Migrate machines or recover from a reset in one step.
Behavior: Honest warning, shown on screen: the backup contains your API keys in readable form — store it somewhere private. Restore replaces your current setup after a confirmation; it whitelists known settings keys, drops providers whose URL isn't http(s), and explicitly asks before accepting a changed account-server URL from the file.

### Models → Providers · Keys stay in this browser notice
aliases: where are my keys stored, key security web, browser storage keys
What: A notice shown only in the web version, under the API key field: "Your API keys stay in this browser's storage and go only to the provider — BrainEdge servers never see them."
Why: Answers the natural trust question before pasting a key.
Behavior: Informational only. The flip side it states: anyone with access to that browser profile could use the keys, so avoid shared computers. The desktop app stores keys locally and doesn't show this notice.

### Models → Providers · Corporate proxy card
aliases: proxy, corporate gateway, no-proxy, bypass hosts, company proxy
What: An optional card with "Proxy URL" and "Bypass hosts (no-proxy)" fields routing all LLM, MCP, and Telegram traffic through a company proxy.
Why: Needed on locked-down corporate networks where direct API calls are blocked.
Behavior: Local models bypass the proxy automatically. A restart of the app is required after changing it — the card says so in bold.
