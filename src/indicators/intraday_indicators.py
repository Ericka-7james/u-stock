"""
Compute intraday (5m) indicators from intraday-5m.json.

Reads:
  public/data/fetched/intraday-5m.json

Writes (legacy):
  public/data/fetched/intraday-signals.json

Writes (new standardized):
  public/data/indicators/indicators-intraday.json

Indicators per symbol for the most recent trading day:
  - intraday_return      : (last close / first open) - 1
  - intraday_range_pct   : (max(high) - min(low)) / first open
  - vwap                 : volume-weighted average price
  - close_vs_vwap_pct    : (last close / vwap) - 1
  - volume_spike_ratio   : max(volume) / avg(volume)
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------- Path helpers ----------

def get_project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


# ---------- Helpers ----------

def extract_latest_session_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not rows:
        return []

    for row in rows:
        date_str = str(row.get("date", ""))
        row["_day"] = date_str.split(" ")[0]

    days = sorted({row["_day"] for row in rows})
    latest_day = days[-1]

    latest_rows = [r for r in rows if r["_day"] == latest_day]
    return sorted(latest_rows, key=lambda r: str(r["date"]))


def compute_intraday_indicators_for_symbol(
    symbol: str,
    intraday_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:

    latest_rows = extract_latest_session_rows(intraday_rows)
    if len(latest_rows) < 2:
        return {}

    first = latest_rows[0]
    last = latest_rows[-1]

    first_open = first.get("open")
    last_close = last.get("close")

    if not first_open or not last_close or first_open == 0:
        return {}

    intraday_return = (last_close / first_open) - 1.0

    highs = [r.get("high") for r in latest_rows if r.get("high") is not None]
    lows = [r.get("low") for r in latest_rows if r.get("low") is not None]

    if not highs or not lows:
        return {}

    high_of_day = max(highs)
    low_of_day = min(lows)

    intraday_range_pct = (high_of_day - low_of_day) / first_open

    # VWAP
    vwap_num = 0.0
    vwap_den = 0.0
    volumes = []

    for r in latest_rows:
        h, l, c, v = r.get("high"), r.get("low"), r.get("close"), r.get("volume")
        if None in (h, l, c, v):
            continue
        typical = (h + l + c) / 3.0
        vwap_num += typical * v
        vwap_den += v
        volumes.append(v)

    vwap = vwap_num / vwap_den if vwap_den > 0 else None

    close_vs_vwap_pct = None
    if vwap and vwap != 0:
        close_vs_vwap_pct = (last_close / vwap) - 1.0

    volume_spike_ratio = None
    if volumes:
        avg_v = sum(volumes) / len(volumes)
        max_v = max(volumes)
        if avg_v > 0:
            volume_spike_ratio = max_v / avg_v

    return {
        "symbol": symbol,
        "session_date": latest_rows[0]["_day"],
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
    intraday_json = load_json(intraday_path)

    intraday_by_symbol: Dict[str, List[Dict[str, Any]]] = intraday_json["prices"]
    interval = intraday_json.get("interval", "5m")

    signals: Dict[str, Any] = {}

    for symbol, rows in intraday_by_symbol.items():
        ind = compute_intraday_indicators_for_symbol(symbol, rows)
        if ind:
            signals[symbol] = ind

    now_iso = datetime.now(timezone.utc).isoformat()

    # ---- Legacy output ----
    legacy_output = {
        "generated_at": now_iso,
        "interval": interval,
        "symbols": list(signals.keys()),
        "intraday_signals": signals,
    }

    out_legacy = fetched_dir / "intraday-signals.json"
    with out_legacy.open("w", encoding="utf-8") as f:
        json.dump(legacy_output, f, indent=2)

    print(f"Saved intraday signals to {out_legacy}")

    # ---- Standardized output ----
    indicators_dir = root / "public" / "data" / "indicators"
    indicators_dir.mkdir(parents=True, exist_ok=True)

    indicators_rows = []
    for symbol, ind in signals.items():
        indicators_clean = {k: v for k, v in ind.items() if k != "symbol"}
        indicators_rows.append(
            {
                "ticker": symbol,
                "sessionDate": ind.get("session_date"),
                "indicators": indicators_clean,
            }
        )

    payload = {
        "generatedAt": now_iso,
        "windowDescription": "Intraday indicators (5m latest session)",
        "interval": interval,
        "universe": sorted(signals.keys()),
        "data": indicators_rows,
    }

    out_std = indicators_dir / "indicators-intraday.json"
    with out_std.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Saved standardized intraday indicators to {out_std}")


if __name__ == "__main__":
    main()
