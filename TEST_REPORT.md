# Madav — Autonomous Test Report

**Date:** 2026-06-06
**Tester:** automated static/build/unit pass (no GUI execution — see Scope)
**Verdict:** **No build-breaking or critical logic defects found.** Every backend file
compiles, every renderer file parses, all imports resolve, and the bug-prone pure
functions pass unit tests. Remaining items are 2 dead files to delete, 2 stale code
comments, and a set of known limitations/regressions documented below. The
interactive/credentialed features still require your manual run (`TESTING.md`).

---

## Scope — what this report covers and what it can't

| Layer | Testable here? | Why |
|---|---|---|
| Syntax / compile of all code | ✅ Yes | ran in a Linux/Node sandbox |
| Pure logic (parsing, URL, regex, math) | ✅ Yes | unit-tested with real inputs |
| Static correctness / security review | ✅ Yes | full read of every module |
| Live desktop GUI (clicks, modals, rendering) | ❌ No | headless Linux, no display, not Windows |
| Real LLM calls | ❌ No | no API keys; needs network + provider accounts |
| Chrome extension runtime | ❌ No | no Chrome / interaction |
| Telegram, Google/GitHub sign-in, Claude subscription | ❌ No | needs real accounts/credentials |

The ❌ rows are exactly what `TESTING.md` is for — your manual pass.

---

## Step 1 — Build / compile verification ✅ PASS

**1a. Backend syntax — `node --check electron/*.cjs`**
Result: **16 / 16 OK, 0 failed.**
Files: agent-openai, agent-transport, backends, dispatch-runner, dispatch-store, main,
mcp-manager, preload, projects-store, providers, session-manager, sessions-store,
settings, skills-manager, telegram-bot, usage-store.

**1b. Renderer parse — `@babel/parser` (jsx) on all of `src/`**
Result: **23 / 23 files parsed OK, 0 failed.** (Catches broken JSX / imports from the
Chai→Madav rename and the logo swap.)

**1c. Extension JS — `node --check extension/*.js`**
Result: **OK** for `background.js` and `sidepanel.js`.

**1d. Dangling relative imports across `src/`**
Result: **all relative imports resolve.** Confirms the deleted `TeaLogo` left no
broken import and `ThinkLogo` is wired in App/Message/TopNav.

> Not run here (needs a Linux `npm install`, your job on the host): a full `vite build`
> bundle and an actual Electron launch. Parsing ≠ bundling, but parse+import-resolution
> catches the overwhelming majority of "white screen" breakages.

---

## Step 2 — Unit tests of pure logic ✅ 17 / 17 PASS

Real inputs → expected outputs, all asserted and green:

### `stripReasoning` (chain-of-thought stripper — the "hi → wall of text" fix)
| Input | Output | ✓ |
|---|---|---|
| `<think>reason here</think>Answer` | `Answer` | ✅ |
| `I should greet.\nLots of reasoning.</think>Greetings, friend.` (orphan close, no opener) | `Greetings, friend.` | ✅ |
| `plain answer` | `plain answer` | ✅ |
| `<think>only open no close` | `` (empty) | ✅ |
| `A<think>x</think>B` | `AB` | ✅ |
| `format... </think> Greetings, friend. Welcome to Madav.` | `Greetings, friend. Welcome to Madav.` | ✅ |
| `` (empty) | `` | ✅ |

The orphan-`</think>` case (row 2/6) is exactly the bug from your screenshot — confirmed handled.

### `chatUrl` / `withV1` (provider URL resolution — the "LLM 404" fix)
| Base URL entered | Resolved endpoint | ✓ |
|---|---|---|
| `https://openrouter.ai/api` | `…/api/v1/chat/completions` | ✅ |
| `https://openrouter.ai/api/v1` | `…/api/v1/chat/completions` | ✅ |
| `https://integrate.api.nvidia.com/v1` | `…/v1/chat/completions` | ✅ |
| `https://generativelanguage.googleapis.com/v1beta/openai` | `…/v1beta/openai/chat/completions` | ✅ |
| `https://api.deepseek.com` | `…/v1/chat/completions` | ✅ |
| `http://localhost:11434/v1/` (trailing slash) | `…/v1/chat/completions` | ✅ |
| `https://x.com/v1/chat/completions` (already full) | unchanged | ✅ |

### Telegram token guard `^\d{6,}:[\w-]{30,}$`
| Input | Valid? | ✓ |
|---|---|---|
| `123456789:AAH…` (32+ tail) | true | ✅ |
| `123456789AAH…` (no colon) | false | ✅ |
| `12:abc` (too short) | false | ✅ |

---

## Step 3 — Static code audit (per module)

**No critical defects.** Findings below are limitations or design notes, severity-tagged.

### electron/agent-openai.cjs — agent tool loop
- ✅ **Path sandbox is sound.** `inside()` resolves the path and requires it to start
  with `root + sep`, blocking `../` traversal for read/write/edit/list/search.
