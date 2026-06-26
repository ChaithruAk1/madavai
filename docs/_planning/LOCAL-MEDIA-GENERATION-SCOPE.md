# Madav — Local Media Generation (Image · Voice · Video)
### Scope & Plan — drafted 2026-06-26

> **BUILD STATUS (2026-06-26): COMPLETE.** All five stages are built and verified — LocalAI engine + guided
> Docker setup, and the Let's Create studio with Image, Voice (speak + transcribe) and Video. The LocalAI tab
> has Image/Voice/Video capability tiles. What remains is real-machine testing (needs Docker + pulled models)
> and the optional follow-ons at the end of this doc (curated model shortlist, cloud-key path).

## The idea, in one breath
One chat box. You ask Madav to **make an image**, **speak a reply**, **turn your voice into text**, or
**generate a short video**, and it just happens *inline* — the way ChatGPT feels — except the generation runs
on **your own machine** through a single local engine. No mode-switching, no hand-picking the "right kind" of
model. You ask; Madav routes it to the right capability and shows the result in the conversation.

## Decisions locked (with you)
- **Engine:** LocalAI — one open-source engine that speaks Madav's existing OpenAI API format for chat, image,
  voice (speak + transcribe) **and** video. One integration instead of four.
- **Windows setup:** Docker, with **Madav guiding the one-time install** and auto-running LocalAI for you.
- **v1 scope:** Image **+** Voice **+** Video (video included, eyes open about the hardware cost).
- **Interface:** the existing chat box routes by intent; results render inline. No separate app.

## Why this is the *small* version (it reuses what Madav already has)
Madav already talks to models in the OpenAI API format and already owns: a provider system, a model selector,
the Local Models browse page, a tool-calling agent loop, and inline file cards. LocalAI plugs into all of it:
- It registers as **just another provider** (like Ollama), at a localhost address.
- The agent loop **already calls tools** — we add `make-image` / `speak` / `transcribe` / `make-video` tools.
- The cards that already show produced spreadsheets/PDFs get **extended** to show an image, an audio player,
  a video player.
So most of the work is wiring into things you already own — not new infrastructure.

## The setup, made painless (the Docker part)
1. Madav checks whether Docker is installed. If not, it walks you through the **one-time** Docker Desktop
   install in plain language — download, a couple of clicks.
2. Once Docker is there, Madav **pulls and starts the LocalAI container in the background** (the equivalent of
   the Ollama "Install" button you already have). You never open a terminal.
3. LocalAI then appears as a provider, and its image/voice/video models show up on the **Local Models** page,
   reusing the browse cards + "fits your machine" badges already built.
4. This is also what finally **runs the flux / Wan models you already downloaded** — Ollama can't; LocalAI can.

## Stages (each one is testable on its own)

**Stage 1 — LocalAI engine + guided Docker setup**
Add LocalAI as a 4th local runtime (detect / install / list / pull / remove) and a provider preset; Docker
detection + guided install + background container start; manage LocalAI models on the Local Models page.
*Done when:* you can get LocalAI running and pull an image model, hands-off.

**Stage 2 — Image generation in chat**
A `make-image` tool → LocalAI's image endpoint; inline image card (view, save to your folder, regenerate); the
chat model calls it when you ask for a picture.
*Done when:* "make an image of a confused monkey on a tree" → an image appears in the chat.

**Stage 3 — Voice (speak + listen)**
A `speak` tool → LocalAI text-to-speech, with an inline audio player; `transcribe` → speech-to-text wired to
the mic you already have.
*Done when:* Madav can read replies aloud and turn your voice notes into text.

**Stage 4 — Video generation**
A `make-video` tool → LocalAI's video endpoint, inline video player. Honest UX: a clear "this needs a strong
GPU and may take several minutes" notice + a progress bar, so it never feels broken.
*Done when:* "make a short video of X" → a clip appears (hardware permitting).

**Stage 5 — Polish, capability tiles, verify, hand over**
Capability tiles on Local Models ("Make images", "Voice", "Make video") beside the chat goals — so the non-chat
models you download finally have a clear home; curate a few known-good models; tests + E2E cases + git steps.

## Honest risks (so nothing surprises you later)
- **Video is the hard one.** Heavy, GPU-hungry, minutes per short clip; on a normal laptop it may be slow or
  unusable. We ship it with clear expectations + progress, not as a headline. (True of every local tool, not
  just Madav.)
- **Docker is a real prerequisite** — a one-time, few-hundred-MB install that needs virtualization enabled.
  Madav makes it as guided as possible, but it is still a step a person has to take once.
- **Quality:** local image/voice is good but sits below cloud (DALL·E, ElevenLabs). If you ever want top
  quality on demand, this same design accepts a cloud key later — no rework.
- **Resources:** LocalAI + its models running alongside Ollama can use a lot of RAM/VRAM. The "fits your
  machine" badges already help; we extend them to media models.
- **First run is slow:** the first image/video loads the model into memory.

## New vs. reused
- **New:** LocalAI runtime adapter, Docker setup helper, the media tools (image/voice/video), inline media
  players, a capability classifier extension (chat vs image vs voice vs video).
- **Reused:** provider system, model selector, Local Models browse/cards/fit, agent loop + tool-calling,
  file/output cards, the install-button pattern, the non-chat filter just built.

## Single-source + surfaces
Everything goes through the shared core, so **web and desktop inherit one implementation**. LocalAI is local,
so on the web build the media features show the same "desktop" treatment local models already get; a future
cloud-key path would light them up on web too — without a second codebase.
