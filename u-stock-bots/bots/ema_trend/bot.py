# u-stock-bots/bots/ema_trend/bot.py
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.types import TradeIntent
from bots._shared.http import UStockAPI
from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal
from bots.ema_trend.reason_codes import BIAS_UP, BIAS_DN

cfg = EMATrendConfig()

# ---- throttled logging + market closed backoff ----
_LAST_LOG_TS: Dict[str, float] = {}
_MARKET_CLOSED_UNTIL: float = 0.0

def _log(msg: str) -> None:
    # keep this simple: runner captures stdout already
    print(f"[ema_trend] {msg}")

def _log_throttled(key: str, msg: str, every_seconds: int = 300) -> None:
    now = time.time()
    last = _LAST_LOG_TS.get(key, 0.0)
    if (now - last) >= float(every_seconds):
        _LAST_LOG_TS[key] = now
        _log(msg)

def _as_floats(seq: Any) -> List[float]:
    if not isinstance(seq, list):
        return []
    out: List[float] = []
    for x in seq:
        if x is None:
            continue
        try:
            out.append(float(x))
        except Exception:
            continue
    return out

def _closes_from_bars(bars_obj: Any) -> List[float]:
    if not isinstance(bars_obj, dict):
        return []
    return _as_floats(bars_obj.get("c") or [])

def _compute_bias(closes: List[float], n: int) -> Optional[str]:
    if not closes:
        return None
    n = int(n or 20)
    if len(closes) < max(2, n):
        return None
    last = closes[-1]
    avg = sum(closes[-n:]) / float(n)
    return "up" if last > avg else "down"

def _write_market_gate_hint(until_epoch: float) -> None:
    """
    Optional: write a tiny hint file runner can read to pause all bots.
    Safe no-op if OUTPUT_DIR isn't configured.
    """
    out_dir = os.getenv("OUTPUT_DIR") or ""
    if not out_dir:
        return
    try:
        p = Path(out_dir).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        hint = p / "market_gate.json"
        hint.write_text(
            f'{{"market":"us_stocks","closed_until":{int(until_epoch)},"ts":{int(time.time())}}}',
            encoding="utf-8",
        )
    except Exception:
        pass

def _get_us_market_session(api: UStockAPI) -> Optional[Dict[str, Any]]:
    """
    If your backend exposes a session endpoint, use it.
    Recommended backend endpoint:
      GET /api/market/us/session -> { ok, is_open, next_open, next_close, timestamp }
    """
    try:
        return api.get("/api/market/us/session")
    except Exception:
        return None

def _maybe_market_closed(api: UStockAPI) -> Tuple[bool, Optional[float], str]:
    """
    Returns (closed?, until_epoch, reason).
    Uses backend session endpoint if available; otherwise falls back to time-based recheck.
    """
    session = _get_us_market_session(api)
    if isinstance(session, dict) and session.get("ok") is True:
        is_open = bool(session.get("is_open"))
        if is_open:
            return (False, None, "open")
        # next_open can be epoch seconds or ISO; we support epoch best-effort
        nxt = session.get("next_open")
        if isinstance(nxt, (int, float)) and nxt > 0:
            return (True, float(nxt), "backend_session_closed")
        # fallback recheck window
        mins = int(os.getenv("MARKET_CLOSED_RECHECK_MINUTES", "120"))
        return (True, time.time() + mins * 60.0, "backend_session_closed_no_next_open")

    # No session endpoint -> just recheck every X minutes if we suspect closed
    mins = int(os.getenv("MARKET_CLOSED_RECHECK_MINUTES", "120"))
    return (True, time.time() + mins * 60.0, "no_session_endpoint")

