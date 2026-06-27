# Sageknowledge · Local Models

<!-- hand-authored 2026-06-26 — the Local Models page (run AI models on your own computer) -->

### Local Models · What this page is
aliases: local models, run models locally, offline models, private models, on-device, my own machine, free models page
What: The Local Models page lets you download and run AI models on your own computer instead of a cloud provider — no API key, no per-token cost, and your data never leaves the machine.
Why: It is the private, free, offline alternative to cloud providers. Pull a model once and it works in chat, agents, and Let's Create without sending anything to the internet.
Behavior: Across the top sit four provider tabs — Ollama, HuggingFace, LM Studio, and Let's Create Models — plus a Server Status tab. Each provider tab shows a status card (engine ready / needs setup), a search box, a row of filter chips, and one unified model table. Selecting a tab is a border-only highlight (no fill), consistent with Let's Chat.
Example: A user with no API keys pulls a small Ollama model and chats completely free and offline.

### Local Models · Provider tabs (Ollama, HuggingFace, LM Studio, Let's Create Models)
aliases: providers, engines, ollama tab, huggingface tab, lm studio tab, local ai, which engine, provider difference
What: The four engines Madav can run locally. Ollama and HuggingFace run text/chat models (GGUF) through the Ollama engine; LM Studio runs GGUF models through the LM Studio app; Let's Create Models is the media engine (image, voice, video, music) that runs in Docker.
Why: Different engines suit different needs — Ollama is the simplest for chat, LM Studio suits people who already use that app, and Let's Create Models powers the Let's Create tab.
Behavior: Each tab independently detects whether its engine is installed and running; if not, the status card offers a one-click setup button ("Install Ollama", "Get LM Studio", or "Set up Let's Create Models"). HuggingFace models are pulled and run via the Ollama engine under the hood. "Let's Create Models" is the engine formerly shown as "Local AI".
Example: Clicking "Set up Let's Create Models" launches the Docker-based media engine so image and voice generation become available.

### Local Models · The unified model table
aliases: model table, columns, model list, browse models, what do the columns mean
What: One consistent table on every provider listing models with columns: a compare checkbox, Model (name + maker logo), Capabilities, Size, Context, Params, RAM compatibility, Downloads, Cost, and an action button.
Why: A single table format (matching the Models Overview page) means you read every provider the same way.
Behavior: Before you search, the table shows a curated set — the most-downloaded models that run well on your machine (up to ~100). The Capabilities column shows colored chips with icons (coding, reasoning, vision, etc.). Cost shows "Free" for every local model. Clicking a row expands it to show the full description, exact pull name, size, and a link to the model's web page.
Example: Sorting by Downloads surfaces the most popular models first.

### Local Models · Filter chips (multi-select)
aliases: filters, filter models, coding filter, downloaded filter, all filter, tiny filter, image voice video filter
What: A consistent set of nine filter chips on all four providers: All, Coding assistant, Deep reasoning, Sees images, Tiny & fast, Image, Voice, Video, and Downloaded.
Why: Lets you narrow a long catalog to exactly the kind of model you want.
Behavior: Chips are multi-select and combine together; "All" shows everything and clears the others; "Downloaded" shows only models already on your machine. The set is identical across providers for consistency. Selected chips use a border-only highlight, not a filled background.
Example: Selecting "Tiny & fast" + "Coding assistant" shows only small coding models.

