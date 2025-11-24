"""
Fetch intraday OHLCV price data (5m and 15m bars) for a list of symbols
using yahooquery, and save them as JSON snapshots under:

  public/data/fetched/intraday-5m.json
  public/data/fetched/intraday-15m.json
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

from yahooquery import Ticker


def fetch_intraday(
    symbols: List[str],
    period: str = "5d",
    interval: str = "5m",
) -> Dict[str, Any]:
    """
    Fetch intraday OHLCV data for each symbol.

    :param symbols: list of tickers, e.g. ["AAPL", "MSFT"]
    :param period:  lookback window, e.g. "5d", "10d"
    :param interval: bar size, e.g. "5m", "15m"
    :return: dict mapping symbol -> list of bar dicts
    """
    data: Dict[str, Any] = {}

    for symbol in symbols:
        print(f"Fetching intraday {interval} for {symbol} (period={period})...")

        t = Ticker(symbol)

        try:
            df = t.history(period=period, interval=interval)
        except Exception as e:
            print(f"  ERROR fetching {symbol}: {e}")
            continue

        if df is None or len(df) == 0:
            print(f"  Warning: no intraday data for {symbol}")
            continue

        # Reset index so "date" is a column
        df = df.reset_index()

        # Keep core OHLCV columns (plus symbol/date if present)
        cols = [
            c
            for c in df.columns
            if c in ("symbol", "date", "open", "high", "low", "close", "volume", "adjclose")
        ]
        subset = df[cols].copy()

        # Convert to JSON-friendly records (stringify date)
        records: List[Dict[str, Any]] = []
        for row in subset.to_dict(orient="records"):
            if "date" in row:
                row["date"] = str(row["date"])
            records.append(row)

        data[symbol] = records

    return data


def save_intraday_json(
    data: Dict[str, Any],
    interval_label: str,
    filename: str | None = None,
) -> Path:
    """
    Save intraday data to public/data/fetched/<filename> as:

    {
      "generated_at": "...",
      "interval": "5m",
      "symbols": ["AAPL", "MSFT"],
      "prices": {
        "AAPL": [ { ... }, ... ],
        "MSFT": [ { ... }, ... ]
      }
    }
    """
    project_root = Path(__file__).resolve().parents[2]
    data_dir = project_root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    if filename is None:
        filename = f"intraday-{interval_label}.json"

    out_path = data_dir / filename

    wrapper = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "interval": interval_label,
        "symbols": list(data.keys()),
        "prices": data,
    }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(wrapper, f, indent=2)

    print(f"\nSaved intraday snapshot ({interval_label}) to {out_path}")
    return out_path


def main() -> None:
    # TODO: later pull this from your symbol universe
    symbols = ["AAPL", "MSFT", "GOOG"]

    # 5-minute bars, last 5 days
    data_5m = fetch_intraday(symbols, period="5d", interval="5m")
    save_intraday_json(data_5m, interval_label="5m", filename="intraday-5m.json")

    # 15-minute bars, last 10 days
    data_15m = fetch_intraday(symbols, period="10d", interval="15m")
    save_intraday_json(data_15m, interval_label="15m", filename="intraday-15m.json")


if __name__ == "__main__":
    main()
