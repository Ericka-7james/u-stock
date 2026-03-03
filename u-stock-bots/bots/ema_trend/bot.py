# u-stock-bots/bots/ema_trend/bot.py
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


def _is_debug() -> bool:
    """
    IMPORTANT:
    Debug is evaluated at runtime, not import time.
    This prevents "I set env but nothing changed" confusion across different entrypoints/tests.
    """
    return _env_bool("USTOCK_STRATEGY_DEBUG", False)


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


def _get(cfg: Dict[str, Any], key: str, default: Any) -> Any:
    """
    Safe getter that preserves valid falsy values like 0 / 0.0 / False.
    Treats None and "" as missing.
    """
    if not isinstance(cfg, dict):
        return default
    v = cfg.get(key, default)
    if v is None:
        return default
    if isinstance(v, str) and v.strip() == "":
        return default
    return v


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


def _pick_symbols(cfg_dict: Dict[str, Any]) -> List[str]:
    """
    Prefer scanner-injected symbols, then cfg_dict["symbols"], then cfg_dict["symbol"].
    """
    scanner = cfg_dict.get("scanner") if isinstance(cfg_dict.get("scanner"), dict) else None
    if isinstance(scanner, dict):
        syms = scanner.get("symbols")
        if isinstance(syms, list):
            picked = _unique_upper(syms)
            if picked:
                return picked

    if isinstance(cfg_dict.get("symbols"), list):
        picked = _unique_upper(cfg_dict["symbols"])
        if picked:
            return picked

    sym = _s(cfg_dict.get("symbol") or cfg_dict.get("primary_symbol") or "").upper()
    return [sym] if sym else []


# ---------------------------------------------------
# Bias Logic (pure)
# ---------------------------------------------------
def compute_bias(bars_bias: Dict[str, Any], cfg: EMATrendConfig) -> Tuple[str, List[str], float]:
    """
    Bias using EMA(cfg.ema_bias) on tf_bias and slope over cfg.bias_slope_lookback bars.
    Returns (bias: 'up'|'down'|'none', reasons, score 0..1)
    """
    ohlc = extract_ohlc(bars_bias)
    if ohlc is None:
        return "none", [], 0.0

    _, _, _, closes = ohlc

    e = ema(closes, int(cfg.ema_bias))
    if not e or len(e) < int(cfg.bias_slope_lookback) + 1:
        return "none", [], 0.0

    n = int(cfg.bias_slope_lookback)
    slope = float(e[-1]) - float(e[-(n + 1)])

    px = float(closes[-1]) if closes else 0.0
    if px <= 0:
        return "none", [], 0.0

    slope_pct = abs(slope) / max(1e-9, px) * 100.0
    score = min(1.0, slope_pct / max(1e-9, float(cfg.min_slope_pct)))

    if slope > 0:
        return "up", [R.BIAS_UP], float(score)
    if slope < 0:
        return "down", [R.BIAS_DN], float(score)

    return "none", [], 0.0


# ---------------------------------------------------
# IO Layer
# ---------------------------------------------------
def get_market_inputs(api: Any, symbol: str, cfg: EMATrendConfig) -> Optional[Dict[str, Any]]:
    """
    Fetch only what the strategy needs. Returns None if any required payload missing.
    """
    bars_bias = fetch_bars(api, symbol=symbol, tf=cfg.tf_bias, limit=220, feed=cfg.feed)
    bars_entry = fetch_bars(api, symbol=symbol, tf=cfg.tf_entry, limit=300, feed=cfg.feed)

    if not bars_bias or not bars_entry:
        return None

    return {"bias": bars_bias, "entry": bars_entry}


