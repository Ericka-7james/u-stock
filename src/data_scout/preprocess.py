# src/data_scout/preprocess.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_DATA_DIR / "preprocessed.json"


def ensure_output_dir(path: Path) -> None:
    """Make sure parent directory exists for an output file."""
    path.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path) -> Dict[str, Any]:
    """
    Safely load a JSON file. If it doesn't exist or is invalid,
    return a minimal empty snapshot structure.
    """
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # If the file is corrupted, don't crash the whole pipeline.
        return {}


def _index_by_ticker(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Build a dict mapping TICKER -> row dict (uppercased).
    Later sources can overwrite earlier ones if needed.
    """
    index: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        ticker = (row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        index[ticker] = row
    return index


def build_preprocessed_snapshot(data_dir: Path = DEFAULT_DATA_DIR) -> Dict[str, Any]:
    """
    Merge reddit-mentions, prices, fundamentals, and macro snapshots into one
    normalized structure that the sentiment/analysis layer can consume.

    Input files (all optional, missing ones just result in empty data):
      - reddit-mentions.json
      - prices.json
      - fundamentals.json
      - macro.json
    """
    reddit_path = data_dir / "reddit-mentions.json"
    prices_path = data_dir / "prices.json"
    fundamentals_path = data_dir / "fundamentals.json"
    macro_path = data_dir / "macro.json"

    reddit_snap = _load_json(reddit_path)
    prices_snap = _load_json(prices_path)
    fundamentals_snap = _load_json(fundamentals_path)
    macro_snap = _load_json(macro_path)

    reddit_rows = reddit_snap.get("data", []) or []
    price_rows = prices_snap.get("data", []) or []
    fundamentals_rows = fundamentals_snap.get("data", []) or []
    macro_series = macro_snap.get("series", []) or []

    reddit_index = _index_by_ticker(reddit_rows)
    prices_index = _index_by_ticker(price_rows)
    fundamentals_index = _index_by_ticker(fundamentals_rows)

    # Build the ticker universe = union of all tickers seen anywhere
    universe = sorted(
        {
            *reddit_index.keys(),
            *prices_index.keys(),
            *fundamentals_index.keys(),
        }
    )

    merged_rows: List[Dict[str, Any]] = []
    for ticker in universe:
        out: Dict[str, Any] = {"ticker": ticker}

        # Prices
        pr = prices_index.get(ticker)
        if pr:
            out["price"] = pr.get("price")
            out["currency"] = pr.get("currency") or "USD"
            out["priceTimestamp"] = pr.get("timestamp")

        # Fundamentals
        fn = fundamentals_index.get(ticker)
        if fn:
            # Use the same keys you already expose in fundamentals.py
            out["pe"] = fn.get("pe")
            out["forwardPE"] = fn.get("forwardPE")
            out["pb"] = fn.get("pb")
            out["roe"] = fn.get("roe")
            out["roa"] = fn.get("roa")
            out["debtToEquity"] = fn.get("debtToEquity")
            out["marketCap"] = fn.get("marketCap")
            out["dividendYield"] = fn.get("dividendYield")
            out["sector"] = fn.get("sector")
            out["industry"] = fn.get("industry")

        # Reddit mentions
        rd = reddit_index.get(ticker)
        out["redditMentions"] = int(rd.get("count", 0)) if rd else 0

        merged_rows.append(out)

    # Also keep a light summary of macro data – you can expand this later.
    macro_summary = {
        "series": macro_series,
        "generatedAt": macro_snap.get("generatedAt"),
    }

    snapshot: Dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "universe": universe,
        "data": merged_rows,
        "macro": macro_summary,
        "sources": {
            "reddit": {
                "generatedAt": reddit_snap.get("generatedAt"),
                "windowDescription": reddit_snap.get("windowDescription"),
                "subreddits": reddit_snap.get("subreddits", []),
            },
            "prices": {
                "generatedAt": prices_snap.get("generatedAt"),
                "universe": prices_snap.get("universe", []),
            },
            "fundamentals": {
                "generatedAt": fundamentals_snap.get("generatedAt"),
                "universe": fundamentals_snap.get("universe", []),
            },
        },
    }

    return snapshot


def write_snapshot(snapshot: Dict[str, Any], output_file: Path = DEFAULT_OUTPUT_FILE) -> None:
    """Write the preprocessed snapshot to JSON."""
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main() -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.preprocess
    """
    snapshot = build_preprocessed_snapshot(DEFAULT_DATA_DIR)
    write_snapshot(snapshot)
    print(
        f"[preprocess] Wrote merged snapshot for {len(snapshot.get('universe', []))} "
        f"tickers → {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
