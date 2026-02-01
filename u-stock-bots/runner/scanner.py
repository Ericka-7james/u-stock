# u-stock-bots/runner/scanner.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Tuple

from bots._shared.ustock_http import UStockAPI
from bots._shared.opportunities_client import get_opportunity_symbols

from runner.events import make_event, now_iso


def _as_dict(x: Any) -> Dict[str, Any]:
    return x if isinstance(x, dict) else {}


def _as_list_str(x: Any) -> List[str]:
    if not isinstance(x, list):
        return []
    out: List[str] = []
    for v in x:
        s = str(v or "").strip().upper()
        if s:
            out.append(s)
    return out


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
    bot_id = str((cfg or {}).get("bot_id") or (cfg or {}).get("id") or "ema_trend").strip() or "ema_trend"

    t0 = time.time()
    try:
        res = get_opportunity_symbols(
            api,
            bot_id=bot_id,
            limit=int((cfg or {}).get("scanner_limit") or 12),
            include_leaders=True,
            leaders_direction=str((cfg or {}).get("leaders_direction") or "up"),
            leaders_show_more=bool((cfg or {}).get("leaders_show_more") or False),
            cache_bust=bool((cfg or {}).get("scanner_cache_bust") or False),
        )

        latency_ms = int((time.time() - t0) * 1000)

        server_meta = _as_dict(res.meta.get("server_meta")) if isinstance(res.meta, dict) else {}
        warnings = []

        # backend warnings (if any)
        backend_warnings = server_meta.get("warnings")
        if isinstance(backend_warnings, list):
            for w in backend_warnings:
                if isinstance(w, dict):
                    warnings.append(w)

        # client warning
        if res.ok and not res.symbols:
            warnings.append({"code": "EMPTY_UNIVERSE", "message": "Scanner returned ok=true but empty symbols."})

        # lightweight “source” label for UI/logging
        # Prefer backend 'sources' if present.
        source = "unknown"
        sources = server_meta.get("sources")
        if isinstance(sources, list) and sources:
            # Pick the first non-zero source name
            picked = None
            for s in sources:
                if isinstance(s, dict) and int(s.get("count") or 0) > 0:
                    picked = str(s.get("name") or "").strip()
                    if picked:
                        break
            source = picked or "fallback"
        else:
            source = "fallback"

        return {
            "ok": bool(res.ok),
            "symbols": list(res.symbols or []),
            "context": {
                "bot_id": bot_id,
                "source": source,
                "latency_ms": latency_ms,
                "warnings": warnings,
                "server_meta": server_meta,
                "client_meta": _as_dict(res.meta),
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
                "client_meta": {},
                "generated_at": 0,
                "error": repr(e),
            },
        }


def attach_scanner_context(api: UStockAPI, cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Fetch opportunities and attach into cfg under cfg["scanner"].

    Also emits ONE standard scanner event shape:
      event_type="scanner_opportunities"
      payload={
        ok, count, source, latency_ms, warnings, bot_id
      }
    """
    scanner_events: List[Dict[str, Any]] = []

    cfg2 = dict(cfg or {})
    scan = fetch_opportunities(api, cfg=cfg2)

    symbols = _as_list_str(scan.get("symbols"))
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
