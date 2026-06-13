# Sageknowledge · Models
<!-- generated from source 2026-06-11 — regenerate per SAGE-KNOWLEDGE-PROCESS.md -->

### Model picker · Model button
aliases: model selector, top bar model, current model, change model, switch model  What: The button that displays the currently active provider and model name; clicking it opens the model dropdown.  
Why: Every chat, agent, and tool call uses the model shown here.  
Behavior: Clicking toggles the dropdown, selects a new model row, and instantly applies it; if the previously saved model is no longer loaded, the button falls back to showing the raw identifier (“select model”).  
Example: Selecting “gpt‑4o” from the list makes the button read “gpt‑4o”.  

### Model picker · Search boxaliases: search models, find model, filter models, model search  
What: A text field above the dropdown with placeholder “Search N models…”.  
Why: With hundreds of loaded models, typing narrows the list far faster than scrolling.  
Behavior: Matches entered text case‑insensitively against both model name and ID, filtering the list in real time while preserving all other filters.  
Example: Typing “qwen” instantly reveals every Qwen variant across providers.  

### Model picker · Refresh buttonaliases: reload models, refresh list, re-fetch models  
What: A circular‑arrow icon labeled “Reload models from providers” placed beside the search box.  
Why: Pulls an updated model list when a provider adds or removes models.  
Behavior: Shows a spinning cursor while reloading; the displayed list updates in place once the fetch completes. It only appears when a refresh handler is attached (e.g., the top‑bar picker).  

### Model picker · Cost chips (All / Free / Paid)
aliases: free models, cost filter, price filter  
What: Three mutually exclusive chips – All, Free, Paid – positioned at the top of the dropdown.  
Why: Lets you instantly limit the view to models that are free to use or to those that incur cost.  
Behavior: Exactly one chip stays active; “Free” includes local models and any cloud model whose ID ends with “:free”, while “Paid” includes the rest. This heuristic is based on naming, not live billing data.  ### Model picker · Host chips (Cloud / Local)
aliases: local models filter, cloud filter, where the model runs, ollama filter, lm studio filter  
What: Two toggle chips labeled “Cloud” and “Local”.  Why: Quickly isolate models that run on your machine versus hosted ones.  
Behavior: Clicking activates a chip; clicking again clears it. “Local” keeps providers whose name contains “local”; “Cloud” keeps everything else. The selection combines with cost and capability chips.  ### Model picker · Capability chips (Coding · Reasoning · Vision · Fast · Agentic)
aliases: capability filter, coding filter, reasoning filter, vision filter, fast filter, agentic filter  
What: Five toggle chips that filter by detected capability.  
Why: Helps you pick a model suited to a particular task (e.g., coding and reasoning together).  Behavior: Checkboxes are multi‑select and combined with AND logic; each chip uses a heuristic derived from the model name or catalog data (e.g., “reasoning” matches tokens like “reason”, “qwq”).  

### Model picker · Maker dropdown
aliases: maker filter, by vendor, by company, filter by maker, nvidia models, meta models  
What: A select dropdown that lists every model maker present in the loaded set.  
Why: When a router provider exposes many makers, this isolates a single vendor for focused browsing.  
Behavior: Appears only if more than one maker exists; the maker is extracted from the id prefix before “/” (or from the provider name). Results are sorted by how many models each maker contributes. Selecting “All makers · N” resets the filter.  

### Model picker · Agent-ready only toggle
aliases: agent ready, tool capable only, agentic only toggle, agent studio model filter  
What: An optional chip labeled “Agent‑ready only”.  
Why: Filters the picker to models that have confirmed tool‑calling capability, which agents require.  
Behavior: Off by default; toggling on retains only models flagged as tool‑capable via catalog metadata, local registry, or an “agent” token in the name.  

### Model picker · Shown counter
aliases: x of y models, result count, how many models  
What: A small text displaying “N of M” at the right of the filter row.  
Why: Shows how many models survive the active filters.  
Behavior: Updates live as you type or toggle chips; if no models match, the list area displays “No models match these filters. Clear a filter, or open Settings to add a provider.”  

### Model picker · Provider group headers
aliases: provider sections, group header, provider logo, models grouped by provider  
What: Section headers inside the dropdown that show the provider name and model count (e.g., “OpenRouter · 213”).  
Why: Makes it clear which configured provider a model will run through.  
Behavior: Logos are fetched from the provider’s favicon; if unavailable, a generated monogram appears. Groups with no visible models disappear after filtering.  

