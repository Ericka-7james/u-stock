from __future__ import annotations

from unittest.mock import Mock

import pytest

from api.routes.bots.deps import get_bot_service
from api.security.bot_runner_dep import require_bot_runner, require_bot_runner_claims


@pytest.fixture(autouse=True)
def clear_dependency_overrides(client):
    client.app.dependency_overrides = {}
    yield
    client.app.dependency_overrides = {}


def test_heartbeat_accepts_runner_payload(client):
    mock_svc = Mock()
    mock_svc.heartbeat.return_value = {
        "ok": True,
        "bot_id": "ema_trend",
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc
    client.app.dependency_overrides[require_bot_runner] = lambda: "runner-1"
    client.app.dependency_overrides[require_bot_runner_claims] = lambda: {"uid": "user-123"}

    response = client.post(
        "/api/bots/heartbeat",
        json={"bot_id": "ema_trend", "mode": "paper", "ts": 1710000000},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "bot_id": "ema_trend",
    }
    mock_svc.heartbeat.assert_called_once_with(
        "user-123",
        {
            "bot_id": "ema_trend",
            "mode": "paper",
            "ts": 1710000000,
            "runner_id": "runner-1",
            "user_id": "user-123",
        },
    )


def test_status_runner_returns_status(client):
    mock_svc = Mock()
    mock_svc.status.return_value = {"ok": True, "armed": True}

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc
    client.app.dependency_overrides[require_bot_runner] = lambda: "runner-1"
    client.app.dependency_overrides[require_bot_runner_claims] = lambda: {"uid": "user-123"}

    response = client.get("/api/bots/status_runner", params={"bot_id": "ema_trend"})

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "armed": True,
        "runner_id": "runner-1",
        "user_id": "user-123",
        "bot_id": "ema_trend",
    }
    mock_svc.status.assert_called_once_with("user-123", "ema_trend")


def test_submit_intents_rejects_non_list_items(client):
    mock_svc = Mock()

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc
    client.app.dependency_overrides[require_bot_runner] = lambda: "runner-1"
    client.app.dependency_overrides[require_bot_runner_claims] = lambda: {"uid": "user-123"}

    response = client.post(
        "/api/bots/submit-intents",
        json={
            "bot_id": "ema_trend",
            "ts": 1710000000,
            "items": "not-a-list",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "items must be a list"
    mock_svc.submit_intents.assert_not_called()


def test_submit_intents_accepts_valid_items(client):
    mock_svc = Mock()
    mock_svc.submit_intents.return_value = {
        "ok": True,
        "count": 2,
    }

    client.app.dependency_overrides[get_bot_service] = lambda: mock_svc
    client.app.dependency_overrides[require_bot_runner] = lambda: "runner-1"
    client.app.dependency_overrides[require_bot_runner_claims] = lambda: {"uid": "user-123"}

    response = client.post(
        "/api/bots/submit-intents",
        json={
            "bot_id": "ema_trend",
            "ts": 1710000000,
            "items": [{"symbol": "AAPL"}, {"symbol": "MSFT"}],
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "count": 2,
    }
    mock_svc.submit_intents.assert_called_once_with(
        "user-123",
        "ema_trend",
        1710000000,
        [{"symbol": "AAPL"}, {"symbol": "MSFT"}],
    )