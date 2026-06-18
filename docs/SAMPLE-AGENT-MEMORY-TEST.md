# Agent memory + track record — manual test (detailed)

Goal: prove a custom agent (1) **saves** a durable learning via the `remember` tool, (2) **recalls** it on a
later run (injected into its system prompt), and (3) accrues a **track record**. Includes a deterministic
check that works even if your model won't call tools.

## Prereqs
- Web app running (`npm run dev` + `node server/auth-server.mjs`), signed in.
- **Use a tool-capable model** (OpenAI-style function calling) so the agent can call `remember`. If your model
  doesn't support tools, skip to **Part E** (seed memory directly) — the recall half still proves out.
- The test agent **must have instructions** (memory is attached to the agent's instruction block; an agent
  with no instructions gets no memory block — by design).

## Part A — Create the agent
1. Go to **Agents** → New agent.
2. Name: **`Coach`**. Leave **Files** and **Shell** tools **off** (so it opens as a plain chat agent).
3. Instructions: `You are a concise fitness coach. Give practical, specific advice.`
4. Save.

## Part B — Run 1: teach it (the `remember` tool)
1. Launch **Coach** (its Run/▶ action opens a fresh chat seeded with the agent).
2. Send: **`Remember that I prefer metric units (km, kg, °C).`**
3. **Expect:** a tool step **`remember`** appears, and the reply confirms something like *"Saved to your agent
   memory."* (If no tool step appears, your model isn't calling tools — use Part E.)

## Part C — Run 2: it recalls (fresh chat, SAME agent)
1. Launch **Coach** again (a NEW chat — this is the key: memory must survive across sessions).
2. Send: **`What's a good running distance for a beginner?`** (note: you did NOT mention units this time)
3. **Expect:** the answer uses **kilometers** (e.g. "start with 2–3 km"), applying the remembered preference
   without being told again.

## Part D — Prove it in devtools (the reliable checks)
Open devtools (F12 / Ctrl+Shift+I).

**D1 — the stored memory (Console):**
```js
JSON.parse(localStorage.getItem("be.agentMemory") || "{}")
```
**PASS:** you see `{ "<agentId>": { notes: [{ text: "the user prefers metric units…" }], runs: <N>, ok, fail, lastRunAt } }`.
`notes` holds the learning; `runs` is the track record (it went up each time you launched Coach).

**D2 — it's injected into the prompt (Network):** with Run 2 open, send another message; click the chat
request (`POST …/chat/completions` or `POST /proxy/chat`) → **Request payload** → the **system** message
(`messages[0]`). **PASS:** it contains **"What you've learned from past runs"** + your note, and a line
**"(Track record: N prior runs.)"**.

## Part E — Deterministic recall test (no reliance on the model calling `remember`)
Use this if your model won't call tools, or to test recall in isolation.
1. Find the agent id (Console):
```js
(JSON.parse(localStorage.getItem("be.settings")||"{}").agents||[]).map(a => ({ id: a.id, name: a.name }))
```
2. Seed a memory for that agent (replace `<AGENT_ID>`):
```js
const id = "<AGENT_ID>";
const m = JSON.parse(localStorage.getItem("be.agentMemory") || "{}");
m[id] = { notes: [{ text: "the user prefers metric units (km, kg, °C)", ts: Date.now() }], runs: 1, lastRunAt: Date.now(), ok: 1, fail: 0 };
localStorage.setItem("be.agentMemory", JSON.stringify(m));
```
3. **Reload the page**, launch **Coach**, and ask the distance question (Part C step 2).
4. **PASS:** the answer uses km, and Part D2 (Network → system message) shows the seeded note + track record.

## Edge cases / gotchas
- **No instructions → no memory.** An agent with an empty Instructions field gets no memory block (the block
  rides on the instruction block). Give the agent instructions.
- **Non-tool model → `remember` won't auto-fire.** Recall (Parts C–E) still works once a note exists; only the
  agent-driven *save* needs tool support.
- **Per-agent + device-local.** Memory is keyed by the agent's id and stored in this browser's localStorage;
  another browser won't have it yet (account-wide sync is a later follow-up).
- **Track record counts launches.** `runs` increments once per fresh agent launch (new session), not per
  message within the same chat.

## Pass / fail checklist
- [ ] Run 1 shows a `remember` tool step + a "saved" confirmation (tool-capable model).
- [ ] `be.agentMemory` (Console) holds the note under the agent's id, with `runs` ≥ 1.
- [ ] Run 2 (fresh chat) answers in km without being reminded.
- [ ] Network: the agent's system message carries "What you've learned from past runs" + "Track record: N prior runs".
- [ ] Edge: an agent with no instructions shows no memory block.
- [ ] Automated: `npx vitest run tests/parity` → `119 passed` (incl. the 6 `agent-memory` tests).
