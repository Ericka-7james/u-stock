# bots/ema_trend/bot.py
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.data.bars import extract_ohlc
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


def _s(x: Any) -> str:
    return str(x or "").strip()


def _i(x: Any, default: int) -> int:
    try:
        return int(x)
    except Exception:
        return int(default)


def _f(x: Any, default: float) -> float:
    try:
        return float(x)
    except Exception:
        return float(default)


def _unique_upper(symbols: List[Any]) -> List[str]:
    out: List[str] = []
    seen = set()
    for x in symbols:
        sx = _s(x).upper()
        if not sx:
            continue
        if sx in seen:
            continue
        seen.add(sx)
        out.append(sx)
    return out


def _pick_symbols(cfg: Dict[str, Any]) -> List[str]:
    # Prefer scanner injected symbols
    scanner = cfg.get("scanner") if isinstance(cfg.get("scanner"), dict) else None
    if isinstance(scanner, dict):
        syms = scanner.get("symbols")
        if isinstance(syms, list):
            picked = _unique_upper(syms)
            if picked:
                return picked

    # fallbacks
    if isinstance(cfg.get("symbols"), list):
        picked = _unique_upper(cfg["symbols"])
        if picked:
            return picked

    sym = _s(cfg.get("symbol") or cfg.get("primary_symbol") or "").upper()
    return [sym] if sym else []


