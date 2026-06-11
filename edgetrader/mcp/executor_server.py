"""EdgeTrader execution-adapter MCP server (Alpaca, PAPER trading by default).

Safety model (defense in depth — ALL gates must pass before any order):
  1. execution.enabled in edgetrader/config.json must be true (default: false)
  2. execution.kill_switch must be false
  3. paper_only=true forces the paper-trading endpoint regardless of env vars
  4. Caps: max_position_usd per order, max_orders_per_day
  5. Two-step flow: propose_orders() writes a proposal file; submit_order()
     only submits a previously written proposal by id, with confirm="SUBMIT"
  6. API keys come ONLY from env vars (ALPACA_KEY_ID / ALPACA_SECRET_KEY) —
     never from config or chat
  7. NOTE: headless runs (schedules/webhooks/swarms) auto-approve tools — the
     interactive "Ask first" prompt does NOT protect there. That is exactly why
     gates 1-5 exist and why this connector ships DISABLED. Never give the
     EdgeTrader analysis agents this connector in scheduled runs.

Tools: account_status, propose_orders, list_proposals, submit_order, cancel_all
"""
from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from datetime import datetime, date
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("trade-executor")

ROOT = Path(__file__).resolve().parent.parent  # edgetrader/
CONFIG = ROOT / "config.json"


def _cfg() -> dict:
    with open(CONFIG, "r", encoding="utf-8") as f:
        return json.load(f).get("execution", {})


def _gate(cfg: dict) -> str | None:
    if cfg.get("kill_switch"):
        return "KILL SWITCH is on (execution.kill_switch in edgetrader/config.json). No orders."
    if not cfg.get("enabled"):
        return ("Execution is DISABLED (execution.enabled=false in edgetrader/config.json). "
                "The user must enable it manually in the file — do not ask an agent to do it.")
    return None


def _base_url(cfg: dict) -> str:
    url = cfg.get("alpaca_base_url", "https://paper-api.alpaca.markets")
    if cfg.get("paper_only", True) and "paper-api" not in url:
        # paper_only hard-forces the paper endpoint — a config typo cannot go live
        url = "https://paper-api.alpaca.markets"
    return url.rstrip("/")


def _keys():
    k, s = os.environ.get("ALPACA_KEY_ID", ""), os.environ.get("ALPACA_SECRET_KEY", "")
    if not k or not s:
        raise RuntimeError("ALPACA_KEY_ID / ALPACA_SECRET_KEY env vars not set. "
                           "Set them in the shell that launches Madav.")
    return k, s


