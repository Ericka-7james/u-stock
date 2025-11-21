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
from data_scout.symbols import load_symbol_universe, filter_valid_symbols
import requests
from dotenv import load_dotenv

# Load .env.local at project root (same as your Node scripts)
load_dotenv(dotenv_path=".env.local")


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "public" / "data"
DEFAULT_OUTPUT_FILE = DEFAULT_OUTPUT_DIR / "reddit-mentions.json"

# Default subreddits to scan if none are passed to main()
DEFAULT_SUBREDDITS = [
    "SecurityAnalysis",
    "stocks",
    "investing",
    "wallstreetbets",
]

# Fallback tickers if no symbol universe or explicit tickers are provided
DEFAULT_TICKERS = [
    "AAPL",
    "MSFT",
    "TSLA",
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
    raw_tickers_list = [t.upper().strip() for t in tickers if t.strip()]

    # 🔒 Validate against symbol universe (if available)
    validated_tickers = filter_valid_symbols(raw_tickers_list)
    tickers_list = sorted(validated_tickers or raw_tickers_list)

    ticker_pattern = build_ticker_regex(tickers_list)
    aggregate_counts: Counter = Counter()

    for sub in subreddits_list:
        print(f"[reddit] Fetching r/{sub} …")
        posts = fetch_subreddit_posts(sub, token, user_agent, limit=posts_per_sub)
        for post in posts:
            title = post.get("title") or ""
            selftext = post.get("selftext") or ""
            combined = f"{title} {selftext}"
            counts = count_mentions_in_text(combined, ticker_pattern)
            aggregate_counts.update(counts)

    # Optional: filter counts one more time for extra safety
    universe = load_symbol_universe()
    if universe:
        aggregate_counts = Counter(
            {t: c for t, c in aggregate_counts.items() if t.upper() in universe}
        )

    data = [
        {"ticker": ticker, "count": int(count)}
        for ticker, count in aggregate_counts.most_common()
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
    # 1) OAuth
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
            "meta": {
                "usedDefaultTickers": True,
                "reason": "OAuth failed, no data fetched",
            },
        }
        write_snapshot(snapshot)
        print(f"[reddit] Wrote EMPTY snapshot → {DEFAULT_OUTPUT_FILE}")
        return

    # 2) Subreddits
    subreddits_list = (
        list(subreddits) if subreddits is not None else DEFAULT_SUBREDDITS
    )

    # 3) Ticker universe: symbol_universe → explicit → default
    used_default = False
    try:
        symbol_universe = load_symbol_universe()
    except Exception as exc:  # noqa: BLE001
        print(
            f"[reddit] Symbol universe unavailable, falling back to defaults/explicit: {exc}"
        )
        symbol_universe = None

    if symbol_universe:
        tickers_list = sorted(symbol_universe)
    elif tickers is not None:
        tickers_list = list(tickers)
    else:
        tickers_list = list(DEFAULT_TICKERS)
        used_default = True

    # 4) Build snapshot
    snapshot = fetch_reddit_mentions(
        subreddits_list,
        tickers_list,
        token,
        user_agent,
    )

    if used_default:
        snapshot["meta"] = {
            "usedDefaultTickers": True,
            "reason": "symbol universe missing/invalid and no explicit tickers passed",
        }

    write_snapshot(snapshot)
    print(
        f"[reddit] Wrote snapshot: {len(snapshot['data'])} tickers "
        f"across {len(snapshot['subreddits'])} subreddits → {DEFAULT_OUTPUT_FILE}"
    )

if __name__ == "__main__":
    main()