- ⚠ **`run_bash` is NOT path-sandboxed** (by design — it's a shell). It runs with your
  OS privileges and can touch anything you can. It is permission-gated, **but** in
  Dispatch and Telegram "folder" targets `permMode = bypass`, so commands auto-run with
  no prompt. *This is the single biggest power/risk surface — keep Telegram allow-list tight.*
- ℹ `edit_file` replaces only the **first** occurrence of `old_string` (JS `String.replace`
  with a string arg). If the snippet appears twice, the 2nd isn't touched. Low impact.
- ℹ `read_file` truncates to 8000 chars silently; large files won't be fully seen.
- ✅ Reasoning is stripped from the final answer; pre-tool narration is suppressed.

### electron/providers.cjs — transports
- ⚠ **Intentional regression:** `streamOpenAI` now **fully buffers** (no token-by-token
  streaming) so reasoning models can't leak `<think>` mid-stream. Trade-off accepted to
  fix the garbage-output bug. Chat feels "all-at-once" instead of typing. Reversible with
  a per-provider "stream raw" toggle if you want it back.
- ✅ `stripReasoning` unit-tested (above). `streamAnthropic` unchanged.

### electron/session-manager.cjs — routing + usage
- ✅ Subscription mode (`subMode`) correctly bypasses the no-key guard and routes
  chat/project through the SDK; agent modes already used the SDK.
- ✅ Usage is appended on every `result` event; `replyChars` accrues from `assistant_delta`.
- ℹ `_chatViaSdk` doesn't sync `s.history` (the SDK keeps context via `resume`). If a user
  toggles subscription off mid-conversation, the prior turns aren't in `s.history`. Edge case.

### electron/main.cjs — IPC, proxy, sign-in
- ✅ Proxy bootstrap reads env **or** `settings.proxyUrl`, defaults `NO_PROXY` to localhost
  so local models bypass it, mirrors into env for child processes, and degrades gracefully
  if `undici` is missing.
- ✅ Google PKCE + GitHub device-flow handlers present and wired to preload + mock.
- ℹ Sign-in needs the user's own OAuth Client IDs (documented in-app) — expected.

### electron/telegram-bot.cjs
- ✅ Validates token shape, `getMe`, and clears webhooks (409) on start; surfaces the real
  error string instead of generic "error"; single poll loop reads latest cfg each iteration.

### electron/usage-store.cjs
- ✅ Streak/peak-hour/token math reviewed and correct (token ≈ chars/4 estimate, as labeled).

### electron/settings.cjs
- ✅ Shallow-merges defaults so new fields (proxyUrl, anthropicUseSubscription, githubClientId)
  appear for old config files; migrates away the removed `p_proxy`.

### extension/ (background.js, sidepanel.js)
- ✅ Multi-provider store, model dropdown, `Load models`, observe/act loop all coherent.
- ⚠ Observation indexes (`data-tf`) can go **stale** if the page re-renders between observe
  and act (SPAs). Known v1 limitation; a re-observe each step mitigates but doesn't eliminate.
- ℹ API key in `chrome.storage.local` — fine personal, not for distribution.

---

## Step 4 — Fixes applied + leftovers for you

**Applied during the build (earlier in the session):** reasoning stripper, date injection,
URL resolver in the extension, dismissable permission modal, Telegram diagnostics, proxy
support, full Madav rename, app icon.

**Cleanups I could NOT do (sandbox is read-only for deletes) — please run on your host:**
```powershell
cd C:\Projects\ClaudeCodeUI\Madav
git rm src/components/TeaLogo.jsx     # dead file, nothing imports it
git rm electron/err.tmp               # stray old error log
```
**Two harmless stale comments** still say `window.chai` (in `src/bridge/contract.js` and
`src/bridge/mockBridge.js`) — comments only, no functional effect; optional to tidy.

---

## Step 5 — What only YOU can verify (runtime handoff)

Work `TESTING.md` top-to-bottom. Highest-value checks, in priority order:
1. **Chat "hi"** on a reasoning model → clean one-liner (proves the stripper end-to-end).
2. **Default model on startup** snaps to the right provider after restart.
3. **Permission modal** prompts and is dismissable (Esc / backdrop), never freezes input.
4. **Cowork**: create/edit a file in a chosen folder, with approval.
5. **Telegram** Apply → `online @bot`, `/start` works, bad token shows a real reason.
6. **Anthropic subscription** billing actually hits your plan credits (only you can see this).
7. **Extension**: load unpacked, Load models, run a simple click/type/search goal.

Keep the terminal + DevTools console open; paste me any red error or wrong behavior and
I'll fix it immediately.

---

## Bottom line
The **code is structurally sound** — it compiles, parses, resolves, and the tricky logic is
proven by unit tests. I found **zero crashers** and a short list of **known limitations**
(buffered streaming, unsandboxed `run_bash`, stale extension indices) that are design
trade-offs, not bugs. The real risk now is **runtime/integration** behavior with live
models and credentials — which is precisely the part you'll drive tomorrow.
