"""
data_scout/reddit.py

Fetch Reddit ticker mentions using the *official Reddit API* with OAuth.

- Auth flow matches scripts/test-reddit-auth.mjs (password grant).
- Reads Vite-style env vars from .env.local:
    VITE_REDDIT_CLIENT_ID
    VITE_REDDIT_SECRET
    VITE_REDDIT_USERNAME
    VITE_REDDIT_PASSWORD
    VITE_REDDIT_USER_AGENT   (optional)

Writes snapshot to:
    public/data/reddit-mentions.json

Snapshot schema:

{
  "generatedAt": "...",
  "windowDescription": "Last ~100 new posts per subreddit (OAuth API)",
  "subreddits": ["SecurityAnalysis", "stocks", ...],
  "data": [
    { "ticker": "AAPL", "count": 32 },
    { "ticker": "TSLA", "count": 27 }
  ]
}
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Iterable, List, Tuple
from data_scout.symbols import filter_valid_symbols, load_symbol_universe
import requests
from dotenv import load_dotenv

# Load .env.local at project root (same as your Node scripts)
load_dotenv(dotenv_path=".env.local")


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "reddit-mentions.json"


# Keep these in sync with config/redditSources.js
DEFAULT_SUBREDDITS = [
    "SecurityAnalysis",
    "ValueInvesting",
    "QualityInvesting",
    "EconMonitor",
    "ETFs",
    "MacroEconomics",
    "InvestorPsychology",
    "Frugal",
    "Unemployment",
    "RealEstate",
    "stocks",
    "investing",
    "wallstreetbets",
    "cryptocurrency",
]

# Keep in sync with config/trackedTickers.js
DEFAULT_TICKERS = [
    "AAPL",
    "MSFT",
    "TSLA",
    "GOOGL",
    "AMZN",
    "SPY",
    "VTI",
    "VOO",
]


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def get_env(*keys: str) -> str | None:
    """
    Try multiple env var names in order (for flexibility).
    Example:
        get_env("REDDIT_CLIENT_ID", "VITE_REDDIT_CLIENT_ID")
    """
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


def get_reddit_access_token() -> Tuple[str | None, str]:
    """
    Perform Reddit OAuth password grant using Vite-style env variables.
    """
    client_id = get_env("VITE_REDDIT_CLIENT_ID", "REDDIT_CLIENT_ID")
    secret = get_env("VITE_REDDIT_SECRET", "REDDIT_SECRET")
    username = get_env("VITE_REDDIT_USERNAME", "REDDIT_USERNAME")
    password = get_env("VITE_REDDIT_PASSWORD", "REDDIT_PASSWORD")

    user_agent = (
        get_env("VITE_REDDIT_USER_AGENT", "REDDIT_USER_AGENT")
        or f"u-stock-data-scout/1.0 (by u/{username})"
    )

    if not all([client_id, secret, username, password]):
        print("❌ Missing Reddit env vars.")
        print("   Required VITE_REDDIT_CLIENT_ID / SECRET / USERNAME / PASSWORD")
        return None, user_agent

    # Reddit requires HTTP Basic with client_id:secret
    auth_string = f"{client_id}:{secret}"
    auth_b64 = auth_string.encode("ascii")
    
    headers = {
        "User-Agent": user_agent,
    }

    data = {
        "grant_type": "password",
        "username": username,
        "password": password,
    }

    try:
        resp = requests.post(
            "https://www.reddit.com/api/v1/access_token",
            auth=(client_id, secret),
            data=data,
            headers=headers,
            timeout=15,
        )

        payload = resp.json()

        if not resp.ok:
            print("❌ OAuth FAILED")
            print("   Status:", resp.status_code, resp.reason)
            print("   Payload:", payload)
            return None, user_agent

        token = payload.get("access_token")
        if not token:
            print("❌ OAuth responded but missing access_token")
            return None, user_agent

        return token, user_agent

    except Exception as exc:
        print("❌ OAuth request error:", exc)
        return None, user_agent


def fetch_subreddit_posts(subreddit: str, token: str, user_agent: str, limit: int = 100):
    url = f"https://oauth.reddit.com/r/{subreddit}/new"
    headers = {
        "Authorization": f"bearer {token}",
        "User-Agent": user_agent,
    }
    params = {"limit": limit}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        children = resp.json().get("data", {}).get("children", [])
        return [c.get("data", {}) for c in children]
    except Exception as exc:
        print(f"[reddit] Failed fetching r/{subreddit}: {exc}")
        return []


def build_ticker_regex(tickers: Iterable[str]) -> re.Pattern:
    """
    Build a regex that matches tickers as whole words (case-insensitive).
    Example: r'\b(AAPL|TSLA|MSFT)\b'
    """
    escaped = [re.escape(t.upper()) for t in tickers if t.strip()]
    if not escaped:
        # match nothing if no tickers
        return re.compile(r"a^")

    # NOTE: single backslash here → \b = word boundary
    pattern = r"\b(" + "|".join(escaped) + r")\b"
    return re.compile(pattern, re.IGNORECASE)


def count_mentions_in_text(text: str, ticker_pattern: re.Pattern) -> Counter:
    """
    Count ticker occurrences in a given text using a compiled regex.
    """
    matches = ticker_pattern.findall(text or "")
    counts = Counter(t.upper() for t in matches)
    return counts


def fetch_reddit_mentions(
    subreddits: Iterable[str],
    tickers: Iterable[str],
    token: str,
    user_agent: str,
    posts_per_sub: int = 100,
) -> Dict[str, Any]:
    """
    Build the full Reddit mentions snapshot.
    """
    subreddits_list = [s.strip().lstrip("r/") for s in subreddits if s.strip()]
    tickers_list = sorted({t.upper().strip() for t in tickers if t.strip()})

    ticker_pattern = build_ticker_regex(tickers_list)
    aggregate_counts: Counter = Counter()

        # At this point aggregate_counts may include acronyms, junk, etc.
    # Apply symbol-universe filter to keep only real US tickers.
    if aggregate_counts:
        universe = load_symbol_universe()
        if universe:
            filtered_counts = {
                t: c for t, c in aggregate_counts.items() if t.upper() in universe
            }
        else:
            # No universe loaded → keep everything (fail soft)
            filtered_counts = dict(aggregate_counts)
    else:
        filtered_counts = {}

    data = [
        {"ticker": ticker, "count": int(count)}
        for ticker, count in sorted(
            filtered_counts.items(), key=lambda kv: kv[1], reverse=True
        )
    ]

    snapshot = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "windowDescription": "Last ~100 new posts per subreddit (OAuth API)",
        "subreddits": subreddits_list,
        "data": data,
    }
    return snapshot


def write_snapshot(snapshot: Dict[str, Any], output_file: Path = DEFAULT_OUTPUT_FILE) -> None:
    ensure_output_dir(output_file.parent)
    with output_file.open("w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)


def main(
    subreddits: Iterable[str] | None = None,
    tickers: Iterable[str] | None = None,
) -> None:
    """
    CLI entry point.

        PYTHONPATH=src python -m data_scout.reddit
    """
    token, user_agent = get_reddit_access_token()
    if not token:
        # Don't crash the whole pipeline; just write an empty snapshot.
        print("[reddit] No access token available. Writing empty snapshot.")
        snapshot = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "windowDescription": "OAuth failed – empty snapshot",
            "subreddits": [],
            "data": [],
            "error": "Reddit OAuth failed (check env vars / credentials)",
        }
        write_snapshot(snapshot)
        print(
            f"[reddit] Wrote EMPTY snapshot → {DEFAULT_OUTPUT_FILE}"
        )
        return

    subreddits = list(subreddits) if subreddits is not None else DEFAULT_SUBREDDITS
    tickers = list(tickers) if tickers is not None else DEFAULT_TICKERS

    snapshot = fetch_reddit_mentions(subreddits, tickers, token, user_agent)
    write_snapshot(snapshot)
    print(
        f"[reddit] Wrote snapshot: {len(snapshot['data'])} tickers "
        f"across {len(snapshot['subreddits'])} subreddits → {DEFAULT_OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()
