# PLAN: "Let's Create" Media Suite

**Status:** Proposal (research only — no code)
**Date:** June 2026
**Scope:** text→image, text→video, image→video, video→transcript — all via the **user's own API keys** (BrainEdge has zero backend compute). Desktop (Electron) writes files locally; web downloads blobs.

---

## 1. Research findings (June 2026 state)

### 1.1 Text → Image

| Provider | API availability | Price (approx.) | Speed | Quality reputation | BYO-key fit for BrainEdge |
|---|---|---|---|---|---|
| **OpenAI GPT Image** (gpt-image-1-mini / 1.5 / 2) | GA, self-serve, Images API. DALL·E 2/3 were **removed from the API May 12, 2026** — GPT Image line only | gpt-image-1-mini from ~$0.005; gpt-image-1.5 ~$0.009 (low) – $0.04 (std); gpt-image-2 ~$0.006 (low) / ~$0.053 (med) / ~$0.21 (high) per 1024² | 10–40 s | Excellent text rendering, instruction following; flagship quality | **Excellent** — key already stored (`p_openai`), simple sync REST, base64 or URL response |
| **Google Gemini image** ("Nano Banana" 2.5 Flash Image; Nano Banana Pro / Gemini 3 Pro Image) | GA on Gemini API (same key as Gemini chat) | ~$0.039/image (2.5 Flash Image); Gemini 3 Pro Image ~$0.134 (1K/2K) – $0.24 (4K); Imagen 4 Fast/Std/Ultra $0.02/$0.04/$0.06 | Fast (Flash tier ~5–15 s) | State of the art editing + multi-turn; Imagen 4 strong photorealism | **Excellent** — key already stored (`p_gemini`); image gen rides the normal `generateContent` shape |
| **Black Forest Labs FLUX** (FLUX.2 Klein / Pro / Max / Flex) | GA, self-serve at api.bfl.ai (credits, $0.01 = 1 credit) | Klein 4B ~$0.014 first MP; FLUX.2 Pro ~$0.03 first output MP; Max ~$0.07 first MP | Fast (Klein very fast) | Top open-weights lineage; great prompt adherence, photorealism | **Good** — but yet another key to manage; also reachable via OpenRouter/fal |
| **Stability AI** (SD3.x / image services) | GA, self-serve, credit-based ($0.01 = 1 credit; $20/mo membership w/ 6,000 credits) | Roughly $0.01–$0.08/image depending on model/service | Fast | Solid but no longer the quality leader | **OK** — extra key; lower priority |
| **OpenRouter** (image models incl. Gemini image, FLUX.2, GPT Image variants) | GA — image output via `/chat/completions` with `modalities: ["image","text"]` | Pass-through of upstream pricing + small margin | Same as upstream | Same models as upstream | **Excellent** — key already stored; one key covers OpenAI/Google/BFL image models |
| **fal.ai / Replicate** (aggregators) | GA, self-serve | fal: from ~$0.02–$0.03/image; Replicate: per-second GPU or per-image, community models from ~$0.002 | fal is latency-optimized | Hosts FLUX, Seedream, Qwen-Image, SDXL etc. | **Good** — one *new* key unlocks hundreds of models; fal also unlocks video (see below) |

### 1.2 Text → Video and Image → Video