### Model picker · Row pills (capability + Free/Local/Cloud)
aliases: model tags, model badges, local pill, cloud pill, free pill, coding pill  
What: Small colored pills on each model row indicating up to three capability tags and one host tag (Local, Free, Cloud).  
Why: Gives a quick visual cue of a model’s strengths and where it runs.  
Behavior: Host pills use green for Local and Free, an accent color for Cloud. Capability pills appear only when the corresponding heuristic is true; otherwise they are omitted.  

### Model picker · Selected-row highlight
aliases: current model checkmark, active model row, which model is selected  
What: Visual highlight and check‑mark on the row that matches the currently selected model.  
Why: Confirms which model is active while you browse alternatives.  
Behavior: Only one row is highlighted; clicking any other row switches the selection instantly and closes the dropdown.  

### Model picker · 250-row display cap
aliases: showing first 250, list truncated, too many models, row limit  
What: A note that at most 250 model rows are rendered; the footer reads “Showing the first 250 of N — type in the search box to narrow down.”  
Why: Keeps the dropdown responsive even when hundreds of models are loaded.  
Behavior: The cap only affects display; all filters, search, and chip combinations still evaluate the full model list, so narrowing will always expose models beyond the first 250.  

### Model picker · Local-model capability fallback registry
aliases: local model tags, why does my ollama model show agentic, localModels registry, family registry  
What: Not a visible UI element; an internal table (src/data/localModels.js) that maps local model IDs to capability tags.  Why: Local providers (Ollama, LM Studio, llama.cpp) publish no metadata, so this registry supplies realistic capability labels to avoid under‑reporting.  
Behavior: Adds capabilities conservatively (e.g., “coding” for qwen2.5‑coder) and never removes them; unlisted local models simply show no tags.  

### Model configuration · Madav Model Starter
aliases: madav starter, model starter, starter, free models, no api key, default provider, try without key  What: The pre‑configured provider called “Madav Model Starter”, shown as “Madav Starter (free)” in the provider list.  
Why: Gives new users an immediate, key‑less way to start chatting.  
Behavior: Routes through madav.ai using the server‑held session key; serves only free models (ids ending “:free”) with a daily request limit. Hitting the limit or selecting a paid model shows a friendly prompt to add a personal key in Settings. Signing out replaces the starter with a sign‑in prompt.  ### Models → Overview · Insight band stat tiles
aliases: stat tiles, dashboard tiles, models loaded count, free count, agent-ready count, open-weight count, speed-tested count  
What: Five tiles above the model table showing live counts: “Models loaded”, “Free to use”, “Agent‑ready”, “Open‑weight”, “Speed‑tested by you”.  
Why: Answers “what do I have?” at a glance before scanning rows.  Behavior: Each tile is clickable; clicking “Free” or “Agent‑ready” toggles the matching filter, “Models loaded” clears all filters, and “Speed‑tested by you” sorts by measured speed.  

### Models → Overview · Filter chip bar
aliases: overview filters, filter chips, local cloud free chips, all chip  
What: A row of combinable chips – All, Local, Cloud, Free, Agentic, Coding, Image, Reasoning, Fast, General, Open‑weight – alongside a search box.  
Why: Lets you slice the model table by any combination of host, cost, capability, etc.  Behavior: Chips are multi‑select and combined with AND logic; “All” highlights only when no other filter is active. The search box matches name, maker, “best for” text, and run ID. Header counts update to “X of Y shown”.  

### Models → Overview · Sortable column headers
aliases: sort table, sort by column, column sorting, sort models  
What: Clickable headers for each column (Model, Best for, Context, Cost · $/1M, SWE‑bench, HumanEval, Speed, Coding, Thinking, Image, Agentic, Host, Params, Download).  
Why: Lets you rank models by the metric that matters to you.  
Behavior: Clicking a header sorts ascending; a second click reverses direction, indicated by an arrow. Default sort is Context descending. Missing values (“—”) are pushed to the end of the ordering.  

### Models → Overview · SWE‑bench and HumanEval columns
aliases: benchmarks, swe bench, humaneval, coding benchmark, benchmark scores  
What: Two columns that display percentage scores and small meter bars for SWE‑bench and HumanEval.  Why: Provides a rough coding‑strength comparison for well‑known models.  
Behavior: Values are drawn from a curated benchmark set; anything not present shows “—”. The UI displays a caveat that these are approximate and curated only for known models.  

