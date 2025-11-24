# src/indicators/multiday_indicators.py

"""
multiday_indicators.py

Compute multi-day indicators (1d/3d/5d/10d returns and rolling volatility)
from *daily* closing prices and write them to a clean JSON file.

Input (from fetch_prices.py):

    public/data/fetched/prices-raw.json

    {
      "generated_at": "...",
      "symbols": ["AAPL", "MSFT", ...],
      "prices": {
        "AAPL": [
          { "symbol": "AAPL", "date": "...", "open": ..., "close": ..., ... },
          ...
        ],
        "MSFT": [ ... ],
        ...
      }
    }

Output:

    public/data/indicators/multiday-indicators.json

    {
      "generatedAt": "...",
      "windowDescription": "Daily multi-day returns and volatility",
      "universe": ["AAPL", "MSFT", ...],
      "data": [
        {
          "ticker": "AAPL",
          "latestDate": "2025-11-22T00:00:00+00:00",
          "indicators": {
            "return_1d": 0.0084,
            "return_3d": 0.0123,
            "return_5d": null,
            "return_10d": null,
            "vol_5d": 0.0132,
            "vol_10d": null,
            "vol_20d": null
          }
        },
        ...
      ]
    }
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd  # type: ignore

# Match your project layout: src/... -> project root is 2 levels up
PROJECT_ROOT = Path(__file__).resolve().parents[2]

INPUT_PATH = PROJECT_ROOT / "public" / "data" / "fetched" / "prices-raw.json"
OUTPUT_PATH = PROJECT_ROOT / "public" / "data" / "indicators" / "multiday-indicators.json"

# Multi-day windows (in trading days)
RETURN_WINDOWS = [1, 3, 5, 10]
VOL_WINDOWS = [5, 10, 20]


@dataclass
class PricesRawSnapshot:
    generated_at: str
    symbols: List[str]
    frame: pd.DataFrame


def load_prices_raw(path: Path = INPUT_PATH) -> PricesRawSnapshot:
    """
    Load prices-raw.json and flatten to a tidy DataFrame.

    Expected structure:

    {
      "generated_at": "...",
      "symbols": [...],
      "prices": {
        "AAPL": [ { "symbol": "AAPL", "date": "...", "close": ..., ... }, ... ],
        ...
      }
    }
    """
    if not path.exists():
        raise FileNotFoundError(f"Prices file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    generated_at = payload.get("generated_at")
    symbols = payload.get("symbols", [])
    prices_by_symbol = payload.get("prices", {})

    records: List[Dict[str, Any]] = []

    for symbol, rows in prices_by_symbol.items():
        if not isinstance(rows, list):
            continue
        for row in rows:
            # Make sure symbol is present and consistent
            row_symbol = row.get("symbol") or symbol
            date_str = row.get("date")
            close = row.get("close")

            # We only care about rows with a close price and date
            if date_str is None or close is None:
                continue

            records.append(
                {
                    "ticker": row_symbol,
                    "date": date_str,
                    "close": close,
                }
            )

    if not records:
        # Empty frame, but keep metadata
        frame = pd.DataFrame(columns=["ticker", "date", "close"])
        return PricesRawSnapshot(generated_at, symbols, frame)

    df = pd.DataFrame.from_records(records)

    # Parse dates and sort
    df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    df = df.dropna(subset=["date", "close"])
    df = df.sort_values(["ticker", "date"]).reset_index(drop=True)

    return PricesRawSnapshot(generated_at, symbols, df)


def _compute_indicators_for_ticker(df_ticker: pd.DataFrame) -> Dict[str, Optional[float]]:
    """
    Given daily prices for a single ticker (sorted by date),
    compute multi-day returns and rolling volatility.
    """
    df_ticker = df_ticker.sort_values("date")
    closes = df_ticker["close"].astype(float).to_list()
    n = len(closes)

    # Daily returns series
    daily_returns = df_ticker["close"].astype(float).pct_change().dropna()

    indicators: Dict[str, Optional[float]] = {}

    # Multi-day returns: (last_close / close_n_days_ago) - 1
    for window in RETURN_WINDOWS:
        key = f"return_{window}d"
        if n > window:
            last_close = closes[-1]
            prev_close = closes[-(window + 1)]
            if prev_close == 0:
                indicators[key] = None
            else:
                indicators[key] = float(last_close / prev_close - 1.0)
        else:
            indicators[key] = None

    # Rolling volatility: std dev of daily returns over last N days
    for window in VOL_WINDOWS:
        key = f"vol_{window}d"
        if len(daily_returns) >= window:
            indicators[key] = float(daily_returns.tail(window).std())
        else:
            indicators[key] = None

    return indicators


def compute_multiday_indicators(snapshot: PricesRawSnapshot) -> Dict[str, Any]:
    """
    Compute indicators for each ticker and return a JSON-serializable payload.
    """
    df = snapshot.frame

    if df.empty:
        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "generatedAt": now_iso,
            "windowDescription": "Daily multi-day returns and volatility",
            "universe": [],
            "data": [],
        }

    results: List[Dict[str, Any]] = []

    for ticker, df_ticker in df.groupby("ticker"):
        indicators = _compute_indicators_for_ticker(df_ticker)
        latest_date = df_ticker["date"].max()

        results.append(
            {
                "ticker": ticker,
                "latestDate": latest_date.isoformat(),
                "indicators": indicators,
            }
        )

    # If the input had symbols, use them as universe, otherwise infer
    universe = snapshot.symbols or sorted(df["ticker"].unique().tolist())
    generated_at = snapshot.generated_at or datetime.now(timezone.utc).isoformat()

    payload: Dict[str, Any] = {
        "generatedAt": generated_at,
        "windowDescription": "Daily multi-day returns and volatility",
        "universe": universe,
        "data": results,
    }
    return payload


def save_multiday_indicators(payload: Dict[str, Any], path: Path = OUTPUT_PATH) -> None:
    """
    Write indicators payload to JSON.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def main() -> None:
    snapshot = load_prices_raw()
    payload = compute_multiday_indicators(snapshot)
    save_multiday_indicators(payload)
    print(
        f"Wrote multiday indicators for {len(payload.get('data', []))} tickers "
        f"to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
