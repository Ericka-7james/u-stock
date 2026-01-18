from __future__ import annotations

import pytest

from bots._shared.transaction_events import TRANSACTION_EVENT_TYPES, is_transaction_event


@pytest.mark.parametrize(
    "event_type",
    sorted(list(TRANSACTION_EVENT_TYPES)),
)
def test_is_transaction_event_true_for_known_types(event_type: str) -> None:
    assert is_transaction_event({"event_type": event_type}) is True


@pytest.mark.parametrize(
    "evt",
    [
        {},
        {"event_type": None},
        {"event_type": ""},
        {"event_type": "   "},
        {"event_type": "ORDER_SUBMITTED"},  # case-sensitive by design
        {"event_type": "orderSubmitted"},
        {"event_type": "heartbeat"},
        {"event_type": "state_changed"},
        {"event_type": 123},
    ],
)
def test_is_transaction_event_false_for_other_values(evt) -> None:
    assert is_transaction_event(evt) is False


def test_is_transaction_event_trims_whitespace() -> None:
    assert is_transaction_event({"event_type": "  order_failed  "}) is True
