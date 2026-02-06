# u-stock-bots/bots/_shared/opportunities_client.py
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List

from bots._shared.ustock_http import UStockAPI


@dataclass(frozen=True)
class OpportunitiesResult:
    ok: bool
    symbols: List[str]
    generated_at: int = 0
    meta: Dict[str, Any] = field(default_factory=dict)
    error: str = ""


def _now_epoch() -> int:
    return int(time.time())


def _clamp_int(v: Any, lo: int, hi: int, default: int) -> int:
    try:
        x = int(v)
    except Exception:
        x = int(default)
    return max(lo, min(hi, x))


def _clean_symbol(x: Any) -> str:
    s = str(x or "").strip().upper()
    if not s or len(s) > 16:
        return ""
    for ch in s:
        if not (ch.isalnum() or ch in {".", "-"}):
            return ""
    return s


def _extract_symbols(payload: Any) -> List[str]:
    """
    Strict extraction:
      payload must be dict
      payload["symbols"] must be list
      symbols are sanitized + deduped (stable order)
    """
    if not isinstance(payload, dict):
        return []

    raw = payload.get("symbols")
    if not isinstance(raw, list):
        return []

    out: List[str] = []
    seen = set()
    for v in raw:
        s = _clean_symbol(v)
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def get_opportunity_symbols(
    api: UStockAPI,
    *,
    bot_id: str,
    limit: int = 12,
    include_leaders: bool = True,
    leaders_direction: str = "up",
    leaders_show_more: bool = False,
    cache_bust: bool = False,
) -> OpportunitiesResult:
    """
    Calls backend:
      GET /api/opportunities?bot_id=...&limit=...&include_leaders=1&...

    Production behavior:
      - never throws (returns ok=False + error message)
      - validates response shape
      - returns deduped sanitized symbols
      - returns meta that includes request params + latency for debugging
    """
    bid = str(bot_id or "").strip() or "unknown"
    dirn = "down" if str(leaders_direction or "").strip().lower() == "down" else "up"

    eff_limit = _clamp_int(limit, 1, 50, default=12)

    params = {
        "bot_id": bid,
        "limit": eff_limit,
        "include_leaders": 1 if bool(include_leaders) else 0,
        "leaders_direction": dirn,
        "leaders_show_more": 1 if bool(leaders_show_more) else 0,
        "cache_bust": 1 if bool(cache_bust) else 0,
    }

    t0 = time.time()
    try:
        # UStockAPI normalizes paths under /api, but being explicit helps readability.
        payload = api.get("/api/opportunities", params=params)
    except Exception as e:
        return OpportunitiesResult(
            ok=False,
            symbols=[],
            generated_at=0,
            meta={
                "client": "opportunities_client",
                "params": params,
                "latency_ms": int((time.time() - t0) * 1000),
                "ts": _now_epoch(),
            },
            error=f"/api/opportunities failed: {repr(e)}",
        )

    if not isinstance(payload, dict):
        return OpportunitiesResult(
            ok=False,
            symbols=[],
            generated_at=0,
            meta={
                "client": "opportunities_client",
                "params": params,
                "latency_ms": int((time.time() - t0) * 1000),
                "ts": _now_epoch(),
            },
            error="Bad response type from /api/opportunities (expected object)",
        )

    symbols = _extract_symbols(payload)

    ok = bool(payload.get("ok") is True)
    generated_at = 0
    try:
        generated_at = int(payload.get("generatedAt") or 0)
    except Exception:
        generated_at = 0

    server_meta = payload.get("meta")
    if not isinstance(server_meta, dict):
        server_meta = {}

    # Combine meta for observability:
    meta = {
        "client": "opportunities_client",
        "params": params,
        "latency_ms": int((time.time() - t0) * 1000),
        "server_meta": dict(server_meta),
        "ts": _now_epoch(),
        "returned": len(symbols),
    }

    # If server said ok=true but we got no symbols, that’s useful to know.
    if ok and not symbols:
        meta["warning"] = "ok_true_but_empty_symbols"

    return OpportunitiesResult(
        ok=ok,
        symbols=symbols,
        generated_at=generated_at,
        meta=meta,
        error=str(payload.get("error") or ""),
    )
