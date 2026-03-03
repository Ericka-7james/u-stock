from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EMATrendConfig:
    """
    EMA Trend configuration.

    Note: these are intentionally explicit so tests + other bots can reuse/shared logic.
    """
    bot_id: str = "ema_trend"

    # timeframes
    tf_bias: str = "15Min"   # higher timeframe bias
    tf_setup: str = "5Min"   # optional future filters
    tf_entry: str = "1Min"   # entry logic runs here

    # EMAs
    ema_fast: int = 9
    ema_slow: int = 21
    ema_bias: int = 50  # bias uses EMA(ema_bias) on tf_bias
    bias_slope_lookback: int = 4  # slope of EMA bias over N bars

    # ATR
    atr_n: int = 14
    # Middle ground: still avoids dead chop, but not so strict it rejects everything
    min_atr_pct: float = 0.12

    # Chop filters (entry timeframe)
    # Slightly looser so valid trends aren't rejected as often
    min_sep_pct: float = 0.08     # EMA separation threshold (% of price)
    min_slope_pct: float = 0.02   # EMA slope threshold (% of price)

    # Setup controls
    # Keep confirmation for safety (reduces false starts)
    require_confirm_candle: bool = True

    # Risk / targets
    rr_multiple: float = 1.5
    stop_atr_pad: float = 0.15
    min_stop_pct: float = 0.08
    max_stop_pct: float = 1.20

    # Selection controls
    # Middle ground: not overly permissive, but not choking the strategy
    min_confidence: float = 0.55
    max_intents_per_run: int = 3

    # Data feed passthrough (backend optional)
    feed: str | None = None