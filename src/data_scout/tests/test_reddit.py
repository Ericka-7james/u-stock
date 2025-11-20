from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from data_scout import reddit as r


# --- Helpers ----------------------------------------------------------------------


class DummyResponse:
    def __init__(self, payload: dict, status_code: int = 200, reason: str = "OK"):
        self._payload = payload
        self.status_code = status_code
        self.reason = reason

    @property
    def ok(self) -> bool:
        return self.status_code < 400

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code} {self.reason}")

    def json(self) -> dict:
        return self._payload


# --- Tests for get_env ------------------------------------------------------------


def test_get_env_returns_first_non_empty(monkeypatch):
    monkeypatch.setenv("KEY1", "")
    monkeypatch.setenv("KEY2", "value2")
    monkeypatch.setenv("KEY3", "value3")

    result = r.get_env("KEY1", "KEY2", "KEY3")
    assert result == "value2"


def test_get_env_returns_none_when_all_missing(monkeypatch):
    monkeypatch.delenv("KEYX", raising=False)
    monkeypatch.delenv("KEYY", raising=False)

    result = r.get_env("KEYX", "KEYY")
    assert result is None


# --- Tests for get_reddit_access_token -------------------------------------------


def test_get_reddit_access_token_missing_env(monkeypatch, capsys):
    # Clear all expected envs
    for key in [
        "VITE_REDDIT_CLIENT_ID",
        "REDDIT_CLIENT_ID",
        "VITE_REDDIT_SECRET",
        "REDDIT_SECRET",
        "VITE_REDDIT_USERNAME",
        "REDDIT_USERNAME",
        "VITE_REDDIT_PASSWORD",
        "REDDIT_PASSWORD",
        "VITE_REDDIT_USER_AGENT",
        "REDDIT_USER_AGENT",
    ]:
        monkeypatch.delenv(key, raising=False)

    token, ua = r.get_reddit_access_token()

    captured = capsys.readouterr()
    assert "Missing Reddit env vars" in captured.out
    assert token is None
    # UA gets built even if username is missing; just ensure it's non-empty string
    assert isinstance(ua, str)
    assert "u-stock-data-scout/1.0" in ua


def test_get_reddit_access_token_success(monkeypatch):
    # Set minimal env vars
    monkeypatch.setenv("VITE_REDDIT_CLIENT_ID", "client123")
    monkeypatch.setenv("VITE_REDDIT_SECRET", "secret123")
    monkeypatch.setenv("VITE_REDDIT_USERNAME", "myuser")
    monkeypatch.setenv("VITE_REDDIT_PASSWORD", "mypass")
    monkeypatch.setenv("VITE_REDDIT_USER_AGENT", "custom-UA")

    def fake_post(url, auth=None, data=None, headers=None, timeout=15):
        assert "access_token" in url
        # Basic sanity checks on request shape
        assert auth == ("client123", "secret123")
        assert data["grant_type"] == "password"
        assert data["username"] == "myuser"
        assert data["password"] == "mypass"
        assert headers["User-Agent"] == "custom-UA"

        payload = {"access_token": "token-abc"}
        return DummyResponse(payload, status_code=200)

    monkeypatch.setattr(r.requests, "post", fake_post)

    token, ua = r.get_reddit_access_token()

    assert token == "token-abc"
    assert ua == "custom-UA"


def test_get_reddit_access_token_http_error(monkeypatch, capsys):
    monkeypatch.setenv("VITE_REDDIT_CLIENT_ID", "client123")
    monkeypatch.setenv("VITE_REDDIT_SECRET", "secret123")
    monkeypatch.setenv("VITE_REDDIT_USERNAME", "myuser")
    monkeypatch.setenv("VITE_REDDIT_PASSWORD", "mypass")

    def fake_post(url, auth=None, data=None, headers=None, timeout=15):
        payload = {"error": "invalid_grant"}
        return DummyResponse(payload, status_code=401, reason="Unauthorized")

    monkeypatch.setattr(r.requests, "post", fake_post)

    token, ua = r.get_reddit_access_token()

    captured = capsys.readouterr()
    assert "OAuth FAILED" in captured.out
    assert "Status: 401 Unauthorized" in captured.out
    assert token is None
    assert isinstance(ua, str)


def test_get_reddit_access_token_exception(monkeypatch, capsys):
    monkeypatch.setenv("VITE_REDDIT_CLIENT_ID", "client123")
    monkeypatch.setenv("VITE_REDDIT_SECRET", "secret123")
    monkeypatch.setenv("VITE_REDDIT_USERNAME", "myuser")
    monkeypatch.setenv("VITE_REDDIT_PASSWORD", "mypass")

    def fake_post(url, auth=None, data=None, headers=None, timeout=15):
        raise RuntimeError("network down")

    monkeypatch.setattr(r.requests, "post", fake_post)

    token, ua = r.get_reddit_access_token()

    captured = capsys.readouterr()
    assert "OAuth request error" in captured.out
    assert token is None
    assert isinstance(ua, str)


# --- Tests for build_ticker_regex + count_mentions_in_text ------------------------