| Provider | API availability | Price | Speed (typ.) | Quality reputation | BYO-key fit |
|---|---|---|---|---|---|
| **OpenAI Sora 2 / Sora 2 Pro** (Videos API) | Public since Sept 2025, **but deprecated — API shuts down Sept 24, 2026**; no announced successor API | Sora 2: $0.10/s @720p ($0.05 batch); Pro: $0.30–$0.70/s by resolution | 1–5 min, async (POST /videos → poll GET /videos/{id} or webhook) | Top-tier realism + native audio; i2v supported via `input_reference` (rejects human faces in input images) | **Poor right now** — building on a 3-month-to-sunset API is wasted work. Treat as "watch for successor" |
| **Google Veo 3 / 3.1 / 3.1 Lite** (Gemini API) | **GA, self-serve on the Gemini API** — t2v and i2v, reference images, start/end frames, native audio, async long-running operation w/ polling | Veo 3.1 Lite ~$0.03–$0.05/s; Veo 3 Fast ~$0.15/s (w/ audio); Veo 3 ~$0.40/s; 4K premium tiers exist | ~1–6 min, async poll until `done` | Best-in-class; 1080p w/ synchronized audio; scene extension to 140+ s | **Excellent** — same Gemini key users already have. **This is the anchor video provider** |
| **Runway** (Gen-4 Turbo / Gen-4.5) | GA developer API portal, credit-based ($0.01/credit) | Gen-4 Turbo 5 credits/s = $0.05/s; Gen-4.5 25 credits/s = $0.25/s | 1–3 min, async | Strong cinematic quality, great i2v/motion control | **OK** — separate key + separate credit wallet; good "pro" option later |
| **Kling** (3.0 / O1 / O3) | Official developer API exists (kling per-second credits, 720p/1080p); also widely resold (fal, EvoLink ~$0.075–$0.11/s) | ~$0.07–$0.12/s via resellers; official pricing credit-based | 2–6 min | Excellent motion/physics reputation, strong i2v | **OK via aggregator** — direct signup is China-based and clunkier; prefer via fal |
| **Luma Dream Machine** (Ray 2/3) | GA self-serve API (separate API wallet from consumer credits) | ~$0.32 per million pixels (Ray 2) ≈ $0.2–0.5 per 5 s 720p clip | 1–3 min | Good quality, friendly API | **OK** — extra key; mid-priority |
| **Pika** (2.2) | Legacy partner-only API; **modern route is via fal.ai** (~$0.05/s) | ~$0.05/s on fal | 1–3 min | Fun/stylized strengths | Via fal only |
| **fal.ai** (aggregator) | GA — hosts Veo 3, Sora 2, Kling (incl. exclusive Kling O1), Pika 2.2, Wan 2.5, Luma, etc. Queue API: submit → poll/webhook → result URL | Wan 2.5 from $0.05/s up to Veo 3 at $0.40/s | Latency-optimized | One key, ~600+ curated endpoints, uniform queue API | **Excellent as the single "everything else" key** |
| **Replicate** (aggregator) | GA — 50k+ community models, video incl. Wan, Hunyuan, LTX | Per-second GPU compute or per-output | Cold starts can hurt | Hit-or-miss community quality; great breadth | OK fallback; fal is the better primary aggregator |
| **OpenRouter video** | Veo 3.1 listed; video support is **new/partial** — image gen is solid, video coverage still thin vs fal | Pass-through | Same as upstream | Same as upstream | Watch — may eventually let one existing key do video too |

### 1.3 Video → Transcript

| Provider | API availability | Price | Speed | Limits / notes | BYO-key fit |
|---|---|---|---|---|---|
| **Groq Whisper** (whisper-large-v3 / v3-turbo) | GA, `/audio/transcriptions` (OpenAI-compatible) | **~$0.04/hour** (v3-turbo); $0.111/hr (v3) | **~228× realtime** — 60 min audio in ~16 s | 25 MB upload cap (URL param for larger); audio only — must extract from video; 10 s billing minimum; multi-channel multiplies cost | **Excellent** — key already stored; cheapest + fastest. **Default transcript engine** |
| **OpenAI** (whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe) | GA, same `/audio/transcriptions` endpoint | $0.006/min (whisper-1, gpt-4o-transcribe); $0.003/min (mini) | Fast (not Groq-fast) | 25 MB cap; gpt-4o-transcribe WER ~4.1% vs Whisper v3 ~5.3% | **Excellent** — existing key; quality fallback |
| **Google Gemini video understanding** | GA — upload the **whole video** (File API up to 20 GB paid / 2 GB free; inline ≤ 100 MB; HTTP URLs supported); model reads audio + frames | Standard Gemini token pricing (video ≈ tokens at 1 fps + 1 Kbps audio) | Minutes for long videos | **No audio extraction needed**; gives transcript *plus* visual summary, timestamps, Q&A | **Excellent** — existing key; the "smart transcript / summarize this video" option |
| **Local whisper.cpp** | Ship/download a binary + GGUF model (desktop only) | $0 — fully offline/private | ~realtime on CPU, faster w/ GPU | Requires 16 kHz mono WAV → needs ffmpeg; Electron-only (not web); model download ~75 MB–3 GB | **Great desktop differentiator**, P3 |

