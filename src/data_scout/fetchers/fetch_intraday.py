# src/data_scout/fetchers/fetch_intraday.py

"""
Fetch intraday OHLCV price data (5m and 15m bars) for a list of symbols using
yahooquery, and save them as:

  - Parquet (raw efficient storage):
      public/data/pandas/intraday_<interval>.parquet

  - JSON snapshots (for indicators / app):
      public/data/fetched/intraday-<interval>.json

This version:

- Uses batched yahooquery calls (chunked symbols) for better scalability.
- Can be run as a CLI script via npm (e.g. `npm run fetch:intraday`).
- Adds *snapshot freshness* per interval:
    * For each interval, we look at the existing Parquet.
    * If its latest `date` is newer than MAX_INTRADAY_AGE_MINUTES[interval],
      we skip refetching for that interval.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd
from yahooquery import Ticker

from data_scout.tickers.universe import load_us_universe_symbols


# ---------- CONFIG ------------------------------------------------------------

# Batch size for yahooquery intraday calls
INTRADAY_BATCH_SIZE = 300

# How "fresh" each interval's snapshot must be before we skip refetching.
# You can tune these as you like.
MAX_INTRADAY_AGE_MINUTES: Dict[str, int] = {
    "5m": 5,    # if latest bar < 5 minutes old, skip refetching 5m
    "15m": 15,  # if latest bar < 15 minutes old, skip refetching 15m
}


# ---------- HELPERS -----------------------------------------------------------


def get_project_root() -> Path:
    """
    Compute project root from this file location.

    This file lives at: src/data_scout/fetchers/fetch_intraday.py

    parents[0] -> fetchers
    parents[1] -> data_scout
    parents[2] -> src
    parents[3] -> project root   ✅
    """
    return Path(__file__).resolve().parents[3]


def chunked(seq: List[str], size: int) -> List[List[str]]:
    """Yield successive chunks of size `size` from seq."""
    return [seq[i: i + size] for i in range(0, len(seq), size)]


def intraday_parquet_path(interval: str) -> Path:
    """
    Path helper for intraday parquet:
        public/data/pandas/intraday_<interval>.parquet
    """
    root = get_project_root()
    return root / "public" / "data" / "pandas" / f"intraday_{interval}.parquet"


def load_existing_intraday(interval: str) -> pd.DataFrame:
    """
    Load existing intraday parquet for the given interval, if present.
    Returns an empty DataFrame if the file doesn't exist.
    """
    path = intraday_parquet_path(interval)
    if not path.exists():
        return pd.DataFrame()

    try:
        df = pd.read_parquet(path)
    except Exception as e:
        print(f"[intraday] Warning: failed to read existing intraday parquet ({interval}): {e}")
        return pd.DataFrame()

    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], utc=True, errors="coerce")
    return df


def intraday_snapshot_is_fresh(df: pd.DataFrame, interval: str) -> bool:
    """
    Decide whether an intraday snapshot is "fresh" enough to skip refetching
    for this interval.

    Logic:
      - If df is empty or 'date' is missing → not fresh.
      - Otherwise, check max(df['date']) against now - MAX_INTRADAY_AGE_MINUTES.
    """
    if df.empty or "date" not in df.columns:
        return False

    max_age_minutes = MAX_INTRADAY_AGE_MINUTES.get(interval, 5)
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=max_age_minutes)

    try:
        latest_ts = pd.to_datetime(df["date"], utc=True, errors="coerce").max()
    except Exception:
        return False

    if pd.isna(latest_ts):
        return False

    is_fresh = latest_ts >= cutoff
    print(
        f"[intraday] Existing {interval} snapshot latest_ts={latest_ts}, "
        f"cutoff={cutoff}, is_fresh={is_fresh}"
    )
    return is_fresh


# ---------- Core batched intraday fetcher -------------------------------------


def fetch_intraday_df(
    symbols: List[str],
    *,
    period: str = "5d",
    interval: str = "5m",
    batch_size: int = INTRADAY_BATCH_SIZE,
) -> pd.DataFrame:
    """
    Fetch intraday OHLCV data for tickers using batched yahooquery calls.

    Returns DataFrame with columns:
      ["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"]
    """
    print(
        f"[intraday] Fetching intraday batch: {len(symbols)} symbols, "
        f"interval={interval}, period={period}, batch_size={batch_size}"
    )

    if not symbols:
        print("[intraday] No symbols provided; returning empty DataFrame.")
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

    all_frames: List[pd.DataFrame] = []
    batches = chunked(symbols, batch_size)

    for batch_idx, batch in enumerate(batches, start=1):
        print(
            f"[intraday] Batch {batch_idx}/{len(batches)} — {len(batch)} symbols "
            f"(interval={interval}, period={period})"
        )

        try:
            t = Ticker(batch)
            df = t.history(period=period, interval=interval)
        except Exception as e:
            print(f"[intraday] ERROR fetching intraday batch {batch_idx}: {e}")
            continue

        if df is None:
            print(f"[intraday] Warning: history returned None for batch {batch_idx}")
            continue

        if not isinstance(df, pd.DataFrame):
            print(
                f"[intraday] Warning: unexpected history type {type(df)} "
                f"for batch {batch_idx}, expected DataFrame."
            )
            continue

        if df.empty:
            print(f"[intraday] Warning: empty DataFrame for batch {batch_idx}")
            continue

        df = df.reset_index()

        # Columns we care about
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
            print(
                f"[intraday] ERROR: no expected OHLCV columns found in "
                f"history DataFrame for batch {batch_idx}"
            )
            continue

        subset = df[cols].copy()

        # Normalize date → UTC + drop empty rows
        subset["date"] = pd.to_datetime(
            subset["date"].astype(str), utc=True, errors="coerce"
        )
        subset = subset.dropna(subset=["date", "close"])

        if subset.empty:
            print(
                f"[intraday] Warning: subset empty after cleaning for batch {batch_idx}"
            )
            continue

        all_frames.append(subset)

    if not all_frames:
        print("[intraday] No intraday data fetched across all batches.")
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

    combined = pd.concat(all_frames, ignore_index=True)

    # Sort nicely
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)

    print(
        f"[intraday] Combined intraday rows: {len(combined)} "
        f"({combined['symbol'].nunique()} symbols)"
    )
    return combined


# ---------- Save helpers (Parquet + JSON) ------------------------------------


def save_intraday_parquet(df: pd.DataFrame, interval: str) -> Path:
    """
    Save intraday data as Parquet:

        public/data/pandas/intraday_<interval>.parquet
    """
    root = get_project_root()
    data_dir = root / "public" / "data" / "pandas"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / f"intraday_{interval}.parquet"
    df.to_parquet(out_path, index=False)
    print(f"[intraday] Saved Parquet intraday ({interval}) to {out_path}")
    return out_path


def save_intraday_json(df: pd.DataFrame, interval: str) -> Path:
    """
    Save intraday data as JSON snapshot:

    {
      "generated_at": "...",
      "interval": "5m" | "15m" | ...,
      "symbols": [...],
      "prices": {
        "AAPL": [ { ... }, ... ],
        ...
      }
    }
    """
    root = get_project_root()
    data_dir = root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / f"intraday-{interval}.json"

    if df.empty:
        wrapper: Dict[str, Any] = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "interval": interval,
            "symbols": [],
            "prices": {},
        }
    else:
        df_json = df.copy()
        df_json["date"] = df_json["date"].astype(str)

        grouped: Dict[str, Any] = {
            symbol: group.to_dict(orient="records")
            for symbol, group in df_json.groupby("symbol")
        }

        wrapper = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "interval": interval,
            "symbols": list(grouped.keys()),
            "prices": grouped,
        }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(wrapper, f, indent=2)

    print(f"[intraday] Saved intraday JSON ({interval}) to {out_path}")
    return out_path


# ---------- MAIN CLI ENTRYPOINT ----------------------------------------------


def main() -> None:
    """
    CLI entrypoint:

    - Load symbol universe (you can slice it for local dev).
    - For each interval (5m, 15m):
        * Check existing parquet freshness.
        * If stale or missing → refetch & overwrite parquet + JSON.
        * If fresh → skip fetch for that interval.
    """
    universe = load_us_universe_symbols()
    print(f"[intraday] Universe size: {len(universe)} symbols")

    # For local dev, you may NOT want all ~5.5k symbols.
    # Adjust slice as needed, or wire this to signals / a config list.
    symbols = universe[:300]
    print(f"[intraday] Using {len(symbols)} symbols for intraday fetch")

    # -------- 5 minute bars, last 5 days -------------------------------------
    existing_5m = load_existing_intraday("5m")
    if intraday_snapshot_is_fresh(existing_5m, "5m"):
        print("[intraday] 5m snapshot is fresh; skipping fetch.")
    else:
        df_5m = fetch_intraday_df(
            symbols,
            period="5d",
            interval="5m",
        )

        if not df_5m.empty:
            # Tiny preview
            preview_cols = [
                c
                for c in ["symbol", "date", "open", "high", "low", "close", "volume"]
                if c in df_5m.columns
            ]
            print("\n[intraday] Sample (5m, up to 5 rows):")
            try:
                print(df_5m[preview_cols].head(5).to_string(index=False))
            except Exception:
                print(df_5m.head(5).to_string(index=False))

            save_intraday_parquet(df_5m, interval="5m")
            save_intraday_json(df_5m, interval="5m")
        else:
            print("[intraday] No 5m data fetched; skipping save.")

    # -------- 15 minute bars, last 10 days -----------------------------------
    existing_15m = load_existing_intraday("15m")
    if intraday_snapshot_is_fresh(existing_15m, "15m"):
        print("[intraday] 15m snapshot is fresh; skipping fetch.")
    else:
        df_15m = fetch_intraday_df(
            symbols,
            period="10d",
            interval="15m",
        )

        if not df_15m.empty:
            preview_cols_15 = [
                c
                for c in ["symbol", "date", "open", "high", "low", "close", "volume"]
                if c in df_15m.columns
            ]
            print("\n[intraday] Sample (15m, up to 5 rows):")
            try:
                print(df_15m[preview_cols_15].head(5).to_string(index=False))
            except Exception:
                print(df_15m.head(5).to_string(index=False))

            save_intraday_parquet(df_15m, interval="15m")
            save_intraday_json(df_15m, interval="15m")
        else:
            print("[intraday] No 15m data fetched; skipping save.")


if __name__ == "__main__":
    main()