def _api(cfg: dict, method: str, path: str, body: dict | None = None) -> dict:
    k, s = _keys()
    req = urllib.request.Request(
        _base_url(cfg) + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s,
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Alpaca API {e.code}: {e.read().decode()[:300]}")


def _orders_dir() -> Path:
    d = ROOT / _cfg().get("orders_dir", "orders")
    (d / "proposed").mkdir(parents=True, exist_ok=True)
    (d / "submitted").mkdir(parents=True, exist_ok=True)
    return d


def _today_submitted_count() -> int:
    d = _orders_dir() / "submitted"
    today = date.today().isoformat()
    return sum(1 for p in d.glob("*.json") if p.name.startswith(today))


@mcp.tool()
def account_status() -> str:
    """Alpaca account snapshot: equity, cash, buying power, open positions.
    Works even when execution is disabled (read-only)."""
    cfg = _cfg()
    acct = _api(cfg, "GET", "/v2/account")
    poss = _api(cfg, "GET", "/v2/positions")
    return json.dumps({
        "endpoint": _base_url(cfg),
        "paper": "paper-api" in _base_url(cfg),
        "execution_enabled": bool(cfg.get("enabled")),
        "kill_switch": bool(cfg.get("kill_switch")),
        "equity": acct.get("equity"), "cash": acct.get("cash"),
        "buying_power": acct.get("buying_power"),
        "positions": [{"symbol": p.get("symbol"), "qty": p.get("qty"),
                       "avg_entry": p.get("avg_entry_price"),
                       "unrealized_pl": p.get("unrealized_pl")} for p in (poss or [])],
    }, indent=1)


@mcp.tool()
def propose_orders(signals_json: str) -> str:
    """Turn EdgeTrader signals into order PROPOSALS (files on disk — nothing is
    sent to the broker). signals_json: JSON list of objects with at least
    {ticker, verdict, conviction}. Only BUY/STRONG BUY/SELL/STRONG SELL with
    conviction >= min_conviction_to_propose become proposals, sized by
    max_position_usd. Returns the proposal ids for review."""
    cfg = _cfg()
    try:
        signals = json.loads(signals_json)
        assert isinstance(signals, list)
    except Exception:
        return json.dumps({"error": "signals_json must be a JSON list of signal objects"})
    min_conv = int(cfg.get("min_conviction_to_propose", 7))
    cap = float(cfg.get("max_position_usd", 1000))
    out, skipped = [], []
    for s in signals:
        tkr = str(s.get("ticker", "")).upper().strip()
        verdict = str(s.get("verdict", "")).upper()
        conv = int(s.get("conviction", 0) or 0)
        side = "buy" if "BUY" in verdict else "sell" if "SELL" in verdict else None
        if not tkr or side is None or conv < min_conv:
            skipped.append({"ticker": tkr or "?", "reason": f"verdict={verdict or 'HOLD'} conviction={conv} (min {min_conv})"})
            continue
        pid = f"{date.today().isoformat()}-{tkr}-{side}"
        proposal = {
            "id": pid, "created": datetime.now().isoformat(timespec="seconds"),
            "symbol": tkr, "side": side, "notional_usd": cap,
            "type": "market", "time_in_force": "day",
            "source_signal": s, "status": "proposed",
        }
        with open(_orders_dir() / "proposed" / f"{pid}.json", "w", encoding="utf-8") as f:
            json.dump(proposal, f, indent=1)
        out.append(pid)
    return json.dumps({"proposed": out, "skipped": skipped,
                       "note": "Nothing was sent to the broker. Review with list_proposals; "
                               "the USER decides what to submit via submit_order."}, indent=1)


@mcp.tool()
def list_proposals() -> str:
    """List pending order proposals (files in edgetrader/orders/proposed)."""
    items = []
    for p in sorted((_orders_dir() / "proposed").glob("*.json")):
        try:
            items.append(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            continue
    return json.dumps({"count": len(items), "proposals": items}, indent=1)


@mcp.tool()
def submit_order(proposal_id: str, confirm: str = "") -> str:
    """Submit ONE previously proposed order to Alpaca. Requires confirm="SUBMIT".
    Gated by: execution.enabled, kill_switch, paper_only, max_orders_per_day.
    Only call this when the USER has explicitly approved this specific order."""
    cfg = _cfg()
    err = _gate(cfg)
    if err:
        return json.dumps({"error": err})
    if confirm != "SUBMIT":
        return json.dumps({"error": 'Pass confirm="SUBMIT" only after the user explicitly approved this order.'})
    if _today_submitted_count() >= int(cfg.get("max_orders_per_day", 5)):
        return json.dumps({"error": "max_orders_per_day reached for today."})
    src = _orders_dir() / "proposed" / f"{proposal_id}.json"
    if not src.exists():
        return json.dumps({"error": f"No proposal '{proposal_id}'. Use list_proposals."})
    prop = json.loads(src.read_text(encoding="utf-8"))
    if float(prop.get("notional_usd", 0)) > float(cfg.get("max_position_usd", 1000)):
        return json.dumps({"error": "Proposal exceeds max_position_usd cap."})
    resp = _api(cfg, "POST", "/v2/orders", {
        "symbol": prop["symbol"], "notional": str(prop["notional_usd"]),
        "side": prop["side"], "type": prop.get("type", "market"),
        "time_in_force": prop.get("time_in_force", "day"),
    })
    prop["status"] = "submitted"
    prop["alpaca_order_id"] = resp.get("id")
    prop["submitted_at"] = datetime.now().isoformat(timespec="seconds")
    dst = _orders_dir() / "submitted" / f"{date.today().isoformat()}-{proposal_id}.json"
    dst.write_text(json.dumps(prop, indent=1), encoding="utf-8")
    src.unlink(missing_ok=True)
    return json.dumps({"submitted": prop, "endpoint": _base_url(cfg),
                       "paper": "paper-api" in _base_url(cfg)}, indent=1)


@mcp.tool()
def cancel_all() -> str:
    """Cancel all open orders at the broker (safety hatch). Allowed even when
    execution is disabled — cancelling reduces risk, never adds it."""
    cfg = _cfg()
    _api(cfg, "DELETE", "/v2/orders")
    return json.dumps({"ok": True, "note": "All open orders cancelled."})


if __name__ == "__main__":
    mcp.run()
