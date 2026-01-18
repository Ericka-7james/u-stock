from __future__ import annotations

from typing import Any, Dict

TRANSACTION_EVENT_TYPES = {
    "order_submitted",
    "order_filled",
    "order_partially_filled",
    "order_canceled",
    "order_rejected",
    "order_failed",
    "trade_closed",
}


def is_transaction_event(evt: Dict[str, Any]) -> bool:
    t = str(evt.get("event_type") or "").strip()
    return t in TRANSACTION_EVENT_TYPES
