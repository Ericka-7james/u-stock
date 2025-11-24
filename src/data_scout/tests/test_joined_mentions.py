from pathlib import Path
import json

from data_scout import joined_mentions as jm


def test_build_index_ignores_missing_tickers():
    snapshot = {
        "data": [
            {"ticker": "AAPL", "count": 3},
            {"ticker": "", "count": 10},
            {"count": 5},
        ]
    }
    idx = jm.build_index(snapshot)
    assert idx == {"AAPL": 3}


def test_build_joined_mentions_merges_counts():
    reddit = {"data": [{"ticker": "AAPL", "count": 5}, {"ticker": "TSLA", "count": 2}]}
    news = {"data": [{"ticker": "AAPL", "count": 3}, {"ticker": "MSFT", "count": 4}]}

    joined = jm.build_joined_mentions(reddit, news)
    data = {row["ticker"]: row for row in joined["data"]}

    assert data["AAPL"]["redditCount"] == 5
    assert data["AAPL"]["newsCount"] == 3
    assert data["AAPL"]["totalMentions"] == 8

    assert data["TSLA"]["redditCount"] == 2
    assert data["TSLA"]["newsCount"] == 0

    assert data["MSFT"]["redditCount"] == 0
    assert data["MSFT"]["newsCount"] == 4


def test_main_reads_files_and_writes_output(tmp_path, monkeypatch):
    # Create fake reddit + news snapshot files
    reddit_data = {"data": [{"ticker": "AAPL", "count": 1}]}
    news_data = {"data": [{"ticker": "AAPL", "count": 2}]}

    data_dir = tmp_path
    reddit_file = data_dir / "reddit-mentions.json"
    news_file = data_dir / "news-mentions.json"
    out_file = data_dir / "mentions-joined.json"

    reddit_file.write_text(json.dumps(reddit_data), encoding="utf-8")
    news_file.write_text(json.dumps(news_data), encoding="utf-8")

    monkeypatch.setattr(jm, "REDDIT_FILE", reddit_file)
    monkeypatch.setattr(jm, "NEWS_FILE", news_file)
    monkeypatch.setattr(jm, "OUTPUT_FILE", out_file)

    jm.main()

    assert out_file.exists()
    out = json.loads(out_file.read_text(encoding="utf-8"))
    row = out["data"][0]
    assert row["ticker"] == "AAPL"
    assert row["totalMentions"] == 3
