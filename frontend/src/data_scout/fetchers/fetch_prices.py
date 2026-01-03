from __future__ import annotations

from datetime import timezone
from pathlib import Path
from typing import Any, Dict, List

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

BASE_PRICE_COLS = ["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"]

# ✅ Your desired default: 1 day
MAX_PRICE_AGE_MINUTES = env_int("MAX_PRICE_AGE_MINUTES", 1440)

DEFAULT_BATCH_SIZE = env_int("PRICES_BATCH_SIZE", 400)


def prices_parquet_path() -> Path:
    root = get_project_root()
    return root / "public" / "data" / "pandas" / "daily_prices.parquet"


def save_prices_parquet(df: pd.DataFrame) -> None:
    out_path = prices_parquet_path()
    ensure_dir(out_path.parent)
    df.to_parquet(out_path, index=False)
    print(f"[prices] Saved Parquet → {out_path}")


def fetch_prices_batch(symbols: List[str], *, period: str = "1mo", interval: str = "1d") -> pd.DataFrame:
    if not symbols:
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    try:
        t = Ticker(symbols)
        df = t.history(period=period, interval=interval)
    except Exception as e:
        print(f"[prices] ERROR fetching history: {e}")
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    if df is None or not isinstance(df, pd.DataFrame) or df.empty:
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    df = df.reset_index()

    wanted = set(BASE_PRICE_COLS)
    cols = [c for c in df.columns if c in wanted]
    if not cols:
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    subset = df[cols].copy()

    # Normalize date to UTC
    subset["date"] = pd.to_datetime(subset["date"].astype(str), utc=True, errors="coerce")
    subset = subset.dropna(subset=["date", "close"])
    subset = subset.sort_values(["symbol", "date"]).reset_index(drop=True)
    return subset


def fetch_prices_for_universe(*, period: str = "1mo", interval: str = "1d", batch_size: int = DEFAULT_BATCH_SIZE) -> pd.DataFrame:
    universe = [s for s in load_us_universe_symbols() if isinstance(s, str) and s.strip()]
    if not universe:
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    frames: List[pd.DataFrame] = []
    for idx, batch in enumerate(chunked(universe, batch_size), start=1):
        print(f"[prices] Batch {idx} — {len(batch)} symbols")
        df = fetch_prices_batch(batch, period=period, interval=interval)
        if not df.empty:
            frames.append(df)

    if not frames:
        return pd.DataFrame(columns=BASE_PRICE_COLS)

    full = pd.concat(frames, ignore_index=True)
    full = full.sort_values(["symbol", "date"]).reset_index(drop=True)
    return full


def save_prices_json(df: pd.DataFrame) -> None:
    # Standard snapshot name: prices.json (instead of prices-raw.json)
    out = snapshot_path("prices")
    spec = SnapshotSpec(dataset="prices", interval="1d")

    if df.empty:
        wrapper = build_snapshot_wrapper(
            spec=spec,
            symbols=[],
            data_key="prices",
            data={},
        )
        write_json(out, wrapper)
        print(f"[prices] Saved empty snapshot → {out}")
        return

    df_json = df.copy()
    df_json["date"] = df_json["date"].astype(str)

    prices_by_symbol: Dict[str, Any] = {
        sym: grp.to_dict(orient="records") for sym, grp in df_json.groupby("symbol")
    }

    wrapper = build_snapshot_wrapper(
        spec=spec,
        symbols=sorted(prices_by_symbol.keys()),
        data_key="prices",
        data=prices_by_symbol,
    )

    write_json(out, wrapper)
    print(f"[prices] Saved JSON snapshot → {out}")


def main() -> None:
    out = snapshot_path("prices")
    if snapshot_is_fresh(out, MAX_PRICE_AGE_MINUTES):
        print(f"[prices] Snapshot is fresh (<={MAX_PRICE_AGE_MINUTES} min). Skipping.")
        return

    print(f"[prices] Snapshot is stale. Fetching new daily prices…")
    df = fetch_prices_for_universe(period="1mo", interval="1d")

    if df.empty:
        print("[prices] No rows fetched; writing empty snapshot.")
        save_prices_json(df)
        return

    save_prices_parquet(df)
    save_prices_json(df)


if __name__ == "__main__":
    main()
