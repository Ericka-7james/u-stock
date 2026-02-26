from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.data.bars import extract_ohlc
from bots._shared.data.fetch import fetch_bars
from bots._shared.indicators.ema import ema

from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal
from bots.ema_trend import reason_codes as R


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name) or "").strip().lower()
    if raw == "":
        return bool(default)
    return raw in ("1", "true", "t", "yes", "y", "on")


_STRAT_DEBUG = _env_bool("USTOCK_STRATEGY_DEBUG", False)


# ---------------------------------------------------
# Bias Logic (pure)
# ---------------------------------------------------

def compute_bias(bars_bias: Dict[str, Any], cfg: EMATrendConfig) -> Tuple[str, List[str], float]:
    ohlc = extract_ohlc(bars_bias)
    if ohlc is None:
        return "none", [], 0.0

    _, _, _, closes = ohlc

    e = ema(closes, int(cfg.ema_bias))
    if not e or len(e) < int(cfg.bias_slope_lookback) + 1:
        return "none", [], 0.0

    n = int(cfg.bias_slope_lookback)
    slope = e[-1] - e[-(n + 1)]

    px = closes[-1]
    if px <= 0:
        return "none", [], 0.0

    slope_pct = abs(slope) / px * 100.0
    score = min(1.0, slope_pct / max(1e-9, float(cfg.min_slope_pct)))

    if slope > 0:
        return "up", [R.BIAS_UP], score
    if slope < 0:
        return "down", [R.BIAS_DN], score

    return "none", [], 0.0


# ---------------------------------------------------
# IO Layer
# ---------------------------------------------------

def get_market_inputs(api: Any, symbol: str, cfg: EMATrendConfig) -> Optional[Dict[str, Any]]:
    bars_bias = fetch_bars(api, symbol=symbol, tf=cfg.tf_bias, limit=220, feed=cfg.feed)
    bars_entry = fetch_bars(api, symbol=symbol, tf=cfg.tf_entry, limit=300, feed=cfg.feed)

    if not bars_bias or not bars_entry:
        return None

    return {
        "bias": bars_bias,
        "entry": bars_entry,
    }


# ---------------------------------------------------
# Decision Layer (PURE)
# ---------------------------------------------------

def decide(symbol: str, inputs: Dict[str, Any], cfg: EMATrendConfig, qty: int):
    bars_bias = inputs["bias"]
    bars_entry = inputs["entry"]

    bias, bias_reasons, bias_score = compute_bias(bars_bias, cfg)
    if bias == "none":
        return None

    triple, reasons, conf = compute_signal(bars_entry, cfg, bias=bias)
    if triple is None:
        return None

    if float(conf) < float(cfg.min_confidence):
        return None

    entry, stop, take_profit = triple
    side = "buy" if bias == "up" else "sell"

    intent = {
        "symbol": symbol,
        "side": side,
        "qty": qty,
        "confidence": float(conf),
        "entry": float(entry),
        "stop": float(stop),
        "take_profit": float(take_profit),
        "reasons": bias_reasons + reasons,
        "strategy": cfg.bot_id,
    }

    return intent


# ---------------------------------------------------
# Runner Entry
# ---------------------------------------------------

def generate_output(*, api: Any, config: Dict[str, Any]) -> Dict[str, Any]:
    return compute(api=api, bot_id=config.get("bot_id") or "ema_trend", cfg_dict=config)


def compute(api: Any, bot_id: str, cfg_dict: Dict[str, Any]) -> Dict[str, Any]:

    cfg = EMATrendConfig(**cfg_dict)

    symbols = cfg_dict.get("symbols") or [cfg_dict.get("symbol")]
    symbols = [s for s in symbols if s]

    qty = int(cfg_dict.get("qty") or 1)

    intents: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    for sym in symbols:
        inputs = get_market_inputs(api, sym, cfg)
        if not inputs:
            continue

        intent = decide(sym, inputs, cfg, qty)
        if not intent:
            continue

        intents.append(intent)

        events.append({
            "event_type": "signal",
            "level": "info",
            "symbol": sym,
            "payload": intent,
        })

    return {"intents": intents, "events": events}