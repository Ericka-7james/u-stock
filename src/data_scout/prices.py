"""
data_scout/prices.py

Fetches latest price data for a list of tickers and writes it to
`public/data/prices.json` in a simple snapshot format.

Dependencies:
    - yfinance
    - python-dotenv (optional, if you want to load env vars from .env)

Snapshot schema (prices.json):

{
  "generatedAt": "2025-11-19T21:05:00Z",
  "universe": ["AAPL", "MSFT", "TSLA"],
  "data": [
    {
      "ticker": "AAPL",
      "price": 193.12,
      "currency": "USD",
      "timestamp": "2025-11-19T20:59:30Z"
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Dict, Any, List

import yfinance as yf  # type: ignore
from dotenv import load_dotenv

from data_scout.symbols import filter_valid_symbols

load_dotenv(dotenv_path=".env.local")

# TODO: keep in sync with frontend trackedTickers config.
DEFAULT_TICKERS = [
    "AAPL",
    "MSFT",
    "TSLA",
    "SPY",
    "VTI",
    "VOO",
]

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "prices.json"
UNIVERSE_FILE = DEFAULT_OUTPUT_DIR / "ticker-universe.json"


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_universe_tickers() -> List[str]:
    """
    Try to load dynamic tickers from ticker-universe.json.

    Falls back to DEFAULT_TICKERS if the file is missing, invalid, or empty.

    Expected schema:

    {
      "generatedAt": "...",
      "tickers": ["TSLA", "AAPL", ...]
      // or "universe": [...]
    }
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


def fetch_latest_price(ticker: str) -> Dict[str, Any]:
    """
    Fetch latest price for a single ticker using yfinance.

    Returns a dict with ticker, price, currency, timestamp.
    If anything fails, returns an object with `price` = None.
    """
    try:
        t = yf.Ticker(ticker)
        info = t.fast_info if hasattr(t, "fast_info") else getattr(t, "info", {})

        price = None
        currency = None

        # Try fast_info first
        if info:
            # fast_info may be an object or dict depending on yfinance version
            price = getattr(info, "last_price", None)
            if price is None and isinstance(info, dict):
                price = info.get("last_price")

            currency = getattr(info, "currency", None)
            if currency is None and isinstance(info, dict):
                currency = info.get("currency")

        # Fallback to history
        if price is None:
            hist = t.history(period="1d")
            if not hist.empty:
                price = float(hist["Close"].iloc[-1])

        return {
            "ticker": ticker.upper(),
            "price": price,
            "currency": currency or "USD",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "ticker": ticker.upper(),
            "price": None,
            "currency": None,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "error": str(exc),
        }


def fetch_prices_snapshot(tickers: Iterable[str]) -> Dict[str, Any]:
    """
    Build a full prices snapshot dict for the given tickers.
    """
    tickers_list: List[str] = sorted({t.upper().strip() for t in tickers if t.strip()})
    data = [fetch_latest_price(t) for t in tickers_list]

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
    CLI entry point. Example:

        PYTHONPATH=src python -m data_scout.prices
    """
    if tickers is None:
        tickers = load_universe_tickers()
    else:
        tickers = list(tickers)

    snapshot = fetch_prices_snapshot(tickers)
    write_snapshot(snapshot)
    print(
        f"[prices] Wrote snapshot for {len(snapshot['universe'])} tickers "
        f"→ {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
