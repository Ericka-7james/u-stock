import os
from typing import Any, Dict, List
from datetime import datetime
import MetaTrader5 as mt5

MT5_LOGIN = os.getenv("MT5_LOGIN")
MT5_PASSWORD = os.getenv("MT5_PASSWORD")
MT5_SERVER = os.getenv("MT5_SERVER")

def ensure_mt5():
    if mt5.initialize():
        return True
    raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")

def mt5_login():
    ensure_mt5()
    if MT5_LOGIN and MT5_PASSWORD and MT5_SERVER:
        ok = mt5.login(int(MT5_LOGIN), password=MT5_PASSWORD, server=MT5_SERVER)
        if not ok:
            raise RuntimeError(f"MT5 login failed: {mt5.last_error()}")

def get_fx_bars(symbol: str, timeframe: int, count: int = 500) -> List[Dict[str, Any]]:
    mt5_login()
    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
    if rates is None:
        raise RuntimeError(f"copy_rates failed: {mt5.last_error()}")

    out = []
    for r in rates:
        out.append({
            "t": int(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r["tick_volume"]),
        })
    return out

def get_fx_quote(symbol: str) -> Dict[str, Any]:
    mt5_login()
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise RuntimeError(f"symbol_info_tick failed: {mt5.last_error()}")

    bid = float(tick.bid)
    ask = float(tick.ask)
    spread = ask - bid
    return {
        "symbol": symbol,
        "bid": bid,
        "ask": ask,
        "spread": spread,
        "time_msc": int(tick.time_msc),
    }
