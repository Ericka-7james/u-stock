from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple


def _as_floats(x: Any) -> List[float]:
    if not isinstance(x, list):
        return []
    out: List[float] = []
    for v in x:
        if v is None:
            continue
        try:
            out.append(float(v))
        except Exception:
            continue
    return out


def extract_ohlc(bars: Dict[str, Any]) -> Optional[Tuple[List[float], List[float], List[float], List[float]]]:
    """
    Safely extract and align OHLC lists from a bars dict like:
      {"o":[...], "h":[...], "l":[...], "c":[...], ...}
    Returns (o,h,l,c) trimmed to common length or None.
    """
    if not isinstance(bars, dict):
        return None

    o = _as_floats(bars.get("o"))
    h = _as_floats(bars.get("h"))
    l = _as_floats(bars.get("l"))
    c = _as_floats(bars.get("c"))

    if not (o and h and l and c):
        return None

    n = min(len(o), len(h), len(l), len(c))
    if n < 2:
        return None

    return (o[-n:], h[-n:], l[-n:], c[-n:])


def closes_from_bars(bars: Dict[str, Any]) -> List[float]:
    """
    Extract closes only. Safe fallback to [].
    """
    if not isinstance(bars, dict):
        return []
    return _as_floats(bars.get("c") or [])
