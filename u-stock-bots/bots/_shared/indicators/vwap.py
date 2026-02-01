# u-stock-bots/bots/_shared/indicators/vwap.py
from __future__ import annotations

from typing import Any, List, Optional, Tuple


def _to_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:
            return None
        return v
    except Exception:
        return None


def extract_ohlcv(bars: Any) -> Optional[Tuple[List[float], List[float], List[float], List[float], List[float]]]:
    """
    Best-effort OHLCV extraction supporting common shapes:

    Shape A (dict of arrays):
      {"o":[...],"h":[...],"l":[...],"c":[...],"v":[...]}

    Shape B (list of dict bars):
      [{"o":..,"h":..,"l":..,"c":..,"v":..}, ...]
    """
    if bars is None:
        return None

    # dict of arrays
    if isinstance(bars, dict):
        o = bars.get("o")
        h = bars.get("h")
        l = bars.get("l")
        c = bars.get("c")
        v = bars.get("v") or bars.get("volume")

        if all(isinstance(x, list) for x in (o, h, l, c)) and isinstance(v, list):
            oo = [_to_float(x) for x in o]
            hh = [_to_float(x) for x in h]
            ll = [_to_float(x) for x in l]
            cc = [_to_float(x) for x in c]
            vv = [_to_float(x) for x in v]

            if any(x is None for x in oo + hh + ll + cc + vv):
                # allow partial by filtering None out consistently? safer to fail
                return None

            return (
                [float(x) for x in oo],
                [float(x) for x in hh],
                [float(x) for x in ll],
                [float(x) for x in cc],
                [float(x) for x in vv],
            )

        # sometimes nested: {"bars":[{...}, ...]}
        maybe_list = bars.get("bars")
        if isinstance(maybe_list, list):
            bars = maybe_list

    # list of dict bars
    if isinstance(bars, list):
        oo: List[float] = []
        hh: List[float] = []
        ll: List[float] = []
        cc: List[float] = []
        vv: List[float] = []
        for row in bars:
            if not isinstance(row, dict):
                continue
            o = _to_float(row.get("o"))
            h = _to_float(row.get("h"))
            l = _to_float(row.get("l"))
            c = _to_float(row.get("c"))
            v = _to_float(row.get("v") or row.get("volume"))
            if None in (o, h, l, c, v):
                return None
            oo.append(float(o))
            hh.append(float(h))
            ll.append(float(l))
            cc.append(float(c))
            vv.append(float(v))
        if not cc:
            return None
        return oo, hh, ll, cc, vv

    return None


def vwap_from_bars(bars: Any) -> Optional[float]:
    """
    Intraday VWAP approximation:
      VWAP = sum(typical_price * volume) / sum(volume)
      typical_price = (high+low+close)/3
    """
    ohlcv = extract_ohlcv(bars)
    if ohlcv is None:
        return None
    _, h, l, c, v = ohlcv

    num = 0.0
    den = 0.0
    for hi, lo, cl, vol in zip(h, l, c, v):
        tp = (float(hi) + float(lo) + float(cl)) / 3.0
        vol = float(vol)
        if vol <= 0:
            continue
        num += tp * vol
        den += vol

    if den <= 0:
        return None
    return num / den
