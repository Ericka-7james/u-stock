# backend/api/clients/fx_mt5_client.py
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

try:
    import MetaTrader5 as mt5  # type: ignore
except Exception:  # pragma: no cover
    mt5 = None  # type: ignore


def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _mt5_creds() -> tuple[Optional[int], str, str]:
    login_raw = _env("MT5_LOGIN")
    password = _env("MT5_PASSWORD")
    server = _env("MT5_SERVER")

    login: Optional[int] = None
    if login_raw:
        try:
            login = int(login_raw)
        except ValueError:
            raise RuntimeError("MT5_LOGIN must be an integer")

    return login, password, server


def _require_mt5():
    if mt5 is None:
        raise RuntimeError(
            "MetaTrader5 package not installed. "
            "Install it in this environment or run MT5 features on a Windows worker."
        )
    return mt5


def ensure_mt5() -> bool:
    m = _require_mt5()
    if m.initialize():
        return True
    raise RuntimeError(f"MT5 initialize failed: {m.last_error()}")


def mt5_login() -> None:
    m = _require_mt5()
    ensure_mt5()

    login, password, server = _mt5_creds()
    if login is not None and password and server:
        ok = m.login(login, password=password, server=server)
        if not ok:
            raise RuntimeError(f"MT5 login failed: {m.last_error()}")


def get_fx_bars(symbol: str, timeframe: int, count: int = 500) -> List[Dict[str, Any]]:
    m = _require_mt5()

    sym = (symbol or "").strip()
    if not sym:
        raise ValueError("symbol is required")
    if count <= 0:
        raise ValueError("count must be > 0")

    mt5_login()

    rates = m.copy_rates_from_pos(sym, timeframe, 0, int(count))
    if rates is None:
        raise RuntimeError(f"copy_rates failed: {m.last_error()}")

    out: List[Dict[str, Any]] = []
    for r in rates:
        out.append(
            {
                "t": int(r["time"]),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r["tick_volume"]),
            }
        )
    return out


def get_fx_quote(symbol: str) -> Dict[str, Any]:
    m = _require_mt5()

    sym = (symbol or "").strip()
    if not sym:
        raise ValueError("symbol is required")

    mt5_login()

    tick = m.symbol_info_tick(sym)
    if tick is None:
        raise RuntimeError(f"symbol_info_tick failed: {m.last_error()}")

    bid = float(tick.bid)
    ask = float(tick.ask)
    return {
        "symbol": sym,
        "bid": bid,
        "ask": ask,
        "spread": ask - bid,
        "time_msc": int(tick.time_msc),
    }
