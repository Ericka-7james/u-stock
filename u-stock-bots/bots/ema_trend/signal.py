# u-stock-bots/bots/ema_trend/signal.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from bots._shared.data.bars import extract_ohlc
from bots._shared.indicators.ema import ema
from bots._shared.indicators.atr import atr
from bots._shared.risk.constraints import risk_bounds_ok, risk_pct
from bots._shared.score.scorecard import weighted_confidence

from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend import reason_codes as R


def _rc(name: str, fallback: str) -> str:
    """
    Safe reason-code getter.
    If bots.ema_trend.reason_codes doesn't define the attr yet,
    we still return a stable readable string (no AttributeError).
    """
    return str(getattr(R, name, fallback))


def compute_signal(
    bars: Dict[str, Any],
    cfg: EMATrendConfig,
    bias: str,
) -> Tuple[Optional[Tuple[float, float, float]], List[str], float]:
    """
    Returns (triple, reasons, confidence).
    triple: (entry, stop, take_profit) or None

    This function is intentionally "transparent":
      - Every early return includes at least one reason code
      - No silent None unless absolutely unavoidable
    """
    reasons: List[str] = []

    ohlc = extract_ohlc(bars)
    if ohlc is None:
        reasons.append(_rc("BARS_MISSING", "bars_missing_or_invalid"))
        return None, reasons, 0.0

    o, h, l, c = ohlc
    if not c or len(c) < 2:
        reasons.append(_rc("BARS_TOO_SHORT", "bars_too_short"))
        return None, reasons, 0.0

    # --- EMA fast ---
    e_fast = ema(c, int(cfg.ema_fast))
    if not e_fast or len(e_fast) < 2:
        reasons.append(_rc("EMA_NOT_READY", "ema_fast_not_ready"))
        return None, reasons, 0.0

    # --- ATR ---
    a = atr(h, l, c, int(cfg.atr_n))
    last_close = float(c[-1]) if c else 0.0
    if a <= 0.0 or last_close <= 0.0:
        reasons.append(_rc("ATR_INVALID", "atr_invalid"))
        return None, reasons, 0.0

    atr_pct = (float(a) / last_close) * 100.0
    if atr_pct < float(cfg.min_atr_pct):
        reasons.append(_rc("ATR_TOO_LOW", "atr_too_low"))
        return None, reasons, 0.0

    reasons.append(_rc("ATR_OK", "atr_ok"))

    # --- Confirmation candle (optional) ---
    # Old behavior required "confirm" always. Now controlled by cfg.require_confirm_candle.
    require_confirm = bool(getattr(cfg, "require_confirm_candle", True))

    # This is your original confirm definition, with safe indexing.
    conf_candle = (float(c[-1]) > float(o[-1])) or (float(c[-1]) > float(c[-2]))
    if require_confirm and not conf_candle:
        reasons.append(_rc("CONFIRM_FAIL", "confirm_candle_fail"))
        return None, reasons, 0.0
    if conf_candle:
        reasons.append(_rc("CONFIRM_OK", "confirm_candle_ok"))
    else:
        reasons.append(_rc("CONFIRM_SKIPPED", "confirm_candle_skipped"))

    # --- Reclaim logic + stops/targets ---
    entry = float(c[-1])
    ema_last = float(e_fast[-1])

    rr = float(cfg.rr_multiple)
    stop_pad = float(cfg.stop_atr_pad)

    # Defensive: reject nonsense config (prevents inverted targets / negative pads)
    if rr <= 0.0:
        reasons.append(_rc("RR_INVALID", "rr_invalid"))
        return None, reasons, 0.0
    if stop_pad < 0.0:
        reasons.append(_rc("STOP_PAD_INVALID", "stop_pad_invalid"))
        return None, reasons, 0.0

    side: str
    stop: float
    tp: float

    if bias == "up":
        # reclaim: close above EMA and wick touched/breached EMA
        above_ema = float(c[-1]) > ema_last
        touched_ema = float(l[-1]) <= ema_last

        if not above_ema:
            reasons.append(_rc("RECLAIM_FAIL_ABOVE", "reclaim_fail_close_not_above_ema"))
            return None, reasons, 0.0
        if not touched_ema:
            reasons.append(_rc("RECLAIM_FAIL_TOUCH", "reclaim_fail_no_touch"))
            return None, reasons, 0.0

        reasons.append(_rc("RECLAIM", "reclaim_ok"))
        side = "buy"

        stop = min(float(l[-1]), ema_last) - float(a) * stop_pad
        tp = entry + (entry - stop) * rr

    elif bias == "down":
        below_ema = float(c[-1]) < ema_last
        touched_ema = float(h[-1]) >= ema_last

        if not below_ema:
            reasons.append(_rc("RECLAIM_FAIL_BELOW", "reclaim_fail_close_not_below_ema"))
            return None, reasons, 0.0
        if not touched_ema:
            reasons.append(_rc("RECLAIM_FAIL_TOUCH", "reclaim_fail_no_touch"))
            return None, reasons, 0.0

        reasons.append(_rc("RECLAIM", "reclaim_ok"))
        side = "sell"

        stop = max(float(h[-1]), ema_last) + float(a) * stop_pad
        tp = entry - (stop - entry) * rr

    else:
        reasons.append(_rc("BIAS_NONE", "bias_none"))
        return None, reasons, 0.0

    # Defensive: ensure stop/entry/tp ordering makes sense
    if bias == "up" and not (stop < entry < tp):
        reasons.append(_rc("TP_SANITY_FAIL", "tp_sanity_fail"))
        return None, reasons, 0.0
    if bias == "down" and not (tp < entry < stop):
        reasons.append(_rc("TP_SANITY_FAIL", "tp_sanity_fail"))
        return None, reasons, 0.0

    # --- Risk bounds sanity ---
    if not risk_bounds_ok(entry, stop, min_stop_pct=cfg.min_stop_pct, max_stop_pct=cfg.max_stop_pct):
        reasons.append(_rc("RISK_BOUNDS_FAIL", "risk_bounds_fail"))
        return None, reasons, 0.0

    reasons.append(_rc("STOP_SANITY", "stop_sanity_ok"))

    # --- Confidence scoring ---
    rp = float(risk_pct(entry, stop))

    score_atr = min(
        1.0,
        max(
            0.0,
            (atr_pct - float(cfg.min_atr_pct)) / max(1e-9, (float(cfg.min_atr_pct) * 2.0)),
        ),
    )
    score_risk = 1.0 - min(1.0, rp / max(1e-9, float(cfg.max_stop_pct)))
    score_confirm = 1.0 if conf_candle else (0.5 if not require_confirm else 0.0)

    breakdown = {
        "atr": float(score_atr),
        "risk": float(score_risk),
        "confirm": float(score_confirm),
    }
    weights = {"atr": 0.4, "risk": 0.35, "confirm": 0.25}
    conf = float(weighted_confidence(breakdown, weights))

    reasons.append(_rc("CONF_SCORE", "confidence_scored"))
    reasons.append(_rc("SIDE_BUY" if side == "buy" else "SIDE_SELL", f"side_{side}"))

    return (entry, stop, tp), reasons, conf