# src/data_scout/fetchers/fetch_prices.py

"""
Fetch daily OHLCV price data for a list of symbols using yahooquery,
and save it both as:

  - Parquet: public/data/pandas/daily_prices.parquet  (raw, efficient storage)
  - JSON:    public/data/fetched/prices-raw.json      (existing shape for indicators)

This is your "prices" fetcher for the main u-Stock project.

Incremental behavior (snapshot-level):

- We look at public/data/fetched/prices-raw.json (if it exists).
- If its "generated_at" timestamp is newer than MAX_PRICE_AGE_MINUTES,
  we treat the snapshot as fresh and SKIP refetching the universe.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional

import pandas as pd
from yahooquery import Ticker

from data_scout.tickers.universe import load_us_universe_symbols


# ---------- CONFIG / CONSTANTS -----------------------------------------------

BASE_PRICE_COLS = [
    "symbol",
    "date",
    "open",
    "high",
    "low",
    "close",
    "volume",
    "adjclose",
]

# How fresh the snapshot must be (based on JSON generated_at) to skip refetch.
# Tune this as you like (e.g. 60 = 1 hour, 1440 = 1 day).
MAX_PRICE_AGE_MINUTES = 60


# ---------- PATH HELPERS -----------------------------------------------------


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


def prices_parquet_path() -> Path:
    return get_project_root() / "public" / "data" / "pandas" / "daily_prices.parquet"


def prices_json_path() -> Path:
    return get_project_root() / "public" / "data" / "fetched" / "prices-raw.json"


# ---------- SNAPSHOT FRESHNESS -----------------------------------------------


def load_existing_prices_generated_at() -> Optional[datetime]:
    """
    Read public/data/fetched/prices-raw.json (if present) and return its
    'generated_at' timestamp as an aware UTC datetime. If anything fails,
    return None.
    """
    path = prices_json_path()
    if not path.exists():
        return None

    try:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception as e:
        print(f"[prices] Warning: failed to read existing JSON snapshot: {e}")
        return None

    ts_str = payload.get("generated_at")
    if not ts_str:
        return None

    try:
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        else:
            ts = ts.astimezone(timezone.utc)
        return ts
    except Exception as e:
        print(f"[prices] Warning: failed to parse generated_at '{ts_str}': {e}")
        return None


def prices_snapshot_is_fresh() -> bool:
    """
    Decide whether the existing prices snapshot is fresh enough to skip
    refetching.

    Logic:
      - If we can't read generated_at → treat as stale.
      - Otherwise, compare generated_at against now - MAX_PRICE_AGE_MINUTES.
    """
    ts = load_existing_prices_generated_at()
    if ts is None:
        print("[prices] No existing JSON snapshot (or no generated_at); not fresh.")
        return False

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=MAX_PRICE_AGE_MINUTES)
    is_fresh = ts >= cutoff

    print(
        f"[prices] Existing snapshot generated_at={ts}, cutoff={cutoff}, "
        f"is_fresh={is_fresh}"
    )
    return is_fresh


# ---------- Core single-batch fetcher ----------------------------------------


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

    # Empty input → empty DataFrame with the expected columns
    if not symbols:
        print("[prices] No symbols provided, returning empty DataFrame.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    try:
        t = Ticker(symbols)
        df = t.history(period=period, interval=interval)
    except Exception as e:
        print(f"[prices] ERROR: failed to fetch history for batch: {e}")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    # yahooquery can sometimes return a dict; we expect a DataFrame
    if df is None:
        print("[prices] Warning: no data returned for batch (None).")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    if not isinstance(df, pd.DataFrame):
        print(f"[prices] Warning: unexpected history type {type(df)}, expected DataFrame.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    if df.empty:
        print("[prices] Warning: empty DataFrame returned for batch.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    # Reset index so "symbol" and "date" are columns (for MultiIndex)
    df = df.reset_index()

    # Ensure we have symbol + date columns
    if "symbol" not in df.columns:
        if len(symbols) == 1:
            df["symbol"] = symbols[0]
        else:
            print("[prices] ERROR: 'symbol' column not found in history DataFrame.")
            return pd.DataFrame(columns=BASE_PRICE_COLS)

    if "date" not in df.columns:
        print("[prices] ERROR: 'date' column not found in history DataFrame.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    # Keep only relevant columns
    wanted_cols = set(BASE_PRICE_COLS)
    cols = [c for c in df.columns if c in wanted_cols]
    if not cols:
        print("[prices] ERROR: no expected OHLCV columns found in history DataFrame.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

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


# ---------- Batched across the *whole* universe ------------------------------


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
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    print(f"[prices] Loaded universe: {len(symbols)} symbols.")
    frames: List[pd.DataFrame] = []

    for i in range(0, len(symbols), batch_size):
        batch = symbols[i: i + batch_size]
        print(f"[prices] Batch {i // batch_size + 1}: {len(batch)} symbols.")
        batch_df = fetch_prices(batch, period=period, interval=interval)
        if not batch_df.empty:
            frames.append(batch_df)

    if not frames:
        print("[prices] No data fetched for any batch; returning empty DataFrame.")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    full_df = pd.concat(frames, ignore_index=True)
    full_df = full_df.sort_values(["symbol", "date"]).reset_index(drop=True)
    print(
        f"[prices] Combined DataFrame has {len(full_df)} rows, "
        f"{full_df['symbol'].nunique()} symbols."
    )
    return full_df


# ---------- Save helpers (pandas + JSON) -------------------------------------


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


# ---------- Main entrypoint ---------------------------------------------------


def main() -> None:
    """
    CLI entrypoint: fetch prices for the full US universe (batched),
    then save to Parquet + JSON, with snapshot-level freshness.

    - If prices-raw.json is "fresh" (generated_at within MAX_PRICE_AGE_MINUTES),
      we skip hitting Yahoo entirely.
    """
    print("[prices] Fetching daily prices for US universe (snapshot incremental)…", flush=True)

    if prices_snapshot_is_fresh():
        print("[prices] Existing prices snapshot is fresh; skipping fetch.")
        return

    df = fetch_prices_for_universe(period="1mo", interval="1d", batch_size=400)

    if df.empty:
        print("[prices] No data fetched; skipping save.")
        return

    # Tiny preview instead of spamming every symbol
    preview_cols = [
        c
        for c in ["symbol", "date", "open", "high", "low", "close", "volume"]
        if c in df.columns
    ]
    print("\n[prices] Sample (up to 5 rows):")
    try:
        print(df[preview_cols].head(5).to_string(index=False))
    except Exception:
        print(df.head(5).to_string(index=False))

    print(
        f"\n[prices] Final snapshot: {len(df)} rows, "
        f"{df['symbol'].nunique()} symbols, "
        f"from {df['date'].min()} → {df['date'].max()}"
    )

    # Save in both formats
    save_prices_parquet(df)
    save_prices_json(df)


if __name__ == "__main__":
    main()
