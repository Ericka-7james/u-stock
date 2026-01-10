from typing import List, Dict, Tuple, Optional
from bots._shared.scoring import clamp01
from bots.ema_trend.config import EMATrendConfig
from bots.ema_trend import reason_codes as R

def ema(values: List[float], length: int) -> List[float]:
    if len(values) < length:
        return []
    k = 2 / (length + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(out[-1] + k * (v - out[-1]))
    return out

def atr(h, l, c, n=14) -> float:
    if len(c) < n + 1:
        return 0.0
    trs = []
    for i in range(1, len(c)):
        trs.append(max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1])))
    return sum(trs[-n:]) / n

def compute_signal(bars: Dict[str, List[float]], cfg: EMATrendConfig, bias: str):
    o,h,l,c = bars["o"], bars["h"], bars["l"], bars["c"]

    e9 = ema(c, cfg.ema_fast)
    if not e9:
        return None, [], 0.0

    a = atr(h,l,c)
    atr_pct = a / c[-1] * 100
    if atr_pct < cfg.min_atr_pct:
        return None, [], 0.0

    reasons = [R.ATR_OK]

    if bias == "up" and c[-1] > e9[-1] and l[-1] <= e9[-1]:
        entry = c[-1]
        stop = min(l[-1], e9[-1]) - a * 0.15
        tp = entry + (entry - stop) * cfg.rr_multiple
        reasons += [R.RECLAIM, R.STOP_SANITY]
    elif bias == "down" and c[-1] < e9[-1] and h[-1] >= e9[-1]:
        entry = c[-1]
        stop = max(h[-1], e9[-1]) + a * 0.15
        tp = entry - (stop - entry) * cfg.rr_multiple
        reasons += [R.RECLAIM, R.STOP_SANITY]
    else:
        return None, [], 0.0

    conf = clamp01(0.55 + 0.1 + 0.08 + 0.05)
    return (entry, stop, tp), reasons, conf
