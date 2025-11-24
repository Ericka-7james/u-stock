"""
data_scout/fundamentals.py

Fetches basic fundamental metrics for a universe of tickers using yfinance
and writes to `public/data/raw/fundamentals.json`.

Snapshot schema:

{
  "generatedAt": "...",
  "universe": ["AAPL", "MSFT", "TSLA"],
  "data": [
    {
      "ticker": "AAPL",
      "pe": 29.1,
      "pb": 45.2,
      "roe": 0.76,
      "debtToEquity": 1.5,
      "marketCap": 2800000000000
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List

import yfinance as yf  # type: ignore
from dotenv import load_dotenv

from data_scout.symbols import (
    load_clean_symbol_universe,
    filter_valid_symbols,
    load_delisted_symbols,
    add_delisted_symbol,
)

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# write into /raw
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "raw"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "fundamentals.json"

# Optional curated universe file
UNIVERSE_FILE = DEFAULT_OUTPUT_DIR / "ticker-universe.json"

# Small backup set if everything else fails badly
DEFAULT_TICKERS = [
    "AAPL",
    "MSFT",
    "TSLA",
    "GOOGL",
    "AMZN",
    "BRK-B",
    "JPM",
    "VTI",
    "VOO",
    "VTSAX",
    "FXAIX",
    "SWTSX",
]


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_universe_tickers() -> List[str]:
    """
    Try to load dynamic tickers from ticker-universe.json.

    Returns an empty list if the file is missing, invalid, or empty.
    The caller (main) will then decide whether to fall back.
    """
    if not UNIVERSE_FILE.exists():
        return []

    try:
        with UNIVERSE_FILE.open("r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        return []

    raw = payload.get("tickers") or payload.get("universe") or []
    tickers = sorted(
        {
            (t or "").strip().upper()
            for t in raw
            if (t or "").strip()
        }
    )
    return tickers  # may be empty if file had no valid symbols


def fetch_fundamentals_for_ticker(ticker: str) -> Dict[str, Any]:
    """
    Pull basic fundamentals from yfinance.
    This uses the .info dict which can be slow; later you may want a better source (FMP, Finnhub).
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info or {}

        return {
            "ticker": ticker.upper(),
            "pe": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "pb": info.get("priceToBook"),
            "roe": info.get("returnOnEquity"),
            "roa": info.get("returnOnAssets"),
            "debtToEquity": info.get("debtToEquity"),
            "marketCap": info.get("marketCap"),
            "dividendYield": info.get("dividendYield"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
        }
    except Exception as exc:  # noqa: BLE001
        # mark as delisted/invalid so future runs can skip it
        add_delisted_symbol(ticker)
        return {
            "ticker": ticker.upper(),
            "pe": None,
            "forwardPE": None,
            "pb": None,
            "roe": None,
            "roa": None,
            "debtToEquity": None,
            "marketCap": None,
            "dividendYield": None,
            "sector": None,
            "industry": None,
            "error": str(exc),
        }


def fetch_fundamentals_snapshot(tickers: Iterable[str]) -> Dict[str, Any]:
    tickers_list: List[str] = sorted({t.upper().strip() for t in tickers if t.strip()})
    data = [fetch_fundamentals_for_ticker(t) for t in tickers_list]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "universe": tickers_list,
        "data": data,
    }


def write_snapshot(snapshot: Dict[str, Any], output_file: Path = DEFAULT_OUTPUT_FILE) -> None:
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main(tickers: Iterable[str] | None = None) -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.fundamentals
    """
    used_default = False

    # 1) Prefer curated ticker-universe.json if present
    universe = load_universe_tickers()

    # 2) If curated file missing/empty and explicit tickers passed, validate them
    if not universe and tickers is not None:
        cleaned = load_clean_symbol_universe()
        delisted = load_delisted_symbols()
        cleaned_minus_delisted = {t for t in cleaned if t not in delisted}
        universe = filter_valid_symbols(tickers, cleaned_minus_delisted)

    # 3) If still empty, fall back to full cleaned symbol universe (minus delisted)
    if not universe:
        cleaned = load_clean_symbol_universe()
        delisted = load_delisted_symbols()
        cleaned_minus_delisted = [t for t in cleaned if t not in delisted]
        if cleaned_minus_delisted:
            universe = sorted(cleaned_minus_delisted)
        else:
            # 4) Absolute last-resort fallback
            universe = list(DEFAULT_TICKERS)
            used_default = True

    # 5) Also ensure we filter out delisted from curated universe path
    delisted = load_delisted_symbols()
    if delisted:
        universe = [t for t in universe if t not in delisted]

    snapshot = fetch_fundamentals_snapshot(universe)

    if used_default:
        snapshot["meta"] = {
            "usedDefaultTickers": True,
            "reason": "ticker-universe.json and cleaned universe were empty; "
                      "fell back to DEFAULT_TICKERS",
        }

    write_snapshot(snapshot)
    print(
        f"[fundamentals] Wrote fundamentals for {len(snapshot['universe'])} "
        f"tickers → {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