# ---------------------------------------------------
# Runner Entry
# ---------------------------------------------------
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
      - If no actionable intent, return no events.
      - Optional debug breadcrumbs if USTOCK_STRATEGY_DEBUG=1.
    """
    cfg_dict = cfg_dict or {}

    # Filter cfg_dict to only fields accepted by EMATrendConfig
    allowed = set(getattr(EMATrendConfig, "__annotations__", {}).keys())
    cfg_kwargs = {k: v for k, v in cfg_dict.items() if k in allowed}

    cfg_kwargs["bot_id"] = _s(_get(cfg_dict, "bot_id", bot_id or "ema_trend")) or "ema_trend"

    # Defaults (preserve falsy values properly)
    cfg_kwargs.setdefault("tf_bias", _s(_get(cfg_dict, "tf_bias", "15Min")) or "15Min")
    cfg_kwargs.setdefault("tf_entry", _s(_get(cfg_dict, "tf_entry", "1Min")) or "1Min")

    cfg_kwargs.setdefault("ema_bias", _i(_get(cfg_dict, "ema_bias", 50), 50))
    cfg_kwargs.setdefault("bias_slope_lookback", _i(_get(cfg_dict, "bias_slope_lookback", 4), 4))
    cfg_kwargs.setdefault("min_slope_pct", _f(_get(cfg_dict, "min_slope_pct", 0.03), 0.03))

    cfg_kwargs.setdefault("min_confidence", _f(_get(cfg_dict, "min_confidence", 0.50), 0.50))
    cfg_kwargs.setdefault("max_intents_per_run", _i(_get(cfg_dict, "max_intents_per_run", 3), 3))

    # allow feed override from cfg_dict even if not in dataclass fields
    feed = _s(_get(cfg_dict, "feed", None)) or None
    if "feed" in allowed:
        cfg_kwargs["feed"] = feed

    cfg = EMATrendConfig(**cfg_kwargs)

    symbols = _pick_symbols(cfg_dict)
    if not symbols:
        return {"intents": [], "events": []}

    qty = _i(_get(cfg_dict, "qty", _get(cfg_dict, "default_qty", 1)), 1)
    if qty <= 0:
        return {"intents": [], "events": []}

    max_intents = max(1, int(getattr(cfg, "max_intents_per_run", 3)))

    intents: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    def _debug_event(sym: Optional[str], code: str, payload: Dict[str, Any]) -> None:
        if not _is_debug():
            return
        events.append(
            {
                "event_type": "strategy_debug",
                "level": "info",
                "symbol": sym,
                "payload": {"bot_id": cfg.bot_id, "code": code, **(payload or {})},
            }
        )

    for sym in symbols:
        if len(intents) >= max_intents:
            break

        inputs = get_market_inputs(api, sym, cfg)
        if not inputs:
            _debug_event(sym, "skip_missing_bars", {"tf_bias": cfg.tf_bias, "tf_entry": cfg.tf_entry})
            continue

        bias, bias_reasons, bias_score = compute_bias(inputs["bias"], cfg)
        if bias == "none":
            _debug_event(
                sym,
                "skip_bias_none",
                {"tf_bias": cfg.tf_bias, "ema_bias": int(cfg.ema_bias), "lookback": int(cfg.bias_slope_lookback)},
            )
            continue

        triple, reasons, conf = compute_signal(inputs["entry"], cfg, bias=bias)
        if triple is None:
            be = inputs["entry"] or {}
            _debug_event(
                sym,
                "skip_signal_none",
                {
                    "reasons": reasons,  # ✅ include compute_signal reasons even when no triple
                    "keys": sorted(list(be.keys()))[:20],
                    "len_t": len(be.get("t") or []),
                    "len_o": len(be.get("o") or []),
                    "len_h": len(be.get("h") or []),
                    "len_l": len(be.get("l") or []),
                    "len_c": len(be.get("c") or []),
                    "len_v": len(be.get("v") or []),
                    "tf_entry": cfg.tf_entry,
                    "bias": bias,
                },
            )
            continue

        if float(conf) < float(cfg.min_confidence):
            _debug_event(sym, "skip_conf_low", {"conf": float(conf), "min_conf": float(cfg.min_confidence)})
            continue

        entry, stop, take_profit = triple
        side = "buy" if bias == "up" else "sell"

        intent = {
            "symbol": sym,
            "side": side,
            "qty": int(qty),
            "confidence": float(conf),
            "entry": float(entry),
            "stop": float(stop),
            "take_profit": float(take_profit),
            "reasons": bias_reasons + reasons,
            "strategy": cfg.bot_id,
            "bias_score": float(bias_score),
            "tf_bias": cfg.tf_bias,
            "tf_entry": cfg.tf_entry,
        }

        intents.append(intent)

        events.append(
            {
                "event_type": "signal",
                "level": "info",
                "symbol": sym,
                "payload": {
                    "strategy": cfg.bot_id,
                    "side": intent["side"],
                    "qty": intent["qty"],
                    "confidence": intent["confidence"],
                    "entry": intent["entry"],
                    "stop": intent["stop"],
                    "take_profit": intent["take_profit"],
                    "reasons": intent["reasons"],
                    "bias_score": intent.get("bias_score"),
                    "tf_bias": intent.get("tf_bias"),
                    "tf_entry": intent.get("tf_entry"),
                },
            }
        )

    # Keep quiet policy: if no intents and debug is off, return no events
    if not intents and not _is_debug():
        return {"intents": [], "events": []}

    return {"intents": intents, "events": events}