"""EdgeTrader finance-data MCP server.

Exposes deterministic market-data tools to Madav agents (stdio MCP):
  - get_snapshot(ticker):       1y daily prices + pre-computed technical indicators
  - get_fundamentals(ticker):   valuation ratios + income/balance/cashflow highlights
  - get_news(ticker, days):     recent Yahoo Finance headlines/summaries
  - resolve_outcome(ticker, decision_date, horizon_days, benchmark):
                                realized return + alpha vs benchmark (reflection loop)

Free data only (yfinance). No API keys. Read-only — this server can never trade.

Run:  python finance_data_server.py     (Madav connects via the Connectors entry)
Deps: pip install -r ../requirements.txt
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("finance-data")


# ---------- helpers ----------

def _yf():
    import yfinance as yf  # imported lazily so the server starts even mid-install
    return yf


def _round(v, n=2):
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, n)
    except (TypeError, ValueError):
        return None


def _sma(closes, n):
    if len(closes) < n:
        return None
    return _round(sum(closes[-n:]) / n)


def _ema_series(closes, n):
    if len(closes) < n:
        return []
    k = 2.0 / (n + 1)
    ema = [sum(closes[:n]) / n]
    for c in closes[n:]:
        ema.append(c * k + ema[-1] * (1 - k))
    return ema


def _rsi(closes, n=14):
    if len(closes) < n + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = sum(gains[:n]) / n
    avg_l = sum(losses[:n]) / n
    for i in range(n, len(gains)):
        avg_g = (avg_g * (n - 1) + gains[i]) / n
        avg_l = (avg_l * (n - 1) + losses[i]) / n
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return _round(100 - 100 / (1 + rs))


def _macd(closes):
    e12 = _ema_series(closes, 12)
    e26 = _ema_series(closes, 26)
    if not e12 or not e26:
        return None, None, None
    macd_line = [a - b for a, b in zip(e12[-len(e26):], e26)]
    if len(macd_line) < 9:
        return _round(macd_line[-1]), None, None
    sig = _ema_series(macd_line, 9)
    if not sig:
        return _round(macd_line[-1]), None, None
    return _round(macd_line[-1]), _round(sig[-1]), _round(macd_line[-1] - sig[-1])


def _bollinger(closes, n=20):
    if len(closes) < n:
        return None, None, None
    win = closes[-n:]
    mid = sum(win) / n
    var = sum((c - mid) ** 2 for c in win) / n
    sd = var ** 0.5
    return _round(mid), _round(mid + 2 * sd), _round(mid - 2 * sd)


def _atr(highs, lows, closes, n=14):
    if len(closes) < n + 1:
        return None
    trs = []
    for i in range(1, len(closes)):
        trs.append(max(highs[i] - lows[i],
                       abs(highs[i] - closes[i - 1]),
                       abs(lows[i] - closes[i - 1])))
    atr = sum(trs[:n]) / n
    for t in trs[n:]:
        atr = (atr * (n - 1) + t) / n
    return _round(atr)


def _history(ticker: str, period="1y"):
    t = _yf().Ticker(ticker)
    h = t.history(period=period, interval="1d", auto_adjust=True)
    if h is None or h.empty:
        raise ValueError(f"No price data returned for '{ticker}'. Check the symbol.")
    return t, h


# ---------- tools ----------

@mcp.tool()
def get_snapshot(ticker: str) -> str:
    """Price snapshot + technical indicators for a stock ticker.

    Returns JSON: latest price, change %, 52-week range, volume vs average,
    SMA 50/200, EMA 10, RSI(14), MACD(12,26,9), Bollinger(20,2), ATR(14),
    and the last 10 daily closes. All numbers are computed, never estimated.
    """
    _, h = _history(ticker)
    closes = [float(x) for x in h["Close"].tolist()]
    highs = [float(x) for x in h["High"].tolist()]
    lows = [float(x) for x in h["Low"].tolist()]
    vols = [float(x) for x in h["Volume"].tolist()]
    last = closes[-1]
    prev = closes[-2] if len(closes) > 1 else last
    macd_l, macd_s, macd_h = _macd(closes)
    boll_m, boll_u, boll_l = _bollinger(closes)
    e10 = _ema_series(closes, 10)
    out = {
        "ticker": ticker.upper(),
        "as_of": str(h.index[-1].date()),
        "price": _round(last),
        "change_1d_pct": _round((last / prev - 1) * 100),
        "change_1m_pct": _round((last / closes[-21] - 1) * 100) if len(closes) >= 21 else None,
        "change_3m_pct": _round((last / closes[-63] - 1) * 100) if len(closes) >= 63 else None,
        "change_1y_pct": _round((last / closes[0] - 1) * 100),
        "high_52w": _round(max(closes)),
        "low_52w": _round(min(closes)),
        "volume": int(vols[-1]),
        "avg_volume_30d": int(sum(vols[-30:]) / min(30, len(vols))),
        "sma_50": _sma(closes, 50),
        "sma_200": _sma(closes, 200),
        "ema_10": _round(e10[-1]) if e10 else None,
        "rsi_14": _rsi(closes),
        "macd": macd_l, "macd_signal": macd_s, "macd_hist": macd_h,
        "boll_mid": boll_m, "boll_upper": boll_u, "boll_lower": boll_l,
        "atr_14": _atr(highs, lows, closes),
        "last_10_closes": [_round(c) for c in closes[-10:]],
    }
    return json.dumps(out, indent=1)


@mcp.tool()
def get_fundamentals(ticker: str) -> str:
    """Fundamental highlights for a stock ticker.

    Returns JSON: market cap, P/E (trailing/forward), P/S, margins, growth,
    debt, cash flow highlights and analyst targets where available. Fields
    Yahoo doesn't provide come back null — report them as unavailable.
    """
    t = _yf().Ticker(ticker)
    info = t.info or {}
    g = info.get
    out = {
        "ticker": ticker.upper(),
        "name": g("longName") or g("shortName"),
        "sector": g("sector"), "industry": g("industry"),
        "market_cap": g("marketCap"),
        "trailing_pe": _round(g("trailingPE")), "forward_pe": _round(g("forwardPE")),
        "price_to_sales": _round(g("priceToSalesTrailing12Months")),
        "price_to_book": _round(g("priceToBook")),
        "peg_ratio": _round(g("pegRatio")),
        "profit_margin_pct": _round((g("profitMargins") or 0) * 100) if g("profitMargins") is not None else None,
        "operating_margin_pct": _round((g("operatingMargins") or 0) * 100) if g("operatingMargins") is not None else None,
        "revenue_ttm": g("totalRevenue"),
        "revenue_growth_pct": _round((g("revenueGrowth") or 0) * 100) if g("revenueGrowth") is not None else None,
        "earnings_growth_pct": _round((g("earningsGrowth") or 0) * 100) if g("earningsGrowth") is not None else None,
        "eps_ttm": _round(g("trailingEps")), "eps_forward": _round(g("forwardEps")),
        "total_cash": g("totalCash"), "total_debt": g("totalDebt"),
        "debt_to_equity": _round(g("debtToEquity")),
        "free_cashflow": g("freeCashflow"), "operating_cashflow": g("operatingCashflow"),
        "dividend_yield_pct": _round((g("dividendYield") or 0) * 100) if g("dividendYield") is not None else None,
        "beta": _round(g("beta")),
        "analyst_target_mean": _round(g("targetMeanPrice")),
        "analyst_recommendation": g("recommendationKey"),
        "next_earnings_hint": str(g("earningsTimestamp") or ""),
    }
    return json.dumps(out, indent=1)


@mcp.tool()
def get_news(ticker: str, days: int = 7) -> str:
    """Recent news headlines for a stock ticker (Yahoo Finance).

    Returns JSON list: title, publisher, published time, summary, link.
    Use for news AND as a sentiment proxy (tone of coverage). Cite titles.
    """
    t = _yf().Ticker(ticker)
    cutoff = datetime.utcnow() - timedelta(days=max(1, int(days)))
    items = []
    for n in (t.news or [])[:25]:
        c = n.get("content") or n  # yfinance >=0.2.50 nests under 'content'
        title = c.get("title") or ""
        summary = c.get("summary") or c.get("description") or ""
        pub = (c.get("provider") or {}).get("displayName") if isinstance(c.get("provider"), dict) else c.get("publisher")
        when = c.get("pubDate") or c.get("displayTime") or ""
        link = c.get("canonicalUrl", {}).get("url") if isinstance(c.get("canonicalUrl"), dict) else c.get("link")
        ts = None
        if isinstance(n.get("providerPublishTime"), (int, float)):
            ts = datetime.utcfromtimestamp(n["providerPublishTime"])
        if ts and ts < cutoff:
            continue
        items.append({"title": title, "publisher": pub, "published": str(when or ts or ""),
                      "summary": summary[:400], "link": link})
    return json.dumps({"ticker": ticker.upper(), "days": days, "count": len(items), "news": items}, indent=1)


@mcp.tool()
def resolve_outcome(ticker: str, decision_date: str, horizon_days: int = 5, benchmark: str = "SPY") -> str:
    """Realized outcome of a past decision: ticker return over the horizon
    from decision_date (YYYY-MM-DD) vs the benchmark, and the alpha.

    Returns JSON: start/end prices and dates, ticker_return_pct,
    benchmark_return_pct, alpha_pct, resolved (false if horizon not elapsed).
    """
    start = datetime.strptime(decision_date, "%Y-%m-%d")
    end = start + timedelta(days=int(horizon_days) + 7)  # pad for weekends/holidays

    def leg(sym):
        h = _yf().Ticker(sym).history(start=start.strftime("%Y-%m-%d"),
                                      end=end.strftime("%Y-%m-%d"),
                                      interval="1d", auto_adjust=True)
        if h is None or h.empty:
            raise ValueError(f"No data for {sym} from {decision_date}")
        closes = h["Close"].tolist()
        dates = [str(d.date()) for d in h.index]
        # first close ON/AFTER decision date is entry; close at horizon trading days later is exit
        idx_exit = min(int(horizon_days), len(closes) - 1)
        return dates[0], float(closes[0]), dates[idx_exit], float(closes[idx_exit]), len(closes) - 1 >= int(horizon_days)

    d0, p0, d1, p1, done_t = leg(ticker)
    bd0, bp0, bd1, bp1, done_b = leg(benchmark)
    r_t = (p1 / p0 - 1) * 100
    r_b = (bp1 / bp0 - 1) * 100
    return json.dumps({
        "ticker": ticker.upper(), "benchmark": benchmark.upper(),
        "entry_date": d0, "entry_price": _round(p0),
        "exit_date": d1, "exit_price": _round(p1),
        "ticker_return_pct": _round(r_t), "benchmark_return_pct": _round(r_b),
        "alpha_pct": _round(r_t - r_b),
        "resolved": bool(done_t and done_b),
    }, indent=1)


if __name__ == "__main__":
    mcp.run()  # stdio transport — Madav's mcp-manager connects to this
