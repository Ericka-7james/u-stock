"""
signal_engine.py

Combine daily, intraday, and multiday indicators into a single
per-ticker "final signal" file with a simple numeric score.

Reads (standardized indicator JSONs):
  public/data/indicators/indicators-daily.json
  public/data/indicators/indicators-intraday.json
  public/data/indicators/multiday-indicators.json

Writes:
  public/data/signals/final-signals.json

Output shape:

{
  "generatedAt": "...",
  "rankingDescription": "Higher score = more 'in play' today with supportive intraday + multiday context",
  "universe": ["AAPL", "MSFT", "GOOG"],
  "data": [
    {
      "ticker": "AAPL",
      "score": 4.23,
      "components": {
        "daily": { ...indicators from indicators-daily.json... },
        "intraday": { ...indicators from indicators-intraday.json... },
        "multiday": { ...indicators from multiday-indicators.json... }
      }
    },
    ...
  ]
}
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------- Path helpers ----------

def get_project_root() -> Path:
    # src/indicators/signal_engine.py -> src -> project root
    return Path(__file__).resolve().parents[2]


def load_json_if_exists(path: Path) -> Optional[Dict[str, Any]]:
    if not path.exists():
        print(f"[signal_engine] Warning: {path} not found, skipping.")
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[signal_engine] Error reading {path}: {e}")
        return None


# ---------- Data structures ----------

@dataclass
class TickerIndicators:
    daily: Dict[str, Any] = field(default_factory=dict)
    intraday: Dict[str, Any] = field(default_factory=dict)
    multiday: Dict[str, Any] = field(default_factory=dict)


# ---------- Load helpers for each indicator file ----------

def load_daily_indicators(root: Path) -> Dict[str, Dict[str, Any]]:
    """
    Return mapping: ticker -> daily_indicators_dict
    from indicators-daily.json
    """
    path = root / "public" / "data" / "indicators" / "indicators-daily.json"
    payload = load_json_if_exists(path)
    result: Dict[str, Dict[str, Any]] = {}

    if not payload:
        return result

    for row in payload.get("data", []):
        ticker = row.get("ticker")
        indicators = row.get("indicators", {})
        if not ticker:
            continue
        result[ticker] = indicators

    return result


def load_intraday_indicators(root: Path) -> Dict[str, Dict[str, Any]]:
    """
    Return mapping: ticker -> intraday_indicators_dict
    from indicators-intraday.json
    """
    path = root / "public" / "data" / "indicators" / "indicators-intraday.json"
    payload = load_json_if_exists(path)
    result: Dict[str, Dict[str, Any]] = {}

    if not payload:
        return result

    for row in payload.get("data", []):
        ticker = row.get("ticker")
        indicators = row.get("indicators", {})
        if not ticker:
            continue
        result[ticker] = indicators

    return result


def load_multiday_indicators(root: Path) -> Dict[str, Dict[str, Any]]:
    """
    Return mapping: ticker -> multiday_indicators_dict
    from multiday-indicators.json
    """
    path = root / "public" / "data" / "indicators" / "multiday-indicators.json"
    payload = load_json_if_exists(path)
    result: Dict[str, Dict[str, Any]] = {}

    if not payload:
        return result

    for row in payload.get("data", []):
        ticker = row.get("ticker")
        indicators = row.get("indicators", {})
        if not ticker:
            continue
        result[ticker] = indicators

    return result


# ---------- Scoring logic ----------

def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def compute_score_for_ticker(ind: TickerIndicators) -> float:
    """
    Very simple scoring model:

    - Daily:
        + uses in_play_score (0..~150)
    - Intraday:
        + intraday_return (in % terms)
        + volume_spike_ratio
    - Multiday:
        + return_3d and return_5d (momentum)

    This is intentionally simple and easy to tweak later.
    Score is roughly in a 0..10+ range.
    """
    score = 0.0

    # ----- Daily component -----
    daily = ind.daily
    in_play_score = daily.get("in_play_score")
    if isinstance(in_play_score, (int, float)):
        # Scale down so ~0-15 range becomes 0-3 pts
        score += clamp(in_play_score / 5.0, 0.0, 4.0)

    # Slight bonus for good 1d close return
    close_return_1d = daily.get("close_return_1d")
    if isinstance(close_return_1d, (int, float)):
        # convert to percentage and cap
        score += clamp(close_return_1d * 100.0 / 10.0, -1.0, 1.0)

    # ----- Intraday component -----
    intraday = ind.intraday
    intraday_return = intraday.get("intraday_return")
    if isinstance(intraday_return, (int, float)):
        # strong intraday moves add or subtract up to ~2 pts
        score += clamp(intraday_return * 100.0 / 5.0, -2.0, 2.0)

    volume_spike_ratio = intraday.get("volume_spike_ratio")
    if isinstance(volume_spike_ratio, (int, float)):
        # More than 1x avg volume is interesting; 1-5x gives up to ~2 pts
        excess = max(volume_spike_ratio - 1.0, 0.0)
        score += clamp(excess / 2.0, 0.0, 2.0)

    # ----- Multiday component -----
    multiday = ind.multiday
    ret_3d = multiday.get("return_3d")
    ret_5d = multiday.get("return_5d")

    if isinstance(ret_3d, (int, float)):
        score += clamp(ret_3d * 100.0 / 10.0, -1.5, 1.5)

    if isinstance(ret_5d, (int, float)):
        score += clamp(ret_5d * 100.0 / 20.0, -1.5, 1.5)

    return score


# ---------- Main engine ----------

def build_final_signals(root: Path) -> Dict[str, Any]:
    daily_map = load_daily_indicators(root)
    intraday_map = load_intraday_indicators(root)
    multiday_map = load_multiday_indicators(root)

    all_tickers = set(daily_map.keys()) | set(intraday_map.keys()) | set(multiday_map.keys())

    combined: Dict[str, TickerIndicators] = {}

    for ticker in sorted(all_tickers):
        combined[ticker] = TickerIndicators(
            daily=daily_map.get(ticker, {}),
            intraday=intraday_map.get(ticker, {}),
            multiday=multiday_map.get(ticker, {}),
        )

    results: List[Dict[str, Any]] = []

    for ticker, ind in combined.items():
        score = compute_score_for_ticker(ind)
        results.append(
            {
                "ticker": ticker,
                "score": score,
                "components": {
                    "daily": ind.daily,
                    "intraday": ind.intraday,
                    "multiday": ind.multiday,
                },
            }
        )

    # sort by score descending (highest first)
    results_sorted = sorted(results, key=lambda r: r["score"], reverse=True)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "rankingDescription": (
            "Higher score = more 'in play' today, combining daily in-play, "
            "intraday action, and multi-day momentum."
        ),
        "universe": [row["ticker"] for row in results_sorted],
        "data": results_sorted,
    }

    return payload


def save_final_signals(root: Path, payload: Dict[str, Any]) -> Path:
    signals_dir = root / "public" / "data" / "signals"
    signals_dir.mkdir(parents=True, exist_ok=True)
    out_path = signals_dir / "final-signals.json"

    with out_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    return out_path


def main() -> None:
    root = get_project_root()
    payload = build_final_signals(root)
    out_path = save_final_signals(root, payload)

    print(f"[signal_engine] Wrote final signals for {len(payload.get('data', []))} tickers to {out_path}")


if __name__ == "__main__":
    main()
