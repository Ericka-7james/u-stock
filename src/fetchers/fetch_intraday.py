"""
Fetch intraday OHLCV price data (5m and 15m bars) for a list of symbols
using yahooquery, and save them both as:

  - Parquet (raw efficient storage): public/data/pandas/intraday_<interval>.parquet
  - JSON snapshots:                 public/data/fetched/intraday-<interval>.json
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List

import pandas as pd
from yahooquery import Ticker


# ---------- Core batched intraday fetcher ----------

def fetch_intraday_df(
    symbols: List[str],
    period: str = "5d",
    interval: str = "5m",
) -> pd.DataFrame:
    """
    Fetch intraday OHLCV data for tickers in ONE batched call.

    Returns DataFrame with columns:
    ["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"]
    """
    print(f"Fetching INTRADAY batch: {len(symbols)} symbols, interval={interval}, period={period}")

    if not symbols:
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    try:
        t = Ticker(symbols)
        df = t.history(period=period, interval=interval)
    except Exception as e:
        print(f"ERROR fetching intraday batch: {e}")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if df is None:
        print("Warning: intraday history returned None")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if not isinstance(df, pd.DataFrame):
        print(f"Unexpected type from yahooquery: {type(df)}")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    if df.empty:
        print("Warning: intraday DataFrame is empty")
        return pd.DataFrame(columns=["symbol", "date", "open", "high", "low", "close", "volume", "adjclose"])

    df = df.reset_index()

    # Columns we care about
    wanted_cols = [
        "symbol", "date", "open", "high", "low", "close", "volume", "adjclose"
    ]
    cols = [c for c in df.columns if c in wanted_cols]
    if not cols:
        print("ERROR: No OHLCV columns found in intraday data")
        return pd.DataFrame(columns=wanted_cols)

    subset = df[cols].copy()

    # Clean up date
    subset["date"] = pd.to_datetime(subset["date"], errors="coerce")
    subset = subset.dropna(subset=["date", "close"])

    # Sort nicely
    subset = subset.sort_values(["symbol", "date"]).reset_index(drop=True)

    return subset


# ---------- Save helpers (Parquet + JSON) ----------

def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def save_intraday_parquet(df: pd.DataFrame, interval: str) -> Path:
    root = get_project_root()
    data_dir = root / "public" / "data" / "pandas"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / f"intraday_{interval}.parquet"
    df.to_parquet(out_path, index=False)
    print(f"Saved Parquet intraday ({interval}) to {out_path}")
    return out_path


def save_intraday_json(df: pd.DataFrame, interval: str) -> Path:
    root = get_project_root()
    data_dir = root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / f"intraday-{interval}.json"

    if df.empty:
        wrapper = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "interval": interval,
            "symbols": [],
            "prices": {},
        }
    else:
        df_json = df.copy()
        df_json["date"] = df_json["date"].astype(str)

        grouped = {
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

    print(f"Saved intraday JSON ({interval}) to {out_path}")
    return out_path


# ---------- Main ----------

def main() -> None:
    symbols = ["AAPL", "MSFT", "GOOG"]

    # --- 5 minute bars ---
    df_5m = fetch_intraday_df(symbols, period="5d", interval="5m")
    save_intraday_parquet(df_5m, interval="5m")
    save_intraday_json(df_5m, interval="5m")

    # --- 15 minute bars ---
    df_15m = fetch_intraday_df(symbols, period="10d", interval="15m")
    save_intraday_parquet(df_15m, interval="15m")
    save_intraday_json(df_15m, interval="15m")


if __name__ == "__main__":
    main()