### Local Models · RAM compatibility dot
aliases: ram compatibility, will it run, fits my machine, compatible, runs but slow, too big, green orange red dot
What: A colored dot in the RAM compatibility column showing whether a model fits your computer's memory — green "Compatible", orange "Runs but slow", red "Too big".
Why: Local models need enough RAM (or VRAM) to load; this tells you at a glance before you waste time downloading something that can't run.
Behavior: The dot is computed from the model's size versus your system's total RAM (shown in the page's machine details). The machine's RAM figure is read live from your computer.
Example: On a 16 GB machine a 40 GB model shows a red "Too big" dot.

### Local Models · Pull (download a model)
aliases: pull, download model, get model, install model, add model
What: The Pull button downloads a model onto your computer so it becomes usable.
Why: A model has to be downloaded once before it can run.
Behavior: Pull streams a live progress percentage. It is compatibility-gated: a model larger than your system's memory cannot be pulled — the button reads "Not compatible" and a message explains it needs more memory than the machine has. The Pull button is also disabled until that provider's engine is installed and running.
Example: Clicking Pull on a 4 GB model shows 0% climbing to 100%, then the row flips to Activate.

### Local Models · Cancel a download mid-way
aliases: cancel pull, stop download, abort download, cancel midway, X button on download
What: A small "✕" cancel button shown next to the progress percentage while a model is downloading.
Why: Large models can be slow; you may change your mind partway through and want to stop without finishing the whole download.
Behavior: Clicking ✕ stops the download immediately and returns the row to a Pull button. For Ollama, the partly-downloaded data is kept and is resumable, so pulling again later continues where it left off rather than starting over. (Neither Ollama nor the media engine expose a true server-side cancel, so cancelling stops Madav's side of the transfer.)
Example: A user starts a 20 GB pull, sees it is too slow, clicks ✕, and the row goes back to Pull.

### Local Models · Activate (load a model into memory)
aliases: activate, use this model, load model, start model, make it run, ollama ps
What: The Activate button on an installed model both selects it as your active model and loads it into the engine's memory so it is actually running.
Why: Selecting a model in the app is not the same as loading it into the engine; Activate does both, so the model genuinely runs (and shows up in the engine's running list).
Behavior: Activate loads the model using your saved context-length and keep-alive settings for that model (if you set any in Server Status). While loading it shows "Starting…", then the row shows a red Stop button once it is running. Works across all providers.
Example: After Activate, the model appears under Server Status as a running model.

### Local Models · Stop and Delete
aliases: stop model, unload, free memory, delete model, remove model, trash
What: Stop unloads a running model from memory (freeing RAM/VRAM); Delete (trash icon) removes the model's files from disk.
Why: Stop frees memory without deleting; Delete reclaims disk space.
Behavior: Stop appears (red) only while a model is running. Delete asks for confirmation first ("Delete X? This frees the disk space. You can pull it again any time.") so you never remove a model by accident.
Example: Stopping a model frees several GB of RAM; deleting it frees the disk space it occupied.

### Local Models · Media models show "Let's Create" instead of Activate
aliases: lets create chip, why no activate, media model, image model, no activate button
What: Models on the Let's Create Models (media) engine show a green "Let's Create" chip rather than an Activate button.
Why: Media models (image, voice, video, music) are used from the Let's Create tab, not as a chat model, so they do not need to be "activated" as the chat model.
Behavior: Once a media model is installed, it is automatically available in the Let's Create model picker — no activation step.
Example: After pulling an image model, the user switches to Let's Create and it is already selectable.

### Local Models · Server Status tab
aliases: server status, running models, cpu gpu usage, dashboard, system monitor, vram, context, keep alive, expire time
What: A live dashboard (its own tab beside the providers) showing what is running right now: KPI cards (models loaded, RAM/VRAM free and in use), RAM/CPU/GPU gauges, and a table of every running model.
Why: Lets you see resource usage and manage running models in one place.
Behavior: Auto-refreshes every 4 seconds and has a manual Refresh button. For each running model you can change its context length (capped at the model's own maximum — you cannot exceed it), set a keep-alive / expire time (5 minutes, 30 minutes, 1 hour, or Forever), Apply, or Stop it. Apply saves those settings as that model's default until you change them again, and keeps the row on screen while the engine reloads it (it does not vanish).
Example: Raising a model's keep-alive to "Forever" stops it unloading between messages.

### Local Models · Recommended for Let's Create (HuggingFace-ranked)
aliases: recommended models, best media model, what should I download, recommended for lets create, top image model, top voice model
What: On the Let's Create Models tab, a strip of six capability cards — Image, Voice, Video, Music, Transcribe, Describe — each showing the genuinely most-downloaded model on HuggingFace for that task, with its download count and size.
Why: The media engine's own gallery is dominated by text models, so these recommendations go straight to HuggingFace (by task / pipeline_tag, ranked by downloads) to surface the real best media model for each capability, sized against your machine.
Behavior: Each card shows the HuggingFace download count, an estimated size, and a compatibility dot. If the engine can pull a close match, it offers a Pull button (with a cancel option mid-download); otherwise it offers a "HuggingFace" link to open the model's page. The list refreshes in the background every 12 hours and always considers your system's memory.
Example: The Image card shows Stable Diffusion as the top text-to-image model with its download count, and a Pull button.

### Local Models · Search and Compare
aliases: search models, find a model, compare models, side by side, model search box
What: A search box queries the provider's full catalog (HuggingFace GGUF listings, or the Ollama registry); compare checkboxes let you select up to four models for a side-by-side view.
Why: Search finds anything beyond the curated list; compare helps choose between options.
Behavior: Search results show full details (size, RAM compatibility, downloads) in the same table, and only show models that are actually available for local download (cloud-only models are excluded, so they never show a Pull button by mistake). Ticking up to four checkboxes opens a side-by-side comparison like the Models Overview page.
Example: Searching "qwen" lists every downloadable Qwen variant with sizes and compatibility.
