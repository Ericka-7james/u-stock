# src/data_scout/tests/test_news.py
from unittest.mock import MagicMock

from data_scout import news as n


def test_count_mentions_across_sources_basic():
    corpus = {
        "src1": "AAPL is up. AAPL TSLA",
        "src2": "TSLA TSLA and maybe AAPL",
    }
    tickers = ["AAPL", "TSLA"]

    counts = n.count_mentions_across_sources(corpus, tickers)

    assert counts["AAPL"] == 3  # AAPL (1) + AAPL (1) + AAPL (1)
    assert counts["TSLA"] == 3  # TSLA (1) + TSLA TSLA (2)


def test_fetch_news_mentions_uses_symbol_validation(monkeypatch):
    # Fake symbol universe to filter out nonsense
    fake_universe = {"AAPL", "TSLA"}

    monkeypatch.setattr(n, "load_symbol_universe", MagicMock(return_value=fake_universe))

    # Fake RSS text that mentions REAL + FAKE “tickers”
    def fake_fetch_rss_text(url: str) -> str:
        return "AAPL TSLA YOLO CEO"

    monkeypatch.setattr(n, "fetch_rss_text", fake_fetch_rss_text)

    snapshot = n.fetch_news_mentions(["AAPL", "TSLA", "YOLO", "CEO"])

    tickers = {row["ticker"] for row in snapshot["data"]}
    assert "AAPL" in tickers
    assert "TSLA" in tickers
    assert "YOLO" not in tickers
    assert "CEO" not in tickers


def test_main_works_with_default_universe(monkeypatch, tmp_path):
    # Avoid hitting network / disk for real
    fake_snapshot = {
        "generatedAt": "2025-11-19T00:00:00Z",
        "sources": [],
        "data": [{"ticker": "AAPL", "count": 5}],
    }

    monkeypatch.setattr(n, "fetch_news_mentions", MagicMock(return_value=fake_snapshot))
    # Use temp output file
    out_file = tmp_path / "news-mentions.json"
    monkeypatch.setattr(n, "DEFAULT_OUTPUT_FILE", out_file)

    # Also monkeypatch symbol universe to be deterministic
    monkeypatch.setattr(n, "load_symbol_universe", MagicMock(return_value={"AAPL"}))

    n.main(tickers=None)

    assert out_file.exists()
    # And ensure fetch_news_mentions got called
    n.fetch_news_mentions.assert_called_once()
