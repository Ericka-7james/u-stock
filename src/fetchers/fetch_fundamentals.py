"""
Fetch *slim but richer* fundamentals, profile, and institutional ownership
for u-Stock and save to public/data/fundamentals-slim.json.
"""

import json
from pathlib import Path
from typing import Dict, Any, List

from yahooquery import Ticker


def pick_keys(source: Dict[str, Any], keys: List[str]) -> Dict[str, Any]:
    """Return a dict with only the given keys from source (ignoring missing keys)."""
    return {k: source.get(k) for k in keys if k in source}


def fetch_company_fundamentals_slim(symbols: List[str]) -> Dict[str, Any]:
    """
    For each symbol we keep:

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

      institution_ownership:
        - top 5 holders (organization, pctHeld, position, value)
    """
    results: Dict[str, Any] = {}

    for symbol in symbols:
        print(f"Fetching fundamentals for {symbol}...")

        t = Ticker(symbol)
        payload: Dict[str, Any] = {}

        # --- Company profile ---
        try:
            raw_profile = t.asset_profile.get(symbol, {})  # type: ignore[union-attr]
        except Exception as e:
            print(f"  Warning: error fetching asset_profile for {symbol}: {e}")
            raw_profile = {}

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
        try:
            raw_key_stats = t.key_stats.get(symbol, {})  # type: ignore[union-attr]
        except Exception as e:
            print(f"  Warning: error fetching key_stats for {symbol}: {e}")
            raw_key_stats = {}

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
        try:
            raw_fin = t.financial_data.get(symbol, {})  # type: ignore[union-attr]
        except Exception as e:
            print(f"  Warning: error fetching financial_data for {symbol}: {e}")
            raw_fin = {}

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
        try:
            raw_summary = t.summary_detail.get(symbol, {})  # type: ignore[union-attr]
        except Exception as e:
            print(f"  Warning: error fetching summary_detail for {symbol}: {e}")
            raw_summary = {}

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

        # --- Institutional ownership (top 5 slim) ---
        slim_inst_list: List[Dict[str, Any]] = []
        try:
            inst_own = t.institution_ownership
            if inst_own is not None:
                try:
                    records = inst_own.to_dict("records")  # DataFrame-like
                except AttributeError:
                    records = inst_own  # type: ignore[assignment]

                for row in records[:5]:
                    slim_inst_list.append(
                        pick_keys(
                            row,
                            ["organization", "pctHeld", "position", "value"],
                        )
                    )
        except Exception as e:
            print(f"  Warning: error fetching institution_ownership for {symbol}: {e}")

        payload["institution_ownership"] = slim_inst_list

        results[symbol] = payload

    return results


def save_fundamentals_to_json(
    data: Dict[str, Any],
    filename: str = "fundamentals-slim.json",
) -> Path:
    """
    Save fundamentals snapshot to public/data/<filename> as:

    {
      "symbols": [...],
      "data": {
        "AAPL": { ... },
        ...
      }
    }
    """
    project_root = Path(__file__).resolve().parents[2]
    data_dir = project_root / "public" / "data" / "fetched"
    data_dir.mkdir(parents=True, exist_ok=True)

    out_path = data_dir / filename

    wrapper = {
        "symbols": list(data.keys()),
        "data": data,
    }

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(wrapper, f, indent=2)

    print(f"\nSaved fundamentals snapshot to {out_path}")
    return out_path


def main() -> None:
    symbols = ["AAPL", "MSFT", "GOOG"]

    fundamentals = fetch_company_fundamentals_slim(symbols)
    save_fundamentals_to_json(fundamentals)


if __name__ == "__main__":
    main()