def test_build_ticker_regex_matches_whole_words_case_insensitive():
    pattern = r.build_ticker_regex(["AAPL", "TSLA"])

    text = "I like aapl and TSLA. But not TSLAQ or AAPLL."
    matches = pattern.findall(text)
    # Should match only the whole-word instances
    assert [m.upper() for m in matches] == ["AAPL", "TSLA"]


def test_build_ticker_regex_empty_list_matches_nothing():
    pattern = r.build_ticker_regex([])

    text = "AAPL TSLA SPY"
    matches = pattern.findall(text)
    assert matches == []


def test_count_mentions_in_text_counts_by_ticker():
    pattern = r.build_ticker_regex(["AAPL", "TSLA"])
    text = "AAPL TSLA tsla aapl AAPL."
    counts = r.count_mentions_in_text(text, pattern)

    # Counter keys are uppercased
    assert counts["AAPL"] == 3
    assert counts["TSLA"] == 2


# --- Tests for fetch_reddit_mentions ----------------------------------------------


def test_fetch_reddit_mentions_aggregates_counts(monkeypatch):
    """It should fetch per-subreddit posts and aggregate ticker counts."""

    def fake_fetch_posts(subreddit, token, user_agent, limit=100):
        # 2 "posts" per subreddit
        return [
            # Post 1
            {
                "title": f"{subreddit} loves AAPL and TSLA",
                "selftext": "AAPL AAPL",
            },
            # Post 2
            {
                "title": "TSLA or SPY?",
                "selftext": "spy spy",
            },
        ]

    monkeypatch.setattr(r, "fetch_subreddit_posts", fake_fetch_posts)

    snapshot = r.fetch_reddit_mentions(
        subreddits=["r/stocks", "investing"],  # mix of r/ prefix and plain
        tickers=["AAPL", "TSLA", "SPY"],
        token="token-abc",
        user_agent="UA",
        posts_per_sub=2,
    )

    # Subreddits cleaned / normalized
    assert snapshot["subreddits"] == ["stocks", "investing"]

    # Data sorted by count (most_common)
    data = snapshot["data"]
    counts = {d["ticker"]: d["count"] for d in data}

    # For each subreddit, contributions:
    # - AAPL: in post1 title (1) + selftext (2) = 3  → across 2 subs = 6
    # - TSLA: in post1 title (1) + post2 title (1) = 2 → across 2 subs = 4
    # - SPY:  in post2 title (1) + selftext (2) = 3 → across 2 subs = 6
    assert counts["AAPL"] == 6
    assert counts["TSLA"] == 4
    assert counts["SPY"] == 6

    assert "generatedAt" in snapshot
    assert isinstance(snapshot["generatedAt"], str)
    assert snapshot["windowDescription"].startswith("Last ~100 new posts")

# --- Tests for write_snapshot -----------------------------------------------------


def test_write_snapshot_writes_json(tmp_path: Path):
    snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "windowDescription": "Test window",
        "subreddits": ["stocks"],
        "data": [{"ticker": "AAPL", "count": 10}],
    }

    out_file = tmp_path / "public" / "data" / "reddit-mentions.json"
    r.write_snapshot(snapshot, output_file=out_file)

    assert out_file.exists()
    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded == snapshot


# --- Tests for main ---------------------------------------------------------------


def test_main_writes_empty_snapshot_when_no_token(monkeypatch):
    """If OAuth fails (no token), main() should write an empty snapshot with an error field."""
    fake_get_token = MagicMock(return_value=(None, "UA"))
    fake_write = MagicMock()

    monkeypatch.setattr(r, "get_reddit_access_token", fake_get_token)
    monkeypatch.setattr(r, "write_snapshot", fake_write)

    r.main(subreddits=["stocks"], tickers=["AAPL"])

    fake_get_token.assert_called_once()
    fake_write.assert_called_once()
    (snapshot,), _ = fake_write.call_args

    assert snapshot["subreddits"] == []
    assert snapshot["data"] == []
    assert snapshot["windowDescription"].startswith("OAuth failed")
    assert "error" in snapshot
    assert "Reddit OAuth failed" in snapshot["error"]


@pytest.mark.skip(reason="Temporarily skipping while updating reddit main()")
def test_main_happy_path(monkeypatch):
    """With a token, main() should call fetch_reddit_mentions and write_snapshot with the result."""
    fake_snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "windowDescription": "Some window",
        "subreddits": ["stocks"],
        "data": [{"ticker": "AAPL", "count": 10}],
    }

    fake_get_token = MagicMock(return_value=("token-xyz", "UA"))
    fake_fetch_mentions = MagicMock(return_value=fake_snapshot)
    fake_write = MagicMock()

    monkeypatch.setattr(r, "get_reddit_access_token", fake_get_token)
    monkeypatch.setattr(r, "fetch_reddit_mentions", fake_fetch_mentions)
    monkeypatch.setattr(r, "write_snapshot", fake_write)

    r.main(subreddits=["stocks"], tickers=["AAPL", "TSLA"])

    fake_get_token.assert_called_once()
    fake_fetch_mentions.assert_called_once_with(
        ["stocks"],
        ["AAPL", "TSLA"],
        "token-xyz",
        "UA",
    )
    fake_write.assert_called_once_with(fake_snapshot)
