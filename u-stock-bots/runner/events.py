# u-stock-bots/runner/events.py
from __future__ import annotations

import time
import uuid
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, Iterable, List, Optional


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def new_event_id() -> str:
    # one per "decision" (per loop)
    return uuid.uuid4().hex


def attach_event_id(events: List[Dict[str, Any]], event_id: str) -> None:
    for e in events:
        if isinstance(e, dict) and not e.get("event_id"):
            e["event_id"] = event_id


def merge_events(*parts: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in parts:
        for e in p:
            if isinstance(e, dict):
                out.append(e)
    return out


def coerce_intents_list(intents_raw: Any) -> List[Dict[str, Any]]:
    """
    Convert bot outputs into a list[dict] (supports dict, dataclass, plain objects).
    """
    if intents_raw is None:
        return []
    if isinstance(intents_raw, list):
        out: List[Dict[str, Any]] = []
        for it in intents_raw:
            if isinstance(it, dict):
                out.append(it)
            elif is_dataclass(it):
                out.append(asdict(it))
            else:
                out.append(dict(getattr(it, "__dict__", {})))
        return out
    return []


def make_event(
    *,
    event_type: str,
    level: str,
    symbol: Optional[str],
    payload: Dict[str, Any],
    ts: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "ts": ts or now_iso(),
        "event_type": event_type,
        "level": level,
        "symbol": symbol,
        "payload": payload,
    }
