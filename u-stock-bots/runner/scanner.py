# u-stock-bots/runner/scanner.py
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from bots._shared.ustock_http import UStockAPI

from runner.events import make_event, now_iso


def fetch_opportunities(api: UStockAPI) -> Dict[str, Any]:
    """
    Existing function (keep your current implementation if you already have one).
    This placeholder exists only so this file is self-contained in the snippet.

    Expected return shape:
      {
        "ok": bool,
        "symbols": [...],
        "context": {"source": "...", ...}
      }
    """
    # If you already have this implemented, DO NOT replace it.
    # Just keep it and add attach_scanner_context() below.
    return {"ok": True, "symbols": [], "context": {"source": "noop"}}


def attach_scanner_context(api: UStockAPI, cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """
    Fetch opportunities and attach into cfg under cfg["scanner"].
    Returns (cfg, scanner_events).

    Drop-in behavior: identical to the old _apply_scanner_context() from orchestrator.py.
    """
    scanner_events: List[Dict[str, Any]] = []
    try:
        scan = fetch_opportunities(api)
        symbols = list(scan.get("symbols") or [])
        context = dict(scan.get("context") or {})
        ok = bool(scan.get("ok", True))

        cfg2 = dict(cfg or {})
        cfg2["scanner"] = {"symbols": symbols, "context": context, "ok": ok}

        scanner_events.append(
            make_event(
                ts=now_iso(),
                event_type="scanner_opportunities",
                level="info" if ok else "error",
                symbol=None,
                payload={"ok": ok, "count": len(symbols), "source": context.get("source")},
            )
        )
        return cfg2, scanner_events

    except Exception as e:
        cfg2 = dict(cfg or {})
        cfg2["scanner"] = {"symbols": [], "context": {"error": repr(e)}, "ok": False}
        scanner_events.append(
            make_event(
                ts=now_iso(),
                event_type="scanner_failed",
                level="error",
                symbol=None,
                payload={"error": repr(e)},
            )
        )
        return cfg2, scanner_events
