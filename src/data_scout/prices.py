"""
data_scout/prices.py

Fetches latest price data for a list of tickers and writes it to
`public/data/raw/prices.json` in a simple snapshot format.

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

from data_scout.symbols import (
    load_clean_symbol_universe,
    filter_valid_symbols,
    load_delisted_symbols,
    add_delisted_symbol,
)

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# write into /raw
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "raw"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "prices.json"

# Optional curated universe file
UNIVERSE_FILE = DEFAULT_OUTPUT_DIR / "ticker-universe.json"


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_universe_tickers() -> List[str]:
    """
    Try to load dynamic tickers from ticker-universe.json.

    Returns an empty list if the file is missing, invalid, or empty.
    The caller (main) will then decide whether to fall back.
    """
    if not UNIVERSE_FILE.exists():
        return []

    try:
        with UNIVERSE_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return []

    raw = payload.get("tickers") or payload.get("universe") or []
    tickers = sorted(
        {
            (t or "").strip().upper()
            for t in raw
            if (t or "").strip()
        }
    )
    return tickers  # may be empty if file had no valid symbols


def fetch_latest_price(ticker: str) -> Dict[str, Any]:
    """
    Fetch latest price for a single ticker using yfinance.

    Returns a dict with ticker, price, currency, timestamp.
    If anything fails, returns an object with `price` = None
    and records the ticker as potentially delisted.
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
        # mark as delisted/invalid so future runs can skip it
        add_delisted_symbol(ticker)
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

    # 1) Start from curated universe file if present
    universe = load_universe_tickers()

    # 2) If curated file missing/empty, fall back to cleaned symbol universe
    if not universe:
        universe = sorted(load_clean_symbol_universe())

    # 3) Filter out any symbols already marked as delisted
    delisted = load_delisted_symbols()
    if delisted:
        universe = [t for t in universe if t not in delisted]

    if not universe:
        raise RuntimeError(
            "No tickers available: cleaned symbol universe (after delisted filter) is empty. "
            "Check us_tickers.csv or ticker-universe.json."
        )

    # 4) If explicit tickers were passed, validate against the filtered universe
    if tickers is not None:
        universe_set = set(universe)
        tickers_list = filter_valid_symbols(tickers, universe_set)
    else:
        tickers_list = universe

    # 5) Build snapshot
    snapshot = fetch_prices_snapshot(tickers_list)

    # 6) Write to disk
    write_snapshot(snapshot)

    print(
        f"[prices] Wrote snapshot for {len(snapshot['universe'])} tickers "
        f"→ {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
