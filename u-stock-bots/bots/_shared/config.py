from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class EMATrendConfig:
    bot_id: str = "ema_trend"

    # timeframes
    tf_bias: str = "15Min"
    tf_entry: str = "1Min"

    # HTF bias EMAs (15m)
    bias_ema_fast: int = 9
    bias_ema_slow: int = 50
    bias_slope_lookback: int = 4  # ~1 hour on 15m bars

    # Entry EMAs (1m)
    ema_fast: int = 9

    # ATR
    atr_n: int = 14
    min_atr_pct: float = 0.25

    # Chop filters
    min_sep_pct: float = 0.12      # EMA separation %
    min_slope_pct: float = 0.03    # EMA slope %

    # Risk
    rr_multiple: float = 1.5
    stop_atr_pad: float = 0.15
    min_stop_pct: float = 0.08
    max_stop_pct: float = 1.20

    # Decision
    min_confidence: float = 0.62
    max_intents_per_run: int = 3   # take top-N only

    # Optional backend feed selection
    feed: str | None = None
