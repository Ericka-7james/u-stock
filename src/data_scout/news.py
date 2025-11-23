"""
data_scout/news.py

Counts ticker mentions in financial news headlines/snippets and writes
`public/data/raw/news-mentions.json`.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List, Tuple

import requests
from dotenv import load_dotenv

from data_scout.reddit import build_ticker_regex, count_mentions_in_text, DEFAULT_TICKERS
from data_scout.symbols import (
    load_clean_symbol_universe,
    filter_valid_symbols,
    load_ticker_set_for_mentions,
)
from config.raw.news_sources import NEWS_SOURCES

load_dotenv(dotenv_path=".env.local")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data" / "raw"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "news-mentions.json"


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


def build_news_corpus() -> Tuple[Dict[str, str], List[Dict[str, str]]]:
    """
    Fetch all configured RSS feeds and build:
      - corpus: source_id -> combined text
      - errors: list of {"id", "error"} for failed sources

    Adds a small delay between requests to reduce rate limits.
    """
    corpus: Dict[str, str] = {}
    errors: List[Dict[str, str]] = []

    for src in NEWS_SOURCES:
        src_id = src["id"]
        url = src["url"]
        print(f"[news] Fetching RSS from {src_id} …")

        try:
            xml_text = fetch_rss_text(url)
            corpus[src_id] = xml_text
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            print(f"[news] Failed to fetch {src_id}: {msg}")
            corpus[src_id] = ""
            errors.append({"id": src_id, "error": msg})

        # throttle between RSS calls
        time.sleep(0.5)

    return corpus, errors


def count_mentions_across_sources(
    corpus: Dict[str, str],
    tickers: Iterable[str],
) -> Dict[str, int]:
    """
    Given a dict of {source_id: text}, count ticker mentions in all text.
    """
    tickers_list = sorted({t.upper().strip() for t in tickers if t.strip()})
    pattern = build_ticker_regex(tickers_list)

    aggregated: Dict[str, int] = {}

    for _src_id, text in corpus.items():
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
        symbol_universe = load_clean_symbol_universe()
        tickers_list = filter_valid_symbols(tickers_list, symbol_universe)
    except Exception as exc:  # noqa: BLE001
        print(f"[news] Symbol universe unavailable, using raw tickers: {exc}")

    corpus, errors = build_news_corpus()
    mention_counts = count_mentions_across_sources(corpus, tickers_list)

    data = [
        {"ticker": ticker, "count": int(count)}
        for ticker, count in sorted(
            mention_counts.items(),
            key=lambda kv: kv[1],
            reverse=True,
        )
    ]

    snapshot: Dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {"id": src["id"], "label": src["label"], "url": src["url"]}
            for src in NEWS_SOURCES
        ],
        "data": data,
    }

    if errors:
        # attach which sources failed and why
        snapshot.setdefault("meta", {})
        snapshot["meta"]["failedSources"] = errors

    if not data:
        snapshot.setdefault("meta", {})
        snapshot["meta"]["noMentions"] = True
        snapshot["meta"]["note"] = "No tracked tickers were mentioned in the latest news snapshot."

    return snapshot


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
    used_default = False

    if tickers is not None:
        raw_tickers = [t.upper().strip() for t in tickers if t and t.strip()]
        tickers_list = raw_tickers
    else:
        mention_set = load_ticker_set_for_mentions()
        if mention_set:
            tickers_list = sorted(mention_set)
            print(
                f"[news] Using mentions ticker set with {len(tickers_list)} symbols "
                "from raw prices/fundamentals"
            )
        else:
            tickers_list = list(DEFAULT_TICKERS)
            used_default = True
            print(
                f"[news] Mentions ticker set empty; falling back to DEFAULT_TICKERS "
                f"({len(tickers_list)})"
            )

    snapshot = fetch_news_mentions(tickers_list)

    if used_default:
        snapshot.setdefault("meta", {})
        snapshot["meta"]["usedDefaultTickers"] = True
        snapshot["meta"]["reason"] = (
            "mentions ticker set unavailable; fell back to DEFAULT_TICKERS"
        )

    write_snapshot(snapshot)
    print(
        f"[news] Wrote news mentions snapshot for {len(tickers_list)} tickers "
        f"→ {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
