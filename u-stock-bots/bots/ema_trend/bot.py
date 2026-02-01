# u-stock-bots/bots/ema_trend/bot.py
from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from bots._shared.types import TradeIntent
from bots._shared.ustock_http import UStockAPI
from bots._shared.opportunities_client import get_opportunity_symbols

from bots._shared.data.bars import closes_from_bars, extract_ohlc
from bots._shared.indicators.ema import ema
from bots._shared.indicators.vwap import vwap_from_bars
from bots._shared.filters.chop import ema_separation_pct, slope_pct, passes_chop_filters
from bots._shared.filters.time_window import is_trade_window_local
from bots._shared.telemetry import inc, one_line
from bots._shared.symbol_scoring import LiquidityFilterConfig, liquidity_ok, score_candidate

from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend.signal import compute_signal
from bots.ema_trend.reason_codes import BIAS_UP, BIAS_DN, EMA_STACK, PULLBACK_OK

_LAST_LOG_TS: Dict[str, float] = {}
_MARKET_CLOSED_UNTIL: float = 0.0
_LAST_INTENT_TS_BY_SYMBOL: Dict[str, float] = {}


def _log(msg: str) -> None:
    print(f"[ema_trend] {msg}")


def _log_throttled(key: str, msg: str, every_seconds: int = 300) -> None:
    now = time.time()
    last = _LAST_LOG_TS.get(key, 0.0)
    if (now - last) >= float(every_seconds):
        _LAST_LOG_TS[key] = now
        _log(msg)


def _safe_bot_id(bot_id: str) -> str:
    safe = "".join(ch for ch in str(bot_id or "ema_trend") if ch.isalnum() or ch in ("-", "_")).strip()
    return safe or "ema_trend"


def _atomic_write_json(path: Path, payload: Dict[str, Any]) -> None:
    try:
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=True), encoding="utf-8")
        tmp.replace(path)
    except Exception:
        pass


def _write_market_gate_hint(
    *,
    until_epoch: float,
    reason: str,
    bot_id: str = "ema_trend",
    market: str = "us_stocks",
) -> None:
    out_dir = os.getenv("OUTPUT_DIR") or ""
    if not out_dir:
        return

    safe_bot = _safe_bot_id(bot_id)

    try:
        p = Path(out_dir).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)

        hint = p / f"market_gate_{safe_bot}.json"
        payload = {
            "bot_id": safe_bot,
            "market": market,
            "effective_state": "waiting_for_market",
            "reason": str(reason or "market_closed"),
            "closed_until": int(until_epoch),
            "ts": int(time.time()),
        }
        _atomic_write_json(hint, payload)
    except Exception:
        pass


def _get_us_market_session(api: UStockAPI) -> Optional[Dict[str, Any]]:
    try:
        return api.get("/api/market/us/session")
    except Exception:
        return None