**ffmpeg reality check:** Whisper-style endpoints want *audio*, not video, and cap at 25 MB. A 10-minute MP4 easily exceeds that, but its audio extracted to 16 kHz mono Opus/MP3 is a few MB. So:
- **Desktop:** bundle or auto-download a static `ffmpeg` binary; run `ffmpeg -i in.mp4 -vn -ar 16000 -ac 1 -b:a 32k out.mp3` in the main process. Solves size limits for almost any video.
- **Web:** use `ffmpeg.wasm` (works, but ~30 MB wasm download, slow on big files, memory-bound around ~2 GB) **or** skip extraction and route web users to **Gemini File API** (accepts raw video up to 2 GB free / 20 GB paid). Gemini is the cleaner web path.

### 1.4 Aggregator strategy (one key for everything?)

**fal.ai pros:** single key + uniform queue API (submit → status → result URL) across image *and* video; hosts Veo, Sora 2, Kling, Pika, FLUX, Wan; latency-optimized; webhooks; often 30–50 % cheaper than rack-rate competitors for hosted OSS models.
**fal.ai cons:** another account/wallet for the user; pass-through premium on first-party models (Veo via fal ≈ Veo direct price); model deprecations follow upstream; ToS/content moderation layered on top.
**Replicate pros/cons:** unbeatable breadth (50k+ community models) but cold starts, variable quality, per-second GPU billing is harder to predict.
**OpenRouter:** already a stored BrainEdge key, now solid for **image** generation (`modalities` param) — meaning P1 image gen may need *zero* new keys for many users. Video support exists but is thin; don't bet P2 on it yet.

**Verdict:** *Hybrid.* Use **direct keys the user already has** (OpenAI, Gemini, Groq, OpenRouter) for the core path, and add **fal.ai as one optional "power-up" key** that unlocks Kling/Pika/Wan and price-shopping for video. Avoid requiring 5 new accounts.

---

## 2. Recommended architecture for BrainEdge

### 2.1 Wiring order (which providers first)

1. **Image:** Gemini 2.5 Flash Image (default — cheap, fast, existing key) → GPT Image (quality toggle, existing key) → OpenRouter image (covers users who only have an OpenRouter key) → BFL/Stability direct (later, optional).
2. **Transcript:** Groq whisper-large-v3-turbo (default) → OpenAI gpt-4o-mini-transcribe (fallback) → Gemini video understanding ("smart mode": transcript + summary + chapter timestamps, and the web-app path for big files) → local whisper.cpp (desktop, P3).
3. **Video:** Veo 3.1 Lite / Veo 3 Fast via Gemini API (default — existing key, $0.03–$0.15/s) → fal.ai (optional key: Kling, Pika, Wan 2.5, price tiers) → Runway/Luma direct (only if users ask). **Do not integrate the OpenAI Sora 2 API** (sunsets 2026-09-24); add its successor when announced.

### 2.2 Single aggregator vs direct

Direct-first, aggregator-second (see 1.4). Concretely: a `mediaProviders` registry parallel to the existing `providers` map in `electron/settings.cjs`, where each capability (image/video/transcribe) declares an ordered list of engines, each engine bound to an existing provider key id (`p_openai`, `p_gemini`, `p_groq`, `p_openrouter`, new `p_fal`).

### 2.3 Async queue/poll model (the big architectural shift)

Chat is request/stream; **video is submit/poll (1–6 minutes)**. Proposed shape:

