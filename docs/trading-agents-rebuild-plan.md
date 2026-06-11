# EdgeTrader: Rebuilding the TradingAgents Concept on Madav

**Status: PROPOSAL — awaiting approval. No build started.**
Date: 2026-06-11

---

## 1. What TradingAgents actually does (and what it costs in complexity)

TradingAgents (TauricResearch) simulates a trading firm per (ticker, date):

```
4 Analysts (Market/Technical, Sentiment, News, Fundamentals)
   → Bull vs Bear researcher debate
   → Research Manager (judge, deep LLM) → investment plan
   → Trader → BUY/HOLD/SELL proposal
   → 3 Risk debators (Aggressive/Conservative/Neutral)
   → Portfolio Manager (judge, deep LLM) → final 5-tier rating
   + reflection/memory loop fed by realized returns
```

That's ~12 LLM roles wired through LangGraph with significant accidental complexity:

| TradingAgents pain point | Evidence in repo |
|---|---|
| Manual string-concatenation state; full reports re-pasted into every downstream prompt | `agent_states.py` — unbounded `history` strings, massive token duplication |
| Turn-taking via magic strings (`startswith("Bull")`, `startswith("Aggressive")`) | `conditional_logic.py` |
| Extra LLM call just to parse BUY/SELL out of prose | `signal_processing.py` |
| Shared message channel forces "Msg Clear" nodes + placeholder hacks per analyst | `agent_utils.py create_msg_delete()` |
| Tool-calling analysts hallucinated data they had no tool for (verified, issue #557) — fixed upstream by pre-fetching data deterministically | `sentiment_analyst.py` redesign |
| Vendor/provider abstraction sprawl: 2 data vendors × 9 methods × fallback chains, 10 LLM providers | `dataflows/interface.py`, `llm_clients/` |
| Reflection loop disconnected — caller must compute returns and call it manually | `reflection.py` |

The *valuable* ideas to keep: specialist analysis perspectives, the adversarial bull/bear debate (highest-value step per the paper's ablations), a risk check before the final call, deep-think models only at judge points, and outcome-based reflection memory.

## 2. What Madav already gives us for free

| TradingAgents builds by hand | Madav equivalent |
|---|---|
| LangGraph orchestration, state schema, conditional edges | **Teams** (Relay = sequential, Managed = coordinator + parallel + re-planning), mission checkpointing, crash-safe resume |
| LLM client factory for 10 providers, deep/quick split | Provider-agnostic agent loop; **per-agent pinned models** (cheap model for analysts, strong model for judges) |
| ChromaDB/BM25 memory + reflection plumbing | **Per-agent durable memory** (post-mission learnings auto-injected into prompts) |
| Rich CLI for live progress | **Mission Control** live floor, agent cards, run history, token stats |
| Cron-less manual runs | **Scheduler** (cron triggers) + **Webhooks** |
| Custom tool wrappers per data method | **MCP connectors** + **Skills** (SKILL.md playbooks) + built-in browser tool |
| Hand-rolled human-in-the-loop | `ask_user()` tool + "ask first" permission mode |

So the rebuild is mostly *configuration plus one small MCP server*, not a framework.

## 3. Proposed design — "EdgeTrader"

### 3.1 Core simplification: 12 roles → 6 agents

The single biggest lesson from upstream's own evolution: **pre-fetch data deterministically, then let agents reason over it.** We adopt that everywhere.

| # | Agent | Model tier | Role | Replaces in TradingAgents |
|---|---|---|---|---|
| 1 | **Quant Analyst** | quick | Reads pre-fetched price/indicator data (50/200 SMA, MACD, RSI, Bollinger, ATR, volume) → technical report with explicit signal table | Market Analyst + its tool loop + msg-clear nodes |
| 2 | **Context Analyst** | quick | Reads pre-fetched fundamentals + news + sentiment in one pass → fundamentals/news/sentiment report | Fundamentals + News + Sentiment Analysts (3→1; they all do "summarize fetched data" — one strong prompt with three sections does it better and cheaper) |
| 3 | **Bull** | quick | Strongest possible bull case from both reports; one rebuttal turn | Bull Researcher |
| 4 | **Bear** | quick | Strongest possible bear case; one rebuttal turn | Bear Researcher |
| 5 | **Risk Critic** | quick | Single adversarial pass on the draft decision: position sizing, drawdown scenarios, what-would-invalidate-this, devil's advocate | All 3 risk debators (Aggressive/Conservative/Neutral see identical inputs and largely paraphrase — one structured critic prompt with required sections covers the same ground in 1 call instead of 3+) |
| 6 | **Chief Strategist** (team coordinator) | deep | Judges the debate, weighs the risk critique, issues the final structured verdict | Research Manager + Trader + Portfolio Manager (the three are sequential refinements of one decision — collapsing them removes two LLM hops and the duplicate "judge" pattern) |

LLM calls per run: TradingAgents default ≈ 14–18 (incl. tool loops + signal extraction). EdgeTrader ≈ 7–8. No signal-extraction call: the Chief Strategist is required to end with a fixed JSON block (verdict, conviction 1–10, time horizon, entry/invalidation levels) parsed by regex — no LLM needed.

### 3.2 Data layer: one small MCP server (the only code we write)

`finance-data` MCP server (Python/FastMCP, ~200–300 lines, yfinance + stockstats — both free, no API keys):

- `get_snapshot(ticker)` — price history (1y daily), pre-computed indicator table, key stats
- `get_fundamentals(ticker)` — income/balance/cashflow highlights, valuation ratios
- `get_news(ticker, days)` — Yahoo Finance headlines + summaries
- `resolve_outcome(ticker, decision_date, horizon_days, benchmark)` — realized return + alpha vs SPY (powers the reflection loop)

Sentiment: instead of StockTwits/Reddit API plumbing, the Context Analyst uses Madav's **built-in browser tool** to skim 1–2 public pages (e.g. StockTwits ticker page), with the allowlist limited to known finance domains. Zero extra code; honest about source quality.

Optional later: swap/add Alpha Vantage or FinnHub behind the same MCP tool names — agents never change.

### 3.3 Orchestration: one Managed team

**Team "EdgeTrader"** — Managed mode, Chief Strategist as coordinator:

```
Mission input: ticker (+ optional date/context)
Phase 1 (parallel): Quant Analyst ‖ Context Analyst   → 2 reports
Phase 2 (sequential): Bull → Bear → Bull rebuttal → Bear rebuttal  (fixed 2 turns each — no counter logic, no magic strings)
Phase 3: Chief Strategist drafts decision → Risk Critic challenges it
Phase 4: Chief Strategist final verdict (structured JSON block) + full report saved to working folder
```

State passing = Madav's native handoff (each agent receives prior outputs as mission context). Debaters receive the two reports + opponent's last message only — not the entire accumulated transcript — killing the token-duplication problem.

### 3.4 Memory & reflection (TradingAgents' best current idea, kept)

- `decisions/decision-log.md` in the working folder: append-only entries `[date | ticker | verdict | conviction | pending]` — mirrors upstream's `TradingMemoryLog`.
- **Scheduled task (weekly)**: a small "Reflector" run calls `resolve_outcome()` for pending entries past horizon, writes realized return/alpha, generates a 2–4 sentence lesson, and stores it in the **Chief Strategist's Madav agent memory** (and a lesson for Bull/Bear when the debate's losing side was right).
- On each new run, recent same-ticker decisions + top cross-ticker lessons are injected automatically via agent memory — no Chroma/BM25, no embeddings.

### 3.5 Skills (playbooks instead of hard-coded prompts)

Three SKILL.md files in the skills folder (auto-discovered):

1. `equity-analysis/SKILL.md` — indicator-interpretation guide, report template with mandatory summary table (ports the analyst prompt discipline from upstream).
2. `adversarial-debate/SKILL.md` — rules: argue assigned side at full strength, attack opponent's weakest claim, cite specific numbers from reports, no hedging.
3. `verdict-format/SKILL.md` — the exact JSON output contract + 5-tier scale (STRONG BUY/BUY/HOLD/SELL/STRONG SELL), conviction rubric, "avoid defaulting to Hold without justification" (upstream's anti-Hold-bias instruction, which their ablations support).

Prompts live in editable skill files, not code — tunable from the Madav UI.

### 3.6 Multi-ticker batch runs & background execution

Unlike upstream (one ticker per `propagate()` call, foreground only), EdgeTrader is designed batch-first:

- **Input**: a watchlist — chat ("Analyze NVDA, AAPL, TSLA"), a `watchlist.txt`/CSV in the working folder, or a webhook POST.
- **Batch Runner**: a thin dispatcher (Madav mission per ticker) that queues N tickers and runs them as independent missions with a configurable concurrency limit (2–3 parallel; analysts within each mission already run parallel). Missions are checkpointed, so a crash mid-batch resumes where it left off.
- **Background execution**: runs fire via Madav's Scheduler (cron) or Webhooks with no user at the keyboard. Mission Control shows live progress if you happen to be watching; otherwise results land on disk.
- **Consolidated output**: per-ticker reports (`reports/<TICKER>-<date>.md`) plus one **digest** per batch (`reports/digest-<date>.md`): ranked table of all tickers — verdict, conviction, one-line thesis, key risk — sorted by conviction. Decision-log entries appended for every ticker.
- Optional: notification on batch completion (email/Telegram via an MCP connector) — decision point 6 below.

### 3.7 Trading-app integration (future provision, designed now)

Final verdicts are emitted as **machine-readable signals**, not just prose, so a broker can be attached later without reworking anything:

- Every run appends a structured record to `signals/signals.jsonl`: `{date, ticker, verdict, conviction, entry_zone, invalidation_level, horizon_days, report_path}`. This file IS the integration contract.
- **Execution Adapter interface** (defined now, implemented later): a deliberately thin seam — `propose_orders(signals) → order list` and `submit(order)` — to be backed by a broker MCP server (Alpaca, Zerodha/Kite, IBKR, etc. all have APIs; Alpaca paper-trading is the natural first target since it's free and fake-money).
- **Staged rollout when the time comes**: (1) signals file only — you trade manually off the digest; (2) paper-trading adapter — orders go to a simulated account, and realized paper P&L feeds the reflection loop (better learning signal than 5-day alpha); (3) live broker — only with mandatory human approval per order (Madav `ask_user()` / "ask first" permission mode), position-size caps, max-daily-order limits, and a kill-switch flag in config.
- Nothing in phases 1–6 blocks on this; the only build-now cost is the signals.jsonl writer (~trivial) and keeping the verdict schema stable.

To be clear about my own role: I can build this software, including the adapter code, but I won't ever place trades or move money myself — order submission always runs under your account, with your approval gates.

### 3.8 Triggers & output

- On-demand: chat → "Analyze NVDA" or "Run the watchlist".
- Scheduled: cron trigger, e.g. watchlist sweep every weekday 7:00 → batch run → digest + signals.
- Output per run: per-ticker report, batch digest, decision-log entry, signals.jsonl record. Mission Control shows teams live; track-record stats accrue per agent.

### 3.9 Safety rails (non-negotiable)

- **Phases 1–6 are analysis-only**; execution arrives only via the staged path in 3.7, never enabled by default.
- Live trading (stage 3) requires per-order human approval, hard position caps, and a config kill-switch. Reports carry a standing "information, not advice" disclaimer (consistent with Madav's existing Marketscout/Risklens stance).
- Permission mode "ask first" for shell/browser during initial runs; browser allowlist restricted to finance domains.

## 4. Build phases

| Phase | Work | Est. effort | Exit criterion |
|---|---|---|---|
| **1. Data MCP** | Build `finance-data` server (4 tools), register as Madav connector | ~½ day | Each tool returns clean data for NVDA/AAPL from chat |
| **2. Skills** | Write the 3 SKILL.md playbooks | ~½ day | Skills discovered and loadable |
| **3. Agents** | Define the 6 agents (instructions, tools, pinned models, identities) in Agent Studio | ~½ day | Each agent passes a Live Bench smoke test |
| **4. Team** | Assemble Managed team, wire phase order, structured-verdict parsing, report writer | ~½–1 day | End-to-end run on 1 ticker produces full report + log entry |
| **5. Memory loop** | Decision log, weekly Reflector schedule, lesson injection | ~½ day | Pending entry resolves with real alpha + lesson lands in agent memory |
| **5b. Batch Runner** | Watchlist input, mission queue with concurrency limit, digest writer, signals.jsonl writer | ~½ day | One command processes a 5-ticker watchlist in background and produces digest + signals |
| **6. Validation** | 5–10 ticker backtest sanity pass; check verdict distribution (not all HOLD), token cost per run; tune prompts | ~1 day | Stable runs ≤ ~8 LLM calls/ticker; defensible, varied verdicts |
| **7. Execution Adapter** *(future, not now)* | Broker MCP (Alpaca paper first), order proposal from signals, approval gate, P&L→reflection | ~1–2 days when wanted | Paper orders placed from signals with human approval |

Total for phases 1–6: roughly 4–4½ working days, of which only Phase 1 and 5b are real code.

## 4b. What kind of build is this? (your question answered)

It is **~80% configuration of Madav, ~20% small additions** — not a fork or parallel application:

- **Agents**: yes, I create all 6 during the build. They're defined as Madav agent definitions (instructions + tools + pinned model + identity) via Agent Studio / settings JSON — the same mechanism as your existing 27 personas (Marketscout, Risklens, Quant...). They become permanent, reusable agents in your install: visible as agent cards, individually chattable, with their own memory and track record. No application source-code change needed for this part.
- **Team, skills, schedules**: also pure configuration — a Managed team definition, 3 SKILL.md files dropped in the skills folder, cron triggers.
- **New code, running alongside the app** (not modifying it): the `finance-data` MCP server (Phase 1) and the Batch Runner + digest/signals writers (Phase 5b). Both plug in through Madav's existing connector/working-folder mechanisms.
- **Future app-level addition**: the Execution Adapter (Phase 7) is the only piece that could warrant touching Madav itself (e.g. an approval UI for orders) — and even that can ship first as another MCP server.

So: the agents do the thinking; Madav already provides the machinery; we add two small bolt-on components and zero core-app changes until/unless live trading is pursued.

## 5. Decision points for you (defaults marked ★)

1. **Risk stage**: single Risk Critic ★ vs faithful 3-persona risk debate (3× the calls, marginal value).
2. **Sentiment source**: browser-skim of public pages ★ vs adding StockTwits/Reddit fetchers to the MCP server (more code, API churn).
3. **Models**: e.g. cheap/fast model for agents 1–5 + your strongest model for Chief Strategist ★ — pick the actual pair at build time.
4. **Scope**: US equities only ★ first; crypto/regional benchmarks later (upstream's `benchmark_map` idea).
5. **Watchlist automation**: now in scope (Phase 5b) per your request — choose watchlist source: file in working folder ★, chat input, or webhook.
6. **Batch-completion notification**: none ★ vs email/Telegram via MCP connector.
7. **Broker target for Phase 7 (when you get there)**: Alpaca paper ★ vs Zerodha/Kite vs IBKR — depends on your market/region.

## 6. What we deliberately do NOT rebuild

- LangGraph / conditional-edge machinery (Madav teams replace it)
- Signal-extraction LLM call (structured output contract instead)
- Msg-clear nodes and shared-message-channel hacks (isolated agent contexts)
- 10-provider LLM factory (Madav handles providers)
- Online/offline data matrix and dual-vendor fallback router (one MCP server; vendors swappable behind it)
- Chroma/BM25 memory (Madav agent memory + markdown decision log)
