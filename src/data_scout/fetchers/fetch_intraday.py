from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd
from yahooquery import Ticker

from data_scout.tickers.universe import load_us_universe_symbols
from data_scout.fetchers._snapshot_utils import (
    SnapshotSpec,
    build_snapshot_wrapper,
    env_int,
    get_project_root,
    snapshot_is_fresh,
    snapshot_path,
    write_json,
    chunked,
    ensure_dir,
)

INTRADAY_BATCH_SIZE = env_int("INTRADAY_BATCH_SIZE", 300)

# ✅ Your desired defaults:
MAX_INTRADAY_AGE_2M = env_int("MAX_INTRADAY_AGE_2M", 3)
MAX_INTRADAY_AGE_5M = env_int("MAX_INTRADAY_AGE_5M", 10)
MAX_INTRADAY_AGE_15M = env_int("MAX_INTRADAY_AGE_15M", 20)

# Interval config:
# Note: Yahoo often supports 2m, but if it errors, we handle it gracefully.
INTERVALS: Dict[str, Dict[str, Any]] = {
    "2m": {"period": "5d", "max_age_minutes": MAX_INTRADAY_AGE_2M},
    "5m": {"period": "5d", "max_age_minutes": MAX_INTRADAY_AGE_5M},
    "15m": {"period": "10d", "max_age_minutes": MAX_INTRADAY_AGE_15M},
}


def intraday_parquet_path(interval: str) -> Path:
    root = get_project_root()
    return root / "public" / "data" / "pandas" / f"intraday_{interval}.parquet"


def save_intraday_parquet(df: pd.DataFrame, interval: str) -> None:
    out = intraday_parquet_path(interval)
    ensure_dir(out.parent)
    df.to_parquet(out, index=False)
    print(f"[intraday] Saved Parquet ({interval}) → {out}")


def fetch_intraday_df(symbols: List[str], *, period: str, interval: str) -> pd.DataFrame:
    if not symbols:
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    frames: List[pd.DataFrame] = []
    for idx, batch in enumerate(chunked(symbols, INTRADAY_BATCH_SIZE), start=1):
        print(f"[intraday] {interval} batch {idx} — {len(batch)} symbols")
        try:
            t = Ticker(batch)
            df = t.history(period=period, interval=interval)
        except Exception as e:
            print(f"[intraday] ERROR fetching {interval} batch {idx}: {e}")
            continue

        if df is None or not isinstance(df, pd.DataFrame) or df.empty:
            continue

        df = df.reset_index()
        wanted = {"symbol", "date", "open", "high", "low", "close", "volume", "adjclose"}
        cols = [c for c in df.columns if c in wanted]
        if not cols:
            continue

        subset = df[cols].copy()
        subset["date"] = pd.to_datetime(subset["date"].astype(str), utc=True, errors="coerce")
        subset = subset.dropna(subset=["date", "close"])
        if subset.empty:
            continue

        frames.append(subset)

    if not frames:
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values(["symbol", "date"]).reset_index(drop=True)
    return combined


def save_intraday_json(df: pd.DataFrame, interval: str) -> None:
    out = snapshot_path("intraday", interval=interval)
    spec = SnapshotSpec(dataset="intraday", interval=interval)

    if df.empty:
        wrapper = build_snapshot_wrapper(spec=spec, symbols=[], data_key="prices", data={})
        write_json(out, wrapper)
        print(f"[intraday] Saved empty snapshot ({interval}) → {out}")
        return

    df_json = df.copy()
    df_json["date"] = df_json["date"].astype(str)

    grouped: Dict[str, Any] = {
        sym: grp.to_dict(orient="records") for sym, grp in df_json.groupby("symbol")
    }

    wrapper = build_snapshot_wrapper(
        spec=spec,
        symbols=sorted(grouped.keys()),
        data_key="prices",
        data=grouped,
    )
    write_json(out, wrapper)
    print(f"[intraday] Saved JSON snapshot ({interval}) → {out}")


def main() -> None:
    universe = load_us_universe_symbols()
    symbols = universe[:300]  # keep your dev slice; later you can change to a config list
    print(f"[intraday] Using {len(symbols)} symbols")

    for interval, cfg in INTERVALS.items():
        out = snapshot_path("intraday", interval=interval)
        max_age = int(cfg["max_age_minutes"])
        period = str(cfg["period"])

        if snapshot_is_fresh(out, max_age):
            print(f"[intraday] {interval} snapshot is fresh (<={max_age} min). Skipping.")
            continue

        print(f"[intraday] {interval} snapshot stale. Fetching… (period={period})")
        df = fetch_intraday_df(symbols, period=period, interval=interval)

        if not df.empty:
            save_intraday_parquet(df, interval=interval)

        save_intraday_json(df, interval=interval)


if __name__ == "__main__":
    main()
