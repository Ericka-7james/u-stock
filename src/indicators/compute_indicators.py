"""
Compute simple day-trading indicators from your daily prices and fundamentals.

Reads:
  public/data/fetched/prices-raw.json
  public/data/fetched/fundamentals-slim.json

Writes:
  public/data/fetched/signals-today.json        (existing format)
  public/data/indicators/indicators-daily.json  (new standardized format)

Indicators per symbol:
  - close_return_1d   : yesterday close -> today close %
  - gap_pct           : prev close -> today open %
  - day_range_pct     : (high - low) / open for today
  - volume_ratio      : today volume / averageDailyVolume10Day
  - vol_10d           : 10-day volatility of daily returns
  - in_play_score     : naive combined "how spicy is this today?" score
"""

import json
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


# ---------- Path helpers ----------

def get_project_root() -> Path:
    # src/indicators/compute_indicators.py -> src -> project root
    return Path(__file__).resolve().parents[2]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


# ---------- Core math helpers ----------

def compute_daily_returns(prices: List[Dict[str, Any]]) -> List[float]:
    """
    Compute simple daily returns from a list of OHLCV rows.

    Assumes rows are in chronological order (oldest -> newest).
    return_t = (close_t / close_{t-1}) - 1
    """
    closes = [row["close"] for row in prices]
    returns: List[float] = []

    for i in range(1, len(closes)):
        prev = closes[i - 1]
        curr = closes[i]
        if prev is None or prev == 0:
            continue
        returns.append((curr / prev) - 1.0)

    return returns


def compute_indicators_for_symbol(
    symbol: str,
    daily_prices: List[Dict[str, Any]],
    fundamentals: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Compute derived indicators for one symbol combining:
      - daily_prices   : for returns and recent history
      - fundamentals   : trading_snapshot for today's context (open, high, low, volume)
    """
    if len(daily_prices) < 2:
        return {}

    # Make sure prices are sorted by date (string compare is OK for ISO yyyy-mm-dd)
    daily_prices_sorted = sorted(daily_prices, key=lambda row: row["date"])

    last = daily_prices_sorted[-1]
    prev = daily_prices_sorted[-2]

    last_close = last["close"]
    prev_close = prev["close"]

    # 1-day close-to-close return
    close_return_1d: Optional[float] = None
    if prev_close:
        close_return_1d = (last_close / prev_close) - 1.0

    # Pull trading snapshot (may not have all keys)
    trading_snapshot = fundamentals.get("trading_snapshot", {})
    today_open = trading_snapshot.get("regularMarketOpen")
    today_high = trading_snapshot.get("regularMarketDayHigh")
    today_low = trading_snapshot.get("regularMarketDayLow")
    today_volume = trading_snapshot.get("regularMarketVolume")
    avg_vol_10d = trading_snapshot.get("averageDailyVolume10Day")
    prev_close_ref = trading_snapshot.get("regularMarketPreviousClose")

    # Gap %: prev close -> today open
    gap_pct: Optional[float] = None
    base_prev_close = prev_close_ref or prev_close
    if base_prev_close and today_open:
        gap_pct = (today_open / base_prev_close) - 1.0

    # Day range %: how tall is today's candle?
    day_range_pct: Optional[float] = None
    if today_open and today_high and today_low and today_open != 0:
        day_range_pct = (today_high - today_low) / today_open

    # Volume ratio: today vol vs 10-day average
    volume_ratio: Optional[float] = None
    if today_volume and avg_vol_10d and avg_vol_10d != 0:
        volume_ratio = today_volume / avg_vol_10d

    # 10-day volatility (std dev) of daily returns
    returns = compute_daily_returns(daily_prices_sorted)
    vol_10d: Optional[float] = None
    if len(returns) >= 2:
        window = returns[-10:]
        if len(window) >= 2:
            vol_10d = statistics.stdev(window)

    # Naive in_play_score:
    #   - bigger gap, bigger range, higher volume ratio, higher vol_10d -> higher score
    #   - each contribution is capped so the score doesn't explode
    in_play_score = 0.0

    if gap_pct is not None:
        in_play_score += min(abs(gap_pct) * 100, 50)  # up to +50

    if day_range_pct is not None:
        in_play_score += min(day_range_pct * 100, 30)  # up to +30

    if volume_ratio is not None:
        # Only count volume > normal; each extra "1x avg" adds up to 10 pts, capped
        in_play_score += min(max(volume_ratio - 1.0, 0.0) * 10, 40)  # up to +40

    if vol_10d is not None:
        in_play_score += min(vol_10d * 100, 30)  # up to +30

    return {
        "symbol": symbol,
        "close_return_1d": close_return_1d,
        "gap_pct": gap_pct,
        "day_range_pct": day_range_pct,
        "volume_ratio": volume_ratio,
        "vol_10d": vol_10d,
        "in_play_score": in_play_score,
    }


# ---------- Main entrypoint ----------

def main() -> None:
    root = get_project_root()
    fetched_dir = root / "public" / "data" / "fetched"

    prices_path = fetched_dir / "prices-raw.json"
    fundamentals_path = fetched_dir / "fundamentals-slim.json"

    print(f"Loading prices from:       {prices_path}")
    print(f"Loading fundamentals from: {fundamentals_path}")

    prices_json = load_json(prices_path)
    fundamentals_json = load_json(fundamentals_path)

    prices_by_symbol: Dict[str, List[Dict[str, Any]]] = prices_json["prices"]
    fundamentals_by_symbol: Dict[str, Dict[str, Any]] = fundamentals_json["data"]

    signals: Dict[str, Any] = {}

    for symbol, price_rows in prices_by_symbol.items():
        fund = fundamentals_by_symbol.get(symbol, {})
        indicators = compute_indicators_for_symbol(symbol, price_rows, fund)
        if indicators:
            signals[symbol] = indicators

    # Use a single timestamp for both outputs
    now_iso = datetime.now(timezone.utc).isoformat()

    # ---------- Existing output (unchanged shape) ----------
    output_legacy = {
        "generated_at": now_iso,
        "symbols": list(signals.keys()),
        "signals": signals,
    }

    out_path_legacy = fetched_dir / "signals-today.json"
    with out_path_legacy.open("w", encoding="utf-8") as f:
        json.dump(output_legacy, f, indent=2)

    print(f"\nSaved signals to {out_path_legacy}")

    # ---------- New standardized indicators JSON ----------
    # Shape: generatedAt + windowDescription + universe + data[ticker, indicators]
    indicators_rows: List[Dict[str, Any]] = []

    for symbol, ind in signals.items():
        # Drop the embedded "symbol" field; we already have it as the key
        indicators_clean = {k: v for k, v in ind.items() if k != "symbol"}
        indicators_rows.append(
            {
                "ticker": symbol,
                "indicators": indicators_clean,
            }
        )

    universe = sorted(signals.keys())

    indicators_payload = {
        "generatedAt": now_iso,
        "windowDescription": "Daily EOD day-trading indicators",
        "universe": universe,
        "data": indicators_rows,
    }

    indicators_dir = root / "public" / "data" / "indicators"
    indicators_dir.mkdir(parents=True, exist_ok=True)
    indicators_path = indicators_dir / "indicators-daily.json"

    with indicators_path.open("w", encoding="utf-8") as f:
        json.dump(indicators_payload, f, indent=2)

    print(f"Saved standardized daily indicators to {indicators_path}")


if __name__ == "__main__":
    main()
