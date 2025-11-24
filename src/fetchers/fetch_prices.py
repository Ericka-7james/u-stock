"""
Fetch daily OHLCV price data for a list of symbols using yahooquery,
and save it as a JSON snapshot under public/data/prices-raw.json.

This is your "prices" fetcher for the main u-Stock project.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

from yahooquery import Ticker


def fetch_prices(symbols: List[str], period: str = "1mo", interval: str = "1d") -> Dict[str, Any]:
    """
    Fetch OHLCV price data for a list of symbols.

    :param symbols: list of ticker strings, e.g. ["AAPL", "MSFT", "GOOG"]
    :param period:  lookback window, e.g. "1mo", "3mo", "1y"
    :param interval: bar size, e.g. "1d", "1h", "30m"
    :return: dict mapping symbol -> list of bar dicts
    """
    data: Dict[str, Any] = {}

    for symbol in symbols:
        print(f"Fetching {symbol}...")

        t = Ticker(symbol)

        try:
            df = t.history(period=period, interval=interval)
        except Exception as e:
            print(f"  ERROR fetching {symbol}: {e}")
            continue

        if df is None or len(df) == 0:
            print(f"  Warning: no data for {symbol}")
            continue

        # Reset index so "date" is a column
        df = df.reset_index()

        # Only keep the columns we care about
        cols = [
            c
            for c in df.columns
            if c in ("symbol", "date", "open", "high", "low", "close", "volume", "adjclose")
        ]
        subset = df[cols].copy()

        # Convert to JSON-friendly records (stringify date)
        records = []
        for row in subset.to_dict(orient="records"):
            if "date" in row:
                row["date"] = str(row["date"])
            records.append(row)

        data[symbol] = records

    return data


def save_prices_json(data: Dict[str, Any], filename: str = "prices-raw.json") -> Path:
    """
    Save prices to public/data/<filename> as:

    {
      "generated_at": "...",
      "symbols": [...],
      "prices": {
        "AAPL": [ { ... }, ... ],
        ...
      }
    }
    """
    # project root = src/.. (adjust if your layout is different)
    project_root = Path(__file__).resolve().parents[2]
    data_dir = project_root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / filename

    wrapper = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "symbols": list(data.keys()),
        "prices": data,
    }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(wrapper, f, indent=2)

    print(f"\nSaved prices snapshot to {out_path}")
    return out_path


def main() -> None:
    # TODO: later this will come from config / symbol universe
    symbols = ["AAPL", "MSFT", "GOOG"]

    prices = fetch_prices(symbols, period="1mo", interval="1d")

    print("\n=== SUMMARY ===")
    for symbol, rows in prices.items():
        if not rows:
            continue
        first = rows[0]
        last = rows[-1]
        print(
            f"{symbol}: {len(rows)} rows "
            f"from {first['date']} → {last['date']} "
            f"(open={first['open']:.2f}, close={last['close']:.2f})"
        )

    save_prices_json(prices)


if __name__ == "__main__":
    main()