def _fetch_bars(api: Any, *, symbol: str, tf: str, limit: int, feed: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Defensive wrapper around backend bars endpoint.

    Expected: dict with enough shape for extract_ohlc() to work.
    Fail-soft: returns None on any error or unexpected shape.
    """
    params: Dict[str, Any] = {"symbol": symbol, "tf": tf, "limit": int(limit)}
    if feed:
        params["feed"] = feed
    try:
        data = api.get("/api/market/bars", params=params)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _compute_bias(bars_bias: Dict[str, Any], cfg: EMATrendConfig) -> Tuple[str, List[str], float]:
    """
    Bias using EMA(cfg.ema_bias) on tf_bias and slope over cfg.bias_slope_lookback bars.
    Returns (bias: 'up'|'down'|'none', reasons, score 0..1)
    """
    ohlc = extract_ohlc(bars_bias)
    if ohlc is None:
        return "none", [], 0.0

    _o, _h, _l, c = ohlc
    e = ema(c, int(cfg.ema_bias))
    if not e or len(e) < int(cfg.bias_slope_lookback) + 1:
        return "none", [], 0.0

    n = int(cfg.bias_slope_lookback)
    recent = float(e[-1])
    past = float(e[-(n + 1)])
    slope = recent - past

    px = float(c[-1]) if c and c[-1] else 0.0
    if px <= 0:
        return "none", [], 0.0

    slope_pct = abs(slope) / max(1e-9, px) * 100.0
    score = min(1.0, slope_pct / max(1e-9, float(cfg.min_slope_pct)))

    if slope > 0:
        return "up", [R.BIAS_UP], float(score)
    if slope < 0:
        return "down", [R.BIAS_DN], float(score)
    return "none", [], 0.0


def generate_output(*, api: Any, config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Runner-facing entrypoint (strategy_loader prefers generate_output).
    """
    return compute(api=api, bot_id=_s(config.get("bot_id") or "ema_trend") or "ema_trend", cfg_dict=config)


def compute(api: Any, bot_id: str, cfg_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    EMA Trend main entrypoint.

    Output contract:
      {"intents": [...], "events": [...]}

    Quiet policy:
      - If no actionable intent, return no events (prevents log spam).
      - Optional debug breadcrumbs if USTOCK_STRATEGY_DEBUG=1.
    """
    cfg = EMATrendConfig(
        bot_id=_s(cfg_dict.get("bot_id") or bot_id or "ema_trend") or "ema_trend",
        tf_bias=_s(cfg_dict.get("tf_bias") or "15Min") or "15Min",
        tf_setup=_s(cfg_dict.get("tf_setup") or "5Min") or "5Min",
        tf_entry=_s(cfg_dict.get("tf_entry") or "1Min") or "1Min",
        ema_fast=_i(cfg_dict.get("ema_fast") or 9, 9),
        ema_slow=_i(cfg_dict.get("ema_slow") or 21, 21),
        ema_bias=_i(cfg_dict.get("ema_bias") or 50, 50),
        bias_slope_lookback=_i(cfg_dict.get("bias_slope_lookback") or 4, 4),
        atr_n=_i(cfg_dict.get("atr_n") or 14, 14),
        min_atr_pct=_f(cfg_dict.get("min_atr_pct") or 0.25, 0.25),
        min_sep_pct=_f(cfg_dict.get("min_sep_pct") or 0.10, 0.10),
        min_slope_pct=_f(cfg_dict.get("min_slope_pct") or 0.03, 0.03),
        require_confirm_candle=bool(cfg_dict.get("require_confirm_candle", True)),
        rr_multiple=_f(cfg_dict.get("rr_multiple") or 1.5, 1.5),
        stop_atr_pad=_f(cfg_dict.get("stop_atr_pad") or 0.15, 0.15),
        min_stop_pct=_f(cfg_dict.get("min_stop_pct") or 0.08, 0.08),
        max_stop_pct=_f(cfg_dict.get("max_stop_pct") or 1.20, 1.20),
        min_confidence=_f(cfg_dict.get("min_confidence") or 0.62, 0.62),
        max_intents_per_run=_i(cfg_dict.get("max_intents_per_run") or 3, 3),
        feed=_s(cfg_dict.get("feed")) or None,
    )

    symbols = _pick_symbols(cfg_dict)
    if not symbols:
        return {"intents": [], "events": []}

    qty = _i(cfg_dict.get("qty") or cfg_dict.get("default_qty") or 1, 1)
    if qty <= 0:
        return {"intents": [], "events": []}

    max_intents = max(1, int(cfg.max_intents_per_run))

    intents: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    def _debug_event(sym: Optional[str], code: str, payload: Dict[str, Any]) -> None:
        if not _STRAT_DEBUG:
            return
        events.append(
            {
                "event_type": "strategy_debug",
                "level": "info",
                "symbol": sym,
                "payload": {"bot_id": cfg.bot_id, "code": code, **payload},
            }
        )

    for sym in symbols:
        if len(intents) >= max_intents:
            break

        bars_bias = _fetch_bars(api, symbol=sym, tf=cfg.tf_bias, limit=220, feed=cfg.feed)
        bars_entry = _fetch_bars(api, symbol=sym, tf=cfg.tf_entry, limit=300, feed=cfg.feed)
        if not bars_bias or not bars_entry:
            _debug_event(sym, "skip_missing_bars", {"tf_bias": cfg.tf_bias, "tf_entry": cfg.tf_entry})
            continue

        bias, bias_reasons, bias_score = _compute_bias(bars_bias, cfg)
        if bias == "none":
            _debug_event(sym, "skip_no_bias", {"bias_score": float(bias_score)})
            continue

        triple, reasons, conf = compute_signal(bars_entry, cfg, bias=bias)
        if triple is None:
            _debug_event(sym, "skip_no_signal", {"bias": bias})
            continue

        if float(conf) < float(cfg.min_confidence):
            _debug_event(sym, "skip_low_confidence", {"conf": float(conf), "min": float(cfg.min_confidence)})
            continue

        entry, stop, take_profit = triple
        side = "buy" if bias == "up" else "sell"

        intents.append(
            {
                "symbol": sym,
                "side": side,
                "qty": qty,
                "confidence": float(conf),
                "entry": float(entry),
                "stop": float(stop),
                "take_profit": float(take_profit),
                "reasons": bias_reasons + reasons,
                "strategy": cfg.bot_id,
            }
        )

        # Only emit signal event when we actually have an intent
        events.append(
            {
                "event_type": "signal",
                "level": "info",
                "symbol": sym,
                "payload": {
                    "strategy": cfg.bot_id,
                    "side": side,
                    "qty": qty,
                    "confidence": float(conf),
                    "entry": float(entry),
                    "stop": float(stop),
                    "take_profit": float(take_profit),
                    "reasons": bias_reasons + reasons,
                    "bias_score": float(bias_score),
                    "tf_bias": cfg.tf_bias,
                    "tf_entry": cfg.tf_entry,
                },
            }
        )

    # Keep quiet policy: if no intents and debug is off, return no events
    if not intents and not _STRAT_DEBUG:
        return {"intents": [], "events": []}

    return {"intents": intents, "events": events}