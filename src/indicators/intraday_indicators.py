"""
Compute intraday (5m) indicators from intraday-5m.json.

Reads:
  public/data/fetched/intraday-5m.json

Writes:
  public/data/fetched/intraday-signals.json

Indicators per symbol for the most recent trading day:
  - intraday_return      : (last close / first open) - 1
  - intraday_range_pct   : (max(high) - min(low)) / first open
  - vwap                 : volume-weighted average price
  - close_vs_vwap_pct    : (last close / vwap) - 1
  - volume_spike_ratio   : max(volume) / avg(volume) for the day
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------- Path helpers ----------

def get_project_root() -> Path:
    # src/indicators/intraday_indicators.py -> src -> project root
    return Path(__file__).resolve().parents[2]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


# ---------- Core intraday helpers ----------

def extract_latest_session_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Given a list of intraday rows (with 'date' as string),
    keep only the rows from the *most recent* trading day.

    We assume 'date' looks like:
      "2025-11-21 14:30:00-05:00"
    or
      "2025-11-21 14:30:00"
    or just:
      "2025-11-21"

    We'll split on space and use the first part as the "day key".
    """
    if not rows:
        return []

    # Normalize each row with a "day" field
    for row in rows:
        # e.g. "2025-11-21 14:30:00-05:00" -> "2025-11-21"
        date_str = str(row.get("date", ""))
        day_part = date_str.split(" ")[0]
        row["_day"] = day_part

    # Find the most recent day
    days = sorted({row["_day"] for row in rows})
    latest_day = days[-1]

    latest_rows = [r for r in rows if r["_day"] == latest_day]

    # Sort intraday rows by time within that day using the full "date" string
    latest_rows_sorted = sorted(latest_rows, key=lambda r: str(r["date"]))
    return latest_rows_sorted


def compute_intraday_indicators_for_symbol(
    symbol: str,
    intraday_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Compute intraday indicators for the latest trading day for this symbol.
    """
    latest_rows = extract_latest_session_rows(intraday_rows)
    if len(latest_rows) < 2:
        return {}

    first = latest_rows[0]
    last = latest_rows[-1]

    first_open = first.get("open")
    last_close = last.get("close")

    # Basic guards
    if not first_open or not last_close or first_open == 0:
        return {}

    # Intraday return: open -> close
    intraday_return = (last_close / first_open) - 1.0

    # Range %: (high_of_day - low_of_day) / first_open
    highs = [row.get("high") for row in latest_rows if row.get("high") is not None]
    lows = [row.get("low") for row in latest_rows if row.get("low") is not None]

    if not highs or not lows:
        return {}

    high_of_day = max(highs)
    low_of_day = min(lows)

    intraday_range_pct: Optional[float] = None
    if first_open != 0:
        intraday_range_pct = (high_of_day - low_of_day) / first_open

    # VWAP: sum(price * volume) / sum(volume)
    # We'll approximate "price" as (high + low + close) / 3 per bar.
    vwap_numerator = 0.0
    vwap_denominator = 0.0
    volumes = []

    for row in latest_rows:
        h = row.get("high")
        l = row.get("low")
        c = row.get("close")
        v = row.get("volume")

        if h is None or l is None or c is None or v is None:
            continue

        typical_price = (h + l + c) / 3.0
        vwap_numerator += typical_price * v
        vwap_denominator += v
        volumes.append(v)

    vwap: Optional[float] = None
    if vwap_denominator > 0:
        vwap = vwap_numerator / vwap_denominator

    close_vs_vwap_pct: Optional[float] = None
    if vwap and vwap != 0:
        close_vs_vwap_pct = (last_close / vwap) - 1.0

    # Volume spike ratio: max(volume) / avg(volume) for the day
    volume_spike_ratio: Optional[float] = None
    if volumes:
        avg_volume = sum(volumes) / len(volumes)
        max_volume = max(volumes)
        if avg_volume > 0:
            volume_spike_ratio = max_volume / avg_volume

    return {
        "symbol": symbol,
        "session_date": latest_rows[0]["_day"],  # e.g. "2025-11-21"
        "first_open": first_open,
        "last_close": last_close,
        "intraday_return": intraday_return,
        "intraday_range_pct": intraday_range_pct,
        "vwap": vwap,
        "close_vs_vwap_pct": close_vs_vwap_pct,
        "volume_spike_ratio": volume_spike_ratio,
    }


# ---------- Main entrypoint ----------

def main() -> None:
    root = get_project_root()
    fetched_dir = root / "public" / "data" / "fetched"

    intraday_path = fetched_dir / "intraday-5m.json"
    print(f"Loading intraday data from: {intraday_path}")

    intraday_json = load_json(intraday_path)
    intraday_by_symbol: Dict[str, List[Dict[str, Any]]] = intraday_json["prices"]

    signals: Dict[str, Any] = {}

    for symbol, rows in intraday_by_symbol.items():
        indicators = compute_intraday_indicators_for_symbol(symbol, rows)
        if indicators:
            signals[symbol] = indicators

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "interval": intraday_json.get("interval", "5m"),
        "symbols": list(signals.keys()),
        "intraday_signals": signals,
    }

    out_path = fetched_dir / "intraday-signals.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved intraday signals to {out_path}")


if __name__ == "__main__":
    main()
