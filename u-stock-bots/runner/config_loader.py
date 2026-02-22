# u-stock-bots/runner/config_loader.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional


def _env(name: str, default: Optional[str] = None) -> str:
    v = os.getenv(name)
    if v is None:
        return "" if default is None else str(default)
    return str(v).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name, "")
    if raw == "":
        return bool(default)
    raw = raw.lower()
    return raw in ("1", "true", "t", "yes", "y", "on")


def _env_int(name: str, default: int, *, min_v: Optional[int] = None, max_v: Optional[int] = None) -> int:
    raw = _env(name, "")
    if raw == "":
        v = int(default)
    else:
        try:
            v = int(raw)
        except Exception:
            v = int(default)

    if min_v is not None and v < int(min_v):
        v = int(min_v)
    if max_v is not None and v > int(max_v):
        v = int(max_v)
    return v


def _env_float(name: str, default: float, *, min_v: Optional[float] = None, max_v: Optional[float] = None) -> float:
    raw = _env(name, "")
    if raw == "":
        v = float(default)
    else:
        try:
            v = float(raw)
        except Exception:
            v = float(default)

    if min_v is not None and v < float(min_v):
        v = float(min_v)
    if max_v is not None and v > float(max_v):
        v = float(max_v)
    return v


def _normalize_timeframe(tf: Any, default: str) -> str:
    """
    Keep a small allowlist so typos don't leak into market data calls.
    Extend as needed.
    """
    s = str(tf or "").strip()
    if not s:
        return default
    allowed = {"1Min", "5Min", "15Min", "30Min", "1Hour", "1Day"}
    return s if s in allowed else default


def _normalize_feed(feed: Any, default: str) -> str:
    s = str(feed or "").strip().lower()
    if not s:
        return default
    allowed = {"sip", "iex"}
    return s if s in allowed else default


def _normalize_mode(raw: Any, default: str = "paper") -> str:
    m = str(raw or default).strip().lower()
    return m if m in ("paper", "live") else "paper"


# ------------------------------------------------------------
# Bot config builders (env -> cfg dict)
# ------------------------------------------------------------
def _ema_trend_cfg_from_env(*, bot_id: str) -> Dict[str, Any]:
    """
    Maps EMA_TREND_* env vars into the dict passed to EMATrendConfig(**cfg).
    Keys here should match your strategy config dataclass.
    """
    cfg: Dict[str, Any] = {"bot_id": bot_id}

    # market data
    cfg["tf_entry"] = _normalize_timeframe(_env("EMA_TREND_TF_ENTRY", "1Min"), "1Min")
    cfg["tf_setup"] = _normalize_timeframe(_env("EMA_TREND_TF_SETUP", "5Min"), "5Min")
    cfg["tf_bias"] = _normalize_timeframe(_env("EMA_TREND_TF_BIAS", "15Min"), "15Min")
    cfg["feed"] = _normalize_feed(_env("EMA_TREND_FEED", "sip"), "sip")

    # EMAs (clamp to sane ranges)
    cfg["ema_fast"] = _env_int("EMA_TREND_EMA_FAST", 9, min_v=1, max_v=500)
    cfg["ema_slow"] = _env_int("EMA_TREND_EMA_SLOW", 21, min_v=1, max_v=500)
    cfg["ema_bias"] = _env_int("EMA_TREND_EMA_BIAS", 21, min_v=1, max_v=500)
    cfg["bias_slope_lookback"] = _env_int("EMA_TREND_BIAS_SLOPE_LOOKBACK", 6, min_v=1, max_v=500)

    # chop filters / confidence
    cfg["min_sep_pct"] = _env_float("EMA_TREND_MIN_SEP_PCT", 0.10, min_v=0.0, max_v=10.0)
    cfg["min_slope_pct"] = _env_float("EMA_TREND_MIN_SLOPE_PCT", 0.05, min_v=0.0, max_v=10.0)
    cfg["min_confidence"] = _env_float("EMA_TREND_MIN_CONFIDENCE", 0.55, min_v=0.0, max_v=1.0)
    cfg["max_intents_per_run"] = _env_int("EMA_TREND_MAX_INTENTS_PER_RUN", 2, min_v=0, max_v=50)

    # optional confirmations
    cfg["require_setup_confirmation"] = _env_bool("EMA_TREND_REQUIRE_SETUP_CONFIRMATION", True)
    cfg["setup_ema_fast"] = _env_int("EMA_TREND_SETUP_EMA_FAST", 9, min_v=1, max_v=500)
    cfg["setup_ema_slow"] = _env_int("EMA_TREND_SETUP_EMA_SLOW", 21, min_v=1, max_v=500)
    cfg["setup_pullback_max_dist_pct"] = _env_float("EMA_TREND_SETUP_PULLBACK_MAX_DIST_PCT", 0.25, min_v=0.0, max_v=100.0)

    # VWAP
    cfg["use_vwap_filter"] = _env_bool("EMA_TREND_USE_VWAP_FILTER", True)
    cfg["vwap_max_dist_pct"] = _env_float("EMA_TREND_VWAP_MAX_DIST_PCT", 0.25, min_v=0.0, max_v=100.0)

    # strategy quality
    cfg["min_rr"] = _env_float("EMA_TREND_MIN_RR", 1.0, min_v=0.0, max_v=100.0)

    return cfg


