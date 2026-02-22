# u-stock-bots/runner/scanner.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Tuple

from bots._shared.ustock_http import UStockAPI
from bots._shared.opportunities_client import get_opportunity_symbols

from runner.events import make_event, now_iso


def _as_dict(x: Any) -> Dict[str, Any]:
    return x if isinstance(x, dict) else {}


def _as_list_str_unique(x: Any) -> List[str]:
    """
    Normalize to unique, uppercase strings while preserving order.
    """
    if not isinstance(x, list):
        return []
    out: List[str] = []
    seen = set()
    for v in x:
        s = str(v or "").strip().upper()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _clamp_int(v: Any, default: int, *, min_v: int, max_v: int) -> int:
    try:
        n = int(v)
    except Exception:
        n = int(default)
    if n < min_v:
        return int(min_v)
    if n > max_v:
        return int(max_v)
    return n


def fetch_opportunities(api: UStockAPI, *, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Production-grade scanner fetch.

    Output shape (runner internal):
      {
        "ok": bool,
        "symbols": [...],
        "context": {
          "source": str,
          "latency_ms": int,
          "warnings": [...],
          "server_meta": {...},
          "client_meta": {...},
          "bot_id": str
        }
      }

    Important: NEVER throws. Scanner should not crash the loop.
    """
    cfg0 = cfg or {}
    bot_id = str(cfg0.get("bot_id") or cfg0.get("id") or "ema_trend").strip() or "ema_trend"

    # Support multiple key spellings to reduce config drift
    raw_limit = cfg0.get("scanner_limit", cfg0.get("opps_limit", 12))
    raw_cache_bust = cfg0.get("scanner_cache_bust", cfg0.get("opps_cache_bust", False))

    limit = _clamp_int(raw_limit, 12, min_v=1, max_v=200)
    cache_bust = bool(raw_cache_bust)

    leaders_direction = str(cfg0.get("leaders_direction") or "up").strip() or "up"
    leaders_show_more = bool(cfg0.get("leaders_show_more") or False)

    t0 = time.time()
    try:
        res = get_opportunity_symbols(
            api,
            bot_id=bot_id,
            limit=limit,
            include_leaders=True,
            leaders_direction=leaders_direction,
            leaders_show_more=leaders_show_more,
            cache_bust=cache_bust,
        )

        latency_ms = int((time.time() - t0) * 1000)

        server_meta = _as_dict(res.meta.get("server_meta")) if isinstance(res.meta, dict) else {}
        warnings: List[Dict[str, Any]] = []

        # backend warnings (if any)
        backend_warnings = server_meta.get("warnings")
        if isinstance(backend_warnings, list):
            for w in backend_warnings:
                if isinstance(w, dict):
                    warnings.append(w)

        # client warning
        if bool(res.ok) and not list(res.symbols or []):
            warnings.append({"code": "EMPTY_UNIVERSE", "message": "Scanner returned ok=true but empty symbols."})

        # source label for UI/logging
        source = "fallback"
        sources = server_meta.get("sources")
        if isinstance(sources, list) and sources:
            picked = None
            for s in sources:
                if isinstance(s, dict) and int(s.get("count") or 0) > 0:
                    name = str(s.get("name") or "").strip()
                    if name:
                        picked = name
                        break
            source = picked or "fallback"
        else:
            # if server doesn't report sources, keep fallback for ok responses
            source = "fallback" if bool(res.ok) else "error"

        # Add client-side request meta for easier debugging
        client_meta = _as_dict(res.meta)
        client_meta.setdefault("requested_limit", limit)
        client_meta.setdefault("requested_cache_bust", cache_bust)
        client_meta.setdefault("leaders_direction", leaders_direction)
        client_meta.setdefault("leaders_show_more", leaders_show_more)

        return {
            "ok": bool(res.ok),
            "symbols": list(res.symbols or []),
            "context": {
                "bot_id": bot_id,
                "source": source,
                "latency_ms": latency_ms,
                "warnings": warnings,
                "server_meta": server_meta,
                "client_meta": client_meta,
                "generated_at": int(res.generated_at or 0),
                "error": str(res.error or ""),
            },
        }

    except Exception as e:
        latency_ms = int((time.time() - t0) * 1000)
        return {
            "ok": False,
            "symbols": [],
            "context": {
                "bot_id": bot_id,
                "source": "error",
                "latency_ms": latency_ms,
                "warnings": [{"code": "SCANNER_EXCEPTION", "message": "Scanner exception."}],
                "server_meta": {},
                "client_meta": {
                    "requested_limit": limit,
                    "requested_cache_bust": cache_bust,
                    "leaders_direction": leaders_direction,
                    "leaders_show_more": leaders_show_more,
                },
                "generated_at": 0,
                "error": repr(e),
            },
        }


def attach_scanner_context(api: UStockAPI, cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Fetch opportunities and attach into cfg under cfg["scanner"].

    Also emits ONE standard scanner event shape:
      event_type="scanner_opportunities"
      payload={ ok, count, source, latency_ms, warnings, bot_id }
    """
    scanner_events: List[Dict[str, Any]] = []

    cfg2 = dict(cfg or {})
    scan = fetch_opportunities(api, cfg=cfg2)

    symbols = _as_list_str_unique(scan.get("symbols"))
    context = _as_dict(scan.get("context"))
    ok = bool(scan.get("ok") is True)

    cfg2["scanner"] = {"symbols": symbols, "context": context, "ok": ok}

    payload = {
        "ok": ok,
        "count": len(symbols),
        "source": str(context.get("source") or "unknown"),
        "latency_ms": int(context.get("latency_ms") or 0),
        "warnings": context.get("warnings") if isinstance(context.get("warnings"), list) else [],
        "bot_id": str(context.get("bot_id") or cfg2.get("bot_id") or "unknown"),
    }

    scanner_events.append(
        make_event(
            ts=now_iso(),
            event_type="scanner_opportunities",
            level="info" if ok else "error",
            symbol=None,
            payload=payload,
        )
    )

    return cfg2, scanner_events