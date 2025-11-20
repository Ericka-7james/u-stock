"""
data_scout/fundamentals.py

Fetches basic fundamental metrics for a universe of tickers using yfinance
and writes to `public/data/fundamentals.json`.

This is intentionally simple; you can extend with FMP/Finnhub later.

Snapshot schema:

{
  "generatedAt": "...",
  "universe": ["AAPL", "MSFT", "TSLA"],
  "data": [
    {
      "ticker": "AAPL",
      "pe": 29.1,
      "pb": 45.2,
      "roe": 0.76,
      "debtToEquity": 1.5,
      "marketCap": 2800000000000
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List

import yfinance as yf  # type: ignore
from dotenv import load_dotenv

from data_scout.symbols import filter_valid_symbols

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "fundamentals.json"
UNIVERSE_FILE = DEFAULT_OUTPUT_DIR / "ticker-universe.json"

# TODO: keep in sync with tracked tickers / UI config.
DEFAULT_TICKERS = [
    # Large-cap single names
    "AAPL",
    "MSFT",
    "TSLA",
    "GOOGL",
    "AMZN",
    "BRK-B",
    "JPM",

    # Index funds (used on IndexFundsPage)
    "VTI",
    "VOO",
    "VTSAX",
    "FXAIX",
    "SWTSX",
]


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_universe_tickers() -> List[str]:
    """
    Try to load dynamic tickers from ticker-universe.json.

    Falls back to DEFAULT_TICKERS if the file is missing, invalid, or empty.
    """
    if not UNIVERSE_FILE.exists():
        return DEFAULT_TICKERS

    try:
        with UNIVERSE_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return DEFAULT_TICKERS

    raw = payload.get("tickers") or payload.get("universe") or []
    tickers = sorted(
        {
            (t or "").strip().upper()
            for t in raw
            if (t or "").strip()
        }
    )
    return tickers or DEFAULT_TICKERS


def fetch_fundamentals_for_ticker(ticker: str) -> Dict[str, Any]:
    """
    Pull basic fundamentals from yfinance.
    This uses the .info dict which can be slow; later you may want a better source (FMP, Finnhub).
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        return {
            "ticker": ticker.upper(),
            "pe": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "pb": info.get("priceToBook"),
            "roe": info.get("returnOnEquity"),
            "roa": info.get("returnOnAssets"),
            "debtToEquity": info.get("debtToEquity"),
            "marketCap": info.get("marketCap"),
            "dividendYield": info.get("dividendYield"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ticker": ticker.upper(),
            "pe": None,
            "forwardPE": None,
            "pb": None,
            "roe": None,
            "roa": None,
            "debtToEquity": None,
            "marketCap": None,
            "dividendYield": None,
            "sector": None,
            "industry": None,
            "error": str(exc),
        }


def fetch_fundamentals_snapshot(tickers: Iterable[str]) -> Dict[str, Any]:
    tickers_list: List[str] = sorted({t.upper().strip() for t in tickers if t.strip()})
    data = [fetch_fundamentals_for_ticker(t) for t in tickers_list]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "universe": tickers_list,
        "data": data,
    }


def write_snapshot(snapshot: Dict[str, Any], output_file: Path = DEFAULT_OUTPUT_FILE) -> None:
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main(tickers: Iterable[str] | None = None) -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.fundamentals
    """
    if tickers is None:
        tickers = load_universe_tickers()
    else:
        tickers = list(tickers)

    snapshot = fetch_fundamentals_snapshot(tickers)
    write_snapshot(snapshot)
    print(
        f"[fundamentals] Wrote fundamentals for {len(snapshot['universe'])} tickers "
        f"→ {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
