from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from bots._shared.data.bars import extract_ohlc
from bots._shared.indicators.ema import ema
from bots._shared.indicators.atr import atr
from bots._shared.risk.constraints import risk_bounds_ok, risk_pct
from bots._shared.score.scorecard import weighted_confidence
from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend import reason_codes as R


def compute_signal(
    bars: Dict[str, Any],
    cfg: EMATrendConfig,
    bias: str,
) -> Tuple[Optional[Tuple[float, float, float]], List[str], float]:
    """
    Returns (triple, reasons, confidence).
    triple: (entry, stop, take_profit) or None
    """

    ohlc = extract_ohlc(bars)
    if ohlc is None:
        return None, [], 0.0

    o, h, l, c = ohlc

    e_fast = ema(c, int(cfg.ema_fast))
    if not e_fast:
        return None, [], 0.0

    a = atr(h, l, c, int(cfg.atr_n))
    if a <= 0.0 or c[-1] <= 0:
        return None, [], 0.0

    atr_pct = (a / c[-1]) * 100.0
    if atr_pct < float(cfg.min_atr_pct):
        return None, [], 0.0

    reasons: List[str] = [R.ATR_OK]

    # --- reclaim + confirmation ---
    entry = float(c[-1])
    ema_last = float(e_fast[-1])
    conf_candle = (c[-1] > o[-1]) or (c[-1] > c[-2])

    rr = float(cfg.rr_multiple)
    stop_pad = float(cfg.stop_atr_pad)

    if bias == "up":
        cond = (c[-1] > ema_last) and (l[-1] <= ema_last) and conf_candle
        if not cond:
            return None, [], 0.0

        stop = min(float(l[-1]), ema_last) - a * stop_pad
        tp = entry + (entry - stop) * rr
        reasons += [R.RECLAIM, R.STOP_SANITY]

        side = "buy"

    elif bias == "down":
        cond = (c[-1] < ema_last) and (h[-1] >= ema_last) and conf_candle
        if not cond:
            return None, [], 0.0

        stop = max(float(h[-1]), ema_last) + a * stop_pad
        tp = entry - (stop - entry) * rr
        reasons += [R.RECLAIM, R.STOP_SANITY]

        side = "sell"

    else:
        return None, [], 0.0

    # --- risk bounds ---
    if not risk_bounds_ok(entry, stop, min_stop_pct=cfg.min_stop_pct, max_stop_pct=cfg.max_stop_pct):
        return None, [], 0.0

    # --- confidence scoring ---
    # Normalize a few factors into 0..1-ish scores.
    # These are simple and stable; you can refine later.
    rp = risk_pct(entry, stop)
    score_atr = min(1.0, max(0.0, (atr_pct - cfg.min_atr_pct) / max(1e-9, (cfg.min_atr_pct * 2))))
    score_risk = 1.0 - min(1.0, rp / max(1e-9, cfg.max_stop_pct))
    score_confirm = 1.0 if conf_candle else 0.0

    breakdown = {
        "atr": score_atr,
        "risk": score_risk,
        "confirm": score_confirm,
    }
    weights = {"atr": 0.4, "risk": 0.35, "confirm": 0.25}
    conf = float(weighted_confidence(breakdown, weights))

    return (entry, stop, tp), reasons, conf