def _maybe_market_closed(api: UStockAPI) -> Tuple[bool, Optional[float], str]:
    session = _get_us_market_session(api)
    if isinstance(session, dict) and session.get("ok") is True:
        if bool(session.get("is_open")):
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
    Bias:
      - price > slow EMA AND fast > slow AND slope > 0 => up
      - price < slow EMA AND fast < slow AND slope < 0 => down
    """
    slow_len = int(cfg.ema_bias)
    fast_len = int(cfg.ema_fast)
    slope_lb = max(1, int(cfg.bias_slope_lookback))

    if not closes:
        return None

    need = max(slow_len, fast_len) + slope_lb + 2
    if len(closes) < need:
        return None

    ef = ema(closes, fast_len)
    es = ema(closes, slow_len)
    if not ef or not es or len(es) <= slope_lb:
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


def _cooldown_seconds() -> int:
    try:
        return max(30, int(os.getenv("EMA_TREND_SYMBOL_COOLDOWN_SECONDS", "180")))
    except Exception:
        return 180


def _is_in_cooldown(symbol: str) -> bool:
    cd = float(_cooldown_seconds())
    now = time.time()
    last = float(_LAST_INTENT_TS_BY_SYMBOL.get(symbol, 0.0))
    return (now - last) < cd


def _mark_intent(symbol: str) -> None:
    _LAST_INTENT_TS_BY_SYMBOL[symbol] = time.time()


def _liq_cfg_from_env() -> LiquidityFilterConfig:
    def _f(name: str, default: float) -> float:
        try:
            return float(os.getenv(name, str(default)))
        except Exception:
            return default

    def _i(name: str, default: int) -> int:
        try:
            return int(os.getenv(name, str(default)))
        except Exception:
            return default

    max_atr = os.getenv("EMA_TREND_MAX_ATR_PCT", "").strip()
    max_atr_pct: Optional[float] = None
    if max_atr:
        try:
            max_atr_pct = float(max_atr)
        except Exception:
            max_atr_pct = None

    return LiquidityFilterConfig(
        min_last_price=_f("EMA_TREND_MIN_LAST_PRICE", 2.0),
        min_bar_volume=_f("EMA_TREND_MIN_LAST_BAR_VOLUME", 25_000.0),
        min_avg_bar_volume=_f("EMA_TREND_MIN_AVG_BAR_VOLUME", 15_000.0),
        avg_volume_lookback=_i("EMA_TREND_AVG_VOL_LOOKBACK", 30),
        max_atr_pct=max_atr_pct,
    )


def _min_rr_from_env(default: float = 1.0) -> float:
    """
    Strategy-quality upgrade:
    reject brackets with weak reward:risk.
    """
    raw = (os.getenv("EMA_TREND_MIN_RR") or "").strip()
    if not raw:
        return float(default)
    try:
        return max(0.1, float(raw))
    except Exception:
        return float(default)


def _rr_ok(entry: float, stop: float, tp: float, *, min_rr: float) -> bool:
    risk = abs(float(entry) - float(stop))
    reward = abs(float(tp) - float(entry))
    if risk <= 0:
        return False
    rr = reward / risk
    return rr >= float(min_rr)


def _setup_confirmation_ok(
    *,
    bars_setup: Dict[str, Any],
    bias: str,
    cfg: EMATrendConfig,
) -> Tuple[bool, List[str]]:
    """
    Setup timeframe confirmation (default 5m):
      - EMA stack in direction (fast vs slow)
      - pullback proximity to fast EMA (avoid chasing)
    """
    ohlc = extract_ohlc(bars_setup)
    if ohlc is None:
        return False, []

    o, h, l, c = ohlc
    if not c:
        return False, []

    ef = ema(c, int(cfg.setup_ema_fast))
    es = ema(c, int(cfg.setup_ema_slow))
    if not ef or not es:
        return False, []

    price = float(c[-1])
    fast = float(ef[-1])
    slow = float(es[-1])

    # avoid chasing: must be near fast EMA
    dist_pct = abs(price - fast) / max(1e-9, price) * 100.0
    pullback_ok = dist_pct <= float(cfg.setup_pullback_max_dist_pct)

    if bias == "up":
        stack_ok = (fast > slow) and (price >= slow)
    else:
        stack_ok = (fast < slow) and (price <= slow)

    reasons: List[str] = []
    if stack_ok:
        reasons.append(EMA_STACK)
    if pullback_ok:
        reasons.append(PULLBACK_OK)

    return (stack_ok and pullback_ok), reasons


def run(api: Optional[UStockAPI] = None, cfg: Optional[EMATrendConfig] = None) -> List[TradeIntent]:
    global _MARKET_CLOSED_UNTIL

    created_api = api is None
    if created_api:
        api = UStockAPI()

    cfg = cfg or EMATrendConfig()
    intents: List[TradeIntent] = []
    counters: Dict[str, int] = {}

    liq_cfg = _liq_cfg_from_env()
    min_rr = _min_rr_from_env(default=1.0)

    try:
        # time window gate
        if not is_trade_window_local():
            inc(counters, "outside_window")
            _log_throttled("outside_window", one_line("ema_trend", counters), every_seconds=300)
            return []

        # market session gate
        now = time.time()
        if now >= _MARKET_CLOSED_UNTIL:
            closed, until, reason = _maybe_market_closed(api)
            if closed:
                mins = int(os.getenv("MARKET_CLOSED_RECHECK_MINUTES", "120"))
                _MARKET_CLOSED_UNTIL = float(until or (time.time() + mins * 60.0))
                _write_market_gate_hint(until_epoch=_MARKET_CLOSED_UNTIL, reason=reason, bot_id=cfg.bot_id)
                inc(counters, "market_gated")
                return []

        if time.time() < _MARKET_CLOSED_UNTIL:
            inc(counters, "market_gated")
            return []

        # symbols (leaders + fallback handled by backend /api/opportunities)
        opp_res = get_opportunity_symbols(
            api,
            bot_id=cfg.bot_id,
            limit=12,
            include_leaders=True,
            leaders_direction="up",
            leaders_show_more=False,
            cache_bust=False,
        )

        if not opp_res.ok or not opp_res.symbols:
            inc(counters, "no_symbols")
            _log_throttled("no_symbols", "No symbols from opportunities.", every_seconds=180)
            return []

        symbols = opp_res.symbols

        any_symbol_had_data = False
        candidates: List[Tuple[float, TradeIntent]] = []

        for sym in symbols:
            s = str(sym or "").strip().upper()
            if not s:
                continue

            if _is_in_cooldown(s):
                inc(counters, "cooldown_skip")
                continue

            # ---- bias bars (15m) ----
            try:
                resp_bias = api.get(
                    "/api/market/us/bars",
                    params={"symbol": s, "timeframe": cfg.tf_bias, "limit": 250, "feed": cfg.feed},
                )
            except Exception as e:
                inc(counters, "bias_bars_err")
                _log_throttled(f"bias_bars_err:{s}", f"{s} bias bars request failed: {repr(e)}", every_seconds=300)
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

            # ---- setup confirmation (5m) ----
            setup_reasons: List[str] = []
            if bool(getattr(cfg, "require_setup_confirmation", True)):
                try:
                    resp_setup = api.get(
                        "/api/market/us/bars",
                        params={"symbol": s, "timeframe": cfg.tf_setup, "limit": 180, "feed": cfg.feed},
                    )
                    bars_setup = (resp_setup or {}).get("bars") or {}
                    ok_setup, setup_reasons = _setup_confirmation_ok(bars_setup=bars_setup, bias=bias, cfg=cfg)
                    if not ok_setup:
                        inc(counters, "setup_fail")
                        continue
                except Exception as e:
                    inc(counters, "setup_err")
                    _log_throttled(f"setup_err:{s}", f"{s} setup bars request failed: {repr(e)}", every_seconds=300)
                    continue

            # ---- entry bars (1m) ----
            try:
                resp_entry = api.get(
                    "/api/market/us/bars",
                    params={"symbol": s, "timeframe": cfg.tf_entry, "limit": 400, "feed": cfg.feed},
                )
            except Exception as e:
                inc(counters, "entry_bars_err")
                _log_throttled(f"entry_bars_err:{s}", f"{s} entry bars request failed: {repr(e)}", every_seconds=300)
                continue

            bars_entry = (resp_entry or {}).get("bars") or {}
            ohlc = extract_ohlc(bars_entry)
            if ohlc is None:
                inc(counters, "entry_bars_bad")
                continue

            o, h, l, c = ohlc
            if not c:
                inc(counters, "entry_no_closes")
                continue

            # ---- chop filters (entry tf) ----
            ef = ema(c, int(cfg.ema_fast))
            es = ema(c, int(cfg.ema_slow))
            if not ef or not es:
                inc(counters, "entry_ema_missing")
                continue

            price = float(c[-1])
            sep = ema_separation_pct(float(ef[-1]), float(es[-1]), price)
            slp = slope_pct(es, lookback=6, price=price)

            if not passes_chop_filters(
                sep_pct=sep,
                slope=slp,
                min_sep_pct=cfg.min_sep_pct,
                min_slope_pct=cfg.min_slope_pct,
            ):
                inc(counters, "chop_fail")
                continue

            # ---- optional VWAP filter (entry tf) ----
            if bool(getattr(cfg, "use_vwap_filter", False)):
                vwap_val = vwap_from_bars(bars_entry)
                if vwap_val is not None and float(vwap_val) > 0:
                    dist_pct = abs(price - float(vwap_val)) / max(1e-9, price) * 100.0
                    if dist_pct > float(getattr(cfg, "vwap_max_dist_pct", 1.0)):
                        inc(counters, "vwap_fail")
                        continue

            # ---- signal ----
            triple, reasons, conf = compute_signal(bars_entry, cfg, bias)
            if (not triple) or conf is None or float(conf) < float(cfg.min_confidence):
                inc(counters, "signal_fail")
                continue

            entry, stop, tp = triple

            # ✅ strategy-quality upgrade: minimum reward:risk
            if not _rr_ok(float(entry), float(stop), float(tp), min_rr=min_rr):
                inc(counters, "rr_fail")
                continue

            # ---- liquidity sanity ----
            atr_pct_approx: Optional[float] = None
            try:
                atr_pct_approx = abs(float(entry) - float(stop)) / max(1e-9, float(entry)) * 100.0
            except Exception:
                atr_pct_approx = None

            ok_liq, liq_reason = liquidity_ok(
                symbol=s,
                last_price=float(entry),
                bars_entry=bars_entry,
                atr_pct=atr_pct_approx,
                cfg=liq_cfg,
            )
            if not ok_liq:
                inc(counters, f"liq_fail:{liq_reason}")
                continue

            # ---- intent ----
            intent = TradeIntent(
                symbol=s,
                side="buy" if bias == "up" else "sell",
                entry=round(float(entry), 4),
                stop=round(float(stop), 4),
                take_profit=round(float(tp), 4),
                confidence=float(conf),
                bot_id=cfg.bot_id,
                timeframe=cfg.tf_entry,
                reason_codes=[BIAS_UP if bias == "up" else BIAS_DN] + setup_reasons + (reasons or []),
            )

            # ---- shared scoring ----
            score = score_candidate(
                confidence=float(conf),
                atr_pct=atr_pct_approx,
                sep_pct=float(sep),
                slope_pct=float(slp),
            )

            candidates.append((float(score), intent))
            inc(counters, "candidates")

        # market safety net
        if not any_symbol_had_data:
            closed, until, reason = _maybe_market_closed(api)
            if closed and until:
                _MARKET_CLOSED_UNTIL = float(until)
                _write_market_gate_hint(until_epoch=_MARKET_CLOSED_UNTIL, reason=reason, bot_id=cfg.bot_id)
            return []

        # select top N
        candidates.sort(key=lambda x: x[0], reverse=True)
        for _, intent in candidates[: int(cfg.max_intents_per_run)]:
            intents.append(intent)
            _mark_intent(intent.symbol)

        inc(counters, "intents", len(intents))
        _log_throttled("summary", one_line("ema_trend", counters), every_seconds=120)
        return intents

    finally:
        if created_api and api is not None:
            try:
                api.close()
            except Exception:
                pass


# --------------------------------------------------------------------
# Stable runner entrypoints
# --------------------------------------------------------------------
def _generate_intents_internal(api: UStockAPI, config: Dict[str, Any]) -> List[TradeIntent]:
    cfg = EMATrendConfig(**(config or {}))
    return run(api=api, cfg=cfg)


def generate_intents(api: UStockAPI, config: Dict[str, Any]) -> List[Dict[str, Any]]:
    intents = _generate_intents_internal(api=api, config=config)

    out: List[Dict[str, Any]] = []
    for it in intents or []:
        if isinstance(it, dict):
            out.append(it)
        elif is_dataclass(it):
            out.append(asdict(it))
        else:
            out.append(dict(getattr(it, "__dict__", {})))
    return out


def generate_output(api: UStockAPI, config: Dict[str, Any]) -> Dict[str, Any]:
    return {"intents": generate_intents(api, config), "events": []}
