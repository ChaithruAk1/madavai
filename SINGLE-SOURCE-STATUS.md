# Madav — Single-Source Status: The Full Map (plain English)

_Last updated: 18 June 2026. Built from a full sweep of the code, not from memory._

## The goal, and an honest reality check
Madav is two apps — a **web app** and a **desktop app** — from one project. The goal is for **one shared "brain" (the logic, the rules, and the screens) to power both**, so work is done once and both apps get it.

**The honest ceiling:** a web browser and a desktop computer are fundamentally different machines. A browser is not allowed to run a terminal, launch local AI models, or open files on your hard drive the way the desktop can. So a thin layer of **plumbing** (how code actually runs, where files and passwords are stored) will always differ between the two — on purpose, not by neglect.

So "everything one source" realistically means: **every screen and all the decision-making logic is shared; only the unavoidable plumbing differs, kept as small as possible.** That's exactly what your architecture plan calls for.

---

## ✅ Already ONE shared source (done)
- **The entire Interface — every screen and button.** Chat view, sidebar, settings, dialogs, model picker, file previews. The whole look-and-feel is one shared app used by both. *(This is the "Interface" you asked about — essentially done.)*
- **The chat engine ("Let's Chat").** Web: fully live. Desktop: now running the shared engine, with a small final cleanup pending.
- **The "discipline" helpers** behind chat (cleaning up messy AI replies, trimming huge outputs, stopping loops, summarising long chats).
- **The AI's core instruction-rules** for chat.
- **The document/office RULES** (how the AI is told to build Word/Excel/PDF/slides) are written as one shared source — just not switched on yet.

---

## 🔶 Screens shared, but the engine behind them still has TWO copies
These all use the shared Interface, so they *look* unified — but the working logic underneath is still duplicated and needs merging:
- **Let's Collaborate** (working inside a folder). *Note: the web side already runs on the shared engine; the desktop side does not yet — so this one is half-migrated.*
- **Let's Build** (the bigger build workflow / terminal-style work).
- **Projects / Workrooms.**
- **Team mode** (several agents working together).
- **Knowledgebase / Sage** (the knowledge the AI draws on).
- **Building the actual office files** (Word/Excel/PDF/slides — the *rules* are shared, the *building* is not).
- **Skills, Scheduler, Connectors, Deep Research, Image generation, Agent memory** — shared screens, but separate behind-the-scenes logic on each side.

---

## ⬜ The road ahead — the planned next stages (still two copies)
In the same careful, one-at-a-time order:
1. **Let's Collaborate** (finish the desktop side).
2. **Let's Build / Projects / Workrooms.**
3. **Team mode.**
4. **Switch on the shared document/office rules.**
5. **The behind-the-scenes services** (agent memory, skills, scheduler engine, connectors, deep research) — merged where it makes sense.

---

## 🖥️ Desktop-only by nature (cannot move to the web — by physics, not a gap)
The browser isn't permitted to do these, so they can't be "one source" — the desktop simply does more here:
- The **built-in terminal** and running real shell commands.
- Running **local AI models** on your own machine (Ollama, LM Studio).
- A few **OS-level extras** (e.g. the Telegram bridge, Windows voice).
Where possible, the web app does a safe equivalent — for example, it runs Python inside a sealed sandbox in the browser instead of on your machine.

---

## So — is your goal achievable?
**Yes, for everything that matters:** all the screens and all the decision-making logic can become one shared source. We're doing it in stages, and **stage one (chat) — the biggest and riskiest — is essentially done.** What remains is merging the engines behind the other modes, plus the behind-the-scenes services. A small, unavoidable bit of plumbing stays per-platform by design, and we keep it as thin as possible.

## What I recommend next
1. Finish the desktop chat cleanup that's already in flight (the step you're test-driving).
2. Then I'll give you a **stage-by-stage plan** for unifying the rest — in priority order, each done the same safe, reversible way — until the whole app's brain is one source.

You can also point at **any single feature** in this list and I'll merge that one next — your call on priorities.

---

_Technical note (for our work together): shared brain lives in `core/` and the shared UI in `src/**`. The still-duplicated engines live in `electron/*.cjs` (desktop) and `src/bridge/webBridge.js` + `server/*.mjs` (web). This map was built from a code sweep; if you want, I can verify any single feature's exact files before we touch it._
