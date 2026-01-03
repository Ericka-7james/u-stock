# src/preprocess/sentiment_snapshot.py
"""
Builds sentiment-snapshot.json from daily price history.

Output shape:
{
  "meta": { "generatedAt": "...", "universe": [...] },
  "data": [
    {
      "ticker": "AAPL",
      "price_based": { ... },
      "volatility": { ... },
      "technical": { ... },
      "risk": { ... },
      "style": { ... },
      "cross_section": { ... },
      "overall_label": "...",
      "overall_score": 3
    },
    ...
  ]
}
"""

from pathlib import Path
import json
from math import sqrt
from statistics import mean
from datetime import datetime


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "public" / "data" / "fetched"
PRICES_PATH = DATA_DIR / "prices-raw.json"
OUT_PATH = DATA_DIR / "sentiment-snapshot.json"


# ---------- helpers ---------------------------------------------------------


def pct(from_, to_):
    if not from_ or from_ == 0:
        return 0.0
    return (to_ - from_) / from_ * 100.0


def simple_rsi(closes, period=14):
    """Standard Wilder-style RSI on closes."""
    if len(closes) < period + 1:
        return None

    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        if diff >= 0:
            gains.append(diff)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(-diff)

    avg_gain = mean(gains)
    avg_loss = mean(losses)

    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss

    # Smooth for rest of series
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = max(diff, 0.0)
        loss = max(-diff, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            rs = float("inf")
        else:
            rs = avg_gain / avg_loss

    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi


def ema(values, period):
    """Exponential moving average (closing prices)."""
    if len(values) < period:
        return None

    k = 2 / (period + 1)
    ema_val = mean(values[:period])
    for price in values[period:]:
        ema_val = price * k + ema_val * (1 - k)
    return ema_val


def macd(values, fast=12, slow=26, signal=9):
    """MACD line, signal line, histogram."""
    if len(values) < slow + signal:
        return None, None, None

    fast_ema = ema(values, fast)
    slow_ema = ema(values, slow)
    if fast_ema is None or slow_ema is None:
        return None, None, None

    macd_line = fast_ema - slow_ema

    # Rebuild EMA for MACD signal using last (slow+signal) values
    # (approximation good enough for snapshot)
    tail = values[-(slow + signal) :]
    macd_series = []
    f_ema = ema(tail, fast)
    s_ema = ema(tail, slow)
    if f_ema is None or s_ema is None:
        return macd_line, None, None
    macd_series.append(f_ema - s_ema)
    for price in tail[max(fast, slow) :]:
        f_ema = price * (2 / (fast + 1)) + f_ema * (1 - 2 / (fast + 1))
        s_ema = price * (2 / (slow + 1)) + s_ema * (1 - 2 / (slow + 1))
        macd_series.append(f_ema - s_ema)

    sig = ema(macd_series, signal)
    if sig is None:
        return macd_line, None, None
    hist = macd_line - sig
    return macd_line, sig, hist


def bollinger(values, period=20, num_std=2.0):
    """Bollinger band position."""
    if len(values) < period:
        return None, None, None, None

    window = values[-period:]
    m = mean(window)
    var = mean((p - m) ** 2 for p in window)
    std = sqrt(var)
    upper = m + num_std * std
    lower = m - num_std * std
    last = values[-1]
    if std == 0:
        pos = 0.0
    else:
        # -1 at lower band, 0 at mid, +1 at upper band
        pos = (last - m) / (num_std * std)
    return m, upper, lower, pos


def max_drawdown(series):
    """Max drawdown (%) over the given price series."""
    if not series:
        return 0.0
    peak = series[0]
    max_dd = 0.0
    for price in series:
        if price > peak:
            peak = price
        dd = (price - peak) / peak * 100.0
        if dd < max_dd:
            max_dd = dd
    return max_dd  # negative number


def percentile_ranks(values):
    """
    Given a list of floats (may contain None),
    return a list of percentile ranks [0,1] or None for missing values.
    """
    indexed = [(i, v) for i, v in enumerate(values) if v is not None]
    if not indexed:
        return [None] * len(values)

    # sort by value
    sorted_vals = sorted(indexed, key=lambda t: t[1])
    n = len(sorted_vals)
    ranks = [None] * len(values)
    for rank_idx, (orig_idx, _v) in enumerate(sorted_vals):
        # percentile: 0..1
        if n == 1:
            pct_rank = 1.0
        else:
            pct_rank = rank_idx / (n - 1)
        ranks[orig_idx] = pct_rank
    return ranks


# ---------- per-symbol sentiment --------------------------------------------


def compute_sentiment_for_symbol(bars):
    """
    bars: list of {date, open, high, low, close, volume}
    Returns dict with all metrics for this symbol.
    """
    if not bars or len(bars) < 3:
        return None

    closes = [float(b["close"]) for b in bars if b.get("close") is not None]
    if len(closes) < 3:
        return None

    last_idx = len(closes) - 1
    last = closes[last_idx]
    prev = closes[last_idx - 1]
    c5 = closes[max(0, last_idx - 5)]
    c20 = closes[max(0, last_idx - 20)]

    # --- Price-based sentiment ----------------------------------------------
    change_1d = pct(prev, last)
    change_5d = pct(c5, last)
    change_20d = pct(c20, last)

    price_label = "Neutral"
    price_score = 0

    big_up = change_1d > 2 or change_5d > 5
    small_up = change_1d > 0 or change_5d > 0
    big_down = change_1d < -2 or change_5d < -5
    small_down = change_1d < 0 or change_5d < 0

    if big_up:
        price_label, price_score = "Strongly Bullish", 2
    elif small_up:
        price_label, price_score = "Bullish", 1
    elif big_down:
        price_label, price_score = "Strongly Bearish", -2
    elif small_down:
        price_label, price_score = "Bearish", -1

    price_based = {
        "label": price_label,
        "score": price_score,
        "change_1d": change_1d,
        "change_5d": change_5d,
        "change_20d": change_20d,
    }

    # --- Volatility sentiment -----------------------------------------------
    returns = []
    for i in range(1, len(closes)):
        prev_close = closes[i - 1]
        if prev_close:
            returns.append((closes[i] - prev_close) / prev_close)

    if returns:
        m = mean(returns)
        var = mean((r - m) ** 2 for r in returns)
        stdev = sqrt(var)
    else:
        stdev = 0.0

    realized_vol = stdev * sqrt(252) * 100.0

    vol_label = "Normal"
    vol_score = 0
    if realized_vol < 20:
        vol_label, vol_score = "Calm", 1
    elif realized_vol > 60:
        vol_label, vol_score = "Stressed", -2
    elif realized_vol > 40:
        vol_label, vol_score = "Elevated", -1

    volatility = {
        "label": vol_label,
        "score": vol_score,
        "realized_vol": realized_vol,
    }

    # --- Technical indicators (RSI, MACD, Bollinger, MAs) --------------------
    rsi_14 = simple_rsi(closes, period=14)
    macd_line, macd_signal, macd_hist = macd(closes)
    bb_ma, bb_upper, bb_lower, bb_pos = bollinger(closes, period=20, num_std=2.0)

    # Short / long MAs for trend
    ma_short = mean(closes[-20:]) if len(closes) >= 20 else mean(closes)
    ma_long = (
        mean(closes[-50:]) if len(closes) >= 50 else mean(closes[-20:])
    )

    above_short = last > ma_short
    above_long = last > ma_long

    tech_label = "Range-Bound / Mixed"
    tech_score = 0
    if above_short and above_long:
        tech_label, tech_score = "Uptrend", 2
    elif not above_short and not above_long:
        tech_label, tech_score = "Downtrend", -2
    elif above_short and not above_long:
        tech_label, tech_score = "Potential Early Uptrend", 1
    elif not above_short and above_long:
        tech_label, tech_score = "Potential Early Breakdown", -1

    # Add RSI / MACD overlays to label a bit
    if rsi_14 is not None:
        if rsi_14 > 70:
            tech_label += " (Overbought)"
        elif rsi_14 < 30:
            tech_label += " (Oversold)"

    technical = {
        "label": tech_label,
        "score": tech_score,
        "ma_short": ma_short,
        "ma_long": ma_long,
        "last_close": last,
        "rsi_14": rsi_14,
        "macd_line": macd_line,
        "macd_signal": macd_signal,
        "macd_hist": macd_hist,
        "bb_ma": bb_ma,
        "bb_upper": bb_upper,
        "bb_lower": bb_lower,
        "bb_position": bb_pos,  # -1 low band, 0 mid, +1 upper band
    }

    # --- Risk sentiment ------------------------------------------------------
    window60 = closes[-60:] if len(closes) >= 60 else closes
    max_dd_60d = max_drawdown(window60)

    risk_label = "Calm"
    risk_score = 1

    if realized_vol > 60 or max_dd_60d < -25:
        risk_label, risk_score = "High Risk", -2
    elif realized_vol > 40 or max_dd_60d < -15:
        risk_label, risk_score = "Watch", -1

    risk = {
        "label": risk_label,
        "score": risk_score,
        "max_dd_60d": max_dd_60d,
    }

    # --- Momentum vs mean-reversion style -----------------------------------
    # Momentum score: reward strong multi-horizon returns + uptrend
    momentum_score = (
        (change_20d / 5.0)  # scale
        + (1 if tech_score > 0 else -1 if tech_score < 0 else 0)
        + (0.5 if rsi_14 and rsi_14 > 55 else 0)
    )

    # Mean reversion score: reward extremes (overbought/oversold) & band edges
    mr_score = 0.0
    if rsi_14 is not None:
        if rsi_14 > 70 or rsi_14 < 30:
            mr_score += 1.0
    if bb_pos is not None:
        if bb_pos > 0.8 or bb_pos < -0.8:
            mr_score += 1.0

    style_label = "Neutral"
    if momentum_score >= 2:
        style_label = "Momentum Long"
    elif momentum_score <= -2:
        style_label = "Momentum Short"
    elif mr_score >= 2:
        style_label = "Mean-Reversion Setup"

    style = {
        "label": style_label,
        "momentum_score": momentum_score,
        "mean_reversion_score": mr_score,
    }

    # --- Combine into base row (cross-section added later) -------------------
    base_row = {
        "price_based": price_based,
        "volatility": volatility,
        "technical": technical,
        "risk": risk,
        "style": style,
        # things we will use for cross-sectional ranks
        "_metrics": {
            "ret_20d": change_20d,
            "realized_vol": realized_vol,
            "max_dd_60d": max_dd_60d,
        },
    }

    # Overall score: sum of main scores (price, vol, tech, risk)
    overall_score = (
        price_score + vol_score + tech_score + risk_score
    )
    overall_label = "Neutral / Mixed"
    if overall_score >= 4:
        overall_label = "Strongly Bullish"
    elif overall_score >= 2:
        overall_label = "Bullish Tilt"
    elif overall_score <= -4:
        overall_label = "Strongly Bearish"
    elif overall_score <= -2:
        overall_label = "Bearish Tilt"

    base_row["overall_label"] = overall_label
    base_row["overall_score"] = overall_score

    return base_row


# ---------- main builder ----------------------------------------------------


def build_sentiment_snapshot():
    if not PRICES_PATH.exists():
        raise FileNotFoundError(f"Missing {PRICES_PATH}")

    prices_payload = json.loads(PRICES_PATH.read_text())

    # ------------------------------------------------------------------
    # Try to infer history_by_symbol from the structure of prices-raw.json
    # ------------------------------------------------------------------
    history_by_symbol = None

    # Case A: top-level dict with 'historyBySymbol'
    if isinstance(prices_payload, dict) and "historyBySymbol" in prices_payload:
        history_by_symbol = prices_payload["historyBySymbol"]

    # Case B: top-level dict with 'data': [ { symbol, history }, ... ]
    if history_by_symbol is None and isinstance(prices_payload, dict) and "data" in prices_payload:
        maybe_list = prices_payload["data"]
        if isinstance(maybe_list, list) and maybe_list and isinstance(maybe_list[0], dict):
            if "symbol" in maybe_list[0] and "history" in maybe_list[0]:
                history_by_symbol = {
                    row["symbol"]: row["history"] for row in maybe_list
                }

    # Case C: top-level list [ { symbol, history }, ... ]
    if history_by_symbol is None and isinstance(prices_payload, list):
        if prices_payload and isinstance(prices_payload[0], dict):
            first = prices_payload[0]
            if "symbol" in first and "history" in first:
                history_by_symbol = {
                    row["symbol"]: row["history"] for row in prices_payload
                }

    # Case D: generic: look for ANY dict value that looks like {symbol: [bars]}
    if history_by_symbol is None and isinstance(prices_payload, dict):
        for key, val in prices_payload.items():
            # Something like { "AAPL": [ {close: ...}, ... ], "MSFT": [...] }
            if isinstance(val, dict) and val:
                sample_value = next(iter(val.values()))
                if isinstance(sample_value, list):
                    # assume bars look like dicts with 'close'
                    if sample_value and isinstance(sample_value[0], dict) and "close" in sample_value[0]:
                        history_by_symbol = val
                        break

    if history_by_symbol is None:
        # Give you something debuggable instead of a vague error
        raise ValueError(
            f"Unrecognized structure in {PRICES_PATH}; "
            f"top-level type={type(prices_payload)}, keys={list(prices_payload.keys()) if isinstance(prices_payload, dict) else 'n/a'}"
        )

    # ------------------------------------------------------------------
    # Now compute sentiment rows using history_by_symbol
    # ------------------------------------------------------------------
    rows = []
    for symbol, bars in history_by_symbol.items():
        snap = compute_sentiment_for_symbol(bars)
        if snap:
            rows.append({"ticker": symbol, **snap})

    # ---- cross-sectional percentiles (same as before) ----------------
    ret_20d_vals = [row["_metrics"]["ret_20d"] for row in rows]
    vol_vals = [row["_metrics"]["realized_vol"] for row in rows]
    dd_vals = [row["_metrics"]["max_dd_60d"] for row in rows]

    ret_ranks = percentile_ranks(ret_20d_vals)
    vol_ranks = percentile_ranks(vol_vals)
    dd_ranks = percentile_ranks(dd_vals)

    for i, row in enumerate(rows):
        cross_section = {
            "ret_20d_pct": ret_ranks[i],
            "realized_vol_pct": vol_ranks[i],
            "max_dd_60d_pct": dd_ranks[i],
        }
        row["cross_section"] = cross_section
        row.pop("_metrics", None)

    meta = {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "universe": [row["ticker"] for row in rows],
    }

    payload = {
        "meta": meta,
        "data": rows,
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2))
    print(f"[sentiment] wrote {OUT_PATH} with {len(rows)} rows")



if __name__ == "__main__":
    build_sentiment_snapshot()
