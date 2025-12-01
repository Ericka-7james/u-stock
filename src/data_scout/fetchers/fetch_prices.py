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

from data_scout.tickers.universe import load_us_universe_symbols


# ---------- Core single-batch fetcher ----------


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
    print(f"[prices] Fetching prices for {len(symbols)} symbols in one batch…")

    base_cols = [
        "symbol",
        "date",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "adjclose",
    ]

    # Empty input → empty DataFrame with the expected columns
    if not symbols:
        print("[prices] No symbols provided, returning empty DataFrame.")
        return pd.DataFrame(columns=base_cols)

    try:
        t = Ticker(symbols)
        df = t.history(period=period, interval=interval)
    except Exception as e:
        print(f"[prices] ERROR: failed to fetch history for batch: {e}")
        return pd.DataFrame(columns=base_cols)

    # yahooquery can sometimes return a dict; we expect a DataFrame
    if df is None:
        print("[prices] Warning: no data returned for batch (None).")
        return pd.DataFrame(columns=base_cols)

    if not isinstance(df, pd.DataFrame):
        print(f"[prices] Warning: unexpected history type {type(df)}, expected DataFrame.")
        return pd.DataFrame(columns=base_cols)

    if df.empty:
        print("[prices] Warning: empty DataFrame returned for batch.")
        return pd.DataFrame(columns=base_cols)

    # Reset index so "symbol" and "date" are columns (for MultiIndex)
    df = df.reset_index()

    # Ensure we have symbol + date columns
    if "symbol" not in df.columns:
        if len(symbols) == 1:
            df["symbol"] = symbols[0]
        else:
            print("[prices] ERROR: 'symbol' column not found in history DataFrame.")
            return pd.DataFrame(columns=base_cols)

    if "date" not in df.columns:
        print("[prices] ERROR: 'date' column not found in history DataFrame.")
        return pd.DataFrame(columns=base_cols)

    # Keep only relevant columns
    wanted_cols = set(base_cols)
    cols = [c for c in df.columns if c in wanted_cols]
    if not cols:
        print("[prices] ERROR: no expected OHLCV columns found in history DataFrame.")
        return pd.DataFrame(columns=base_cols)

    subset = df[cols].copy()

    # Normalize date by first casting to string, then parsing as UTC
    subset["date"] = pd.to_datetime(
        subset["date"].astype(str),
        utc=True,
        errors="coerce",
    )
    subset = subset.dropna(subset=["date", "close"])

    # Sort for nicer downstream behavior
    subset = subset.sort_values(["symbol", "date"]).reset_index(drop=True)

    return subset


def fetch_prices_df(
    symbols: List[str],
    period: str = "1mo",
    interval: str = "1d",
) -> pd.DataFrame:
    """
    Backwards-compatible alias for fetch_prices.

    Old tests and callers imported fetch_prices_df; internally we now
    implement everything in fetch_prices(), so this just forwards.
    """
    return fetch_prices(symbols=symbols, period=period, interval=interval)


# ---------- Batched across the *whole* universe ----------


def fetch_prices_for_universe(
    period: str = "1mo",
    interval: str = "1d",
    batch_size: int = 400,
) -> pd.DataFrame:
    """
    Fetch prices for the full US equities universe in reasonably sized batches.

    Uses data_scout.tickers.universe.load_us_universe_symbols() as the source
    of truth for valid tickers.
    """
    symbols = load_us_universe_symbols()
    symbols = [s for s in symbols if isinstance(s, str) and s.strip()]

    if not symbols:
        print("[prices] Universe is empty; nothing to fetch.")
        return pd.DataFrame(
            columns=[
                "symbol",
                "date",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "adjclose",
            ]
        )

    print(f"[prices] Loaded universe: {len(symbols)} symbols.")
    frames: List[pd.DataFrame] = []

    for i in range(0, len(symbols), batch_size):
        batch = symbols[i : i + batch_size]
        print(f"[prices] Batch {i // batch_size + 1}: {len(batch)} symbols.")
        batch_df = fetch_prices(batch, period=period, interval=interval)
        if not batch_df.empty:
            frames.append(batch_df)

    if not frames:
        print("[prices] No data fetched for any batch; returning empty DataFrame.")
        return pd.DataFrame(
            columns=[
                "symbol",
                "date",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "adjclose",
            ]
        )

    full_df = pd.concat(frames, ignore_index=True)
    full_df = full_df.sort_values(["symbol", "date"]).reset_index(drop=True)
    print(f"[prices] Combined DataFrame has {len(full_df)} rows.")
    return full_df


# ---------- Save helpers (pandas + JSON) ----------


def get_project_root() -> Path:
    """
    Compute project root from this file location.

    This file lives at: src/data_scout/fetchers/fetch_prices.py

    parents[0] -> fetchers
    parents[1] -> data_scout
    parents[2] -> src
    parents[3] -> project root   ✅
    """
    return Path(__file__).resolve().parents[3]


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
    print(f"[prices] Saved Parquet price data to {out_path}")
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

    print(f"[prices] Saved JSON prices snapshot to {out_path}")
    return out_path


# ---------- Main entrypoint ----------


def main() -> None:
    """
    CLI entrypoint: fetch prices for the full US universe (batched),
    then save to Parquet + JSON.
    """
    print("[prices] Fetching daily prices for US universe…", flush=True)

    df = fetch_prices_for_universe(period="1mo", interval="1d", batch_size=400)

    if df.empty:
        print("[prices] No data fetched; skipping save.")
        return

    # Quick summary for logs
    print("\n[prices] === SUMMARY (per symbol) ===")
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
