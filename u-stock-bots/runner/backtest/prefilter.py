from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

# Reason codes (keep these stable: they become your debug language)
PF_NO_BARS = "pf_no_bars"
PF_NOT_ENOUGH_BARS = "pf_not_enough_bars"
PF_BAD_PRICE = "pf_bad_price"
PF_BAD_SYMBOL = "pf_bad_symbol"


@dataclass(frozen=True)
class PrefilterConfig:
    # Minimum bars required for a symbol to be considered "ready"
    min_bars_bias: int = 80
    min_bars_entry: int = 120


@dataclass(frozen=True)
class PrefilterDecision:
    symbol: str
    ok: bool
    reasons: List[str]
    meta: Dict[str, Any]


def _safe_upper(s: Any) -> str:
    return str(s or "").strip().upper()


def _bars_len(bars: Optional[Dict[str, Any]]) -> int:
    if not isinstance(bars, dict):
        return 0

    # Prefer closes array length (your strategy format)
    c = bars.get("c")
    if isinstance(c, list):
        return len(c)

    # fallback: items list (if any future source returns rows)
    items = bars.get("items")
    if isinstance(items, list):
        return len(items)

    return 0


def _last_close(bars: Optional[Dict[str, Any]]) -> float:
    if not isinstance(bars, dict):
        return 0.0
    c = bars.get("c")
    if isinstance(c, list) and c:
        try:
            return float(c[-1])
        except Exception:
            return 0.0
    return 0.0


def prefilter_symbol(
    *,
    symbol: str,
    bars_bias: Optional[Dict[str, Any]],
    bars_entry: Optional[Dict[str, Any]],
    cfg: PrefilterConfig,
) -> PrefilterDecision:
    sym = _safe_upper(symbol)
    reasons: List[str] = []
    meta: Dict[str, Any] = {}

    if not sym:
        return PrefilterDecision(symbol=sym, ok=False, reasons=[PF_BAD_SYMBOL], meta={})

    n_bias = _bars_len(bars_bias)
    n_entry = _bars_len(bars_entry)
    meta["n_bias"] = n_bias
    meta["n_entry"] = n_entry

    if n_bias <= 0 or n_entry <= 0:
        reasons.append(PF_NO_BARS)
        return PrefilterDecision(symbol=sym, ok=False, reasons=reasons, meta=meta)

    if n_bias < int(cfg.min_bars_bias) or n_entry < int(cfg.min_bars_entry):
        reasons.append(PF_NOT_ENOUGH_BARS)
        return PrefilterDecision(symbol=sym, ok=False, reasons=reasons, meta=meta)

    px = _last_close(bars_entry)
    meta["last_close"] = px
    if px <= 0:
        reasons.append(PF_BAD_PRICE)
        return PrefilterDecision(symbol=sym, ok=False, reasons=reasons, meta=meta)

    return PrefilterDecision(symbol=sym, ok=True, reasons=[], meta=meta)


def prefilter_universe(
    *,
    symbols: List[str],
    bias_by_symbol: Dict[str, Optional[Dict[str, Any]]],
    entry_by_symbol: Dict[str, Optional[Dict[str, Any]]],
    cfg: PrefilterConfig,
) -> Tuple[List[str], List[PrefilterDecision]]:
    ok_syms: List[str] = []
    decisions: List[PrefilterDecision] = []

    for s in symbols:
        sym = _safe_upper(s)
        d = prefilter_symbol(
            symbol=sym,
            bars_bias=bias_by_symbol.get(sym),
            bars_entry=entry_by_symbol.get(sym),
            cfg=cfg,
        )
        decisions.append(d)
        if d.ok:
            ok_syms.append(sym)

    return ok_syms, decisions