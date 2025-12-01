"""
Fetch *slim but richer* fundamentals, profile, and (optionally) institutional
ownership for u-Stock and save to:

  - JSON:   public/data/fetched/fundamentals-slim.json
            (nested per-symbol structure, for indicators / app)
  - Parquet public/data/pandas/fundamentals_slim.parquet
            (flat, one row per symbol, for analytics)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Any, List, Tuple

import pandas as pd
from yahooquery import Ticker

from data_scout.tickers.universe import load_us_universe_symbols


# ---------- PATH HELPERS ------------------------------------------------------


def get_project_root() -> Path:
  """
  Compute project root from this file location.

  This file lives at: src/data_scout/fetchers/fetch_fundamentals.py

  parents[0] -> fetchers
  parents[1] -> data_scout
  parents[2] -> src
  parents[3] -> project root   ✅
  """
  return Path(__file__).resolve().parents[3]


def pick_keys(source: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
  """Return a dict with only the given keys from source (ignoring missing keys)."""
  if not isinstance(source, dict):
    return {}
  return {k: source.get(k) for k in keys if k in source}


def chunked(seq: List[str], size: int) -> List[List[str]]:
  """Yield successive chunks of size `size` from seq."""
  return [seq[i : i + size] for i in range(0, len(seq), size)]


# ---------- CORE FETCHER ------------------------------------------------------


def fetch_company_fundamentals_slim(
  symbols: List[str],
  *,
  batch_size: int = 250,
  include_institution_ownership: bool = False,
) -> Tuple[Dict[str, Any], pd.DataFrame]:
  """
  Batched fundamentals fetch for a list of symbols.

  For each symbol we keep (nested JSON structure per symbol):

    company_profile:
      - sector, industry, country, website
      - longBusinessSummary
      - fullTimeEmployees

    key_stats:
      - beta
      - bookValue, priceToBook
      - 52WeekChange
      - heldPercentInstitutions
      - sharesOutstanding
      - trailingPE, forwardPE
      - enterpriseValue
      - enterpriseToEbitda
      - enterpriseToRevenue
      - floatShares
      - sharesShort, sharesShortPriorMonth
      - shortRatio, shortPercentOfFloat
      - sharesPercentSharesOut

    financial_data:
      - currentPrice
      - totalRevenue
      - revenueGrowth
      - grossMargins, operatingMargins, profitMargins
      - debtToEquity
      - freeCashflow

    dividends:
      - dividendYield
      - dividendRate
      - payoutRatio

    trading_snapshot:
      - marketCap
      - regularMarketVolume
      - averageVolume
      - averageDailyVolume10Day
      - regularMarketPreviousClose
      - regularMarketOpen
      - regularMarketDayHigh
      - regularMarketDayLow

    institution_ownership (optional, slow):
      - top 5 holders (organization, pctHeld, position, value)

  Returns:
    - results: nested dict for JSON {symbol: {...}}
    - df_flat: one-row-per-symbol DataFrame with key scalar fields
  """
  results: Dict[str, Any] = {}
  flat_rows: List[Dict[str, Any]] = []

  if not symbols:
    print("No symbols provided to fetch_company_fundamentals_slim; returning empty.")
    return results, pd.DataFrame()

  print(
    f"Fetching fundamentals in batch for {len(symbols)} symbols "
    f"(batch_size={batch_size}, include_institution_ownership={include_institution_ownership})..."
  )

  # Process in batches to avoid overloading YahooQuery
  batches = chunked(symbols, batch_size)
  for batch_idx, batch in enumerate(batches, start=1):
    print(f"\n[fundamentals] Batch {batch_idx}/{len(batches)} — {len(batch)} symbols")

    try:
      t = Ticker(batch)
    except Exception as e:
      print(f"ERROR creating Ticker for fundamentals batch {batch_idx}: {e}")
      continue

    # Preload dict-like endpoints (each keyed by symbol)
    try:
      asset_profiles = t.asset_profile or {}
    except Exception as e:
      print(f"  Warning: error fetching asset_profile batch {batch_idx}: {e}")
      asset_profiles = {}

    try:
      key_stats_all = t.key_stats or {}
    except Exception as e:
      print(f"  Warning: error fetching key_stats batch {batch_idx}: {e}")
      key_stats_all = {}

    try:
      financial_data_all = t.financial_data or {}
    except Exception as e:
      print(f"  Warning: error fetching financial_data batch {batch_idx}: {e}")
      financial_data_all = {}

    try:
      summary_detail_all = t.summary_detail or {}
    except Exception as e:
      print(f"  Warning: error fetching summary_detail batch {batch_idx}: {e}")
      summary_detail_all = {}

    # ---- per-symbol within this batch --------------------------------------
    for symbol in batch:
    #   print(f"  Processing fundamentals for {symbol}...")
      payload: Dict[str, Any] = {}

      # --- Company profile ---
      raw_profile = (
        asset_profiles.get(symbol, {})
        if isinstance(asset_profiles, dict)
        else {}
      )
      payload["company_profile"] = pick_keys(
        raw_profile,
        [
          "sector",
          "industry",
          "country",
          "website",
          "longBusinessSummary",
          "fullTimeEmployees",
        ],
      )

      # --- Key stats (valuation + short interest) ---
      raw_key_stats = (
        key_stats_all.get(symbol, {})
        if isinstance(key_stats_all, dict)
        else {}
      )
      payload["key_stats"] = pick_keys(
        raw_key_stats,
        [
          "beta",
          "bookValue",
          "priceToBook",
          "52WeekChange",
          "heldPercentInstitutions",
          "sharesOutstanding",
          "trailingPE",
          "forwardPE",
          "enterpriseValue",
          "enterpriseToEbitda",
          "enterpriseToRevenue",
          "floatShares",
          "sharesShort",
          "sharesShortPriorMonth",
          "shortRatio",
          "shortPercentOfFloat",
          "sharesPercentSharesOut",
        ],
      )

      # --- Financial data ---
      raw_fin = (
        financial_data_all.get(symbol, {})
        if isinstance(financial_data_all, dict)
        else {}
      )
      payload["financial_data"] = pick_keys(
        raw_fin,
        [
          "currentPrice",
          "totalRevenue",
          "revenueGrowth",
          "grossMargins",
          "operatingMargins",
          "profitMargins",
          "debtToEquity",
          "freeCashflow",
        ],
      )

      # --- Summary detail: dividends + trading snapshot ---
      raw_summary = (
        summary_detail_all.get(symbol, {})
        if isinstance(summary_detail_all, dict)
        else {}
      )

      payload["dividends"] = pick_keys(
        raw_summary,
        [
          "dividendYield",
          "dividendRate",
          "payoutRatio",
        ],
      )

      payload["trading_snapshot"] = pick_keys(
        raw_summary,
        [
          "marketCap",
          "regularMarketVolume",
          "averageVolume",
          "averageDailyVolume10Day",
          "regularMarketPreviousClose",
          "regularMarketOpen",
          "regularMarketDayHigh",
          "regularMarketDayLow",
        ],
      )

      # --- Institutional ownership (optional, *slow*) ---
      slim_inst_list: List[Dict[str, Any]] = []
      if include_institution_ownership:
        try:
          t_single = Ticker(symbol)
          inst_own = t_single.institution_ownership
          if inst_own is not None:
            try:
              df_inst = inst_own.to_dict("records")  # DataFrame-like
            except AttributeError:
              df_inst = inst_own  # type: ignore[assignment]

            for row in df_inst[:5]:
              slim_inst_list.append(
                pick_keys(
                  row,
                  ["organization", "pctHeld", "position", "value"],
                )
              )
        except Exception as e:
          print(
            f"    Warning: error fetching institution_ownership for {symbol}: {e}"
          )

      payload["institution_ownership"] = slim_inst_list

      # Store nested structure
      results[symbol] = payload

      # Build flat row for Parquet
      flat_row: Dict[str, Any] = {"symbol": symbol}

      flat_row.update(
        {
          # profile
          "sector": payload["company_profile"].get("sector"),
          "industry": payload["company_profile"].get("industry"),
          "country": payload["company_profile"].get("country"),
          "fullTimeEmployees": payload["company_profile"].get(
            "fullTimeEmployees"
          ),
          # key stats
          "beta": payload["key_stats"].get("beta"),
          "bookValue": payload["key_stats"].get("bookValue"),
          "priceToBook": payload["key_stats"].get("priceToBook"),
          "heldPercentInstitutions": payload["key_stats"].get(
            "heldPercentInstitutions"
          ),
          "sharesOutstanding": payload["key_stats"].get("sharesOutstanding"),
          "trailingPE": payload["key_stats"].get("trailingPE"),
          "forwardPE": payload["key_stats"].get("forwardPE"),
          # financial data
          "currentPrice": payload["financial_data"].get("currentPrice"),
          "totalRevenue": payload["financial_data"].get("totalRevenue"),
          "revenueGrowth": payload["financial_data"].get("revenueGrowth"),
          "grossMargins": payload["financial_data"].get("grossMargins"),
          "operatingMargins": payload["financial_data"].get("operatingMargins"),
          "profitMargins": payload["financial_data"].get("profitMargins"),
          "debtToEquity": payload["financial_data"].get("debtToEquity"),
          "freeCashflow": payload["financial_data"].get("freeCashflow"),
          # dividends
          "dividendYield": payload["dividends"].get("dividendYield"),
          "dividendRate": payload["dividends"].get("dividendRate"),
          "payoutRatio": payload["dividends"].get("payoutRatio"),
          # trading snapshot
          "marketCap": payload["trading_snapshot"].get("marketCap"),
          "regularMarketVolume": payload["trading_snapshot"].get(
            "regularMarketVolume"
          ),
          "averageVolume": payload["trading_snapshot"].get("averageVolume"),
          "averageDailyVolume10Day": payload["trading_snapshot"].get(
            "averageDailyVolume10Day"
          ),
          "regularMarketPreviousClose": payload["trading_snapshot"].get(
            "regularMarketPreviousClose"
          ),
          "regularMarketOpen": payload["trading_snapshot"].get(
            "regularMarketOpen"
          ),
          "regularMarketDayHigh": payload["trading_snapshot"].get(
            "regularMarketDayHigh"
          ),
          "regularMarketDayLow": payload["trading_snapshot"].get(
            "regularMarketDayLow"
          ),
        }
      )

      flat_rows.append(flat_row)

  df_flat = pd.DataFrame(flat_rows) if flat_rows else pd.DataFrame()
  return results, df_flat


# ---------- SAVE HELPERS ------------------------------------------------------


def save_fundamentals_to_json(
  data: Dict[str, Any],
  filename: str = "fundamentals-slim.json",
) -> Path:
  """
  Save fundamentals snapshot to public/data/fetched/<filename> as:

  {
    "symbols": [...],
    "data": {
      "AAPL": { ... },
      ...
    }
  }
  """
  project_root = get_project_root()
  data_dir = project_root / "public" / "data" / "fetched"
  data_dir.mkdir(parents=True, exist_ok=True)

  out_path = data_dir / filename

  wrapper = {
    "symbols": sorted(data.keys()),
    "data": data,
  }

  with out_path.open("w", encoding="utf-8") as f:
    json.dump(wrapper, f, indent=2)

  print(f"\nSaved fundamentals JSON snapshot to {out_path}")
  return out_path


def save_fundamentals_parquet(
  df: pd.DataFrame,
  filename: str = "fundamentals_slim.parquet",
) -> Path:
  """
  Save flattened fundamentals to public/data/pandas/<filename> as Parquet
  (one row per symbol with key scalar fields).
  """
  project_root = get_project_root()
  data_dir = project_root / "public" / "data" / "pandas"
  data_dir.mkdir(parents=True, exist_ok=True)

  out_path = data_dir / filename
  df.to_parquet(out_path, index=False)
  print(f"Saved fundamentals Parquet snapshot to {out_path}")
  return out_path


# ---------- MAIN ENTRYPOINT ---------------------------------------------------


def main() -> None:
  """
  CLI entrypoint: load full universe and fetch fundamentals.

  NOTE: This may be a large universe (5k+ symbols). For local dev,
  you can slice to a smaller subset, e.g.:

      symbols = load_us_universe_symbols()[:500]
  """
  symbols = load_us_universe_symbols()

  print(f"[fundamentals] Universe size: {len(symbols)} symbols")

  fundamentals_nested, df_flat = fetch_company_fundamentals_slim(
    symbols,
    batch_size=250,
    include_institution_ownership=False,  # turn on only for small subsets
  )

  # 🔎 Tiny preview: up to 5 rows with a few key columns
  if not df_flat.empty:
    preview_cols = [
      c
      for c in [
        "symbol",
        "sector",
        "industry",
        "marketCap",
        "trailingPE",
        "currentPrice",
      ]
      if c in df_flat.columns
    ]

    print("\n[fundamentals] Sample (up to 5 rows):")
    try:
      print(df_flat[preview_cols].head(5).to_string(index=False))
    except Exception:
      # Fallback: just print head if something unexpected happens
      print(df_flat.head(5).to_string(index=False))

  # JSON: nested structure used by indicators / app
  save_fundamentals_to_json(fundamentals_nested)

  # Parquet: flat table, great for analytics / joins
  if not df_flat.empty:
    save_fundamentals_parquet(df_flat)
  else:
    print("Warning: no fundamentals data fetched; Parquet not written.")


if __name__ == "__main__":
  main()
