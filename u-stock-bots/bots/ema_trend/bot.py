from typing import List, Dict
from bots._shared.types import TradeIntent
from bots._shared.http import UStockAPI
from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal
from bots.ema_trend.reason_codes import BIAS_UP, BIAS_DN

cfg = EMATrendConfig()

def run(api: UStockAPI) -> List[TradeIntent]:
    intents = []
    symbols = api.get("/api/opportunities")["symbols"]

    for symbol in symbols:
        bars15 = api.get("/api/market/us/bars", {"symbol": symbol, "timeframe": cfg.tf_bias, "limit": 100})["bars"]
        bias = "up" if bars15["c"][-1] > sum(bars15["c"][-cfg.ema_bias:]) / cfg.ema_bias else "down"

        bars1 = api.get("/api/market/us/bars", {"symbol": symbol, "timeframe": cfg.tf_entry, "limit": 200})["bars"]
        triple, reasons, conf = compute_signal(bars1, cfg, bias)

        if not triple or conf < cfg.min_confidence:
            continue

        entry, stop, tp = triple
        intents.append(
            TradeIntent(
                symbol=symbol,
                side="buy" if bias=="up" else "sell",
                entry=round(entry,4),
                stop=round(stop,4),
                take_profit=round(tp,4),
                confidence=conf,
                bot_id=cfg.bot_id,
                timeframe=cfg.tf_entry,
                reason_codes=[BIAS_UP if bias=="up" else BIAS_DN] + reasons
            )
        )

    return intents