### Models → Overview · Speed column
aliases: tokens per second, t/s column, measured speed, speed tested  
What: Shows measured tokens/second for models you have tested in a Speed Check, accompanied by a meter bar.  
Why: Gives real throughput based on your own hardware and API keys, not vendor marketing.  
Behavior: Pulls the last Speed Check result; untested models display “—” and a hover hint “run a Speed Check to measure”. Sorting by this column (or via the “Speed‑tested by you” tile) surfaces your fastest models first.  

### Models → Overview · Agentic column
aliases: agent column, tool calling column, agent capability rating  
What: Lists each model’s tool‑calling / agent capability as “Yes”, a qualitative label, or “—”.  
Why: Indicates which models can reliably drive agents.  
Behavior: Uses curated labels when available; otherwise falls back to “Yes” if the model has tool‑calling data from the catalog or local registry, otherwise “—”.  

### Models → Overview · Cost · $/1M column
aliases: price column, cost per million tokens, variable pricing, free cost  
What: Displays price per 1 M tokens as “$0.25 / $1.25” or “Free”/“Paid”, color‑coded by tier.  
Why: Lets you compare real cost before committing to a model.  
Behavior: Prices come from the OpenRouter catalog; “Variable” appears when the provider reports dynamic pricing (‑1). Free models are highlighted in green, low‑cost in amber, high‑cost in red.  

### Models → Overview · In-cell meter bars
aliases: little bars, mini bars in table, meters  
What: Tiny horizontal bars inside Context, SWE‑bench, HumanEval, and Speed cells.  
Why: Turns numeric values into instantly scannable visuals.  
Behavior: Benchmark meters are absolute percentages; the speed meter is relative to your fastest measured model; the context meter uses a log scale. No bar renders when there is no data.  

### Models → Overview · Row expansion
aliases: expand row, inline details, wins and misses, row chevron  
What: Clicking any row expands it inline with a description, green “wins” / red “misses” chips, key stats, and action buttons (Full details, Copy model id, download sources, Add to compare).  
Why: Learns about a model without leaving the table.  
Behavior: Only one row can be expanded at a time; expanding again collapses it. Sparse rows (live models not in the curated catalog) show a basic description and only minimal details.  

### Models → Overview · Harness score
aliases: harness, tool discipline, agent mission score, score out of 10, not measured  
What: A stat shown in an expanded row that measures tool discipline from your real agent missions (JSON accuracy, retries, failures, finished vs stalled).  
Why: Provides concrete evidence of how a model behaves as an agent on your workloads.  
Behavior: Displayed as “score/10 · N calls” once enough calls are recorded; until then it shows “measuring… (N calls)”; models with no history show “not measured”. The score is never guessed.  

### Models → Overview · Compare checkboxes & compare bar
aliases: compare models, side by side, compare checkbox, pick models to compare  
What: A checkbox (or scale icon) at the left of each row for selecting models to compare; a floating bar appears once two or more are picked.  
Why: Eliminates the need to remember rows across sessions when you want a side‑by‑side view.  Behavior: Up to four models may be selected; further checkboxes are disabled until you remove one. The bar shows the count with “Compare side by side” and “Clear” buttons. You can also add/remove models from an expanded row’s “Add to compare” button.  

### Models → Overview · Compare side by side cardaliases: comparison table, best value highlight, compare view  
What: A modal table that places up to four selected models in columns across Context, Cost · $/1M, SWE‑bench, HumanEval, Your speed, Thinking, Agentic, Host, Params, and License.  
Why: Consolidates all key metrics for the selected models so you can pick the best one in one screen.  
Behavior: For numeric rows the “best” value is highlighted with a badge (highest for context/benchmarks/speed/params, lowest for cost). Qualitative rows (Thinking, Agentic, Host, License) show no winner. Opening the modal closes any previous compare view.  

### Models → Overview · Full details card
aliases: model detail card, model info popup, release date, license badge  
What: A modal card displaying badges (VRAM or API host, context, parameter size, release age, license), capability tags, a short blurb, provider availability, Wins/Misses lists, and download options.  
Why: Packs every known piece of information about a model into a single view.  
Behavior: Opened from an expanded row’s “Full details” button. Release dates appear as “X ago” only when the catalog provides a date. Open‑weight models get direct links to Hugging Face, Ollama, and LM Studio; proprietary models show “API only — no download”.  

### Models → Overview · Download button & source chooser
aliases: download model, get weights, hugging face, ollama download, open weights  
What: A “Download” button on each model row for open‑weight models, opening a chooser with Hugging Face, Ollama, and LM Studio options.  
Why: Provides a quick path to obtain weights for models that can be run locally.  
Behavior: The button appears only when the license is not proprietary; proprietary models show “API only”. Selecting an option opens the external URL; the chooser closes on outside click or Escape.  

