# u-stock-bots/runner/risk.py
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


def _today_key_utc() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _now() -> int:
    return int(time.time())


def _cfg_int(cfg: Dict[str, Any], *keys: str, default: int) -> int:
    for k in keys:
        v = cfg.get(k)
        try:
            if v is not None:
                return int(v)
        except Exception:
            pass
    return int(default)


def _cfg_list(cfg: Dict[str, Any], *keys: str) -> List[str]:
    for k in keys:
        v = cfg.get(k)
        if isinstance(v, list):
            out: List[str] = []
            for x in v:
                s = str(x or "").strip()
                if s:
                    out.append(s.upper())
            if out:
                return out
        if isinstance(v, str) and v.strip():
            out = [p.strip().upper() for p in v.split(",") if p.strip()]
            if out:
                return out
    return []


@dataclass
class RiskState:
    """
    Runner-local counters (per process). Keeps behavior identical to your module globals,
    but cleaner to pass around / test.
    """
    orders_today: int = 0
    last_order_epoch: int = 0
    day_key: str = ""


def reset_daily_counters_if_needed(state: RiskState) -> None:
    tk = _today_key_utc()
    if state.day_key != tk:
        state.day_key = tk
        state.orders_today = 0


def record_orders_placed(state: RiskState, n: int) -> None:
    if n <= 0:
        return
    state.orders_today += int(n)
    state.last_order_epoch = _now()


def filter_intents_with_gates(
    *,
    state: RiskState,
    mode: str,
    cfg: Dict[str, Any],
    intents: List[Dict[str, Any]],
    status: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Apply a minimal, production-safe gate set at runner level.
    Returns (filtered_intents, block_reason_if_all_blocked_or_empty)

    Drop-in behavior: same logic as your previous orchestrator.py.
    """
    reset_daily_counters_if_needed(state)

    # A) Hard gates
    if mode != "paper":
        return [], "blocked: paper-only gate (mode != paper)"

    if bool(status.get("kill_switch") or cfg.get("kill_switch") or False):
        return [], "blocked: kill switch enabled"

    required = ("symbol", "side", "qty")
    cleaned: List[Dict[str, Any]] = []
    for it in intents:
        if not isinstance(it, dict):
            continue
        if any(it.get(k) in (None, "", 0, 0.0) for k in required):
            continue

        sym = str(it.get("symbol") or "").upper().strip()
        if not sym:
            continue

        it["symbol"] = sym
        it["side"] = str(it.get("side") or "").lower().strip()
        cleaned.append(it)

    if not cleaned:
        return [], "blocked: no valid intents"

    allow = _cfg_list(cfg, "allowed_symbols", "symbol_allowlist", "symbols")
    if allow:
        allow_set = set(allow)
        cleaned = [it for it in cleaned if str(it.get("symbol") or "").upper() in allow_set]
        if not cleaned:
            return [], "blocked: symbol not in allowlist"

    # B) Soft gates
    max_orders_per_day = _cfg_int(cfg, "max_orders_per_day", "daily_order_cap", default=10)
    cooldown_seconds = _cfg_int(cfg, "cooldown_seconds", "order_cooldown_seconds", default=30)

    if state.orders_today >= max_orders_per_day:
        return [], "soft_block: max orders per day reached"

    now = _now()
    if state.last_order_epoch and (now - state.last_order_epoch) < cooldown_seconds:
        return [], "soft_block: cooldown"

    remaining = max(0, max_orders_per_day - state.orders_today)
    if remaining <= 0:
        return [], "soft_block: no remaining order budget"

    if len(cleaned) > remaining:
        cleaned = cleaned[:remaining]

    return cleaned, None
