"""
Fetch daily OHLCV price data for a list of symbols using yahooquery,
and save it both as:

  - Parquet: public/data/pandas/daily_prices.parquet  (raw, efficient storage)
  - JSON:    public/data/fetched/prices-raw.json      (existing shape for indicators)

This is your "prices" fetcher for the main u-Stock project.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd
from yahooquery import Ticker


# ---------- Core fetcher (batched) ----------

def fetch_prices(
    symbols: List[str],
    period: str = "1mo",
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Fetch OHLCV price data for a list of symbols in a single batched request.

    :param symbols: list of ticker strings, e.g. ["AAPL", "MSFT", "GOOG"]
    :param period:  lookback window, e.g. "1mo", "3mo", "1y"
    :param interval: bar size, e.g. "1d", "1h", "30m"
    :return: pandas DataFrame with columns:
             ["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"]
    """
    print(f"Fetching prices for {len(symbols)} symbols in batch...")

    if not symbols:
        print("No symbols provided, returning empty DataFrame.")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    try:
        t = Ticker(symbols)
        df = t.history(period=period, interval=interval)
    except Exception as e:
        print(f"ERROR: failed to fetch history for batch: {e}")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    # yahooquery can sometimes return a dict; we expect a DataFrame
    if df is None:
        print("Warning: no data returned for batch (None).")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if not isinstance(df, pd.DataFrame):
        print(f"Warning: unexpected history type {type(df)}, expected DataFrame.")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if df.empty:
        print("Warning: empty DataFrame returned for batch.")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    # Reset index so "symbol" and "date" are columns (for MultiIndex)
    df = df.reset_index()

    # Ensure we have symbol + date columns
    if "symbol" not in df.columns:
        if len(symbols) == 1:
            df["symbol"] = symbols[0]
        else:
            print("ERROR: 'symbol' column not found in history DataFrame.")
            return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if "date" not in df.columns:
        print("ERROR: 'date' column not found in history DataFrame.")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    # Keep only relevant columns
    wanted_cols = {
        "symbol",
        "date",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "adjclose",
    }
    cols = [c for c in df.columns if c in wanted_cols]
    if not cols:
        print("ERROR: no expected OHLCV columns found in history DataFrame.")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    subset = df[cols].copy()

    # 🔧 FIX: normalize date by first casting to string, then parsing as UTC
    subset["date"] = pd.to_datetime(subset["date"].astype(str), utc=True, errors="coerce")
    subset = subset.dropna(subset=["date", "close"])

    # Sort for nicer downstream behavior
    subset = subset.sort_values(["symbol", "date"]).reset_index(drop=True)

    return subset


# ---------- Save helpers (pandas + JSON) ----------

def get_project_root() -> Path:
    # src/fetchers/fetch_prices.py -> src -> project root
    return Path(__file__).resolve().parents[2]


def save_prices_parquet(df: pd.DataFrame, filename: str = "daily_prices.parquet") -> Path:
    """
    Save the full daily OHLCV DataFrame as a Parquet file for efficient storage.

    Path: public/data/pandas/<filename>
    """
    project_root = get_project_root()
    data_dir = project_root / "public" / "data" / "pandas"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / filename
    df.to_parquet(out_path, index=False)
    print(f"Saved Parquet price data to {out_path}")
    return out_path


def save_prices_json(df: pd.DataFrame, filename: str = "prices-raw.json") -> Path:
    """
    Save prices to public/data/fetched/<filename> in the existing JSON shape:

    {
      "generated_at": "...",
      "symbols": [...],
      "prices": {
        "AAPL": [ { ... }, ... ],
        ...
      }
    }
    """
    project_root = get_project_root()
    data_dir = project_root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / filename

    if df.empty:
        wrapper = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "symbols": [],
            "prices": {},
        }
    else:
        # Convert date to string for JSON and group by symbol
        df_for_json = df.copy()
        df_for_json["date"] = df_for_json["date"].astype(str)

        prices_by_symbol: Dict[str, Any] = {}
        for symbol, group in df_for_json.groupby("symbol"):
            records = group.to_dict(orient="records")
            prices_by_symbol[symbol] = records

        wrapper = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "symbols": list(prices_by_symbol.keys()),
            "prices": prices_by_symbol,
        }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(wrapper, f, indent=2)

    print(f"Saved JSON prices snapshot to {out_path}")
    return out_path


# ---------- Main entrypoint ----------

def main() -> None:
    # TODO: later this will come from config / symbol universe
    symbols = ["AAPL", "MSFT", "GOOG"]

    df = fetch_prices(symbols, period="1mo", interval="1d")

    if df.empty:
        print("No data fetched; skipping save.")
        return

    print("\n=== SUMMARY (batch) ===")
    for symbol, group in df.groupby("symbol"):
        first = group.iloc[0]
        last = group.iloc[-1]
        try:
            print(
                f"{symbol}: {len(group)} rows "
                f"from {first['date']} → {last['date']} "
                f"(open={float(first.get('open')):.2f}, close={float(last.get('close')):.2f})"
            )
        except Exception:
            print(f"{symbol}: {len(group)} rows from {first['date']} → {last['date']}")

    # Save in both formats
    save_prices_parquet(df)
    save_prices_json(df)


if __name__ == "__main__":
    main()
