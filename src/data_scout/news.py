# src/data_scout/news.py
"""
data_scout/news.py

Counts ticker mentions in financial news headlines/snippets and writes
`public/data/news-mentions.json`.

Snapshot schema:

{
  "generatedAt": "...",
  "sources": [
    {"id": "yf_top", "label": "Yahoo Finance - Top Stories", "url": "..."},
    ...
  ],
  "data": [
    {"ticker": "AAPL", "count": 12},
    {"ticker": "TSLA", "count": 9}
  ]
}
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List

import requests

from dotenv import load_dotenv

from .reddit import build_ticker_regex, count_mentions_in_text
from .symbols import load_symbol_universe, filter_valid_symbols

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "news-mentions.json"

from data_scout.config.news_sources import NEWS_SOURCES


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def fetch_rss_text(url: str) -> str:
    """
    Fetch raw RSS XML as text. For now we just treat it as a text blob and
    scan titles/descriptions via regex; if you want richer parsing, you can
    add feedparser later.
    """
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    return resp.text


def build_news_corpus() -> Dict[str, str]:
    """
    Fetch all configured RSS feeds and build a map of source_id -> combined text.
    """
    corpus: Dict[str, str] = {}

    for src in NEWS_SOURCES:
        src_id = src["id"]
        url = src["url"]
        print(f"[news] Fetching RSS from {src_id} …")
        try:
            xml_text = fetch_rss_text(url)
            # Super simple: just use entire XML as one big text blob.
            # Later you can parse <title> and <description>.
            corpus[src_id] = xml_text
        except Exception as exc:  # noqa: BLE001
            print(f"[news] Failed to fetch {src_id}: {exc}")
            corpus[src_id] = ""

    return corpus


def count_mentions_across_sources(
    corpus: Dict[str, str], tickers: Iterable[str]
) -> Dict[str, int]:
    """
    Given a dict of {source_id: text}, count ticker mentions in all text.
    """
    tickers_list = sorted({t.upper().strip() for t in tickers if t.strip()})
    pattern = build_ticker_regex(tickers_list)

    aggregated: Dict[str, int] = {}

    for src_id, text in corpus.items():
        counts = count_mentions_in_text(text, pattern)
        for ticker, count in counts.items():
            aggregated[ticker] = aggregated.get(ticker, 0) + int(count)

    return aggregated


def fetch_news_mentions(tickers: Iterable[str]) -> Dict[str, Any]:
    """
    Build a news mentions snapshot for a given ticker universe.
    """
    # Normalize ticker list
    tickers_list = sorted({t.upper().strip() for t in tickers if t.strip()})

    # Optional: validate against symbol universe
    try:
        symbol_universe = load_symbol_universe()
        tickers_list = filter_valid_symbols(tickers_list, symbol_universe)
    except Exception as exc:  # noqa: BLE001
        print(f"[news] Symbol universe unavailable, using raw tickers: {exc}")

    corpus = build_news_corpus()
    mention_counts = count_mentions_across_sources(corpus, tickers_list)

    data = [
        {"ticker": ticker, "count": int(count)}
        for ticker, count in sorted(
            mention_counts.items(), key=lambda kv: kv[1], reverse=True
        )
    ]

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {"id": sid, "label": sid, "url": url}
            for sid, url in NEWS_SOURCES.items()
        ],
        "data": data,
    }


def write_snapshot(snapshot: Dict[str, Any], output_file: Path | None = None) -> None:
    """
    Write news mentions snapshot to disk.

    If output_file is None, use DEFAULT_OUTPUT_FILE so tests can monkeypatch it.
    """
    if output_file is None:
        output_file = DEFAULT_OUTPUT_FILE

    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main(tickers: Iterable[str] | None = None) -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.news
    """
    # If no tickers passed, try to use the full universe; otherwise fallback.
    if tickers is not None:
        tickers_list = list(tickers)
    else:
        try:
            symbol_universe = load_symbol_universe()
            tickers_list = sorted(symbol_universe)
        except Exception:
            # Fallback: a small core set
            from .reddit import DEFAULT_TICKERS

            tickers_list = list(DEFAULT_TICKERS)

    snapshot = fetch_news_mentions(tickers_list)
    write_snapshot(snapshot)
    print(
    (
        f"[news] Wrote news mentions snapshot for {len(tickers_list)} tickers "
        f"→ {DEFAULT_OUTPUT_FILE}"
    )
)


if __name__ == "__main__":
    main()
