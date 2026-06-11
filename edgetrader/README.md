# EdgeTrader — multi-agent stock analysis on Madav

A simplified rebuild of the [TradingAgents](https://github.com/TauricResearch/TradingAgents) concept
using Madav's own agent workforce: 6 agents in one relay team replace their ~12 LangGraph roles,
with batch runs, background scheduling, a learning loop, and a gated (off-by-default) paper-trading
execution adapter.

> **This is information, not financial advice.** Nothing here executes trades unless you explicitly
> enable execution in `config.json` AND enable the trade-executor connector — and even then it
> defaults to Alpaca's paper (fake money) endpoint.

## The team (relay, in order)

| # | Agent | Job |
|---|---|---|
| 1 | ET Quant Analyst | Technical read from `get_snapshot` (trend, momentum, volatility, volume) |
| 2 | ET Context Analyst | Fundamentals + news tone from `get_fundamentals` / `get_news` |
| 3 | ET Bull | Strongest case FOR the stock, numbers-cited |
| 4 | ET Bear | Quotes and dismantles the bull's strongest claims |
| 5 | ET Risk Critic | Sizing, invalidation level, drawdown scenario, `RISK ADJUSTMENT:` line |
| 6 | ET Chief Strategist | Final judge → 5-tier verdict + machine-readable JSON block |

Prompts live in three editable skills: `skills/edgetrader-equity-analysis`,
`skills/edgetrader-adversarial-debate`, `skills/edgetrader-verdict-format`.

## Install (one time)

```
cd C:\Projects\ClaudeCodeUI\Madav
pip install -r edgetrader\requirements.txt
node scripts\install-edgetrader.mjs        (Madav must be CLOSED)
python edgetrader\selftest.py              (then START Madav and run it again)
```

The installer seeds (idempotent, with a settings backup): the 6 agents, the EdgeTrader team
(120k token budget), the `finance-data` connector (enabled) and `trade-executor` connector
(**disabled**), the repo `skills\` folder, webhook triggers (port 8765 + token), and two
scheduled tasks (daily sweep 07:00, weekly reflection Mon 07:30).

Pin models per agent in Agent Studio if you want a cheap model for stations 1–5 and your
strongest model for the Chief Strategist.

## Run

- **Single ticker (interactive):** Agents Team tab → EdgeTrader → brief it with `NVDA`.
  Watch the stations light up in Mission Control.
- **Batch (background):** edit `watchlist.txt`, keep Madav running, then
  `python batch_runner.py` (or wait for the 07:00 scheduled sweep). Outputs:
  - `reports/<TICKER>-<date>.md` — Chief Strategist's decision + rationale
  - `reports/digest-<date>.md` — all tickers ranked by verdict/conviction
  - `signals/signals.jsonl` — one JSON record per verdict (the broker contract)
  - `decisions/decision-log.md` — append-only log, entries start `pending`
- **Reflection (the memory):** `python reflector.py` (or the Monday task) resolves pending
  entries against realized return + alpha vs SPY, and appends lessons to
  `decisions/lessons.md`. The batch runner injects recent decisions + lessons into every
  new brief — verdicts learn from outcomes.

## Trading (Phase 7 — OFF by default)

Three independent locks must be opened, in this order, by **you** (never by an agent):

1. Set Alpaca keys in the environment Madav starts from: `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`
   (create a free paper account at alpaca.markets).
2. Enable the `trade-executor` connector in Madav → Connectors.
3. Set `execution.enabled: true` in `edgetrader/config.json`.

Even then: `paper_only: true` **hard-forces** the paper endpoint (a config typo cannot go
live), every order needs `propose_orders` → your review → `submit_order(id, confirm="SUBMIT")`,
caps apply (`max_position_usd`, `max_orders_per_day`, `min_conviction_to_propose`), and
`kill_switch: true` stops everything instantly.

**Important:** headless runs (schedules, webhooks, batch sweeps) auto-approve tool calls —
the interactive permission prompt does not protect there. Only use the executor in
interactive chat with an agent on **Ask first** autonomy; never wire it into scheduled runs.
The config gates are what protect you in headless contexts.

## Files

```
edgetrader/
  config.json            all knobs (horizon, benchmark, concurrency, webhook, execution gates)
  watchlist.txt          tickers for batch runs
  batch_runner.py        watchlist → team missions → reports/digest/signals/log
  reflector.py           outcomes → lessons (the learning loop)
  selftest.py            run before first use
  mcp/finance_data_server.py   read-only market data (yfinance, no keys)
  mcp/executor_server.py       gated Alpaca adapter (paper by default)
scripts/install-edgetrader.mjs seeds agents/team/connectors/schedules
skills/edgetrader-*            the three playbooks (edit prompts here)
```

## Troubleshooting

- *Batch runner: "Cannot reach Madav webhook"* — Madav must be running; check
  Scheduler page → Webhook triggers on, port matches `config.json`.
- *Webhook token empty in config.json* — your existing token was OS-encrypted; copy it from
  the Madav Scheduler page into `config.json → webhook.token`.
- *`python` not found in connectors* — change the connector Command from `python` to `py`
  or the full path to your Python 3.10+ in Madav → Connectors.
- *Verdict shows UNPARSED in digest* — the model skipped the JSON block; use a stronger
  model for ET Chief Strategist (pin it in Agent Studio). The prose verdict fallback still ranks.
- *Analysts report "unavailable" for everything / never call tools* — headless agent runs need
  an **OpenAI-compatible** provider (OpenRouter, DeepSeek, NIM, local). On an Anthropic-kind
  profile, headless runs use plain chat without connector tools — switch the active model or
  pin OpenAI-compatible models on the two analyst agents.
