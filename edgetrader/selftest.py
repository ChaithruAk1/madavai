"""EdgeTrader self-test — run BEFORE first use:  python selftest.py

Checks (no LLM, no orders): deps importable, config valid, MCP servers parse,
indicator math correct, verdict parser correct, webhook reachability, and that
the executor's safety gates hold. Exits non-zero on any failure.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

try:  # Windows pipes default to cp1252
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
PASS, FAIL, WARN = 0, 0, 0


def check(name, fn, optional=False):
    global PASS, FAIL, WARN
    try:
        fn()
        PASS += 1
        print(f"  ✓ {name}")
    except Exception as e:
        if optional:
            WARN += 1
            print(f"  ~ {name}: {e}")
        else:
            FAIL += 1
            print(f"  ✗ {name}: {e}")


def t_deps():
    import yfinance  # noqa
    import mcp  # noqa


def t_config():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    assert cfg["execution"]["paper_only"] is True or cfg["execution"]["enabled"] is False, \
        "live trading enabled without paper_only — refuse"
    assert (ROOT / cfg["watchlist_file"]).exists(), "watchlist.txt missing"


def t_mcp_parse():
    import ast
    for f in ["mcp/finance_data_server.py", "mcp/executor_server.py", "batch_runner.py", "reflector.py"]:
        ast.parse((ROOT / f).read_text(encoding="utf-8"), filename=f)


def t_indicators():
    sys.path.insert(0, str(ROOT / "mcp"))
    import finance_data_server as fds
    closes = [float(i) for i in range(1, 61)]  # 1..60 ramp
    assert fds._sma(closes, 50) == sum(range(11, 61)) / 50
    assert fds._rsi(closes) == 100.0, "monotonic rise must give RSI 100"
    mid, up, lo = fds._bollinger(closes)
    assert lo < mid < up
    assert fds._atr([c + 1 for c in closes], [c - 1 for c in closes], closes) is not None


def t_verdict_parser():
    sys.path.insert(0, str(ROOT))
    import batch_runner as br
    text = ('blah analysis...\n```json\n{"edgetrader_verdict": {"ticker": "nvda", "verdict": "BUY", '
            '"conviction": 8, "horizon_days": 5, "entry_zone": "180-185", "invalidation": "below 172", '
            '"thesis": "t", "key_risk": "r"}}\n```')
    v = br.parse_verdict(text, "NVDA")
    assert v["verdict"] == "BUY" and v["conviction"] == 8 and v["ticker"] == "NVDA" and not v.get("parse_fallback")
    v2 = br.parse_verdict("the committee says STRONG BUY overall", "X")
    assert v2["verdict"] == "STRONG BUY" and v2.get("parse_fallback")


def t_executor_gates():
    sys.path.insert(0, str(ROOT / "mcp"))
    import executor_server as ex
    cfg = ex._cfg()
    msg = ex._gate(cfg)
    assert cfg.get("enabled") is False and msg, "executor must be gated OFF by default"
    assert "paper-api" in ex._base_url({**cfg, "paper_only": True, "alpaca_base_url": "https://api.alpaca.markets"}), \
        "paper_only must force the paper endpoint"
    r = json.loads(ex.submit_order("nope"))
    assert "error" in r, "submit without confirm must be refused"


def t_webhook():
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))["webhook"]
    try:
        with urllib.request.urlopen(cfg["base_url"].rstrip("/") + "/hook/ping", timeout=3) as r:
            assert json.loads(r.read().decode()).get("ok")
    except Exception:
        raise RuntimeError("BrainEdge webhook not reachable (start BrainEdge with webhooks enabled — "
                           "needed for batch runs, not for chat runs)")


def t_market_data():
    sys.path.insert(0, str(ROOT / "mcp"))
    import finance_data_server as fds
    snap = json.loads(fds.get_snapshot("AAPL"))
    assert snap["price"] and snap["sma_50"], "live snapshot incomplete"


print("\nEdgeTrader self-test\n")
check("python deps (yfinance, mcp)", t_deps)
check("config.json valid + safe defaults", t_config)
check("all python sources parse", t_mcp_parse)
check("indicator math (SMA/RSI/Bollinger/ATR)", t_indicators)
check("verdict parser (JSON + fallback)", t_verdict_parser)
check("executor safety gates (off, paper-forced, confirm)", t_executor_gates)
check("BrainEdge webhook reachable (only needed for batch runs)", t_webhook, optional=True)
check("live market data (AAPL snapshot, needs internet)", t_market_data, optional=True)
print(f"\n{PASS} passed, {FAIL} failed, {WARN} warning(s)")
sys.exit(1 if FAIL else 0)