def _orb_cfg_from_env(*, bot_id: str) -> Dict[str, Any]:
    """
    Keep minimal for now; expand as ORB matures.
    """
    cfg: Dict[str, Any] = {"bot_id": bot_id}
    cfg["range_minutes"] = _env_int("ORB_RANGE_MINUTES", 5, min_v=1, max_v=120)
    cfg["start_time_et"] = _env("ORB_START_TIME_ET", "09:30")
    cfg["end_time_et"] = _env("ORB_END_TIME_ET", "09:35")
    cfg["min_atr"] = _env_float("ORB_MIN_ATR", 0.05, min_v=0.0, max_v=100.0)
    cfg["r_multiple"] = _env_float("ORB_R_MULTIPLE", 1.0, min_v=0.0, max_v=100.0)
    return cfg


# ------------------------------------------------------------
# Public API
# ------------------------------------------------------------
def build_bot_cfg(
    *,
    bot_id: str,
    status_cfg: Optional[Dict[str, Any]] = None,
    scanner_ctx: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Final cfg precedence:
      1) env-based bot cfg (baseline production tuning)
      2) status_cfg from backend (lets UI override)
      3) scanner_ctx (symbols + context) injected at the end
    """
    bid = (bot_id or "").strip() or "ema_trend"

    if bid == "ema_trend":
        env_base = _ema_trend_cfg_from_env(bot_id=bid)
    elif bid == "orb":
        env_base = _orb_cfg_from_env(bot_id=bid)
    else:
        env_base = {"bot_id": bid}

    merged: Dict[str, Any] = {}
    merged.update(env_base)

    if isinstance(status_cfg, dict):
        merged.update(status_cfg)

    if isinstance(scanner_ctx, dict):
        merged["scanner"] = scanner_ctx

    return merged


def opportunities_params_from_env() -> Dict[str, Any]:
    """
    Standardizes how bots/runner ask for opportunities (leaders + fallback).
    Supports both OPPORTUNITIES_* and OPPS_* names to prevent drift.
    """
    # Prefer OPPS_* (matches runner/main.py), fallback to OPPORTUNITIES_*
    def _pick(name_a: str, name_b: str, default: Any) -> Any:
        va = _env(name_a, "")
        if va != "":
            return va
        vb = _env(name_b, "")
        if vb != "":
            return vb
        return default

    limit = _env_int("OPPS_LIMIT", _env_int("OPPORTUNITIES_LIMIT", 12), min_v=1, max_v=200)
    cache_bust = _env_bool("OPPS_CACHE_BUST", _env_bool("OPPORTUNITIES_CACHE_BUST", False))

    leaders_direction_raw = str(
        _pick("OPPS_LEADERS_DIRECTION", "OPPORTUNITIES_LEADERS_DIRECTION", "up")
    ).strip().lower()
    leaders_direction = "down" if leaders_direction_raw == "down" else "up"

    include_leaders = _env_bool("OPPS_INCLUDE_LEADERS", _env_bool("OPPORTUNITIES_INCLUDE_LEADERS", True))
    leaders_show_more = _env_bool("OPPS_LEADERS_SHOW_MORE", _env_bool("OPPORTUNITIES_LEADERS_SHOW_MORE", False))

    return {
        "limit": limit,
        "include_leaders": include_leaders,
        "leaders_direction": leaders_direction,
        "leaders_show_more": leaders_show_more,
        "cache_bust": cache_bust,
    }


def runner_settings_from_env() -> Dict[str, Any]:
    """
    Runner knobs you often want in one place for logging/debugging.
    """
    return {
        "mode": _normalize_mode(_env("MODE", "paper")),
        "respect_market_hours": _env_bool("RUNNER_RESPECT_MARKET_HOURS", True),
        "loop_seconds": _env_int("RUNNER_LOOP_SECONDS", 5, min_v=1, max_v=3600),
        "heartbeat_every_seconds": _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60, min_v=5, max_v=3600),
    }