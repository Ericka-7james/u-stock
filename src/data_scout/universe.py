# src/data_scout/universe.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = PROJECT_ROOT / "public" / "data"
REDDIT_SNAPSHOT_FILE = DEFAULT_DATA_DIR / "reddit-mentions.json"
UNIVERSE_FILE = DEFAULT_DATA_DIR / "ticker-universe.json"


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # Don’t blow up the pipeline if the file is corrupt
        return {}


def build_ticker_universe(
    reddit_snapshot_path: Path = REDDIT_SNAPSHOT_FILE,
    max_from_reddit: int = 200,
) -> Dict[str, Any]:
    """
    Build a dynamic ticker universe from the reddit-mentions snapshot.

    Strategy:
      - Read public/data/reddit-mentions.json
      - Sort by count descending
      - Take the top N tickers (max_from_reddit)
      - Emit a payload like:

        {
          "generatedAt": "...",
          "source": "reddit-mentions.json",
          "tickers": ["TSLA", "AAPL", ...]
        }
    """
    snap = _load_json(reddit_snapshot_path)
    rows = snap.get("data", []) or []

    # Sorted by count descending
    sorted_rows = sorted(
        (r for r in rows if r.get("ticker")),
        key=lambda r: r.get("count", 0),
        reverse=True,
    )

    # Preserve order but dedupe by ticker
    tickers: List[str] = []
    seen = set()
    for row in sorted_rows:
        t = (row.get("ticker") or "").strip().upper()
        if not t or t in seen:
            continue
        tickers.append(t)
        seen.add(t)
        if len(tickers) >= max_from_reddit:
            break

    payload: Dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(reddit_snapshot_path.relative_to(PROJECT_ROOT)),
        "tickers": tickers,
        "meta": {
            "fromRedditCount": len(tickers),
            "maxFromReddit": max_from_reddit,
        },
    }
    return payload


def write_universe(universe: Dict[str, Any], output_file: Path = UNIVERSE_FILE) -> None:
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(universe, f, indent=2)


def main() -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.universe
    """
    universe = build_ticker_universe()
    write_universe(universe)
    print(
        f"[universe] Wrote {len(universe.get('tickers', []))} tickers "
        f"→ {UNIVERSE_FILE}"
    )


if __name__ == "__main__":
    main()
