# src/data_scout/joined_mentions.py
"""
Build a combined mentions snapshot across Reddit + News.

Reads:
  - public/data/reddit-mentions.json
  - public/data/news-mentions.json

Writes:
  - public/data/mentions-joined.json

Schema:

{
  "generatedAt": "...",
  "sources": ["reddit", "news"],
  "data": [
    {
      "ticker": "AAPL",
      "redditCount": 32,
      "newsCount": 12,
      "totalMentions": 44
    }
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "public" / "data"

REDDIT_FILE = DATA_DIR / "reddit-mentions.json"
NEWS_FILE = DATA_DIR / "news-mentions.json"
OUTPUT_FILE = DATA_DIR / "mentions-joined.json"

def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)

def load_snapshot(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {"data": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_index(snapshot: Dict[str, Any]) -> Dict[str, int]:
    """
    Turn a snapshot's data list into {ticker: count}
    """
    idx: Dict[str, int] = {}
    for row in snapshot.get("data", []):
        ticker = str(row.get("ticker", "")).upper()
        if not ticker:
            continue
        idx[ticker] = int(row.get("count", 0) or 0)
    return idx


def build_joined_mentions(
    reddit_snapshot: Dict[str, Any], news_snapshot: Dict[str, Any]
) -> Dict[str, Any]:
    r_index = build_index(reddit_snapshot)
    n_index = build_index(news_snapshot)

    all_tickers = sorted(set(r_index.keys()) | set(n_index.keys()))

    data = []
    for t in all_tickers:
        r_count = r_index.get(t, 0)
        n_count = n_index.get(t, 0)
        data.append(
            {
                "ticker": t,
                "redditCount": r_count,
                "newsCount": n_count,
                "totalMentions": r_count + n_count,
            }
        )

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": ["reddit", "news"],
        "data": data,
    }


def write_snapshot(snapshot: Dict[str, Any], output_file: Path | None = None) -> None:
    """
    Write the joined mentions snapshot to disk.

    If output_file is None, use the module-level OUTPUT_FILE. This keeps
    monkeypatching OUTPUT_FILE in tests working correctly.
    """
    if output_file is None:
        output_file = OUTPUT_FILE

    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main() -> None:
    reddit_snapshot = load_snapshot(REDDIT_FILE)
    news_snapshot = load_snapshot(NEWS_FILE)

    joined = build_joined_mentions(reddit_snapshot, news_snapshot)
    write_snapshot(joined)
    print(
        f"[joined_mentions] Wrote joined mentions for {len(joined['data'])} tickers → {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
