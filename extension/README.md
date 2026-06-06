# Thinkflux for Chrome (browsing agent)

A Manifest V3 Chrome extension: a side‑panel agent that reads the active tab and
clicks / types / navigates for you, driven by **your own** OpenAI‑compatible LLMs.
It has the same multi‑provider + model‑selector concept as the Thinkflux desktop app.

It's independent of the desktop app — keys live in `chrome.storage`, and it only
touches the page you point it at. It cannot read files or run shell commands
(browser sandbox); it's purely a web agent.

## Setup

### 1. Load the extension (personal Chrome)
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top‑right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin the extension and click its icon — the **side panel** opens.

> Managed/corporate Chrome usually blocks unpacked extensions by policy. This is
> built for a personal browser unless your IT allow‑lists it.

### 2. Configure providers (⚙)
Click the gear. You get a provider editor pre‑loaded with **OpenRouter, NVIDIA NIM,
Gemini, DeepSeek, Ollama, and LM Studio**. For each one you want to use:
1. Pick it in **Edit provider**.
2. Paste its **API key** (leave blank for local Ollama / LM Studio).
3. Click **Load models** to fetch and cache that provider's model list.
4. **Save**.

Add your own endpoints with **+ Add** (any OpenAI‑compatible base URL). The base
URL can omit `/v1` — it's added automatically. Quick reference:

| Provider     | Base URL                                            |
|--------------|-----------------------------------------------------|
| OpenRouter   | `https://openrouter.ai/api/v1`                      |
| NVIDIA NIM   | `https://integrate.api.nvidia.com/v1`               |
| Gemini       | `https://generativelanguage.googleapis.com/v1beta/openai` |
| DeepSeek     | `https://api.deepseek.com/v1`                       |
| Ollama       | `http://localhost:11434/v1`                         |
| LM Studio    | `http://localhost:1234/v1`                          |

### 3. Pick a model and run
Choose the active model from the dropdown under the header (grouped by provider;
the green dot shows the active provider has a key or is local). Open any web page,
type a goal, press ▶.

## Examples
- "Find the pricing page and tell me the cheapest plan."
- "Type 'wireless headphones' into the search box and search."
- "Summarize this article in 3 bullets." (uses page text, no actions)

## How it works
`sidepanel.js` runs an observe → decide → act loop. Each step the service worker
(`background.js`) injects a function into the tab that lists the visible interactive
elements; the active model returns ONE JSON action; the worker executes it. Repeats
up to 14 steps or until the model says `done`.

## Troubleshooting
- **`404 … (empty → wrong URL or model)`** — base URL missing `/v1` (now auto‑added,
  reload the extension) or an invalid model id. Use **Load models** to pick a valid one.
- **`No API key for …`** — open ⚙ and add the key for the active provider.
- **Picks wrong elements / loops** — use a stronger instruct model; weak models
  struggle with element selection.
- After editing any file here, click the **reload ↻** on the extension card in
  `chrome://extensions`.

## Limits
- Text/accessibility based — no screenshot/vision step yet.
- Single active tab; it won't open new tabs unless it chooses to `navigate`.
- API key is stored in `chrome.storage.local` (fine for personal use, not for sharing).