def run(api: Optional[UStockAPI] = None) -> List[TradeIntent]:
    global _MARKET_CLOSED_UNTIL

    api = api or UStockAPI()
    intents: List[TradeIntent] = []

    # ---- market gate: if we already decided "closed", don’t spam ----
    now = time.time()
    if now < _MARKET_CLOSED_UNTIL:
        _log_throttled(
            "market_closed",
            f"US market gated until {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_MARKET_CLOSED_UNTIL))}. Skipping.",
            every_seconds=600,
        )
        return intents

    # ---- 1) symbols ----
    try:
        opp = api.get("/api/opportunities")
    except Exception as e:
        _log_throttled("opp_fail", f"/api/opportunities failed: {repr(e)}", every_seconds=120)
        return intents

    symbols = (opp or {}).get("symbols") or []
    if not isinstance(symbols, list) or not symbols:
        _log_throttled("no_symbols", "No symbols from /api/opportunities.", every_seconds=300)
        return intents

    # ---- 2) loop ----
    any_symbol_had_data = False

    for sym in symbols:
        s = str(sym or "").strip().upper()
        if not s:
            continue

        # bias timeframe bars
        try:
            resp15 = api.get(
                "/api/market/us/bars",
                params={
                    "symbol": s,
                    "timeframe": cfg.tf_bias,
                    "limit": 200,
                    "feed": getattr(cfg, "feed", None),
                },
            )
        except Exception as e:
            _log_throttled(f"bars15_err:{s}", f"{s} bias bars request failed: {repr(e)}", every_seconds=300)
            continue

        bars15 = (resp15 or {}).get("bars") or {}
        closes15 = _closes_from_bars(bars15)

        if len(closes15) == 0:
            _log_throttled(
                f"bars15_empty:{s}",
                f"{s} bias bars empty (tf={cfg.tf_bias}, feed={getattr(cfg,'feed',None)}).",
                every_seconds=300,
            )
            continue

        any_symbol_had_data = True

        bias = _compute_bias(closes15, int(getattr(cfg, "ema_bias", 20) or 20))
        if bias is None:
            _log_throttled(
                f"bias_missing:{s}",
                f"{s} bias could not be computed (need >= ema_bias closes). closes={len(closes15)} ema_bias={getattr(cfg,'ema_bias',None)}",
                every_seconds=300,
            )
            continue

        # entry timeframe bars
        try:
            resp1 = api.get(
                "/api/market/us/bars",
                params={
                    "symbol": s,
                    "timeframe": cfg.tf_entry,
                    "limit": 300,
                    "feed": getattr(cfg, "feed", None),
                },
            )
        except Exception as e:
            _log_throttled(f"bars1_err:{s}", f"{s} entry bars request failed: {repr(e)}", every_seconds=300)
            continue

        bars1 = (resp1 or {}).get("bars") or {}
        closes1 = _closes_from_bars(bars1)
        if len(closes1) < 20:
            _log_throttled(
                f"bars1_short:{s}",
                f"{s} entry bars too short (tf={cfg.tf_entry}). closes={len(closes1)}",
                every_seconds=300,
            )
            continue

        # compute signal
        try:
            triple, reasons, conf = compute_signal(bars1, cfg, bias)
        except Exception as e:
            _log_throttled(f"signal_err:{s}", f"{s} compute_signal failed: {repr(e)}", every_seconds=300)
            continue

        if (not triple) or conf is None or float(conf) < float(cfg.min_confidence):
            continue

        entry, stop, tp = triple
        intents.append(
            TradeIntent(
                symbol=s,
                side="buy" if bias == "up" else "sell",
                entry=round(float(entry), 4),
                stop=round(float(stop), 4),
                take_profit=round(float(tp), 4),
                confidence=float(conf),
                bot_id=cfg.bot_id,
                timeframe=cfg.tf_entry,
                reason_codes=[BIAS_UP if bias == "up" else BIAS_DN] + (reasons or []),
            )
        )

    # ---- 3) If *everything* was empty, it’s probably market gate (or feed mismatch) ----
    if not any_symbol_had_data:
        closed, until, reason = _maybe_market_closed(api)
        if closed and until:
            _MARKET_CLOSED_UNTIL = float(until)
            _write_market_gate_hint(_MARKET_CLOSED_UNTIL)
            _log_throttled(
                "market_gate_set",
                f"No symbols returned bars. Setting market gate until {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_MARKET_CLOSED_UNTIL))} ({reason}).",
                every_seconds=300,
            )

    return intents