- A **MediaJob** record: `{ id, capability, engine, params, status: queued|running|succeeded|failed, providerJobId, costEstimate, resultPath|resultBlobUrl, createdAt }`, persisted (desktop: userData JSON/SQLite; web: IndexedDB) so jobs survive reload/restart.
- A **poller** in the Electron main process (and a web worker on web) polls provider status endpoints with exponential backoff (2 s → 15 s). Veo: poll operation until `done`; fal: queue status endpoint; OpenAI Images: synchronous, no poll. Webhooks are *not* usable — BrainEdge has no server — so polling is the design, and that's fine.
- **Resume on launch:** on app start, re-poll any `running` jobs (provider job IDs are durable for hours on Veo/fal).
- UI: a "Creations" tray showing in-flight jobs with progress, cancel, and retry; generation must never block chat.

### 2.4 File handling: desktop vs web

- **Desktop:** download result MP4/PNG via main process to `~/BrainEdge/Creations/` (user-configurable); store path on the job; thumbnail in renderer. ffmpeg static binary for audio extraction + optional re-encode/thumbnail generation.
- **Web:** fetch result as Blob → object URL preview → `download` attribute save. No ffmpeg binary: either ffmpeg.wasm (small files only) or push video-transcript users to Gemini File API. Cap web uploads at ~100 MB inline / 2 GB File API and say so in the UI.
- **CORS note (web):** some provider endpoints (BFL, fal result URLs are usually CORS-friendly; others aren't). The desktop app has no CORS constraint; web may need to restrict engine list to CORS-permissive providers — verify per-endpoint during implementation.

### 2.5 Cost guardrails UX (essential for BYO-key)

- **Pre-flight estimate, always:** "8 s · Veo 3 Fast · 720p ≈ **$1.20**" shown *before* the Generate button confirms. Per-second video pricing makes silent costs dangerous ($0.40/s × 30 s = $12).
- Per-session and per-month **soft budget** (user-set, default e.g. $5/mo for video) with a hard confirm dialog beyond it; running spend meter in the Creations tray.
- Default to the **cheap tier** everywhere (gpt-image-mini / Gemini Flash Image, Veo Lite, Groq turbo); quality tiers are explicit upgrades with the price delta shown.
- Duration/resolution caps by default (video ≤ 8 s, 720p) with an "I know what I'm doing" unlock.
- Log every job's actual/estimated cost locally; never send telemetry.

---

## 3. Phased rollout

**P1 — Image gen + transcript (low risk, existing keys, mostly synchronous)**
- "Let's Create" mode shell + Creations tray + MediaJob store.
- Text→image: Gemini Flash Image (default), GPT Image, OpenRouter image. Save/download, regenerate, simple edit-by-prompt (Gemini's multi-turn editing).
- Video→transcript: Groq turbo (desktop, via ffmpeg audio extraction), OpenAI fallback, Gemini File API path (web + "smart summary" mode). SRT/TXT/MD export.
- Cost estimator + budget settings.

**P2 — Video (async infra)**
- Poller + resumable jobs. Text→video and image→video on **Veo 3.1 (Lite default, Fast/Quality tiers)** via Gemini key.
- Optional **fal.ai key** in Settings unlocking Kling / Pika 2.2 / Wan 2.5 + a price-comparison picker.
- Image→video chaining: any P1 generated image can be sent as a Veo/Kling start frame.

**P3 — Polish & differentiation**
- Local whisper.cpp engine (desktop, offline/private transcription).
- Watch list: Sora successor API, OpenRouter video maturity, Runway/Luma direct if demanded.
- Batch-tier toggles (OpenAI batch ≈ 50 % off; Gemini batch 50 % off images) for non-urgent jobs.

---

## 4. Honest risks

1. **API churn is brutal in this space.** DALL·E 2/3 *removed* from the API in May 2026; Sora 2 API *sunsets Sept 24, 2026* with no committed successor. Any hard-coded model ID will rot — keep model lists data-driven and remotely-updatable (or at least trivially patchable).
2. **Pricing volatility.** Veo pricing has shifted across 3.0→3.1→Lite tiers within months; Runway changed plan inclusions twice in six months. Cost estimates must be config, not constants, and labeled "estimate."
3. **Regional/account limits.** Veo and GPT Image impose org verification for some tiers; Kling direct API is China-centric; some providers gate by region or require billing history. The UI must surface provider errors ("your key doesn't have Veo access") legibly rather than failing silently.
4. **Content policy mismatch.** Each provider moderates differently (e.g., Sora rejects input images containing human faces; Gemini/OpenAI block various prompt classes). BrainEdge must pass through refusals clearly and never retry-loop a blocked prompt.
5. **Web app is second-class for media.** No ffmpeg binary, CORS unknowns per endpoint, blob memory limits on long 1080p videos. Set expectations: desktop is the full experience; web covers image gen + Gemini-based transcription cleanly.
6. **Cost shock liability.** Per-second video billing on a user's own card is the #1 way to lose trust — the guardrail UX in §2.5 is not optional.
7. **Aggregator dependency.** If fal becomes the de-facto video path, BrainEdge inherits fal's uptime, markup, and model-removal decisions; keeping the Gemini-direct Veo path primary hedges this.
8. **25 MB transcription cap** means ffmpeg extraction is load-bearing on desktop; bundling ffmpeg adds ~80–120 MB or requires a first-run download step (license: use the LGPL static build or download-on-demand to keep the installer lean).

---

## 5. Sources

- OpenAI API pricing: https://openai.com/api/pricing/ and https://developers.openai.com/api/docs/pricing
- OpenAI GPT Image pricing breakdown (incl. DALL·E API removal May 12, 2026): https://costgoat.com/pricing/openai-images and https://www.aifreeapi.com/en/posts/openai-image-generation-api-pricing
- OpenAI Sora video generation guide (Videos API, polling, `input_reference`): https://developers.openai.com/api/docs/guides/video-generation
- Sora 2 API sunset (Sept 24, 2026) + tier pricing: https://costgoat.com/pricing/sora and https://platform.openai.com/docs/models/sora-2
- Gemini API pricing (Veo, Imagen, Gemini image models): https://ai.google.dev/gemini-api/docs/pricing
- Veo 3.1 in Gemini API (i2v, reference images, polling): https://ai.google.dev/gemini-api/docs/video and https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/
- Veo pricing tiers: https://costgoat.com/pricing/google-veo
- Gemini video understanding + File API limits (20 GB paid / 2 GB free; 100 MB inline): https://ai.google.dev/gemini-api/docs/video-understanding and https://blog.google/innovation-and-ai/technology/developers-tools/gemini-api-new-file-limits/
- Imagen 4 / Gemini image pricing comparison: https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai
- Black Forest Labs FLUX pricing: https://bfl.ai/pricing and https://docs.bfl.ml/quick_start/pricing
- Stability AI platform pricing: https://platform.stability.ai/pricing
- OpenRouter image generation docs (`modalities` param): https://openrouter.ai/docs/guides/overview/multimodal/image-generation and https://openrouter.ai/collections/image-models
- Runway API pricing (credits, $0.01/credit, Gen-4 Turbo 5 credits/s): https://docs.dev.runwayml.com/guides/pricing/
- Luma Dream Machine API pricing: https://lumalabs.ai/pricing and https://lumalabs.ai/learning-hub/dream-machine-support-pricing-information
- Kling API pricing (official + resellers): https://evolink.ai/blog/is-kling-ai-free-pricing-plans-guide
- Pika API now powered by fal: https://blog.fal.ai/pika-api-is-now-powered-by-fal/ and https://pika.art/api
- fal.ai platform + pricing: https://fal.ai/ and https://costbench.com/software/ai-ml-platforms/fal/
- fal vs Replicate comparisons: https://www.teamday.ai/blog/fal-ai-vs-replicate-comparison and https://pricepertoken.com/image
- Groq Whisper speech-to-text docs (25 MB cap, URL param, $0.04/hr turbo): https://console.groq.com/docs/speech-to-text and https://console.groq.com/docs/model/whisper-large-v3-turbo
- OpenAI transcription models (gpt-4o-transcribe $0.006/min, 25 MB cap): https://developers.openai.com/api/docs/models/gpt-4o-transcribe and https://costgoat.com/pricing/openai-transcription
- whisper.cpp + ffmpeg 16 kHz mono workflow: https://whipscribe.com/tools/whisper-cpp and https://medium.com/@vpalmisano/run-whisper-audio-transcriptions-with-one-ffmpeg-command-c6ecda51901f
