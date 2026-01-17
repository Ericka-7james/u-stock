# u-stock-bots/bots/ema_trend/bot.py
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.types import TradeIntent
from bots._shared.ustock_http import UStockAPI

from bots._shared.data.bars import closes_from_bars, extract_ohlc
from bots._shared.indicators.ema import ema
from bots._shared.filters.chop import (
    ema_separation_pct,
    slope_pct,
    passes_chop_filters,
)
from bots._shared.filters.time_window import is_trade_window_local
from bots._shared.telemetry import inc, one_line

from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal
from bots.ema_trend.reason_codes import BIAS_UP, BIAS_DN

_LAST_LOG_TS: Dict[str, float] = {}
_MARKET_CLOSED_UNTIL: float = 0.0


def _log(msg: str) -> None:
    print(f"[ema_trend] {msg}")


def _log_throttled(key: str, msg: str, every_seconds: int = 300) -> None:
    now = time.time()
    last = _LAST_LOG_TS.get(key, 0.0)
    if (now - last) >= float(every_seconds):
        _LAST_LOG_TS[key] = now
        _log(msg)


def _write_market_gate_hint(until_epoch: float) -> None:
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
        # never let hinting break trading logic
        pass


def _get_us_market_session(api: UStockAPI) -> Optional[Dict[str, Any]]:
    try:
        return api.get("/api/market/us/session")
    except Exception:
        return None


def _maybe_market_closed(api: UStockAPI) -> Tuple[bool, Optional[float], str]:
    session = _get_us_market_session(api)
    if isinstance(session, dict) and session.get("ok") is True:
        is_open = bool(session.get("is_open"))
        if is_open:
            return (False, None, "open")

        nxt = session.get("next_open")
        if isinstance(nxt, (int, float)) and nxt > 0:
            return (True, float(nxt), "backend_session_closed")

        mins = int(os.getenv("MARKET_CLOSED_RECHECK_MINUTES", "120"))
        return (True, time.time() + mins * 60.0, "backend_session_closed_no_next_open")

    mins = int(os.getenv("MARKET_CLOSED_RECHECK_MINUTES", "120"))
    return (True, time.time() + mins * 60.0, "no_session_endpoint")


def _compute_bias_15m(closes: List[float], cfg: EMATrendConfig) -> Optional[str]:
    """
    Bias uses:
      - slow EMA = EMA(cfg.ema_bias)
      - fast EMA = EMA(cfg.ema_fast)
      - slope of slow EMA over cfg.bias_slope_lookback

    Up:
      price > slow AND fast > slow AND slope > 0
    Down:
      price < slow AND fast < slow AND slope < 0
    """
    slow_len = int(cfg.ema_bias)
    fast_len = int(cfg.ema_fast)
    slope_lb = int(cfg.bias_slope_lookback)

    if not closes:
        return None
    if slow_len <= 1 or fast_len <= 1:
        return None
    if slope_lb < 1:
        slope_lb = 1

    # Need enough points for EMA(slow) and slope lookback
    need = max(slow_len, fast_len) + slope_lb + 2
    if len(closes) < need:
        return None

    ef = ema(closes, fast_len)
    es = ema(closes, slow_len)
    if not ef or not es:
        return None

    if len(es) <= slope_lb:
        return None

    price = float(closes[-1])
    slow_last = float(es[-1])
    fast_last = float(ef[-1])
    slope = float(es[-1]) - float(es[-1 - slope_lb])

    if price > slow_last and fast_last > slow_last and slope > 0:
        return "up"
    if price < slow_last and fast_last < slow_last and slope < 0:
        return "down"
    return None


