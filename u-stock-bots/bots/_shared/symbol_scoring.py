# u-stock-bots/bots/_shared/symbol_scoring.py
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


@dataclass(frozen=True)
class LiquidityFilterConfig:
    """
    Simple liquidity + volatility sanity checks for intraday bots.

    Notes:
    - bars_entry is expected to be the raw "bars" payload your backend returns
      (dict-like), but we intentionally parse it defensively.
    """
    min_last_price: float = 2.0
    min_bar_volume: float = 25_000.0          # last bar volume
    min_avg_bar_volume: float = 15_000.0      # average volume across lookback
    avg_volume_lookback: int = 30
    max_atr_pct: Optional[float] = None       # optional volatility ceiling


def clean_symbol(x: Any) -> str:
    """
    Conservative symbol sanitizer.
    Keeps A-Z 0-9 . -
    """
    s = str(x or "").strip().upper()
    if not s or len(s) > 16:
        return ""
    for ch in s:
        if not (ch.isalnum() or ch in {".", "-"}):
            return ""
    return s


def _safe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:  # NaN
            return None
        return v
    except Exception:
        return None


def _extract_volumes_from_bars(bars: Dict[str, Any]) -> List[float]:
    """
    Extract a volume series from a variety of bar shapes.

    Supported patterns (best-effort):
    - { "bars": { "t": [...], "v": [...] } } (already sliced before calling)
    - bars = { "t": [...], "v": [...] }
    - bars = [ { "v": 123 }, ... ]
    - bars = { "items": [ { "v": 123 }, ... ] }
    """
    if not bars:
        return []

    # case: dict with list columns
    if isinstance(bars, dict):
        vcol = bars.get("v")
        if isinstance(vcol, list) and vcol:
            out: List[float] = []
            for x in vcol:
                fv = _safe_float(x)
                if fv is not None:
                    out.append(fv)
            return out

        items = bars.get("items")
        if isinstance(items, list) and items:
            out = []
            for it in items:
                if isinstance(it, dict):
                    fv = _safe_float(it.get("v"))
                    if fv is not None:
                        out.append(fv)
            return out

    # case: list of dicts
    if isinstance(bars, list):
        out = []
        for it in bars:
            if isinstance(it, dict):
                fv = _safe_float(it.get("v"))
                if fv is not None:
                    out.append(fv)
        return out

    return []


def liquidity_ok(
    *,
    symbol: str,
    last_price: float,
    bars_entry: Dict[str, Any],
    atr_pct: Optional[float],
    cfg: LiquidityFilterConfig,
) -> Tuple[bool, str]:
    """
    Returns (ok, reason).

    This is intentionally lightweight: it prevents the worst fills / nonsense ticks.
    """
    sym = clean_symbol(symbol)
    if not sym:
        return False, "bad_symbol"

    lp = _safe_float(last_price)
    if lp is None or lp <= 0:
        return False, "bad_last_price"

    if lp < float(cfg.min_last_price):
        return False, "min_price"

    # optional vol ceiling (ATR% proxy)
    if cfg.max_atr_pct is not None and atr_pct is not None:
        try:
            if float(atr_pct) > float(cfg.max_atr_pct):
                return False, "max_atr_pct"
        except Exception:
            pass

    vols = _extract_volumes_from_bars(bars_entry)
    if not vols:
        # if we can't read volume at all, fail CLOSED (safer for production)
        return False, "no_volume_series"

    last_v = vols[-1] if vols else 0.0
    if last_v < float(cfg.min_bar_volume):
        return False, "min_last_bar_volume"

    lb = max(1, int(cfg.avg_volume_lookback))
    tail = vols[-lb:] if len(vols) >= lb else vols
    avg_v = (sum(tail) / max(1, len(tail))) if tail else 0.0
    if avg_v < float(cfg.min_avg_bar_volume):
        return False, "min_avg_bar_volume"

    return True, "ok"


def score_candidate(
    *,
    confidence: float,
    atr_pct: Optional[float],
    sep_pct: float,
    slope_pct: float,
) -> float:
    """
    Stable scoring function (higher is better).

    Why this exists:
    - lets you sort candidate intents consistently across bots
    - keeps scoring logic in one place (not copy/pasted into strategies)

    Defaults are tuned to behave sensibly without being "overfit".
    You can adjust weights via env without touching code.
    """
    def _w(name: str, default: float) -> float:
        try:
            return float(os.getenv(name, str(default)))
        except Exception:
            return default

    w_conf = _w("SYMBOL_SCORE_W_CONF", 1.0)
    w_sep = _w("SYMBOL_SCORE_W_SEP", 0.30)
    w_slope = _w("SYMBOL_SCORE_W_SLOPE", 0.20)
    w_atr_pen = _w("SYMBOL_SCORE_W_ATR_PENALTY", 0.05)

    # Normalize confidence into 0..1-ish (you already output 0..1 typically)
    conf = max(0.0, min(1.0, float(confidence)))

    # sep_pct, slope_pct are small numbers; we clamp to avoid outliers dominating
    sep = max(-10.0, min(10.0, float(sep_pct)))
    slp = max(-10.0, min(10.0, float(slope_pct)))

    # ATR penalty: prefer moderate volatility (penalize very high ATR%)
    atr = float(atr_pct) if (atr_pct is not None) else 0.0
    atr_pen = max(0.0, atr) * w_atr_pen

    score = (conf * w_conf) + (sep * w_sep) + (slp * w_slope) - atr_pen
    return float(score)
