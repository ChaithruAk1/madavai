"""EdgeTrader batch runner — multi-ticker analysis through the BrainEdge team.

For each ticker in watchlist.txt (or CLI args) it fires the EdgeTrader relay team
via BrainEdge's local webhook, parses the Chief Strategist's verdict JSON, and writes:

  reports/<TICKER>-<date>.md       Chief Strategist's decision + rationale per ticker
  reports/digest-<date>.md         ranked digest across the batch
  signals/signals.jsonl            machine-readable signal per verdict (broker contract)
  decisions/decision-log.md        append-only decision log ([... | pending] entries)

Requires BrainEdge to be RUNNING with webhook triggers enabled (the installer
enables them and wires edgetrader/config.json).

Usage:
  python batch_runner.py                # analyze every ticker in watchlist.txt
  python batch_runner.py NVDA TSLA      # analyze specific tickers
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

try:  # Windows pipes default to cp1252 — keep ✓/α printable when run by the scheduler
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent
CFG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
TODAY = date.today().isoformat()

VERDICTS = ["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL"]


def load_watchlist() -> list[str]:
    if len(sys.argv) > 1:
        return [a.upper().strip() for a in sys.argv[1:] if a.strip()]
    f = ROOT / CFG["watchlist_file"]
    if not f.exists():
        sys.exit(f"watchlist not found: {f}")
    out = []
    for line in f.read_text(encoding="utf-8").splitlines():
        line = line.strip().upper()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def load_lessons_context() -> str:
    """Recent decisions + lessons injected into each brief (the memory loop)."""
    parts = []
    log_f = ROOT / CFG["decision_log"]
    if log_f.exists():
        lines = [l for l in log_f.read_text(encoding="utf-8").splitlines() if l.startswith("| 20")]
        if lines:
            parts.append("RECENT DECISIONS (most recent last):\n" + "\n".join(lines[-8:]))
    lessons_f = ROOT / CFG["lessons_file"]
    if lessons_f.exists():
        text = lessons_f.read_text(encoding="utf-8").strip()
        if text:
            # last ~5 real lessons (bullets start "[date · ticker ..."; skips the file header)
            lessons = [b.strip() for b in text.split("\n- ") if b.strip().startswith("[")]
            if lessons:
                parts.append("PAST LESSONS (apply where relevant):\n- " + "\n- ".join(lessons[-5:]))
    return ("\n\n".join(parts) + "\n\n") if parts else ""


def run_ticker(ticker: str) -> dict:
    wh = CFG["webhook"]
    if not wh.get("token"):
        raise RuntimeError("webhook.token is empty in config.json — run the installer or copy the token from BrainEdge's Scheduler page.")
    if not wh.get("team_id"):
        raise RuntimeError("webhook.team_id is empty in config.json — run scripts/install-edgetrader.mjs.")
    prompt = (
        f"EdgeTrader mission: full analysis of the stock ticker {ticker} as of {TODAY}.\n\n"
        + load_lessons_context()
        + "Each station: do YOUR job per your instructions and skills, then pass your output down the relay. "
          "Chief Strategist: end with the mandatory edgetrader_verdict JSON block."
    )
    url = f"{wh['base_url'].rstrip('/')}/hook/team/{wh['team_id']}"
    req = urllib.request.Request(
        url, data=json.dumps({"prompt": prompt}).encode(), method="POST",
        headers={"Authorization": "Bearer " + wh["token"], "Content-Type": "application/json"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=1800) as r:
            body = json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"webhook HTTP {e.code}: {e.read().decode()[:300]}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Cannot reach BrainEdge webhook at {url} — is BrainEdge running with webhooks enabled? ({e.reason})")
    text = body.get("output") or body.get("text") or body.get("result") or json.dumps(body)
    if not body.get("ok", True):
        raise RuntimeError(f"team run failed: {str(text)[:200]}")
    return {"ticker": ticker, "text": str(text), "secs": round(time.time() - t0)}


def parse_verdict(text: str, ticker: str) -> dict:
    """Extract the edgetrader_verdict JSON block; tolerant fallbacks."""
    matches = list(re.finditer(r"\{[^{}]*\"edgetrader_verdict\"\s*:\s*\{.*?\}\s*\}", text, re.DOTALL))
    for m in reversed(matches):  # prefer the LAST valid block (the final answer)
        try:
            v = json.loads(m.group(0))["edgetrader_verdict"]
            v["ticker"] = (v.get("ticker") or ticker).upper()
            v["verdict"] = str(v.get("verdict", "")).upper()
            v["conviction"] = int(float(v.get("conviction", 0) or 0))
            if v["verdict"] in VERDICTS:
                return v
        except (json.JSONDecodeError, KeyError, ValueError, TypeError):
            continue
    # fallback: scan prose for a verdict word (longest first so STRONG BUY wins over BUY)
    up = text.upper()
    found = next((w for w in ["STRONG BUY", "STRONG SELL", "BUY", "SELL", "HOLD"] if w in up), None)
    return {"ticker": ticker, "verdict": found or "UNPARSED", "conviction": 0,
            "horizon_days": CFG.get("horizon_days", 5), "entry_zone": "", "invalidation": "",
            "thesis": "(verdict block missing — see full report)", "key_risk": "", "parse_fallback": True}


def write_outputs(results: list[dict]):
    rep_dir = ROOT / CFG["reports_dir"]; rep_dir.mkdir(parents=True, exist_ok=True)
    sig_f = ROOT / CFG["signals_file"]; sig_f.parent.mkdir(parents=True, exist_ok=True)
    log_f = ROOT / CFG["decision_log"]; log_f.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    for r in results:
        v = r["verdict"]
        # per-ticker report
        (rep_dir / f"{r['ticker']}-{TODAY}.md").write_text(
            f"# EdgeTrader · {r['ticker']} · {TODAY}\n\n"
            f"**Verdict: {v['verdict']} · conviction {v['conviction']}/10**\n\n---\n\n{r['text']}\n",
            encoding="utf-8")
        # signal record (the future-broker contract)
        with open(sig_f, "a", encoding="utf-8") as f:
            f.write(json.dumps({"date": TODAY, **{k: v.get(k) for k in
                ("ticker", "verdict", "conviction", "horizon_days", "entry_zone", "invalidation", "thesis", "key_risk")},
                "report": f"{CFG['reports_dir']}/{r['ticker']}-{TODAY}.md"}) + "\n")
        rows.append(v)

    # decision log (append; header once)
    if not log_f.exists():
        log_f.write_text("# EdgeTrader decision log\n\n| date | ticker | verdict | conviction | outcome |\n|---|---|---|---|---|\n", encoding="utf-8")
    with open(log_f, "a", encoding="utf-8") as f:
        for v in rows:
            f.write(f"| {TODAY} | {v['ticker']} | {v['verdict']} | {v['conviction']} | pending |\n")

    # digest, ranked by conviction (buys first)
    order = {w: i for i, w in enumerate(["STRONG BUY", "BUY", "HOLD", "SELL", "STRONG SELL", "UNPARSED"])}
    ranked = sorted(rows, key=lambda v: (order.get(v["verdict"], 9), -v["conviction"]))
    lines = [f"# EdgeTrader digest · {TODAY}", "",
             f"{len(rows)} tickers analyzed. This is information, not financial advice.", "",
             "| # | Ticker | Verdict | Conv. | Thesis | Key risk |", "|---|---|---|---|---|---|"]
    for i, v in enumerate(ranked, 1):
        lines.append(f"| {i} | {v['ticker']} | **{v['verdict']}** | {v['conviction']}/10 | {v.get('thesis','')} | {v.get('key_risk','')} |")
    digest = rep_dir / f"digest-{TODAY}.md"
    digest.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return digest


def main():
    tickers = load_watchlist()
    if not tickers:
        sys.exit("watchlist is empty")
    conc = max(1, int(CFG.get("batch_concurrency", 2)))
    print(f"EdgeTrader batch · {len(tickers)} ticker(s) · concurrency {conc}")
    results, errors = [], []
    with ThreadPoolExecutor(max_workers=conc) as pool:
        futs = {pool.submit(run_ticker, t): t for t in tickers}
        for fut in as_completed(futs):
            t = futs[fut]
            try:
                r = fut.result()
                r["verdict"] = parse_verdict(r["text"], t)
                results.append(r)
                print(f"  ✓ {t}: {r['verdict']['verdict']} ({r['verdict']['conviction']}/10) in {r['secs']}s")
            except Exception as e:
                errors.append((t, str(e)))
                print(f"  ✗ {t}: {e}")
    if results:
        digest = write_outputs(results)
        print(f"\nDigest: {digest}")
    if errors:
        print(f"\n{len(errors)} failure(s):")
        for t, e in errors:
            print(f"  {t}: {e}")
        sys.exit(2)


if __name__ == "__main__":
    main()