### Models → Speed check · Model selection panel
aliases: pick models to test, speed test selection, select all, show unavailable  What: Left‑hand panel listing every model on configured providers with checkboxes, a filter box, Provider/Host/Price dropdowns, “Select all” / “Clear” links, and a “Show unavailable” toggle.  
Why: Lets you choose exactly which models to include in a speed run.  
Behavior: A model is testable only if its provider has an API key or it is a running local endpoint; untestable models appear greyed out unless “Show unavailable” is enabled. “Select all” checks only the currently filtered, testable models. The header reads “N available · M selected”.  

### Models → Speed check · Prompt presets & box
aliases: test prompt, prompt presets, short medium long code  
What: Four preset chips (“Short”, “Medium”, “Long”, “Code”) and a textarea that holds the single prompt sent to each selected model.  
Why: Guarantees identical input for every model, making timing comparable.  
Behavior: Clicking a preset fills the textarea (clicking again clears it); you may also type a custom prompt. Replies are capped at 256 output tokens to keep runs fast and cheap.  

### Models → Speed check · Also score answer quality
aliases: quality toggle, quiz toggle, score answers, graded quiz  What: A checkbox (enabled by default) that, when on, sends each model a short set of auto‑graded questions (reasoning, coding, agentic, instruction‑following, structured extraction, honesty).  
Why: Adds a deterministic quality check so a fast but wrong model is not mistaken for a good one.  
Behavior: The quiz incurs ~19 extra short calls per model, costing real money on paid models. Grading occurs on the server; the answer key never ships to the client. It is a smoke test, not a full benchmark.  ### Models → Speed check · Run speed test / Stop
aliases: start test, run button, stop test, cancel speed test, parallel test  
What: The primary button labeled “Run speed test (N)” and its in‑flight replacement “Stop”.  
Why: Initiates the benchmark run; “Stop” aborts any in‑flight requests.  
Behavior: When pressed, all selected models receive the same prompt simultaneously in parallel. The request runs in the main process, so navigating away or closing the window does not cancel it; results continue to arrive when you return. The button is disabled until at least one testable model is selected.  

### Models → Speed check · Live race lanes
aliases: race view, progress lanes, racing models, live streaming bars  
What: While a test is running, a “Racing N models” panel shows one lane per model with a progress bar, live tokens‑per‑second, and a status (streaming, scoring, done, failed).  Why: Lets you watch the head‑to‑head competition instead of staring at a spinner.  
Behavior: Each lane’s bar fills as tokens stream (capped at 256); “scoring” appears while quiz answers are being graded. The header counts finished lanes; partial results appear in the dashboard as they arrive.  

### Models → Speed check · Winner band & KPI tiles
aliases: winner spotlight, fastest model, best quality, best value, hero tiles  
What: After a run, a “Winner of this run” spotlight sits beside up to four KPI tiles: Fastest, Best quality, Best value (quality ÷ cost), plus optional Cheapest / Quickest start / Quickest overall.  
Why: Provides a headline verdict before you dive into charts.  
Behavior: The winner is the model with the highest measured quality, using throughput as a tiebreaker; without quality data the fastest model wins. Clicking any KPI tile re‑sorts the ranking chart and table to that metric and spotlights the corresponding model. Cost tiles appear only when pricing data is known.  

### Models → Speed check · Ranking chart, trade‑offs scatter & measurements table
aliases: ranked bars, kpi chart, scatter plot, all measurements, results table  
What: A ranked bar chart with a KPI switcher (Throughput, First token, Total time, Quality, Cost / run, Context), a speed‑vs‑quality scatter (dot size = cost), and an “All measurements” table where the best value per column is highlighted.  
Why: Lets you compare every model across all KPIs in one view.  
Behavior: The chart, scatter, and table stay synchronized; clicking a bar, dot, or tile jumps to and expands that model’s row in the main table, revealing the full breakdown including quiz scores. Only the top 15 results are shown side‑by‑side; unknown values display “—” and estimated token counts are marked “(est)”. Results reflect a single request snapshot.  

### Models → Speed check · Active‑model snapshot guard
aliases: speed test changed my model, model reset after test, selection restored  
What: An internal guard that snapshots the active provider and model when a speed test starts and restores them when it ends.  
Why: Prevents a benchmark from unintentionally changing the model you are actually using.  
Behavior: If any UI action alters the active selection during the run, the app restores the original choice after the test finishes and logs a warning. This guarantees you never finish a test on a different model than you started with.  ### Models → Speed check · Failed models listaliases: failed tests, why did a model fail, error reasons  
What: A collapsible section titled “N models failed” that lists each failed model with a plain‑language reason.  
Why: Failures (missing keys, rate limits, quota exhaustion) are common and should not hide successful runs.  
Behavior: Expanding the section reveals entries such as “Invalid or missing API key”, “Out of credit”, “Rate‑limited / quota reached”, or “Model not available on this provider right now”. Hovering a reason shows the raw error text.  

