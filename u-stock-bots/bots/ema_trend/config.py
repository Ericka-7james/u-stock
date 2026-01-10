from dataclasses import dataclass

@dataclass(frozen=True)
class EMATrendConfig:
    bot_id: str = "ema_trend"

    tf_bias: str = "15Min"
    tf_setup: str = "5Min"
    tf_entry: str = "1Min"

    ema_fast: int = 9
    ema_slow: int = 21
    ema_bias: int = 50

    rr_multiple: float = 1.5
    min_confidence: float = 0.62

    min_atr_pct: float = 0.25
    max_stop_pct: float = 1.20
