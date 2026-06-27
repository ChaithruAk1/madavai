# Sageknowledge · Let's Create

<!-- hand-authored 2026-06-26 — the Let's Create tab (make images, voice, video, music locally) -->

### Let's Create · What this tab is
aliases: lets create, create tab, make images, generate media, image voice video, creative tab, media generation
What: Let's Create is Madav's creative studio for making media on your own machine — images, speech, music, video — and for understanding media (transcribing audio, describing images). It is conversational: each result can spark the next.
Why: It is the front door to local media generation, powered by the Let's Create Models engine; nothing is sent to the cloud.
Behavior: When idle it shows a centered greeting in the middle of the window (like Let's Collaborate), with a model picker, capability tiles above the input, a Select Folder control, a "+" menu, a Permission control, and a Use Agents toggle. You type what you want and pick a capability; the result appears inline and can be carried into the next step (an image can be animated into a video).
Example: A user types "a watercolor fox", picks Image, and gets a generated picture they can then animate.

### Let's Create · Capability tiles
aliases: image voice video music transcribe describe, capabilities, what can it make, tiles, generation types
What: Tiles above the input choosing what to make or do: Image, Voice (text-to-speech), Video, Music, Transcribe (speech-to-text), and Describe (understand an image).
Why: Each capability uses a different kind of model, so you tell Madav which one you want.
Behavior: Selecting a tile sets the task for your next prompt. Image and Voice are the lightest and fastest; Video is the heaviest and slowest (and benefits greatly from a GPU). If you pick a capability your chosen model can't do, Madav explains it and suggests picking a different model or pulling one in Local Models.
Example: Picking Transcribe and attaching an audio file returns the spoken text.

### Let's Create · Model picker (media models only)
aliases: model picker, choose model, which model, media model selector, capability hint
What: A picker listing only the media models relevant to Let's Create (the ones installed on the Let's Create Models engine), each with a short hint of what it is good for.
Why: Keeps the choice focused on models that can actually generate media, rather than every chat model.
Behavior: Installed media models appear automatically — media models need no "activation" step. Each entry shows a capability hint (image, voice, video, etc.). If nothing suitable is installed, the picker points you to Local Models to pull one.
Example: After pulling an image model and a voice model, both appear here with hints.

### Let's Create · Select Folder
aliases: select folder, output folder, save location, where files save, process my files, work on a folder
What: A control that picks a folder on your computer to use both as the place creations are saved and as a source of files to work on.
Why: Lets you keep everything for a project in one folder and feed your own files (images, audio) into Let's Create.
Behavior: Once a folder is chosen, generated images, audio, music, and video are saved into it. Through the "+" menu's "From your folder…" option you can pick a file already in that folder to use as input (for example, an image to animate or describe, or audio to transcribe).
Example: A user selects a project folder; every image they generate is saved there automatically.

### Let's Create · The "+" menu
aliases: plus button, add files, add photos, attach, from your folder, upload
What: A "+" button next to the input opening options to Add files or photos, pick a file From your folder…, or turn on Use Agents.
Why: Brings your own content into a creation (an image to edit, audio to transcribe) and exposes the Agents toggle.
Behavior: "Add files or photos" attaches a file from anywhere on your computer; "From your folder…" lists files in the folder you selected; both attach the file as input for your next prompt.
Example: Attaching a photo and choosing Describe returns a written description of it.

### Let's Create · Permission to Act
aliases: permission, permission to act, ask first, autonomy, auto save, ask before
What: A control setting how much Let's Create may do on its own — for example whether it acts immediately or checks with you first.
Why: Gives you control over how autonomous the creative process is, especially when Agents are involved.
Behavior: It mirrors the Permission control used elsewhere in Madav, applied to Let's Create's actions.
Example: With permission set to ask first, Madav confirms before running a multi-step job.

### Let's Create · Use Agents (autonomous multi-step creation)
aliases: use agents, agent mode, automatic, do it all, multi step, agent creation, plan and create
What: A toggle that, when on, turns your single prompt into an autonomous multi-step job: the Agent reads what you asked, plans the full sequence of steps, and carries them out using Let's Create to complete the whole task.
Why: For requests that need several creative steps (e.g. "make a logo, then animate it, then add a voiceover"), the Agent handles the chain instead of you doing each step by hand.
Behavior: When Use Agents is on and you submit a prompt, Madav plans the steps from your request and executes them in order, passing each result into the next (for example an image into a video). Models must already be installed (pull them in Local Models first).
Example: "Create a product image and turn it into a 5-second clip" runs as two chained steps automatically.

### Let's Create · Where the models come from
aliases: no models, pull a model, set up engine, how to get models, install media model, engine not running
What: Let's Create runs on the Let's Create Models engine; its models are pulled on the Local Models page.
Why: You need at least one media model installed (and the engine running) before you can create.
Behavior: If the engine isn't running, Let's Create guides you to set it up. The fastest way to get good models is the "Recommended for Let's Create" strip on the Local Models → Let's Create Models tab, which lists the most-downloaded model per capability from HuggingFace, sized for your machine.
Example: A first-time user sets up the engine, pulls the recommended Image and Voice models, and returns to Let's Create ready to go.