def run(api: Optional[UStockAPI] = None, cfg: Optional[EMATrendConfig] = None) -> List[TradeIntent]:
    global _MARKET_CLOSED_UNTIL

    created_api = api is None
    if created_api:
        api = UStockAPI()

    cfg = cfg or EMATrendConfig()
    intents: List[TradeIntent] = []
    counters: Dict[str, int] = {}

    try:
        # time window gate
        if not is_trade_window_local():
            inc(counters, "outside_window")
            _log_throttled("outside_window", one_line("ema_trend", counters), every_seconds=300)
            return []

        # market closed gate
        now = time.time()
        if now < _MARKET_CLOSED_UNTIL:
            inc(counters, "market_gated")
            _log_throttled(
                "market_closed",
                f"US market gated until {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(_MARKET_CLOSED_UNTIL))}. Skipping.",
                every_seconds=600,
            )
            return []

        # ---- symbols ----
        try:
            opp = api.get("/api/opportunities")
        except Exception as e:
            inc(counters, "opp_fail")
            _log_throttled("opp_fail", f"/api/opportunities failed: {repr(e)}", every_seconds=120)
            return []

        symbols = (opp or {}).get("symbols") or []
        if not isinstance(symbols, list) or not symbols:
            inc(counters, "no_symbols")
            _log_throttled("no_symbols", "No symbols from /api/opportunities.", every_seconds=300)
            return []

        any_symbol_had_data = False
        candidates: List[Tuple[float, TradeIntent]] = []

        for sym in symbols:
            inc(counters, "symbols_total")
            s = str(sym or "").strip().upper()
            if not s:
                inc(counters, "symbol_blank")
                continue

            # ---- bias bars ----
            try:
                resp_bias = api.get(
                    "/api/market/us/bars",
                    params={"symbol": s, "timeframe": cfg.tf_bias, "limit": 250, "feed": cfg.feed},
                )
            except Exception as e:
                inc(counters, "bias_bars_err")
                _log_throttled(f"bars_bias_err:{s}", f"{s} bias bars request failed: {repr(e)}", every_seconds=300)
                continue

            bars_bias = (resp_bias or {}).get("bars") or {}
            closes_bias = closes_from_bars(bars_bias)
            if not closes_bias:
                inc(counters, "bias_bars_empty")
                continue

            any_symbol_had_data = True

            bias = _compute_bias_15m(closes_bias, cfg)
            if bias is None:
                inc(counters, "bias_none")
                continue

            # ---- entry bars ----
            try:
                resp_entry = api.get(
                    "/api/market/us/bars",
                    params={"symbol": s, "timeframe": cfg.tf_entry, "limit": 400, "feed": cfg.feed},
                )
            except Exception as e:
                inc(counters, "entry_bars_err")
                _log_throttled(f"bars_entry_err:{s}", f"{s} entry bars request failed: {repr(e)}", every_seconds=300)
                continue

            bars_entry = (resp_entry or {}).get("bars") or {}
            ohlc = extract_ohlc(bars_entry)
            if ohlc is None:
                inc(counters, "entry_bars_bad")
                continue
            o, h, l, c = ohlc

            # ---- chop filters (entry timeframe) ----
            ef = ema(c, int(cfg.ema_fast))
            es = ema(c, int(cfg.ema_slow))
            if not ef or not es:
                inc(counters, "entry_ema_missing")
                continue

            price = float(c[-1])
            sep = ema_separation_pct(float(ef[-1]), float(es[-1]), price)
            slope = slope_pct(es, lookback=6, price=price)

            if not passes_chop_filters(
                sep_pct=sep,
                slope=slope,
                min_sep_pct=cfg.min_sep_pct,
                min_slope_pct=cfg.min_slope_pct,
            ):
                inc(counters, "chop_fail")
                continue

            # ---- signal ----
            triple, reasons, conf = compute_signal(bars_entry, cfg, bias)
            if (not triple) or conf is None or float(conf) < float(cfg.min_confidence):
                inc(counters, "signal_fail")
                continue

            entry, stop, tp = triple
            intent = TradeIntent(
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

            candidates.append((float(conf), intent))
            inc(counters, "candidates")

        # ---- market gate if everything empty ----
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
            return []

        # ---- select top N ----
        candidates.sort(key=lambda x: x[0], reverse=True)
        for _, intent in candidates[: int(cfg.max_intents_per_run)]:
            intents.append(intent)

        inc(counters, "intents", len(intents))
        _log_throttled("summary", one_line("ema_trend", counters), every_seconds=120)

        return intents

    finally:
        if created_api and api is not None:
            try:
                api.close()
            except Exception:
                pass