### Models → Providers · Provider gallery (cards)
aliases: add provider, provider presets, new provider, connect openrouter, add ollama, provider cards  
What: A grid of cards representing each configured provider; your connected providers show a green “Connected” badge or an “Add key” hint, while popular presets (OpenAI, Anthropic, OpenRouter, etc.) display a “Connect” button.  Why: Gives a quick visual overview of the state of every provider and a one‑click path to add a new one.  
Behavior: Cards display real brand icons (fallback monograms when offline); clicking a card opens that provider’s setup page where you can enter the API key, base URL, etc. “Connect” creates the profile automatically. The grid also includes a “Custom provider” card for manual entry.  

### Models → Providers · Provider profile editor
aliases: provider settings, base url, api key field, wire format, kind, connection fields  What: The editor for a single provider profile containing Display name, Wire format (OpenAI‑compatible /v1/chat/completions or Anthropic‑compatible /v1/messages), Base URL, and API key field.  Why: These four fields are all Madav needs to communicate with a given provider.  
Behavior: Edits save instantly as you type; the API key field shows “leave blank for local” for local endpoints. The trash button deletes the profile (you cannot delete the last remaining one). A note reminds you that providers stay available simultaneously; the top‑bar model selector decides which one runs.  

### Models → Providers · Save & load models
aliases: save provider, load models, cache model list, test only, fetch models  
What: Two buttons in the provider editor: “Save & load models” (primary) and “Test only”.  
Why: Saving also fetches and caches the provider’s model list, which populates the model picker, Overview table, and Speed Check.  
Behavior: On success the status reads “Saved ✓ · N models available in the picker”. The cached list is reused thereafter, so subsequent picks do not refetch. “Test only” performs the fetch without persisting the profile.  

### Models → Providers · Default model
aliases: startup model, default on launch, model resets on restart, snap on launch  
What: A picker card that designates the model applied every time the application starts.  
Why: Guarantees a known starting model regardless of what you experimented with previously.  
Behavior: You can still switch models live in the top‑bar during a session; the selected model “snaps back” to this default on the next launch. Choosing a model here saves instantly with a “Default model saved ✓” message.  

### Models → Providers · Online/offline status dot
aliases: provider status, green dot, red dot, is my provider online, ping  
What: A small colored dot in the top bar indicating whether the active provider responds to a ping.  
Why: Gives an immediate visual cue that the endpoint is reachable before any request is sent.  
Behavior: Green means reachable, red means unresponsive, grey indicates the system is still checking. The active provider is pinged on selection and re‑pinged every 30 seconds; for local providers a red dot usually means Ollama/LM Studio is not running.  

### Models → Providers · Backup & restore
aliases: export settings, backup file, restore backup, move to new machine, json backup  
What: A card offering “Download backup” and “Restore from backup” actions, producing a JSON file that stores providers, agents, teams, and preferences.  
Why: Enables easy migration to a new machine or recovery after a reset.  
Behavior: The backup JSON contains your API keys in plain text — treat it as sensitive data. Restoring replaces your current setup after a confirmation prompt; it whitelists known settings keys, drops providers whose URL is not http(s), and asks before accepting a changed account‑server URL from the file.  

### Models → Providers · Keys stay in this browser notice
aliases: where are my keys stored, key security web, browser storage keys  
What: A notice shown only in the web version, beneath the API key field, stating “Your API keys stay in this browser’s storage and go only to the provider — Madav servers never see them.”  
Why: Addresses the natural trust question about where keys are persisted.  
Behavior: Purely informational; it also warns that anyone with access to that browser profile could use the keys, so avoid using shared computers. The desktop client stores keys locally and does not display this notice.  

### Models → Providers · Corporate proxy card
aliases: proxy, corporate gateway, no-proxy, bypass hosts, company proxy  
What: An optional card with “Proxy URL” and “Bypass hosts (no‑proxy)” fields that route all LLM, MCP, and Telegram traffic through a corporate proxy.  Why: Required on locked‑down corporate networks where direct API calls are blocked.  
Behavior: Local models automatically bypass the proxy. Changing these fields requires a full app restart, and the card displays a bold warning to that effect.