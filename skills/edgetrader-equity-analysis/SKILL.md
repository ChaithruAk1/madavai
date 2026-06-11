---
name: edgetrader-equity-analysis
description: How to analyze a stock with the finance-data connector — indicator interpretation rules and the exact report template for EdgeTrader analyst agents (Quant Analyst, Context Analyst).
---

# EdgeTrader · Equity Analysis Playbook

You analyze ONE ticker per mission using the `finance-data` connector tools. Never invent a number — every figure must come from a tool result. If a field is null, say "unavailable", never estimate.

## Quant (technical) analysis — for the Quant Analyst

Call `get_snapshot(ticker)` once. Interpret using these rules:

- **Trend**: price > SMA50 > SMA200 = established uptrend; price < SMA50 < SMA200 = downtrend; mixed = transitional. Note distance of price from SMA50 in %.
- **Golden/death cross**: SMA50 vs SMA200 relationship and whether a cross looks imminent from last_10_closes trajectory.
- **Momentum**: RSI(14) > 70 overbought, < 30 oversold, 45–55 neutral. MACD histogram sign and direction = momentum confirmation or divergence from price.
- **Volatility/levels**: position inside Bollinger bands (riding upper band = strong trend OR exhaustion — decide using volume); ATR(14) as % of price for stop-distance context.
- **Volume**: volume vs avg_volume_30d > 1.5x on an up day = accumulation; on a down day = distribution.
- **52-week context**: distance from 52w high/low in %.

## Context (fundamental + news) analysis — for the Context Analyst

Call `get_fundamentals(ticker)` and `get_news(ticker, days=7)`. Rules:

- Valuation: compare trailing vs forward P/E (falling forward P/E = expected earnings growth). Flag P/S or P/E that looks extreme for the sector. PEG > 2 = growth likely priced in.
- Health: debt_to_equity, cash vs debt, free cash flow sign and size vs market cap.
- Growth: revenue_growth and earnings_growth direction; margins trend.
- News: classify each headline bullish / bearish / neutral for THIS ticker. Weigh recency. Quote titles — never summarize news you weren't given.
- Sentiment proxy: overall tone of coverage (count of bullish vs bearish items). Be explicit that this is a news-tone proxy, not social-media sentiment.

## Mandatory report format (both analysts)

End your report with this exact table — downstream agents parse it:

| Aspect | Reading | Signal (bullish/bearish/neutral) |
|---|---|---|
| ... one row per aspect analyzed ... | | |

Then one line: `ANALYST LEAN: bullish|bearish|neutral (one-sentence reason)`.

Keep the full report under 500 words. Facts and numbers first, interpretation second, never advice language ("you should buy") — that decision belongs to the Chief Strategist.
