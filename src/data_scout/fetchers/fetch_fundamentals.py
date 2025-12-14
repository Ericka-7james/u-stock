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

# ✅ Your desired defaults (set to 1440 for daily if you want):
MAX_FUNDAMENTALS_AGE_MINUTES = env_int("MAX_FUNDAMENTALS_AGE_MINUTES", 10080)  # 7 days by default
FUNDAMENTALS_BATCH_SIZE = env_int("FUNDAMENTALS_BATCH_SIZE", 250)


def fundamentals_parquet_path() -> Path:
    root = get_project_root()
    return root / "public" / "data" / "pandas" / "fundamentals_slim.parquet"


def save_fundamentals_parquet(df: pd.DataFrame) -> None:
    out = fundamentals_parquet_path()
    ensure_dir(out.parent)
    df.to_parquet(out, index=False)
    print(f"[fundamentals] Saved Parquet → {out}")


def pick_keys(source: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    if not isinstance(source, dict):
        return {}
    return {k: source.get(k) for k in keys if k in source}


def fetch_company_fundamentals_slim(
    symbols: List[str],
    *,
    batch_size: int = FUNDAMENTALS_BATCH_SIZE,
    include_institution_ownership: bool = False,
) -> Tuple[Dict[str, Any], pd.DataFrame]:
    results: Dict[str, Any] = {}
    flat_rows: List[Dict[str, Any]] = []

    if not symbols:
        return results, pd.DataFrame()

    for batch_idx, batch in enumerate(chunked(symbols, batch_size), start=1):
        print(f"[fundamentals] Batch {batch_idx} — {len(batch)} symbols")

        try:
            t = Ticker(batch)
        except Exception as e:
            print(f"[fundamentals] ERROR creating Ticker: {e}")
            continue

        # Preload dict-like endpoints
        try:
            asset_profiles = t.asset_profile or {}
        except Exception:
            asset_profiles = {}

        try:
            key_stats_all = t.key_stats or {}
        except Exception:
            key_stats_all = {}

        try:
            financial_data_all = t.financial_data or {}
        except Exception:
            financial_data_all = {}

        try:
            summary_detail_all = t.summary_detail or {}
        except Exception:
            summary_detail_all = {}

        for symbol in batch:
            payload: Dict[str, Any] = {}

            raw_profile = asset_profiles.get(symbol, {}) if isinstance(asset_profiles, dict) else {}
            payload["company_profile"] = pick_keys(
                raw_profile,
                ["sector", "industry", "country", "website", "longBusinessSummary", "fullTimeEmployees"],
            )

            raw_key_stats = key_stats_all.get(symbol, {}) if isinstance(key_stats_all, dict) else {}
            payload["key_stats"] = pick_keys(
                raw_key_stats,
                [
                    "beta", "bookValue", "priceToBook", "52WeekChange", "heldPercentInstitutions",
                    "sharesOutstanding", "trailingPE", "forwardPE", "enterpriseValue",
                    "enterpriseToEbitda", "enterpriseToRevenue", "floatShares", "sharesShort",
                    "sharesShortPriorMonth", "shortRatio", "shortPercentOfFloat", "sharesPercentSharesOut",
                ],
            )

            raw_fin = financial_data_all.get(symbol, {}) if isinstance(financial_data_all, dict) else {}
            payload["financial_data"] = pick_keys(
                raw_fin,
                ["currentPrice", "totalRevenue", "revenueGrowth", "grossMargins", "operatingMargins",
                 "profitMargins", "debtToEquity", "freeCashflow"],
            )

            raw_summary = summary_detail_all.get(symbol, {}) if isinstance(summary_detail_all, dict) else {}
            payload["dividends"] = pick_keys(raw_summary, ["dividendYield", "dividendRate", "payoutRatio"])
            payload["trading_snapshot"] = pick_keys(
                raw_summary,
                [
                    "marketCap", "regularMarketVolume", "averageVolume", "averageDailyVolume10Day",
                    "regularMarketPreviousClose", "regularMarketOpen", "regularMarketDayHigh", "regularMarketDayLow",
                ],
            )

            # Optional slow part (kept but default False)
            payload["institution_ownership"] = []
            if include_institution_ownership:
                try:
                    t_single = Ticker(symbol)
                    inst_own = t_single.institution_ownership
                    if inst_own is not None:
                        try:
                            rows = inst_own.to_dict("records")
                        except AttributeError:
                            rows = inst_own
                        payload["institution_ownership"] = [
                            pick_keys(r, ["organization", "pctHeld", "position", "value"]) for r in rows[:5]
                        ]
                except Exception as e:
                    print(f"[fundamentals] Warning: institution_ownership {symbol}: {e}")

            results[symbol] = payload

            flat_rows.append(
                {
                    "symbol": symbol,
                    "sector": payload["company_profile"].get("sector"),
                    "industry": payload["company_profile"].get("industry"),
                    "country": payload["company_profile"].get("country"),
                    "fullTimeEmployees": payload["company_profile"].get("fullTimeEmployees"),
                    "beta": payload["key_stats"].get("beta"),
                    "bookValue": payload["key_stats"].get("bookValue"),
                    "priceToBook": payload["key_stats"].get("priceToBook"),
                    "heldPercentInstitutions": payload["key_stats"].get("heldPercentInstitutions"),
                    "sharesOutstanding": payload["key_stats"].get("sharesOutstanding"),
                    "trailingPE": payload["key_stats"].get("trailingPE"),
                    "forwardPE": payload["key_stats"].get("forwardPE"),
                    "currentPrice": payload["financial_data"].get("currentPrice"),
                    "totalRevenue": payload["financial_data"].get("totalRevenue"),
                    "revenueGrowth": payload["financial_data"].get("revenueGrowth"),
                    "grossMargins": payload["financial_data"].get("grossMargins"),
                    "operatingMargins": payload["financial_data"].get("operatingMargins"),
                    "profitMargins": payload["financial_data"].get("profitMargins"),
                    "debtToEquity": payload["financial_data"].get("debtToEquity"),
                    "freeCashflow": payload["financial_data"].get("freeCashflow"),
                    "dividendYield": payload["dividends"].get("dividendYield"),
                    "dividendRate": payload["dividends"].get("dividendRate"),
                    "payoutRatio": payload["dividends"].get("payoutRatio"),
                    "marketCap": payload["trading_snapshot"].get("marketCap"),
                }
            )

    df_flat = pd.DataFrame(flat_rows) if flat_rows else pd.DataFrame()
    return results, df_flat


def save_fundamentals_json(nested: Dict[str, Any]) -> None:
    out = snapshot_path("fundamentals")
    spec = SnapshotSpec(dataset="fundamentals")

    wrapper = build_snapshot_wrapper(
        spec=spec,
        symbols=sorted(nested.keys()),
        data_key="fundamentals",
        data=nested,
    )
    write_json(out, wrapper)
    print(f"[fundamentals] Saved JSON snapshot → {out}")


def main() -> None:
    out = snapshot_path("fundamentals")
    if snapshot_is_fresh(out, MAX_FUNDAMENTALS_AGE_MINUTES):
        print(f"[fundamentals] Snapshot is fresh (<={MAX_FUNDAMENTALS_AGE_MINUTES} min). Skipping.")
        return

    symbols = load_us_universe_symbols()
    print(f"[fundamentals] Universe size: {len(symbols)}")

    nested, df = fetch_company_fundamentals_slim(
        symbols,
        batch_size=FUNDAMENTALS_BATCH_SIZE,
        include_institution_ownership=False,
    )

    save_fundamentals_json(nested)
    if not df.empty:
        save_fundamentals_parquet(df)


if __name__ == "__main__":
    main()
