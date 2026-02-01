# u-stock-bots/bots/ema_trend/config.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EMATrendConfig:
    """
    EMA Trend configuration (production-grade knobs).

    - tf_bias: determines directional bias (15m)
    - tf_setup: confirms structure (5m)
    - tf_entry: executes entries (1m)
    """
    bot_id: str = "ema_trend"

    # timeframes
    tf_bias: str = "15Min"
    tf_setup: str = "5Min"
    tf_entry: str = "1Min"

    # EMAs
    ema_fast: int = 9
    ema_slow: int = 21
    ema_bias: int = 50
    bias_slope_lookback: int = 4

    # ATR
    atr_n: int = 14
    min_atr_pct: float = 0.25

    # Chop filters (entry timeframe)
    min_sep_pct: float = 0.10
    min_slope_pct: float = 0.03

    # ✅ Setup confirmation (5m)
    require_setup_confirmation: bool = True
    setup_ema_fast: int = 9
    setup_ema_slow: int = 21
    setup_pullback_max_dist_pct: float = 0.25  # how close price should be to fast EMA on 5m

    # ✅ VWAP filter (entry timeframe)
    use_vwap_filter: bool = False
    vwap_max_dist_pct: float = 0.25  # how far price can be from vwap on entry tf

    # Risk / targets
    rr_multiple: float = 1.5
    stop_atr_pad: float = 0.15
    min_stop_pct: float = 0.08
    max_stop_pct: float = 1.20

    # Selection controls
    min_confidence: float = 0.62
    max_intents_per_run: int = 3

    # Data feed passthrough (backend optional)
    feed: str | None = None
